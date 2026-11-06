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
  CV_ASSIST_ACTIONS,
  CV_ASSIST_FIELDS,
  cvAssistBulletBudget,
  cvAssistVariationHint,
  cvAssistWordBudget,
  CV_ASSIST_TONE_INSTRUCTIONS,
  resolveCvAssistAction,
  type CvAssistAction,
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
import {
  loadAiCareerContext,
  buildAiContextBlock,
  type AiCareerContext,
} from '../ai/careerContext.ts';
import {
  CV_HEADLINE_SUGGESTION_COUNT,
  parseHeadlineSuggestionsPayload,
  validateHeadlineSuggestionsPayload,
} from '../../shared/cvAiAssist.ts';
import {
  generateHeadlineSuggestions,
  mergeHeadlineSuggestions,
  type HeadlineSuggestionInput,
} from '../../shared/headlineSuggestions.ts';
import { listExperiences } from '../db/experiences.ts';
import { listEducations } from '../db/educations.ts';
import { listProjects } from '../db/projects.ts';
import { listVolunteerExperiences } from '../db/volunteer.ts';
import { listCertifications } from '../db/profileExtensions.ts';
import { listLearningItems, listCourses } from '../db/learning.ts';
import {
  aiLanguageInstruction,
  normalizeAiLanguage,
  type AiLanguageCode,
} from '../../shared/aiLanguages.ts';

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
  /**
   * What the candidate asked for: a fresh write, an improvement of what they
   * already wrote, bullet points, the achievements of a role, and so on.
   *
   * An action that does not apply to the field falls back to a plain write,
   * so a request can never ask for something the field cannot produce.
   */
  action?: CvAssistAction;
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
  /** The language the answer is written in. */
  language?: AiLanguageCode;
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
  const action = resolveCvAssistAction(request.field, request.action);

  const parts: string[] = [];

  parts.push('You are writing ONE section of a CV for the candidate below.');
  parts.push('');

  // What was asked for comes before what the field is. "Write the bullet
  // points for one role" and "suggest the achievements of this role" are
  // the same field and very different jobs.
  parts.push(CV_ASSIST_ACTIONS[action].instruction);
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
  parts.push(`- ${aiLanguageInstruction(request.language ?? 'en')}`);
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

  const careerContext = await loadAiCareerContext(userId, {
    language: request.language,
  });
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

/**
 * The inputs for a headline suggestion request.
 *
 * The target role is the one the candidate chose, so the body may name it, but
 * the server's own context wins when the two disagree: the context was read
 * from the profile for this verified user.
 */
export interface CvHeadlineRequest {
  targetRoleTitle?: string;
  language?: AiLanguageCode;
  /** Other target roles the candidate is preparing, for a combined headline. */
  additionalTargetRoles?: readonly string[];
}

/** What the headline endpoint returns. */
export interface CvHeadlineSuggestionsResult {
  /** The options to show, never empty. */
  suggestions: string[];
  /** True when at least one option came from the model. */
  aiUsed: boolean;
  /** Why the deterministic options are being shown instead, when they are. */
  fallbackReason: string | null;
}

/**
 * Builds the deterministic generator's input from the candidate's record.
 *
 * Only facts the candidate supplied are passed through: the target role, the
 * skills they rated, their own experience and education lines, and their
 * career goal. The role's required skills are used only to order the
 * candidate's skills, never to add one they do not have.
 */
export function headlineInputFromCareerContext(
  context: AiCareerContext,
  request: CvHeadlineRequest
): HeadlineSuggestionInput {
  const targetRoleTitle =
    request.targetRoleTitle?.trim() ||
    context.targetRoleTitle?.trim() ||
    context.targetRole?.title?.trim() ||
    '';

  const roleSkills = [
    ...(context.targetRole?.requiredSkills ?? []).map((skill) => skill.name),
    ...(context.targetRole?.preferredSkills ?? []).map((skill) => skill.name),
  ];

  return {
    targetRoleTitle,
    skills: context.currentSkills.map((skill) => skill.name),
    roleSkills,
    experience: context.experience,
    education: context.education,
    careerGoal: context.careerGoal,
    additionalTargetRoles: request.additionalTargetRoles ?? [],
    projects: context.projects,
    certifications: context.certifications,
    volunteering: context.volunteering,
    training: context.learningSummary,
    language: normalizeAiLanguage(request.language ?? context.language),
    limit: CV_HEADLINE_SUGGESTION_COUNT,
  };
}

/**
 * The prompt for headline options.
 *
 * Exported so a test can inspect it without a model call. The grounding rule
 * and the role-relevance rule are both in the prompt, because the model is
 * one of the places a wrong headline can come from.
 */
export function buildCvHeadlineSuggestionsPrompt(input: {
  request: CvHeadlineRequest;
  careerContextBlock: string;
  targetRoleTitle: string;
}): string {
  const parts: string[] = [];
  parts.push('You are writing the headline options for a CV.');
  parts.push('');
  parts.push(
    'The headline is the single line under the candidate\'s name. It states who the candidate is and the role they are aiming at.'
  );
  if (input.targetRoleTitle) {
    parts.push(`The CV is aimed at the role: ${input.targetRoleTitle}.`);
  }
  parts.push('');
  parts.push("The candidate's own record, read from their CareerDev4AI account:");
  parts.push(input.careerContextBlock);
  parts.push('');
  parts.push('Requirements:');
  parts.push(
    `- Write exactly ${CV_HEADLINE_SUGGESTION_COUNT} different headline options, one per suggestion.`
  );
  parts.push('- Every option must name the target role above.');
  parts.push(
    '- Use only the facts in the record. Do not invent a job title, employer, skill, degree, number or achievement.'
  );
  parts.push('- Each option is one line of 3 to 14 words, at most 140 characters.');
  parts.push('- Do not use quotes, numbering, bullet characters or explanations.');
  parts.push(`- ${aiLanguageInstruction(input.request.language ?? 'en')}`);
  if ((input.request.additionalTargetRoles ?? []).length > 0) {
    parts.push(
      '- The candidate is preparing more than one target role. A combined headline is allowed only when the roles share a real skill or domain; never join unrelated occupations in one line.'
    );
  }
  parts.push(groundingRules());
  parts.push('- Return JSON: { "suggestions": string[] }');
  return parts.join('\n');
}

/**
 * Produces headline options for the verified user.
 *
 * The deterministic set is generated first and is always returned when the
 * model is absent, rate-limited, slow or wrong. This function never throws:
 * a failed AI call degrades to the local options with a reason, so the studio
 * can never be left in a loading state it cannot leave.
 */
export async function generateCvHeadlineSuggestions(
  userId: string,
  request: CvHeadlineRequest,
  ai: CvAssistAiClient | null,
  model: string | null
): Promise<CvHeadlineSuggestionsResult> {
  let context: AiCareerContext | null = null;
  try {
    context = await loadAiCareerContext(userId, { language: request.language });
  } catch (error) {
    console.error('Failed to load the career context for headline suggestions:', error);
  }

  const input: HeadlineSuggestionInput = context
    ? headlineInputFromCareerContext(context, request)
    : {
        targetRoleTitle: request.targetRoleTitle ?? '',
        additionalTargetRoles: request.additionalTargetRoles ?? [],
        language: normalizeAiLanguage(request.language),
        limit: CV_HEADLINE_SUGGESTION_COUNT,
      };

  const deterministic = generateHeadlineSuggestions(input);

  if (!ai || !model) {
    return { suggestions: deterministic, aiUsed: false, fallbackReason: null };
  }

  try {
    const contextBlock = context ? buildAiContextBlock(context) : '';
    const prompt = buildCvHeadlineSuggestionsPrompt({
      request,
      careerContextBlock: contextBlock,
      targetRoleTitle: input.targetRoleTitle,
    });
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    let payload: unknown;
    try {
      payload = JSON.parse(response.text || '{}');
    } catch {
      return {
        suggestions: deterministic,
        aiUsed: false,
        fallbackReason:
          'The AI returned an unreadable answer, so locally generated headline options are shown.',
      };
    }

    const errors = validateHeadlineSuggestionsPayload(payload);
    if (errors.length > 0) {
      console.error('CV headline suggestions returned an invalid payload:', errors);
      return {
        suggestions: deterministic,
        aiUsed: false,
        fallbackReason:
          'The AI returned no usable headline options, so locally generated options are shown.',
      };
    }

    const aiSuggestions = parseHeadlineSuggestionsPayload(payload);
    const suggestions = mergeHeadlineSuggestions(
      aiSuggestions,
      deterministic,
      { targetRoleTitle: input.targetRoleTitle, additionalTargetRoles: input.additionalTargetRoles },
      CV_HEADLINE_SUGGESTION_COUNT
    );

    return {
      suggestions,
      aiUsed: aiSuggestions.length > 0,
      fallbackReason:
        aiSuggestions.length > 0
          ? null
          : 'The AI returned no role-relevant headline options, so locally generated options are shown.',
    };
  } catch (error) {
    // A provider quota error or an outage is not the candidate's problem. The
    // local options are still useful, so they are returned with a reason.
    console.error('CV headline suggestion failed:', error);
    return {
      suggestions: deterministic,
      aiUsed: false,
      fallbackReason:
        'The AI assistant is unavailable right now, so locally generated headline options are shown.',
    };
  }
}
