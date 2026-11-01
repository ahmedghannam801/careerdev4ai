/**
 * The job description, the ATS match it implies, and the CV written for it.
 *
 * This module holds the contract between the server and the CV studio for the
 * "paste a job description, get a CV written for it" flow. It is pure: no
 * database, no model, no network. Everything here can be tested without a
 * server, which matters because these are the parts that decide what the
 * candidate is told about their own CV.
 *
 * Three rules shape the whole design.
 *
 * First, the job description is not a source of facts about the candidate. It
 * describes what the employer wants; the candidate's records describe what the
 * candidate has. The two are compared, never merged. A requirement the
 * candidate cannot support is reported as missing, never written onto the CV.
 *
 * Second, the ATS score is computed from the records, not asserted by a model.
 * `buildAtsMatchReport` reads the candidate's real skills and real text and
 * says exactly which requirement each piece of evidence supports. A model is
 * never asked "how well does this CV match?" — it is asked to extract the
 * requirements, and that extraction is then checked against the pasted text.
 *
 * Third, the generated CV is applied to the candidate's own document rather
 * than replacing it. `applyAtsCvToDocument` rewrites wording and reorders
 * what is already there, and it refuses to write a skill the document does not
 * already own. The candidate can edit every word afterwards.
 */

import { skillMatchConfidence } from './skillMatching.ts';
import type { AiLanguageCode } from './aiLanguages.ts';

// ---------------------------------------------------------------------------
// The job description analysis
// ---------------------------------------------------------------------------

/**
 * The kinds of requirement a job description can contain.
 *
 * The kind decides how the requirement is matched against the candidate's
 * records and how much it weighs in the score.
 */
export type JdRequirementKind =
  | 'required_skill'
  | 'technical_skill'
  | 'keyword'
  | 'responsibility'
  | 'experience'
  | 'qualification';

/**
 * How important a requirement is.
 *
 * `core` requirements decide whether the candidate is a plausible applicant at
 * all. `preferred` ones make the application stronger. `mention` ones are
 * keywords an applicant filter scans for.
 */
export type JdRequirementImportance = 'core' | 'preferred' | 'mention';

/** The seven things a job description is read for. */
export interface JobDescriptionAnalysis {
  /** The role the advertisement is for, when the text names one. */
  jobTitle: string | null;
  /** The skills the advertisement lists as required. */
  requiredSkills: string[];
  /** The tools, languages and platforms it names. */
  technicalSkills: string[];
  /** The terms an applicant filter is likely to scan for. */
  keywords: string[];
  /** What the person in the role is expected to do. */
  responsibilities: string[];
  /** How much experience the advertisement asks for. */
  experienceRequirements: string[];
  /** The credentials it asks for. */
  qualifications: string[];
}

/** The keys of `JobDescriptionAnalysis`, in the order the UI shows them. */
export const JOB_DESCRIPTION_LIST_FIELDS = [
  'requiredSkills',
  'technicalSkills',
  'keywords',
  'responsibilities',
  'experienceRequirements',
  'qualifications',
] as const;

export type JobDescriptionListField = (typeof JOB_DESCRIPTION_LIST_FIELDS)[number];

/** An empty analysis, used as the starting point and as the fallback shape. */
export function emptyJobDescriptionAnalysis(): JobDescriptionAnalysis {
  return {
    jobTitle: null,
    requiredSkills: [],
    technicalSkills: [],
    keywords: [],
    responsibilities: [],
    experienceRequirements: [],
    qualifications: [],
  };
}

/** The longest a single extracted item may be. */
const MAX_ITEM_LENGTH = 220;

/** The most items one field may hold. */
const MAX_ITEMS_PER_FIELD = 25;

/**
 * Coerces one extracted item into a clean string.
 *
 * The model may return a string, a number or a nested object; anything that
 * cannot be read as a short piece of text is dropped rather than stringified
 * into something meaningless.
 */
function coerceItem(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/\s+/g, ' ');
    if (!trimmed) return null;
    return trimmed.length > MAX_ITEM_LENGTH ? `${trimmed.slice(0, MAX_ITEM_LENGTH - 1)}…` : trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/**
 * Coerces one extracted list, dropping blanks and duplicates.
 *
 * The order the model produced is preserved: the order of a job description's
 * requirements is meaningful, and it is usually the employer's own order of
 * importance.
 */
export function coerceRequirementList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const item = coerceItem(entry);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_ITEMS_PER_FIELD) break;
  }
  return out;
}

/**
 * Validates a raw model payload against the analysis contract.
 *
 * The errors are returned rather than thrown so the caller can log what the
 * model got wrong and fall back safely.
 */
export function validateJobDescriptionAnalysis(payload: unknown): string[] {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('The payload is not an object.');
    return errors;
  }
  const record = payload as Record<string, unknown>;

  if (record.jobTitle !== undefined && record.jobTitle !== null && typeof record.jobTitle !== 'string') {
    errors.push('jobTitle must be a string or null.');
  }
  for (const field of JOB_DESCRIPTION_LIST_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) {
      errors.push(`${field} must be an array of strings.`);
      continue;
    }
    for (const entry of value) {
      if (typeof entry !== 'string' && typeof entry !== 'number') {
        errors.push(`${field} must contain only strings.`);
        break;
      }
    }
  }
  return errors;
}

/**
 * Turns a validated model payload into an analysis.
 *
 * Returns null when the payload does not satisfy the contract, so the caller
 * can fall back to the deterministic extraction instead of showing a
 * half-parsed job description.
 */
export function parseJobDescriptionAnalysis(payload: unknown): JobDescriptionAnalysis | null {
  if (validateJobDescriptionAnalysis(payload).length > 0) return null;
  const record = (payload ?? {}) as Record<string, unknown>;
  const title = coerceItem(record.jobTitle);
  return {
    jobTitle: title,
    requiredSkills: coerceRequirementList(record.requiredSkills),
    technicalSkills: coerceRequirementList(record.technicalSkills),
    keywords: coerceRequirementList(record.keywords),
    responsibilities: coerceRequirementList(record.responsibilities),
    experienceRequirements: coerceRequirementList(record.experienceRequirements),
    qualifications: coerceRequirementList(record.qualifications),
  };
}

// ---------------------------------------------------------------------------
// Tokenising, for Arabic and English alike
// ---------------------------------------------------------------------------

/**
 * Words that carry no matching signal.
 *
 * Both English and Arabic are listed, because the tokeniser below is
 * language-neutral and a job description may be written in either.
 */
const STOP_WORDS = new Set(
  [
    // English
    'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could',
    'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'in', 'into', 'is', 'it', 'its',
    'like', 'may', 'might', 'must', 'not', 'of', 'on', 'only', 'or', 'other', 'our', 'out', 'over',
    'own', 'per', 'should', 'so', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there',
    'these', 'they', 'this', 'those', 'to', 'up', 'upon', 'use', 'used', 'using', 'very', 'was',
    'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'will', 'with', 'within',
    'without', 'would', 'you', 'your',
    // Job-description filler that says nothing about the work
    'ability', 'about', 'across', 'able', 'around', 'atleast', 'candidate', 'candidates',
    'degree', 'bachelor', 'bachelors', 'master', 'masters', 'bsc', 'msc', 'ba', 'ma', 'btech',
    'experience', 'experienced', 'excellent', 'familiar', 'good', 'great', 'knowledge',
    'least', 'minimum', 'plus', 'preferred', 'required', 'requirement', 'requirements',
    'responsible', 'role', 'roles', 'job', 'position', 'skills', 'strong', 'team', 'teams',
    'work', 'working', 'works', 'year', 'years', 'least',
    // Arabic
    'أن', 'إن', 'إلى', 'الى', 'ال', 'التي', 'الذي', 'الذين', 'ال.this', 'هذا', 'هذه', 'ذلك',
    'العمل', 'خبرة', 'سنوات', 'سنوات_خبرة', 'مطلوب', 'مطلوبة', 'مهارات', 'مسؤوليات',
    'مسؤولية', 'مؤهلات', 'مؤهل', 'شهادة', 'دبلوم', 'بكالوريوس', 'ماجستير', 'القدرة',
    'المعرفة', 'جيدة', 'ممتازة', 'يفضل', 'إلزامي', 'اساسي', 'أساسي', 'الحد', 'الاقلي',
    'على', 'في', 'من', 'عن', 'مع', 'او', 'أو', 'و', 'أن', 'كان', 'تكون', 'يجب', 'وأن',
    'جيد', 'قوي', 'متوسط', 'حول', 'على_الأقل', 'ما_يزيد', 'خلال',
  ].map((word) => word.toLowerCase())
);

/**
 * Tokens that describe a kind of work rather than a distinctive capability.
 *
 * They are too generic to prove that a candidate has a requirement, so they
 * neither count as evidence nor disqualify a match on their own.
 */
const GENERIC_TOKENS = new Set(
  [
    'analysis', 'analytics', 'basic', 'business', 'cloud', 'communication', 'computer', 'content',
    'control', 'data', 'design', 'development', 'digital', 'distribution', 'documentation',
    'engineering', 'finance', 'fundamental', 'integration', 'management', 'marketing', 'method',
    'network', 'operation', 'optimization', 'planning', 'practice', 'principles', 'process',
    'product', 'project', 'quality', 'research', 'risk', 'safety', 'science', 'security',
    'service', 'software', 'strategy', 'support', 'system', 'technical', 'technology', 'testing',
    'tool', 'web', 'mobile', 'senior', 'junior', 'mid', 'level', 'building', 'solutions',
    'مجال', 'مجال_التخصص', 'تطوير', 'تصميم', 'ادارة', 'تحليل', 'اختبار', 'نظام', 'برمجيات',
    'ويب', 'تطبيقات', 'مستوى', 'خبرة_في',
  ].map((word) => word.toLowerCase())
);

/**
 * Splits text into comparable tokens.
 *
 * The pattern is Unicode-aware so an Arabic job description tokenises exactly
 * like an English one. Arabic diacritics and the tatweel are removed first:
 * they are presentation, not content, and they would otherwise make two
 * spellings of the same word look unrelated.
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  return (
    text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\u0640/g, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}+#]+/gu) ?? []
  );
}

/**
 * True when a token is only a number and its symbols.
 *
 * "3+" in "3+ years of experience" is a quantity, not a word. Counting it as a
 * missing term would make every requirement that states a number of years
 * impossible to match against a record that states the same years.
 */
function isNumericToken(token: string): boolean {
  return /^[\d.,%+#-]+$/.test(token);
}

/** The tokens of a text that carry matching signal. */
export function significantTokens(text: string): string[] {
  return tokenizeText(text).filter(
    (token) =>
      token.length > 1 &&
      !STOP_WORDS.has(token) &&
      !GENERIC_TOKENS.has(token) &&
      !isNumericToken(token)
  );
}

/**
 * The tokens of a text that are worth looking for, including the generic ones.
 *
 * A generic word such as "science" is too weak to tell two skills apart, but
 * it is perfectly good evidence that somebody studied Computer Science. This
 * is the list used when a requirement is a sentence rather than a skill name.
 */
export function evidenceTokens(text: string): string[] {
  return tokenizeText(text).filter(
    (token) => token.length > 1 && !STOP_WORDS.has(token) && !isNumericToken(token)
  );
}

/**
 * A canonical, comparable form of a name.
 *
 * This mirrors the platform's own skill canonicaliser but keeps every Unicode
 * letter, so an Arabic skill name compares the same way an English one does.
 */
export function canonicalNameKey(name: string): string {
  return tokenizeText(name).join(' ');
}

/**
 * True when two names describe the same capability.
 *
 * The platform's own matcher is consulted first, because it understands the
 * phrase variants the catalogues use ("CI/CD" against "Continuous Integration").
 * The token comparison that follows is the fallback that works for scripts the
 * catalogue matcher does not model.
 */
export function namesMatch(a: string, b: string): boolean {
  const keyA = canonicalNameKey(a);
  const keyB = canonicalNameKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;

  if (skillMatchConfidence(a, b) > 0) return true;

  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const setB = new Set(tokensB);
  const shared = tokensA.filter((token) => setB.has(token));
  if (shared.length === 0) return false;
  if (shared.every((token) => token.length < 2)) return false;
  if (!shared.some((token) => !GENERIC_TOKENS.has(token))) return false;

  const coverage = shared.length / Math.min(tokensA.length, tokensB.length);
  return coverage >= 0.8;
}

// ---------------------------------------------------------------------------
// Grounding the analysis against the pasted text
// ---------------------------------------------------------------------------

/**
 * Keeps only the items the pasted job description actually supports.
 *
 * A model asked to pull skills out of an advertisement will occasionally add
 * one it "expects" to see. Every extracted item is therefore checked against
 * the pasted text, and anything that is not in it is dropped. The result is
 * only ever a reading of what the candidate pasted.
 */
export function groundJobDescriptionAnalysis(
  analysis: JobDescriptionAnalysis,
  jdText: string
): JobDescriptionAnalysis {
  const jdTokens = new Set(significantTokens(jdText));
  const jdCanonical = canonicalNameKey(jdText);

  const supported = (item: string, minimumCoverage: number): boolean => {
    const itemTokens = significantTokens(item);
    if (itemTokens.length === 0) {
      // Nothing distinctive to check. Fall back to a literal containment test.
      return jdCanonical.includes(canonicalNameKey(item));
    }
    const shared = itemTokens.filter((token) => jdTokens.has(token));
    const coverage = shared.length / itemTokens.length;
    if (coverage >= minimumCoverage) return true;
    // A multi-word phrase may appear verbatim even when its tokens are split
    // across the advertisement's formatting.
    return jdCanonical.includes(canonicalNameKey(item));
  };

  const keepList = (items: string[], minimumCoverage: number): string[] =>
    items.filter((item) => supported(item, minimumCoverage));

  const title = analysis.jobTitle;
  const groundedTitle = title && supported(title, 0.6) ? title : null;

  return {
    jobTitle: groundedTitle,
    // A skill must be recognisably present in the text.
    requiredSkills: keepList(analysis.requiredSkills, 0.8),
    technicalSkills: keepList(analysis.technicalSkills, 0.8),
    // A keyword may be a single common word, so it is held to a lower bar.
    keywords: keepList(analysis.keywords, 0.6),
    // A responsibility is a sentence, so most of its words must be there.
    responsibilities: keepList(analysis.responsibilities, 0.5),
    experienceRequirements: keepList(analysis.experienceRequirements, 0.5),
    qualifications: keepList(analysis.qualifications, 0.5),
  };
}

// ---------------------------------------------------------------------------
// The ATS match
// ---------------------------------------------------------------------------

/** One piece of the candidate's real record the match can be read against. */
export interface AtsProfileSource {
  /** A human label, so the evidence can be pointed at. */
  label: string;
  /** The text to look in. */
  text: string;
}

/**
 * Everything the candidate really has.
 *
 * This is assembled by the server from the verified user's records. Nothing in
 * it comes from the client, and nothing in it comes from the job description.
 */
export interface AtsProfileFacts {
  /** The skills the candidate rated, with the level they gave them. */
  skills: { name: string; level: number }[];
  /** The candidate's own words: job descriptions, project goals, notes. */
  sources: AtsProfileSource[];
}

/** One requirement, and whether the candidate's record supports it. */
export interface AtsRequirementMatch {
  /** The requirement, in the employer's own words. */
  requirement: string;
  /** Which kind of requirement it is. */
  kind: JdRequirementKind;
  /** How important it is. */
  importance: JdRequirementImportance;
  /** True when the candidate's record supports it. */
  matched: boolean;
  /** The record that supports it, or null when nothing does. */
  evidence: string | null;
}

/** The per-category scores behind the overall match. */
export interface AtsMatchBreakdown {
  skills: number;
  keywords: number;
  experience: number;
  qualifications: number;
  responsibilities: number;
}

/** The full result of comparing a job description with the candidate's record. */
export interface AtsMatchReport {
  /** 0..100. */
  score: number;
  /** The score per category. */
  breakdown: AtsMatchBreakdown;
  /** The requirements the record supports. */
  matched: AtsRequirementMatch[];
  /** The requirements the record does not support. */
  missing: AtsRequirementMatch[];
  /** A plain-language account of the score. */
  explanation: string;
  /** The matched requirements that read as keywords. */
  matchedKeywords: string[];
  /** The unmatched requirements that read as keywords. */
  missingKeywords: string[];
}

/** How much each kind of requirement weighs in the score. */
const REQUIREMENT_WEIGHTS: Record<JdRequirementKind, number> = {
  required_skill: 3,
  technical_skill: 3,
  qualification: 2,
  experience: 2,
  keyword: 1,
  responsibility: 1,
};

/** Which requirement kinds belong to which score category. */
const BREAKDOWN_GROUPS: Array<{ key: keyof AtsMatchBreakdown; kinds: JdRequirementKind[] }> = [
  { key: 'skills', kinds: ['required_skill', 'technical_skill'] },
  { key: 'keywords', kinds: ['keyword'] },
  { key: 'experience', kinds: ['experience'] },
  { key: 'qualifications', kinds: ['qualification'] },
  { key: 'responsibilities', kinds: ['responsibility'] },
];

/**
 * The index the match is computed against.
 *
 * It is built once per comparison so a requirement is not re-tokenised for
 * every record.
 */
interface EvidenceIndex {
  skills: { name: string; level: number }[];
  sources: { label: string; tokens: Set<string>; canonical: string }[];
  allTokens: Set<string>;
}

function buildEvidenceIndex(facts: AtsProfileFacts): EvidenceIndex {
  const sources = facts.sources.map((source) => ({
    label: source.label,
    tokens: new Set(tokenizeText(source.text)),
    canonical: canonicalNameKey(source.text),
  }));
  const allTokens = new Set<string>();
  for (const source of sources) {
    for (const token of source.tokens) allTokens.add(token);
  }
  return { skills: facts.skills, sources, allTokens };
}

/**
 * Finds the record that supports a skill-like requirement.
 *
 * A rated skill is the strongest evidence, because the candidate claimed it
 * themselves. A mention in their own written text is the next best. Anything
 * else is a miss.
 */
function matchSkillRequirement(
  requirement: string,
  index: EvidenceIndex
): { matched: boolean; evidence: string | null } {
  for (const skill of index.skills) {
    if (namesMatch(requirement, skill.name)) {
      return { matched: true, evidence: `${skill.name} (${skill.level}/5)` };
    }
  }
  const requirementKey = canonicalNameKey(requirement);
  if (!requirementKey) return { matched: false, evidence: null };
  for (const source of index.sources) {
    if (source.canonical.includes(requirementKey)) {
      return { matched: true, evidence: source.label };
    }
  }
  return { matched: false, evidence: null };
}

/**
 * Finds the record that supports a sentence-shaped requirement.
 *
 * The requirement is satisfied when the candidate's own words cover enough of
 * its distinctive vocabulary. A requirement whose words are all generic
 * ("a degree in Computer Science") is held to a stricter bar, because a
 * generic word on its own proves very little.
 *
 * A requirement made only of generic career words cannot be verified either
 * way, so it is reported as missing: the candidate is told the requirement is
 * unconfirmed rather than being given credit for something nobody can check.
 */
function matchTextRequirement(
  requirement: string,
  index: EvidenceIndex
): { matched: boolean; evidence: string | null } {
  // The distinctive words are the ones that can prove a requirement. When a
  // requirement has none, the generic words are used, but only a near-total
  // match will count.
  const distinctive = significantTokens(requirement);
  const requirementTokens = distinctive.length > 0 ? distinctive : evidenceTokens(requirement);
  const threshold = distinctive.length > 0 ? 0.6 : 0.8;

  if (requirementTokens.length === 0) {
    return { matched: false, evidence: null };
  }

  let best: { label: string; coverage: number } | null = null;
  for (const source of index.sources) {
    const shared = requirementTokens.filter((token) => source.tokens.has(token));
    const coverage = shared.length / requirementTokens.length;
    if (!best || coverage > best.coverage) {
      best = { label: source.label, coverage };
    }
  }

  const globalCoverage =
    requirementTokens.filter((token) => index.allTokens.has(token)).length / requirementTokens.length;

  if (best && best.coverage >= threshold) {
    return { matched: true, evidence: best.label };
  }
  if (globalCoverage >= threshold) {
    return { matched: true, evidence: null };
  }
  return { matched: false, evidence: null };
}

/**
 * Flattens the analysis into the list of requirements it contains.
 *
 * The order is deliberate: the employer's own order of requirements is kept,
 * so the report reads in the order the advertisement did.
 */
export function collectJobRequirements(
  analysis: JobDescriptionAnalysis
): Array<{ requirement: string; kind: JdRequirementKind; importance: JdRequirementImportance }> {
  const requirements: Array<{
    requirement: string;
    kind: JdRequirementKind;
    importance: JdRequirementImportance;
  }> = [];

  const add = (
    items: string[],
    kind: JdRequirementKind,
    importance: JdRequirementImportance
  ): void => {
    for (const requirement of items) {
      if (!requirement.trim()) continue;
      requirements.push({ requirement: requirement.trim(), kind, importance });
    }
  };

  add(analysis.requiredSkills, 'required_skill', 'core');
  add(analysis.technicalSkills, 'technical_skill', 'core');
  add(analysis.experienceRequirements, 'experience', 'core');
  add(analysis.qualifications, 'qualification', 'preferred');
  add(analysis.responsibilities, 'responsibility', 'preferred');
  add(analysis.keywords, 'keyword', 'mention');

  return requirements;
}

/**
 * Compares a job description with the candidate's real record.
 *
 * This is the whole of the ATS score. There is no model in this function and
 * there is no way for a score to be produced without the records to compare
 * against.
 */
export function buildAtsMatchReport(
  analysis: JobDescriptionAnalysis,
  facts: AtsProfileFacts,
  options: { language?: AiLanguageCode } = {}
): AtsMatchReport {
  const language = options.language === 'ar' ? 'ar' : 'en';
  const index = buildEvidenceIndex(facts);
  const requirements = collectJobRequirements(analysis);

  const matched: AtsRequirementMatch[] = [];
  const missing: AtsRequirementMatch[] = [];

  let totalWeight = 0;
  let matchedWeight = 0;

  for (const entry of requirements) {
    const isSkillLike =
      entry.kind === 'required_skill' || entry.kind === 'technical_skill' || entry.kind === 'keyword';
    const outcome = isSkillLike
      ? matchSkillRequirement(entry.requirement, index)
      : matchTextRequirement(entry.requirement, index);

    const record: AtsRequirementMatch = {
      requirement: entry.requirement,
      kind: entry.kind,
      importance: entry.importance,
      matched: outcome.matched,
      evidence: outcome.evidence,
    };

    const weight = REQUIREMENT_WEIGHTS[entry.kind];
    totalWeight += weight;
    if (outcome.matched) {
      matchedWeight += weight;
      matched.push(record);
    } else {
      missing.push(record);
    }
  }

  const score = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;

  const breakdown = { ...({} as AtsMatchBreakdown) };
  for (const group of BREAKDOWN_GROUPS) {
    const groupRequirements = requirements.filter((entry) => group.kinds.includes(entry.kind));
    let groupTotal = 0;
    let groupMatched = 0;
    for (const entry of groupRequirements) {
      const weight = REQUIREMENT_WEIGHTS[entry.kind];
      groupTotal += weight;
      const record = matched.find((item) => item.requirement === entry.requirement);
      if (record) groupMatched += weight;
    }
    breakdown[group.key] = groupTotal > 0 ? Math.round((groupMatched / groupTotal) * 100) : 0;
  }

  const matchedKeywords = matched
    .filter((item) => item.kind === 'required_skill' || item.kind === 'technical_skill' || item.kind === 'keyword')
    .map((item) => item.requirement);
  const missingKeywords = missing
    .filter((item) => item.kind === 'required_skill' || item.kind === 'technical_skill' || item.kind === 'keyword')
    .map((item) => item.requirement);

  return {
    score,
    breakdown,
    matched,
    missing,
    explanation: explainMatch(
      { score, matched, missing, requirements, breakdown },
      language
    ),
    matchedKeywords,
    missingKeywords,
  };
}

/**
 * Writes the plain-language account of the score.
 *
 * The explanation names the requirements that are missing, because a number on
 * its own tells the candidate nothing about what to do next.
 */
function explainMatch(
  input: {
    score: number;
    matched: AtsRequirementMatch[];
    missing: AtsRequirementMatch[];
    requirements: Array<{ requirement: string }>;
    breakdown: AtsMatchBreakdown;
  },
  language: 'en' | 'ar'
): string {
  const total = input.requirements.length;
  if (total === 0) {
    return language === 'ar'
      ? 'لا يحتوي وصف الوظيفة على متطلبات يمكن مقارنةها بسجلاتك.'
      : 'This job description contains no requirements that could be compared against your records.';
  }

  const skillRequirements = input.requirements.length
    ? [
        ...input.matched.filter((item) => item.kind === 'required_skill' || item.kind === 'technical_skill'),
        ...input.missing.filter((item) => item.kind === 'required_skill' || item.kind === 'technical_skill'),
      ]
    : [];
  const skillTotal = skillRequirements.length;
  const skillMatched = input.matched.filter(
    (item) => item.kind === 'required_skill' || item.kind === 'technical_skill'
  ).length;

  const missingSkills = input.missing
    .filter((item) => item.kind === 'required_skill' || item.kind === 'technical_skill')
    .map((item) => item.requirement);
  const missingOther = input.missing
    .filter((item) => item.kind !== 'required_skill' && item.kind !== 'technical_skill')
    .map((item) => item.requirement);

  if (language === 'ar') {
    const parts: string[] = [];
    parts.push(
      `سجلاتك تغطي ${input.matched.length} من أصل ${total} متطلبًا في وصف الوظيفة هذا، أي ${input.score}٪ من الدرجة المرجّحة.`
    );
    if (skillTotal > 0) {
      parts.push(`لديك ${skillMatched} من أصل ${skillTotal} مهارة أو تقنية يطلبها.`);
    }
    if (missingSkills.length > 0) {
      parts.push(`المتطلبات التي لا تظهر في سجلاتك بعد: ${missingSkills.join('، ')}.`);
    }
    if (missingOther.length > 0) {
      parts.push(`متطلبات أخرى غير مؤكدة: ${missingOther.join('، ')}.`);
    }
    if (input.missing.length === 0) {
      parts.push('لا يوجد متطلب في وصف الوظيفة ينقص من سجلاتك.');
    }
    return parts.join(' ');
  }

  const parts: string[] = [];
  parts.push(
    `Your records cover ${input.matched.length} of the ${total} requirements in this job description, which is ${input.score}% of the weighted score.`
  );
  if (skillTotal > 0) {
    parts.push(`You have ${skillMatched} of the ${skillTotal} skills and tools it asks for.`);
  }
  if (missingSkills.length > 0) {
    parts.push(`The requirements your records do not show yet are: ${missingSkills.join(', ')}.`);
  }
  if (missingOther.length > 0) {
    parts.push(`Other requirements that are not confirmed by your records: ${missingOther.join(', ')}.`);
  }
  if (input.missing.length === 0) {
    parts.push('Nothing in this job description is missing from your records.');
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// The generated CV
// ---------------------------------------------------------------------------

/** Rewritten bullets for one experience. */
export interface AtsCvExperienceEntry {
  /** The id of the experience record the bullets belong to. */
  id: string;
  bullets: string[];
}

/** Rewritten bullets and description for one project. */
export interface AtsCvProjectEntry {
  /** The id of the project record the bullets belong to. */
  id: string;
  bullets: string[];
  description: string | null;
}

/** The CV content written for one job description. */
export interface AtsCvContent {
  /** The headline under the candidate's name. */
  headline: string | null;
  /** The professional summary. */
  summary: string | null;
  /** The rewritten experience bullets, keyed by record id. */
  experiences: AtsCvExperienceEntry[];
  /** The rewritten project content, keyed by record id. */
  projects: AtsCvProjectEntry[];
  /** The skills line, ordered for this job. */
  skills: string[];
  /** The job description's keywords the candidate's record supports. */
  keywordsUsed: string[];
  /** The claims that were removed because the record does not support them. */
  removedClaims: string[];
}

/** An empty CV content, used when the model produced nothing usable. */
export function emptyAtsCvContent(): AtsCvContent {
  return {
    headline: null,
    summary: null,
    experiences: [],
    projects: [],
    skills: [],
    keywordsUsed: [],
    removedClaims: [],
  };
}

/**
 * Validates a raw model payload against the CV content contract.
 */
export function validateAtsCvPayload(payload: unknown): string[] {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('The payload is not an object.');
    return errors;
  }
  const record = payload as Record<string, unknown>;

  if (record.headline !== undefined && record.headline !== null && typeof record.headline !== 'string') {
    errors.push('headline must be a string or null.');
  }
  if (record.summary !== undefined && record.summary !== null && typeof record.summary !== 'string') {
    errors.push('summary must be a string or null.');
  }

  if (record.experiences !== undefined && record.experiences !== null) {
    if (!Array.isArray(record.experiences)) {
      errors.push('experiences must be an array.');
    } else {
      for (const entry of record.experiences) {
        if (!entry || typeof entry !== 'object') {
          errors.push('every experience must be an object.');
          break;
        }
        const item = entry as Record<string, unknown>;
        if (typeof item.id !== 'string' || !item.id) {
          errors.push('every experience needs an id.');
          break;
        }
        if (!Array.isArray(item.bullets) || item.bullets.some((b) => typeof b !== 'string')) {
          errors.push('every experience needs an array of bullet strings.');
          break;
        }
      }
    }
  }

  if (record.projects !== undefined && record.projects !== null) {
    if (!Array.isArray(record.projects)) {
      errors.push('projects must be an array.');
    } else {
      for (const entry of record.projects) {
        if (!entry || typeof entry !== 'object') {
          errors.push('every project must be an object.');
          break;
        }
        const item = entry as Record<string, unknown>;
        if (typeof item.id !== 'string' || !item.id) {
          errors.push('every project needs an id.');
          break;
        }
        if (!Array.isArray(item.bullets) || item.bullets.some((b) => typeof b !== 'string')) {
          errors.push('every project needs an array of bullet strings.');
          break;
        }
        if (
          item.description !== undefined &&
          item.description !== null &&
          typeof item.description !== 'string'
        ) {
          errors.push('a project description must be a string or null.');
          break;
        }
      }
    }
  }

  for (const field of ['skills', 'keywordsUsed'] as const) {
    const value = record[field];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      errors.push(`${field} must be an array of strings.`);
    }
  }

  return errors;
}

/**
 * Turns a validated model payload into CV content.
 *
 * Returns null when the payload does not satisfy the contract.
 */
export function parseAtsCvPayload(payload: unknown): AtsCvContent | null {
  if (validateAtsCvPayload(payload).length > 0) return null;
  const record = (payload ?? {}) as Record<string, unknown>;

  const headline = typeof record.headline === 'string' ? record.headline.trim() : null;
  const summary = typeof record.summary === 'string' ? record.summary.trim() : null;

  const experiences: AtsCvExperienceEntry[] = Array.isArray(record.experiences)
    ? record.experiences
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
          id: String(entry.id),
          bullets: coerceRequirementList(entry.bullets),
        }))
    : [];

  const projects: AtsCvProjectEntry[] = Array.isArray(record.projects)
    ? record.projects
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
        .map((entry) => ({
          id: String(entry.id),
          bullets: coerceRequirementList(entry.bullets),
          description:
            typeof entry.description === 'string' && entry.description.trim()
              ? entry.description.trim()
              : null,
        }))
    : [];

  return {
    headline: headline || null,
    summary: summary || null,
    experiences,
    projects,
    skills: coerceRequirementList(record.skills),
    keywordsUsed: coerceRequirementList(record.keywordsUsed),
    removedClaims: [],
  };
}

// ---------------------------------------------------------------------------
// Applying the generated CV to the candidate's document
// ---------------------------------------------------------------------------

/**
 * The part of the CV document the generated content is applied to.
 *
 * `CVProfile` in the client satisfies this structurally, so the function works
 * on the real document without importing the client types into the shared
 * layer.
 */
export interface AtsCvDocument {
  title: string;
  summary: string;
  experiences: { id: string; bullets: string[] }[];
  projects: { id: string; bullets: string[]; description?: string }[];
  skillsList: string[];
}

/**
 * Writes the generated content onto the candidate's document.
 *
 * Three guarantees hold here.
 *
 * The document is never replaced: everything the candidate wrote that the
 * generator did not touch survives untouched.
 *
 * A skill is only reordered, never dropped. The generator is told the
 * candidate's real skills, but the check is repeated here so a mistake in the
 * model cannot put a skill the candidate never claimed onto their CV — and so
 * a skill the candidate does have is never taken off their CV by a reorder.
 *
 * A record id the document does not have is ignored, so a hallucinated id
 * cannot create a new entry.
 */
export function applyAtsCvToDocument<T extends AtsCvDocument>(
  document: T,
  generated: AtsCvContent
): T {
  const ownedSkills = new Set(document.skillsList.map((skill) => canonicalNameKey(skill)));
  const generatedSkills = generated.skills.filter((skill) =>
    ownedSkills.has(canonicalNameKey(skill))
  );

  // The skills the generator listed come first, in its order. The rest keep
  // their place behind them: the line is reordered, not shortened.
  const reorderedSkills = [
    ...generatedSkills,
    ...document.skillsList.filter(
      (skill) => !generatedSkills.some((entry) => canonicalNameKey(entry) === canonicalNameKey(skill))
    ),
  ];

  const experienceBullets = new Map(
    generated.experiences.map((entry) => [entry.id, entry.bullets] as const)
  );
  const projectContent = new Map(generated.projects.map((entry) => [entry.id, entry] as const));

  const experiences = document.experiences.map((experience) => {
    const bullets = experienceBullets.get(experience.id);
    if (!bullets || bullets.length === 0) return experience;
    // The element keeps every field it had; only its bullets are replaced.
    return { ...experience, bullets: [...bullets] };
  });

  const projects = document.projects.map((project) => {
    const entry = projectContent.get(project.id);
    if (!entry) return project;
    const description = entry.description?.trim();
    return {
      ...project,
      bullets: entry.bullets.length > 0 ? [...entry.bullets] : project.bullets,
      description: description || project.description,
    };
  });

  return {
    ...document,
    title: generated.headline?.trim() || document.title,
    summary: generated.summary?.trim() || document.summary,
    skillsList: reorderedSkills,
    experiences,
    projects,
  } as T;
}

// ---------------------------------------------------------------------------
// The deterministic fallback
// ---------------------------------------------------------------------------

/**
 * Reads a job description without a model.
 *
 * When the model is unavailable, the candidate still gets an analysis and an
 * ATS score: the advertisement's own bullet lines are read and classified by
 * the words they use. The result is coarser than a model's, and it is
 * labelled as such, but the CV studio keeps working.
 */
export function extractDeterministicJobDescription(jdText: string): JobDescriptionAnalysis {
  const analysis = emptyJobDescriptionAnalysis();

  // The bullet marker is read before the line is cleaned, because a line the
  // employer wrote as a bullet is a requirement and a line they wrote as prose
  // is usually the advertisement itself.
  const raw = jdText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2);

  const entries = raw.map((line) => ({
    isBullet: /^[-•*·–—]/.test(line),
    text: line.replace(/^[•\-*·–—\d.)\s]+/, '').trim(),
  }));

  const lines = entries.map((entry) => entry.text).filter((text) => text.length > 2);

  const firstLine = lines[0] ?? '';
  if (firstLine && firstLine.length <= 90 && !/[.!?]$/.test(firstLine)) {
    analysis.jobTitle = firstLine;
  }

  for (let index = 1; index < entries.length; index += 1) {
    const entry = entries[index];
    const line = entry.text;
    if (line.length <= 2) continue;
    const lower = line.toLowerCase();

    if (/(must have|required|requirement|strong knowledge|proficiency|proficient|solid|expert)/.test(lower)) {
      analysis.requiredSkills.push(line);
    } else if (/(technolog|tools?|stack|software|framework|platform|language|proficien)/.test(lower)) {
      analysis.technicalSkills.push(line);
    } else if (/(responsib|duties|you will|day-to-day|day to day|work with|build|design|own the|manage)/.test(lower)) {
      analysis.responsibilities.push(line);
    } else if (/(years|experience|background|proven track record)/.test(lower)) {
      analysis.experienceRequirements.push(line);
    } else if (/(degree|bachelor|master|certif|qualification|diploma|phd|graduat)/.test(lower)) {
      analysis.qualifications.push(line);
    } else if (entry.isBullet || line.length < 120) {
      analysis.keywords.push(line);
    }
  }

  // The lines that were classified are no longer keywords.
  const classified = new Set(
    [
      ...analysis.requiredSkills,
      ...analysis.technicalSkills,
      ...analysis.responsibilities,
      ...analysis.experienceRequirements,
      ...analysis.qualifications,
    ].map((line) => line.toLowerCase())
  );
  analysis.keywords = analysis.keywords.filter((line) => !classified.has(line.toLowerCase()));

  return analysis;
}
