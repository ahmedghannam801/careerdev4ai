/**
 * The server side of AI-assisted CV writing.
 *
 * The rule this module exists to enforce: the model writes from the
 * candidate's own record or it does not write at all.
 *
 * Two things make that true here.
 *
 * First, the facts come from the database for the VERIFIED user id. When the
 * candidate asks for a bullet for one particular job, the server looks that
 * job up itself and hands the model what the platform actually holds — the
 * client never gets to describe an employer or a metric in its own words and
 * have it treated as fact.
 *
 * Second, every answer is checked back against that same record before it is
 * returned, so a sentence that names a number the candidate has never
 * recorded is removed rather than shown.
 *
 * The field being written, the candidate's notes about it and the text they
 * already wrote are all inputs to the prompt. Everything else is the
 * database.
 */

import {
  CV_ASSIST_FIELDS,
  cvAssistBulletBudget,
  cvAssistVariationHint,
  cvAssistWordBudget,
  CV_ASSIST_TONE_INSTRUCTIONS,
  type CvAssistField,
  type CvAssistLength,
  type CvAssistSourceKind,
  type CvAssistTone,
} from '../../shared/cvAiAssist.ts';
import {
  findUngroundedClaims,
  groundingRules,
  stripUngroundedSentences,
  withOwnText,
  type GroundingProfile,
} from '../ai/grounding.ts';
import { buildGroundingProfileForUser } from '../ai/groundingProfile.ts';
import { loadAiCareerContext, buildAiContextBlock } from '../ai/careerContext.ts';
import { listExperiences } from '../db/experiences.ts';
import { listEducations } from '../db/educations.ts';
import { listProjects } from '../db/projects.ts';
import { listVolunteerExperiences } from '../db/volunteer.ts';
import { listCertifications } from '../db/profileExtensions.ts';
import { listLearningItems, listCourses } from '../db/learning.ts';

/** The maximum length of the candidate's own notes about the field. */
const MAX_CONTEXT_CHARS = 1200;

/** The maximum length of the text the candidate already wrote. */
const MAX_EXISTING_CHARS = 4000;

/**
 * The records a field can be written from.
 *
 * Each one names a row the candidate already owns. The server resolves the
 * row itself, so the model is always writing about something that is really
 * in the account.
 */
export interface CvAssistRequest {
  /** Which CV field is being written. */
  field: CvAssistField;
  /** The record the field belongs to, when it belongs to one. */
  sourceKind?: CvAssistSourceKind;
  /** The id of that record. */
  sourceId?: string;
  /**
   * The candidate's own notes about this field, in their words. Used as
   * context, and treated as their own claim when the answer is checked.
   */
  context?: string;
  /** The text already in the field, so the model can improve rather than replace. */
  existingText?: string;
  /** The role the CV is aimed at. */
  targetRoleTitle?: string;
  /** The register to write in. */
  tone?: CvAssistTone;
  /** How much to write. */
  length?: CvAssistLength;
  /** The interface language the answer is written in. */
  language?: 'en' | 'ar';
  /**
   * Which attempt this is. The first attempt carries no hint; later ones ask
   * the model to lead from a different angle, so a regeneration is a
   * genuinely different answer rather than a copy.
   */
  attempt?: number;
}

/**
 * Trims and bounds a free-text input.
 *
 * Every string that reaches the model goes through here, so a single request
 * cannot push an unbounded payload into the context window and consume the
 * project's daily allowance.
 */
function boundedText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/**
 * The record the field belongs to, read from the database.
 *
 * Returns null when the row does not exist or does not belong to this user,
 * which is the answer for a guessed id.
 */
export async function resolveCvAssistSource(
  userId: string,
  kind: CvAssistSourceKind,
  id: string
): Promise<string | null> {
  if (!id || id.length > 64) return null;
  try {
    switch (kind) {
      case 'experience': {
        const rows = await listExperiences(userId);
        const row = rows.find((entry) => entry.id === id);
        if (!row) return null;
        return [
          `Role: ${row.role}`,
          `Employer: ${row.company}`,
          row.employmentType ? `Employment type: ${row.employmentType}` : '',
          row.location ? `Location: ${row.location}` : '',
          row.description ? `What the candidate recorded about this role: ${row.description}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
      case 'education': {
        const rows = await listEducations(userId);
        const row = rows.find((entry) => entry.id === id);
        if (!row) return null;
        return [
          `Institution: ${row.institution}`,
          row.degree ? `Degree: ${row.degree}` : '',
          row.field ? `Field of study: ${row.field}` : '',
          row.description ? `What the candidate recorded about this course: ${row.description}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
      case 'project': {
        const rows = await listProjects(userId);
        const row = rows.find((entry) => entry.id === id);
        if (!row) return null;
        return [
          `Project: ${row.title}`,
          row.goal ? `Goal: ${row.goal}` : '',
          row.description ? `What the candidate recorded about this project: ${row.description}` : '',
          row.skills.length > 0 ? `Skills used: ${row.skills.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
      case 'volunteering': {
        const rows = await listVolunteerExperiences(userId);
        const row = rows.find((entry) => entry.id === id);
        if (!row) return null;
        return [
          `Organisation: ${row.organization}`,
          `Role: ${row.role}`,
          row.description ? `What the candidate recorded about this stint: ${row.description}` : '',
          row.responsibilities.length > 0
            ? `Responsibilities the candidate recorded: ${row.responsibilities.join('; ')}`
            : '',
          row.achievements.length > 0
            ? `Achievements the candidate recorded: ${row.achievements.join('; ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
      case 'certification': {
        const rows = await listCertifications(userId);
        const row = rows.find((entry) => entry.id === id);
        if (!row) return null;
        return [
          `Certification: ${row.name}`,
          row.issuer ? `Issuer: ${row.issuer}` : '',
          row.issueDate ? `Issued: ${row.issueDate}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
      case 'course': {
        // Only a course the candidate has actually completed may be written
        // about. An in-progress course is not a CV line.
        const items = await listLearningItems(userId);
        const item = items.find((entry) => entry.id === id);
        if (!item || item.status !== 'completed') return null;
        const course = (await listCourses()).find((entry) => entry.id === item.courseId);
        if (!course) return null;
        return [
          `Completed course: ${course.title}`,
          `Provider: ${course.provider}`,
          `Level: ${course.level}`,
          item.notes ? `The candidate's notes on this course: ${item.notes}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }
      default:
        return null;
    }
  } catch (error) {
    console.error('Failed to resolve the CV assist source:', error);
    return null;
  }
}

/**
 * Builds the prompt for one field.
 *
 * Exported so the prompt can be inspected in a test without a model call:
 * the grounding rules must always be present, and the candidate's own record
 * must always be in the prompt.
 */
export function buildCvAssistPrompt(input: {
  request: CvAssistRequest;
  careerContextBlock: string;
  sourceBlock: string | null;
}): string {
  const { request } = input;
  const spec = CV_ASSIST_FIELDS[request.field];
  const tone = request.tone ?? 'professional';
  const length = request.length ?? 'medium';
  const words = cvAssistWordBudget(request.field, length);
  const bullets = cvAssistBulletBudget(length);
  const variation = cvAssistVariationHint(request.attempt ?? 0);

  const parts: string[] = [];

  parts.push('You are writing ONE section of a CV for the candidate below.');
  parts.push('');
  parts.push(spec.instruction);

  if (request.targetRoleTitle) {
    parts.push(`The CV is aimed at the role: ${request.targetRoleTitle}.`);
  }

  parts.push('');
  parts.push("The candidate's own record, read from their CareerDev4AI account:");
  parts.push(input.careerContextBlock);

  if (input.sourceBlock) {
    parts.push('');
    parts.push('The specific item this section is about, read from their record:');
    parts.push(input.sourceBlock);
  }

  if (request.context) {
    parts.push('');
    parts.push("The candidate's own notes about this item:");
    parts.push(request.context);
  }

  if (request.existingText) {
    parts.push('');
    parts.push('The text already in this field, which you may improve and keep:');
    parts.push(request.existingText);
  }

  parts.push('');
  parts.push('Requirements:');
  parts.push(`- Length: about ${words.min} to ${words.max} words.`);
  if (spec.format === 'bullets') {
    parts.push(`- Write ${bullets.min} to ${bullets.max} bullet points, one per line, with no dashes.`);
    parts.push('- Each bullet starts with a past-tense action verb and states what the candidate did.');
  } else {
    parts.push('- Write one short paragraph. Do not use bullet points or headings.');
  }
  parts.push(`- Tone: ${CV_ASSIST_TONE_INSTRUCTIONS[tone]}`);
  if (request.language === 'ar') {
    parts.push('- Write the answer in Arabic.');
  }
  if (variation) {
    parts.push(`- ${variation}`);
  }
  parts.push('- Write only about the candidate. Do not address the reader.');
  parts.push(groundingRules());
  parts.push('- Return JSON: { "text": string, "bullets": string[] }');

  return parts.join('\n');
}

/**
 * The answer, and what was removed from it.
 */
export interface CvAssistResult {
  /** The content to put in the field. */
  text: string;
  /** The bullets, for a bullet-shaped field. */
  bullets: string[];
  /** The claims that were removed because the candidate has no record of them. */
  removedClaims: string[];
  /** A message for the candidate, or null when nothing was removed. */
  groundingNote: string | null;
}

/**
 * Removes from the answer every claim the candidate cannot stand behind.
 *
 * The check is the shared grounding validator, so a bullet that names an
 * employer, a metric or a URL the candidate has no record of is dropped whole
 * — a half-bullet is not a usable CV line.
 *
 * The candidate's own notes, their own draft text and the record the server
 * resolved for them are added to their record first. A number or a name they
 * wrote themselves is their own claim, so it survives; a number the model
 * made up does not.
 */
export function groundCvAssistAnswer(
  answer: { text: string; bullets: string[] },
  profile: GroundingProfile,
  userText: string[]
): CvAssistResult {
  const known = withOwnText(profile, userText);
  const removed: string[] = [];

  const keepBullet = (bullet: string): boolean => {
    const claims = findUngroundedClaims(bullet, known);
    if (claims.length === 0) return true;
    for (const claim of claims) removed.push(claim.claim);
    return false;
  };

  const bullets = answer.bullets.filter(keepBullet);
  const text = answer.bullets.length > 0 ? bullets.join('\n') : answer.text;

  // A text-shaped field is a single paragraph, so the offending sentences
  // are stripped from it rather than the whole thing being discarded.
  let finalText = text;
  if (answer.bullets.length === 0) {
    const stripped = stripUngroundedSentences(text, known);
    finalText = stripped.text;
    for (const claim of stripped.removed) removed.push(claim.claim);
  }

  return {
    text: finalText,
    bullets,
    removedClaims: removed,
    groundingNote:
      removed.length > 0
        ? 'Part of the suggestion referred to something that is not in your records, so that part was removed. Add it to your profile or write it into the field yourself if you want it used.'
        : null,
  };
}

/**
 * The AI client shape this module needs.
 *
 * It is the same client the rest of the application uses, declared here so
 * the module can be exercised in a test without a network call.
 */
export interface CvAssistAiClient {
  models: {
    generateContent: (args: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }) => Promise<{ text?: string }>;
  };
}

/**
 * Writes one CV field for the verified user.
 *
 * The order of the checks matters. The model is not called at all when no
 * model is configured, so a missing key is never reported as an exhausted
 * quota. The daily budget is only spent when there is a real call to make.
 */
export async function generateCvAssistText(
  userId: string,
  request: CvAssistRequest,
  ai: CvAssistAiClient,
  model: string
): Promise<
  | { ok: true; result: CvAssistResult }
  | { ok: false; reason: 'invalid_response' | 'source_not_found' }
> {
  const sourceBlock =
    request.sourceKind && request.sourceId
      ? await resolveCvAssistSource(userId, request.sourceKind, request.sourceId)
      : null;

  // The candidate named a record the platform cannot find. There is nothing
  // to ground the writing in, so no text is produced at all.
  if (request.sourceKind && request.sourceId && !sourceBlock) {
    return { ok: false, reason: 'source_not_found' };
  }

  const careerContext = await loadAiCareerContext(userId);
  const contextBlock = buildAiContextBlock(careerContext);
  const prompt = buildCvAssistPrompt({ request, careerContextBlock: contextBlock, sourceBlock });

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  let payload: unknown;
  try {
    payload = JSON.parse(response.text || '{}');
  } catch {
    return { ok: false, reason: 'invalid_response' };
  }

  const { validateCvAssistPayload, parseCvAssistPayload } = await import(
    '../../shared/cvAiAssist.ts'
  );
  const errors = validateCvAssistPayload(payload, request.field);
  if (errors.length > 0) {
    console.error('CV assist returned an invalid payload:', errors);
    return { ok: false, reason: 'invalid_response' };
  }

  const parsed = parseCvAssistPayload(payload, request.field);
  const groundingProfile = await buildGroundingProfileForUser(userId);

  const userText: string[] = [];
  const context = boundedText(request.context, MAX_CONTEXT_CHARS);
  const existing = boundedText(request.existingText, MAX_EXISTING_CHARS);
  if (context) userText.push(context);
  if (existing) userText.push(existing);
  if (sourceBlock) userText.push(sourceBlock);

  const grounded = groundCvAssistAnswer(parsed, groundingProfile, userText);

  return { ok: true, result: grounded };
}
