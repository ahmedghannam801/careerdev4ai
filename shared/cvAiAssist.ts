/**
 * The contract for AI-assisted writing in the CV studio.
 *
 * The studio used to offer the model exactly one job: score the CV for ATS
 * keywords. Every sentence a candidate puts on a CV — the summary, the
 * experience bullets, the project description, the course and certification
 * lines — had to be written by hand, even when the platform already held the
 * facts.
 *
 * This module is the single description of that writing task. It is shared by
 * the server (which builds the prompt and validates the answer) and by the
 * client (which renders the control and knows what shape each field takes), so
 * the two can never disagree about what "an experience bullet" means.
 *
 * The rule that matters throughout: the model is given the candidate's own
 * record and is told not to invent. It rewrites what exists; it does not
 * create what does not.
 */

/** The CV fields the assistant can write. */
export type CvAssistField =
  | 'summary'
  | 'headline'
  | 'experience'
  | 'education'
  | 'project'
  | 'certification'
  | 'course'
  | 'volunteering'
  | 'skills';

/** How a field's content is shaped. */
export type CvAssistFormat = 'text' | 'bullets';

/** The register the candidate asked for. */
export type CvAssistTone = 'professional' | 'impactful' | 'concise' | 'technical';

/** How much the candidate asked for. */
export type CvAssistLength = 'short' | 'medium' | 'long';

export interface CvAssistFieldSpec {
  /** The shape of the generated content. */
  format: CvAssistFormat;
  /** The shortest acceptable result, in words. */
  minWords: number;
  /** The longest sensible result, in words, at the medium length. */
  maxWords: number;
  /**
   * The instruction used for this field. It is deliberately generic: the
   * candidate's own record supplies the substance.
   */
  instruction: string;
}

/**
 * Every field the assistant can write, and what a good answer looks like.
 *
 * The word counts are the medium-length budget. The short and long lengths
 * scale the ceiling from here; the floor never moves, because a shorter
 * answer that still says something is better than a longer one that pads.
 */
export const CV_ASSIST_FIELDS: Record<CvAssistField, CvAssistFieldSpec> = {
  summary: {
    format: 'text',
    minWords: 25,
    maxWords: 80,
    instruction:
      'Write the professional summary paragraph that sits at the top of the CV and is read first.',
  },
  headline: {
    format: 'text',
    minWords: 3,
    maxWords: 14,
    instruction:
      'Write the single line under the name that states who the candidate is and the role they are aiming at.',
  },
  experience: {
    format: 'bullets',
    minWords: 10,
    maxWords: 35,
    instruction:
      'Write the bullet points for one role: what the candidate did there and what it resulted in.',
  },
  education: {
    format: 'text',
    minWords: 12,
    maxWords: 55,
    instruction:
      'Write the line or two that explains the degree, the field of study and anything else relevant about it.',
  },
  project: {
    format: 'bullets',
    minWords: 8,
    maxWords: 30,
    instruction:
      'Write the bullet points for one project: what it was, what the candidate built and what it did.',
  },
  certification: {
    format: 'text',
    minWords: 6,
    maxWords: 30,
    instruction:
      'Write the line that gives this certification context: what it is and what it evidences.',
  },
  course: {
    format: 'text',
    minWords: 6,
    maxWords: 30,
    instruction:
      'Write the line that gives this completed course context: what was studied and why it is worth listing.',
  },
  volunteering: {
    format: 'bullets',
    minWords: 8,
    maxWords: 30,
    instruction:
      'Write the bullet points for one volunteering stint: what the candidate contributed and what it resulted in.',
  },
  skills: {
    format: 'text',
    minWords: 4,
    maxWords: 35,
    instruction:
      'Write the skills line for the CV, choosing only from the skills the candidate has actually rated.',
  },
};

/** The tones the candidate can pick from. */
export const CV_ASSIST_TONES: readonly CvAssistTone[] = [
  'professional',
  'impactful',
  'concise',
  'technical',
];

/** The lengths the candidate can pick from. */
export const CV_ASSIST_LENGTHS: readonly CvAssistLength[] = ['short', 'medium', 'long'];

/**
 * How each tone is described to the model.
 *
 * These are instructions, not instructions *to the candidate*: the model is
 * told which register to write in, and the grounding rules still apply on top.
 */
export const CV_ASSIST_TONE_INSTRUCTIONS: Record<CvAssistTone, string> = {
  professional: 'Measured and professional. Plain, confident, no hype.',
  impactful: 'Result-led and energetic. Lead with what the work achieved.',
  concise: 'Terse. Shortest wording that still says something real.',
  technical:
    'Precise and technical. Name the specific tools and technologies involved.',
};

/** The word budget for a field at a given length. */
export function cvAssistWordBudget(
  field: CvAssistField,
  length: CvAssistLength
): { min: number; max: number } {
  const spec = CV_ASSIST_FIELDS[field];
  if (length === 'short') {
    return { min: spec.minWords, max: Math.max(spec.minWords, Math.round(spec.maxWords * 0.5)) };
  }
  if (length === 'long') {
    return { min: spec.minWords, max: Math.round(spec.maxWords * 1.6) };
  }
  return { min: spec.minWords, max: spec.maxWords };
}

/** The number of bullets a bullet-shaped field should carry at a given length. */
export function cvAssistBulletBudget(length: CvAssistLength): { min: number; max: number } {
  if (length === 'short') return { min: 2, max: 3 };
  if (length === 'long') return { min: 5, max: 8 };
  return { min: 3, max: 5 };
}

/** A tone is accepted only when it is one this application offers. */
export function isCvAssistTone(value: unknown): value is CvAssistTone {
  return typeof value === 'string' && (CV_ASSIST_TONES as readonly string[]).includes(value);
}

/** A length is accepted only when it is one this application offers. */
export function isCvAssistLength(value: unknown): value is CvAssistLength {
  return typeof value === 'string' && (CV_ASSIST_LENGTHS as readonly string[]).includes(value);
}

/** A field is accepted only when the assistant knows how to write it. */
export function isCvAssistField(value: unknown): value is CvAssistField {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CV_ASSIST_FIELDS, value);
}

/**
 * The records a field can be written from.
 *
 * Each one names a row the candidate already owns. The server resolves the
 * row itself, so the model is always writing about something that is really
 * in the account.
 */
export const CV_ASSIST_SOURCE_KINDS = [
  'experience',
  'education',
  'project',
  'volunteering',
  'certification',
  'course',
] as const;

export type CvAssistSourceKind = (typeof CV_ASSIST_SOURCE_KINDS)[number];

/**
 * A source kind is accepted only when the server knows how to resolve it.
 *
 * An unrecognised kind is treated as "no source" rather than as an error:
 * the request still runs, grounded on the candidate's whole record.
 */
export function isCvAssistSourceKind(value: unknown): value is CvAssistSourceKind {
  return (
    typeof value === 'string' &&
    (CV_ASSIST_SOURCE_KINDS as readonly string[]).includes(value)
  );
}

/**
 * The variation hints used when the candidate asks for another attempt.
 *
 * Without them a regeneration returns the same paragraph: the model reads the
 * same prompt and has no reason to change its mind. Each attempt is asked to
 * lead from a different angle, so the second answer is genuinely another
 * option rather than a copy.
 */
export const CV_ASSIST_VARIATION_HINTS: readonly string[] = [
  'Lead with the outcome rather than the task.',
  'Lead with the scale or scope of the work, if the record supports it.',
  'Lead with the specific skills and tools the work involved.',
  'Lead with the progression: what changed for the candidate over time.',
  'Lead with the problem that was solved.',
  'Lead with what the candidate was responsible for personally.',
];

/**
 * The instruction for one attempt.
 *
 * The first attempt carries no hint, so the model's own best answer is the
 * baseline a regeneration is compared against.
 */
export function cvAssistVariationHint(attempt: number): string {
  if (!Number.isFinite(attempt) || attempt <= 0) return '';
  const index = (attempt - 1) % CV_ASSIST_VARIATION_HINTS.length;
  return CV_ASSIST_VARIATION_HINTS[index];
}

/** The upper bound on a single generated field, in characters. */
export const CV_ASSIST_MAX_CHARS = 4000;

/** The upper bound on a single bullet, in characters. */
export const CV_ASSIST_MAX_BULLET_CHARS = 400;

/** The upper bound on the number of bullets in one answer. */
export const CV_ASSIST_MAX_BULLETS = 10;

/** How many headline options the studio asks for and shows. */
export const CV_HEADLINE_SUGGESTION_COUNT = 5;

/** The upper bound on one headline, in characters. */
export const CV_HEADLINE_SUGGESTION_MAX_CHARS = 140;

/** The upper bound on a headline suggestion list, however it was produced. */
export const CV_HEADLINE_SUGGESTION_MAX_ITEMS = 8;

/**
 * Validates the model's headline suggestions.
 *
 * A list of empty strings, or one over-long line, is not a set of options the
 * candidate can choose from. The caller falls back to the deterministic
 * generator when this returns anything.
 */
export function validateHeadlineSuggestionsPayload(payload: unknown): string[] {
  const errors: string[] = [];
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return ['response is not an object'];
  }
  const record = payload as { suggestions?: unknown };
  if (!Array.isArray(record.suggestions)) {
    return ['suggestions is not an array'];
  }
  if (record.suggestions.length === 0) {
    errors.push('no suggestions');
  }
  if (record.suggestions.length > CV_HEADLINE_SUGGESTION_MAX_ITEMS) {
    errors.push('too many suggestions');
  }
  let usable = 0;
  for (const suggestion of record.suggestions) {
    if (typeof suggestion !== 'string' || suggestion.trim().length === 0) {
      errors.push('a suggestion is empty');
      continue;
    }
    if (suggestion.length > CV_HEADLINE_SUGGESTION_MAX_CHARS) {
      errors.push('a suggestion is too long');
      continue;
    }
    usable += 1;
  }
  if (usable === 0 && !errors.includes('no suggestions')) {
    errors.push('no usable suggestions');
  }
  return errors;
}

/**
 * Turns a validated answer into the list the studio shows.
 *
 * Duplicates are removed case-insensitively: two identical options are one
 * option, and showing them twice wastes a slot the candidate could use.
 */
export function parseHeadlineSuggestionsPayload(payload: unknown): string[] {
  const record = payload as { suggestions?: unknown };
  if (!Array.isArray(record?.suggestions)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of record.suggestions) {
    if (typeof entry !== 'string') continue;
    const text = entry.replace(/\s+/g, ' ').trim();
    if (!text || text.length > CV_HEADLINE_SUGGESTION_MAX_CHARS) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= CV_HEADLINE_SUGGESTION_MAX_ITEMS) break;
  }
  return result;
}

/**
 * Validates the model's answer.
 *
 * An answer that does not pass is not shown: a half-written bullet or a
 * paragraph of empty strings is worse than no answer at all, because it looks
 * like something the candidate might put on a CV.
 */
export function validateCvAssistPayload(
  payload: unknown,
  field: CvAssistField
): string[] {
  const errors: string[] = [];
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return ['response is not an object'];
  }
  const record = payload as { text?: unknown; bullets?: unknown };
  const spec = CV_ASSIST_FIELDS[field];

  if (typeof record.text !== 'string' || record.text.trim().length === 0) {
    errors.push('text');
  } else if (record.text.length > CV_ASSIST_MAX_CHARS) {
    errors.push('text is too long');
  }

  if (record.bullets !== undefined) {
    if (!Array.isArray(record.bullets)) {
      errors.push('bullets is not an array');
    } else if (record.bullets.length > CV_ASSIST_MAX_BULLETS) {
      errors.push('too many bullets');
    } else {
      for (const bullet of record.bullets) {
        if (typeof bullet !== 'string' || bullet.trim().length === 0) {
          errors.push('a bullet is empty');
          break;
        }
        if (bullet.length > CV_ASSIST_MAX_BULLET_CHARS) {
          errors.push('a bullet is too long');
          break;
        }
      }
    }
  }

  if (spec.format === 'bullets') {
    if (!Array.isArray(record.bullets) || record.bullets.length === 0) {
      errors.push('bullets are required for this field');
    }
  }

  return errors;
}

/**
 * Turns a validated answer into the content the editor applies.
 *
 * A bullet-shaped field takes its bullets; a text-shaped field takes the
 * paragraph. The text is returned for both so the caller can show the whole
 * answer and so the grounding check has something to run against.
 */
export function parseCvAssistPayload(
  payload: unknown,
  field: CvAssistField
): { text: string; bullets: string[] } {
  const record = payload as { text?: unknown; bullets?: unknown };
  const text = typeof record?.text === 'string' ? record.text.trim() : '';
  const bullets = Array.isArray(record?.bullets)
    ? record.bullets
        .filter((bullet): bullet is string => typeof bullet === 'string')
        .map((bullet) => bullet.trim())
        .filter(Boolean)
    : [];
  if (CV_ASSIST_FIELDS[field].format === 'bullets') {
    return { text: bullets.join('\n'), bullets };
  }
  return { text, bullets };
}
