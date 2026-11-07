/**
 * The contract of the extraction review.
 *
 * The studio used to show a CV that had already been imported: the upload
 * route wrote the parsed document straight into the account, and the modal
 * that appeared afterwards said how many fields had been found. That order
 * made the candidate a spectator of a decision that had already been made.
 *
 * This module is the contract for the other order:
 *
 *   upload -> extract -> REVIEW -> adopt
 *
 * The review is the part that matters, so its shape is written down once and
 * shared by the server that produces it and the client that displays it. The
 * rules it follows are these:
 *
 *   - Every value carries where it came from. A field the reviewer cannot
 *     trace back to the document is not a value, it is a guess, and the review
 *     says so instead of showing it as fact.
 *   - Every value carries how sure the extractor is. The three levels are
 *     not a feeling: they are computed from the evidence, so the same
 *     document always produces the same grade.
 *   - Nothing is applied to the candidate's records until they accept it.
 *     The extraction is a pure function of the document; the import is a
 *     separate, idempotent write.
 *   - A missing field is reported as missing. It is never filled with a
 *     plausible value, because a plausible value that the candidate did not
 *     write is a lie that looks like a CV.
 */

import type { CVProfile } from '../src/types/career.ts';

/* -------------------------------------------------------------------------- */
/* Confidence                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How sure the extractor is about a value.
 *
 * `needs-review` is not a lower score than `low`: it is a different
 * statement. `low` means the value is probably right but weakly evidenced,
 * while `needs-review` means the extractor found a contradiction and the
 * candidate has to decide which half of it is true.
 */
export type CvConfidenceLevel = 'high' | 'medium' | 'low' | 'needs-review';

/** The levels, ordered from the most certain to the least. */
export const CV_CONFIDENCE_LEVELS: readonly CvConfidenceLevel[] = [
  'high',
  'medium',
  'low',
  'needs-review',
];

/**
 * The English label of each level.
 *
 * The labels are wording, not values: the review screen translates them, so
 * they live here with the other wording rather than in the server.
 */
export const CV_CONFIDENCE_LABELS: Record<CvConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  'needs-review': 'Needs review',
};

/**
 * The score above which a value is high confidence.
 *
 * The thresholds are deliberately generous at the top and strict in the
 * middle: a field that is a direct, unambiguous match on a labelled line is
 * high confidence, and anything that had to be inferred from a bullet, a
 * sidebar or a neighbouring line is not.
 */
export const CV_CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  medium: 0.6,
  low: 0.35,
} as const;

/** Turns a 0..1 score into a level. */
export function confidenceFromScore(score: number): CvConfidenceLevel {
  const value = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  if (value >= CV_CONFIDENCE_THRESHOLDS.high) return 'high';
  if (value >= CV_CONFIDENCE_THRESHOLDS.medium) return 'medium';
  if (value >= CV_CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'low';
}

/** A score for a level, so a level can be compared and averaged. */
export function scoreFromConfidence(level: CvConfidenceLevel): number {
  switch (level) {
    case 'high':
      return 1;
    case 'medium':
      return 0.75;
    case 'low':
      return 0.45;
    case 'needs-review':
      return 0.2;
    default:
      return 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The sections a CV is read into.
 *
 * The list is the platform's own vocabulary: a section that is not here has
 * no home in the document, so it is reported as an unrecognised block rather
 * than dropped silently.
 */
export type CvSectionKey =
  | 'personal'
  | 'summary'
  | 'experience'
  | 'internships'
  | 'education'
  | 'projects'
  | 'skills'
  | 'certifications'
  | 'courses'
  | 'languages'
  | 'volunteering'
  | 'awards'
  | 'publications'
  | 'research'
  | 'leadership'
  | 'links';

/** Every section, in the order a CV is read. */
export const CV_SECTION_KEYS: readonly CvSectionKey[] = [
  'personal',
  'summary',
  'experience',
  'internships',
  'education',
  'projects',
  'skills',
  'certifications',
  'courses',
  'languages',
  'volunteering',
  'awards',
  'publications',
  'research',
  'leadership',
  'links',
];

/** The English label of a section. The client translates it for display. */
export const CV_SECTION_LABELS: Record<CvSectionKey, string> = {
  personal: 'Personal details',
  summary: 'Professional summary',
  experience: 'Work experience',
  internships: 'Internships',
  education: 'Education',
  projects: 'Projects',
  skills: 'Skills',
  certifications: 'Certifications',
  courses: 'Courses',
  languages: 'Languages',
  volunteering: 'Volunteering',
  awards: 'Awards',
  publications: 'Publications',
  research: 'Research',
  leadership: 'Leadership',
  links: 'Links',
};

/**
 * The sections that hold a list of entries rather than a single value.
 *
 * The review screen renders them as a list and lets each entry be accepted,
 * corrected or rejected on its own.
 */
export const CV_LIST_SECTIONS: readonly CvSectionKey[] = [
  'experience',
  'internships',
  'education',
  'projects',
  'certifications',
  'courses',
  'languages',
  'volunteering',
  'awards',
  'publications',
  'research',
  'leadership',
];

/* -------------------------------------------------------------------------- */
/* Fields, entries and evidence                                                */
/* -------------------------------------------------------------------------- */

/**
 * Where a value came from.
 *
 * The text is the exact fragment of the document the value was read out of,
 * not a paraphrase of it: the candidate has to be able to check the extraction
 * against the original without trusting the extractor's summary of it.
 */
export interface CvFieldEvidence {
  /** The exact text the value was read from. */
  text: string;
  /** The page it was found on, when the document has pages. */
  page?: number;
}

/**
 * What the candidate has done with a value.
 *
 * `extracted` is what the engine produced and nobody has looked at it.
 * `confirmed` is what the candidate accepted as it stood. `edited` is what
 * the candidate corrected. `rejected` is what the candidate refused.
 */
export type CvFieldStatus = 'extracted' | 'confirmed' | 'edited' | 'rejected' | 'missing';

/** One value, with everything the reviewer needs to judge it. */
export interface CvExtractedField<T = string> {
  /** The key of the field inside its section, e.g. `company` or `startDate`. */
  key: string;
  /** The English label of the field. */
  label: string;
  /** The value, or null when the document did not state one. */
  value: T | null;
  /** How sure the extractor is. */
  confidence: CvConfidenceLevel;
  /** What the candidate has done with it. */
  status: CvFieldStatus;
  /** Where the value came from. */
  evidence: CvFieldEvidence[];
  /** Why the value is uncertain, in plain language. */
  issues: string[];
}

/** One entry of a list section: a role, a degree, a project. */
export interface CvExtractedEntry {
  /** A stable id for this entry within the review. */
  id: string;
  /** The English title of the entry, used as its heading in the review. */
  label: string;
  /** How sure the extractor is about the entry as a whole. */
  confidence: CvConfidenceLevel;
  /** What the candidate has done with it. */
  status: CvFieldStatus;
  /** The fields of this entry. */
  fields: Record<string, CvExtractedField>;
  /** The text the entry was read from. */
  evidence: CvFieldEvidence[];
}

/** One section of the review. */
export interface CvExtractedSection {
  key: CvSectionKey;
  /** The English label of the section. */
  label: string;
  /** Whether the document had this section at all. */
  present: boolean;
  /** How sure the extractor is about the section as a whole. */
  confidence: CvConfidenceLevel;
  /** The single-value fields, for the sections that have one. */
  fields: Record<string, CvExtractedField>;
  /** The entries, for the sections that have a list. */
  entries: CvExtractedEntry[];
  /** The issues found in this section. */
  issues: string[];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/** How serious an issue is. */
export type CvIssueSeverity = 'error' | 'warning' | 'info';

/**
 * One thing that is wrong, missing or suspicious in the extraction.
 *
 * The codes are stable so the client can react to a kind of problem without
 * matching on the message, and so the test suite can assert on the kind
 * rather than on the wording.
 */
export interface CvValidationIssue {
  /** A stable code, e.g. `duplicate_experience` or `overlapping_dates`. */
  code: string;
  /** How serious it is. */
  severity: CvIssueSeverity;
  /** Where the issue is: `experience[0].startDate`, or `personal.email`. */
  path: string;
  /**
   * The message, in English, with `{placeholders}` where a value goes.
   *
   * It is a template rather than a finished sentence so that it can be
   * translated: the Arabic catalogue is keyed by the English text, and a
   * sentence with the values already in it would be a new string every
   * time and would never be found.
   */
  message: string;
  /** The values the message refers to. */
  params?: Record<string, string>;
  /** What the candidate can do about it, in the same form. */
  suggestion?: string;
  /** The values the suggestion refers to. */
  suggestionParams?: Record<string, string>;
}

/* -------------------------------------------------------------------------- */
/* The review                                                                  */
/* -------------------------------------------------------------------------- */

/** The document the review is about. */
export interface CvExtractionSource {
  /** The format the document was read from. */
  format: CvSourceFormat;
  /** The name of the uploaded file, when there was one. */
  fileName?: string;
  /** How many pages the document has. */
  pageCount: number;
  /** The layout the extractor found. */
  layout: 'single-column' | 'two-column' | 'multi-column';
  /** How much text was read. */
  characterCount: number;
  /** How many words were read. */
  wordCount: number;
  /** The language the document is written in. */
  language: CvSourceLanguage;
  /** Whether the document is a scan with no text layer. */
  isScanned: boolean;
}

/** The formats the extractor can read. */
export type CvSourceFormat = 'pdf' | 'docx' | 'doc' | 'txt' | 'json';

/** The languages the extractor recognises. */
export type CvSourceLanguage = 'ar' | 'en' | 'mixed' | 'unknown';

/** One block of the original document, for the preview beside the fields. */
export interface CvSourceBlock {
  /** A stable id, so the client can highlight the block a field came from. */
  id: string;
  /** The page the block is on. */
  page?: number;
  /** The text of the block. */
  text: string;
}

/** The counts the review screen shows at the top. */
export interface CvExtractionSummary {
  /** The confidence of the document as a whole. */
  confidence: CvConfidenceLevel;
  /** The score behind that confidence, 0..100. */
  score: number;
  /** How many sections the document had. */
  sectionsFound: number;
  /** How many sections a CV can have. */
  sectionsTotal: number;
  /** How many values were extracted. */
  fieldsExtracted: number;
  /** How many of them are high confidence. */
  fieldsHigh: number;
  /** How many of them are medium confidence. */
  fieldsMedium: number;
  /** How many of them are low confidence or need review. */
  fieldsLow: number;
  /** How many expected fields the document did not state. */
  fieldsMissing: number;
  /** How many issues of each severity were found. */
  issues: { errors: number; warnings: number; info: number };
}

/**
 * Everything the review screen needs.
 *
 * The document is included whole, so the candidate can correct it in place.
 * The section breakdown is included beside it, so the screen can show the
 * confidence and the evidence for every field without re-deriving anything.
 */
export interface CvExtractionReview {
  /** The document the review is about. */
  source: CvExtractionSource;
  /** The extracted document, ready to be corrected and then adopted. */
  cv: CVProfile;
  /** The sections, with the confidence and the evidence for every field. */
  sections: CvExtractedSection[];
  /** Everything that is wrong, missing or suspicious. */
  validation: CvValidationIssue[];
  /** The counts the review screen shows at the top. */
  summary: CvExtractionSummary;
  /** The original text, block by block. */
  preview: CvSourceBlock[];
}

/* -------------------------------------------------------------------------- */
/* Applying a review                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The request that adopts a reviewed document.
 *
 * The document is sent whole and corrected, because the candidate edited it in
 * the review screen and the server has no way to know which of its values
 * were changed. The sections say which parts of it the candidate accepted,
 * so a section they rejected is not written even if it is in the payload.
 */
export interface CvReviewedImportRequest {
  /** The corrected document. */
  cv: CVProfile;
  /** Which sections the candidate accepted. */
  selectedSections: Record<string, boolean>;
  /**
   * A key that makes the write idempotent.
   *
   * The same key applied twice writes once. The client generates it per
   * review, so a double click, a retry after a dropped connection or a
   * refresh on the confirmation screen cannot create a second copy of
   * everything.
   */
  idempotencyKey?: string;
}

/** The outcome of one section of a reviewed import. */
export interface CvReviewedSectionResult {
  section: string;
  /** How many records were written. */
  imported: number;
  /** How many were already there. */
  skipped: number;
  /** How many could not be written. */
  failed: number;
  /** The errors, when there were any. */
  errors: string[];
}

/** The outcome of a reviewed import. */
export interface CvReviewedImportResult {
  success: boolean;
  /** How many records were written in total. */
  imported: number;
  /** How many were already there. */
  skipped: number;
  /** How many could not be written. */
  failed: number;
  /** The outcome of each section. */
  sections: CvReviewedSectionResult[];
  /** The errors, when there were any. */
  errors: string[];
  /** Whether the write had already been applied with the same key. */
  alreadyApplied?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** True when the value has something in it. */
export function hasExtractedValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

/**
 * Counts the values in a review by their confidence.
 *
 * The summary is computed from the fields rather than from the section
 * scores, so it counts what the candidate actually sees: a document with
 * nine certain fields and one doubtful one is a document with one doubtful
 * field, however well its sections scored overall.
 */
export function summarizeReview(review: {
  sections: CvExtractedSection[];
  validation: CvValidationIssue[];
}): CvExtractionSummary {
  let fieldsExtracted = 0;
  let fieldsHigh = 0;
  let fieldsMedium = 0;
  let fieldsLow = 0;
  let fieldsMissing = 0;
  let scoreTotal = 0;
  let scoreCount = 0;

  const countField = (field: CvExtractedField) => {
    if (!hasExtractedValue(field.value)) {
      fieldsMissing += 1;
      return;
    }
    fieldsExtracted += 1;
    scoreTotal += scoreFromConfidence(field.confidence);
    scoreCount += 1;
    if (field.confidence === 'high') fieldsHigh += 1;
    else if (field.confidence === 'medium') fieldsMedium += 1;
    else fieldsLow += 1;
  };

  let sectionsFound = 0;
  for (const section of review.sections) {
    if (section.present) sectionsFound += 1;
    for (const field of Object.values(section.fields)) countField(field);
    for (const entry of section.entries) {
      for (const field of Object.values(entry.fields)) countField(field);
    }
  }

  const errors = review.validation.filter((issue) => issue.severity === 'error').length;
  const warnings = review.validation.filter((issue) => issue.severity === 'warning').length;
  const info = review.validation.filter((issue) => issue.severity === 'info').length;

  const score = scoreCount > 0 ? Math.round((scoreTotal / scoreCount) * 100) : 0;

  return {
    confidence: scoreCount > 0 ? confidenceFromScore(scoreTotal / scoreCount) : 'low',
    score,
    sectionsFound,
    sectionsTotal: CV_SECTION_KEYS.length,
    fieldsExtracted,
    fieldsHigh,
    fieldsMedium,
    fieldsLow,
    fieldsMissing,
    issues: { errors, warnings, info },
  };
}
