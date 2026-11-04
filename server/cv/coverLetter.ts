// Writing a cover letter.
//
// The letter is written to be sent to an employer, so two things matter more
// than fluency:
//
//   * every claim has to come from the candidate's own record. The model is
//     told to use nothing else, and afterwards every sentence that names a
//     detail the candidate never supplied is removed — and the candidate is
//     told that it happened;
//   * a letter is never invented out of a failure. If the model is unavailable
//     or answers with something that is not a letter, there is no letter.
//
// The module is shared by the API route and the background task, so the letter
// a candidate gets from the button and the letter the task writes are the
// same letter.

import { groundingRules } from '../ai/grounding.ts';
import { buildGroundingProfileForUser } from '../ai/groundingProfile.ts';
import { stripUngroundedSentences } from '../ai/grounding.ts';
import { boundedList } from '../ai/boundedList.ts';
import { aiLanguageInstruction, normalizeAiLanguage, type AiLanguageCode } from '../../shared/aiLanguages.ts';
import type { JobDescriptionAiClient } from './jobDescription.ts';

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Checks that a model answer really is a cover letter.
 *
 * A letter shorter than a hundred characters is not a letter, and the
 * highlights have to be a list of strings, because the interface renders them.
 */
export function validateCoverLetterPayload(value: unknown): string[] {
  if (!isJsonObject(value)) return ['response is not an object'];
  const errors: string[] = [];
  if (typeof value.coverLetter !== 'string' || value.coverLetter.trim().length < 100) {
    errors.push('coverLetter');
  }
  if (!isStringArray(value.keyHighlights)) errors.push('keyHighlights');
  return errors;
}

export interface CoverLetterInput {
  company?: string | null;
  jobTitle?: string | null;
  jobDescription?: string | null;
  candidateName?: string | null;
  experiences?: unknown;
  skills?: unknown;
  projects?: unknown;
  tone?: string | null;
  language?: unknown;
}

/** The prompt that writes the letter. */
export function buildCoverLetterPrompt(input: CoverLetterInput): string {
  const safeCompany = (input.company ?? '').trim().slice(0, 200) || 'the company';
  const safeJobTitle = (input.jobTitle ?? '').trim().slice(0, 200) || 'the role';
  const safeJobDescription =
    (input.jobDescription ?? '').trim().slice(0, 4000) || 'Standard requirements';
  const safeCandidateName = (input.candidateName ?? '').trim().slice(0, 200) || 'Candidate';
  const safeTone = (input.tone ?? '').trim().slice(0, 80) || 'Professional & Confident';
  const safeExperiences = boundedList(input.experiences, 20, 400);
  const safeSkills = boundedList(input.skills, 40, 120);
  const safeProjects = boundedList(input.projects, 20, 400);
  const language = normalizeAiLanguage(input.language);

  return `Write a tailored, compelling cover letter for:
Candidate: ${safeCandidateName}
${aiLanguageInstruction(language)}
Company: ${safeCompany}
Role: ${safeJobTitle}
Tone: ${safeTone}
Job Requirements/Context: ${safeJobDescription}
Candidate Relevant Background:
- Experiences: ${JSON.stringify(safeExperiences)}
- Core Skills: ${JSON.stringify(safeSkills)}
- Key Projects: ${JSON.stringify(safeProjects)}

Rules:
1. Ground every claim strictly in candidate's provided experiences and projects.
2. Structure: Strong hook expressing excitement for ${safeCompany}, high-relevance achievement showcase directly matching the job, and proactive closing.
3. Keep it under 350 words.
${groundingRules()}
4. Return JSON: { "coverLetter": string, "keyHighlights": [string] }`;
}

export interface CoverLetterResult {
  ok: boolean;
  /** Why there is no letter, when there is none. */
  reason?: 'no_model' | 'model_error' | 'invalid_response';
  coverLetter?: string;
  keyHighlights?: string[];
  /** The claims that were removed because the candidate never supplied them. */
  groundingNotes?: { removedSuggestions: string[]; message: string };
}

/**
 * Writes a cover letter for a candidate.
 *
 * The grounding check runs against the candidate's own record, so it needs the
 * candidate's id — never a value the request supplied.
 */
export async function generateCoverLetter(input: {
  userId: string;
  candidate: CoverLetterInput;
  ai: JobDescriptionAiClient | null;
  model: string;
}): Promise<CoverLetterResult> {
  if (!input.ai) return { ok: false, reason: 'no_model' };

  let payload: unknown;
  try {
    const response = await input.ai.models.generateContent({
      model: input.model,
      contents: buildCoverLetterPrompt(input.candidate),
      config: { responseMimeType: 'application/json' },
    });
    payload = JSON.parse(response.text || '{}');
  } catch (error) {
    return { ok: false, reason: 'model_error' };
  }

  const errors = validateCoverLetterPayload(payload);
  if (errors.length > 0) return { ok: false, reason: 'invalid_response' };

  const typed = payload as { coverLetter: string; keyHighlights: string[] };
  let coverLetter = typed.coverLetter;
  let groundingNotes: CoverLetterResult['groundingNotes'];

  // A claim the candidate cannot stand behind is removed before the letter is
  // ever seen, and the candidate is told it happened.
  const grounding = await buildGroundingProfileForUser(input.userId);
  const stripped = stripUngroundedSentences(coverLetter, grounding);
  if (stripped.removed.length > 0) {
    coverLetter = stripped.text;
    groundingNotes = {
      removedSuggestions: stripped.removed.map((claim) => claim.claim),
      message:
        'Part of the letter mentioned details that are not in your profile and was removed. Add the detail to your profile first if you want it used.',
    };
  }

  return {
    ok: true,
    coverLetter,
    keyHighlights: typed.keyHighlights,
    groundingNotes,
  };
}

export type { AiLanguageCode };
