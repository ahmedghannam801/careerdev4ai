/**
 * Deterministic headline suggestions for the CV studio.
 *
 * The headline is the one line under the candidate's name that says who they
 * are and the role they are aiming at. The studio used to offer a single
 * generated draft, and nothing at all when the AI writing preference was
 * switched off. A candidate with no AI allowance was left with an empty box
 * and no way to fill it.
 *
 * This module is the fallback that always works. It reads only the facts the
 * candidate has already supplied — the target role, their rated skills, their
 * experience, their education and their career goal — and composes several
 * distinct, role-specific headlines from them. It is deterministic, so the
 * same record always produces the same suggestions, and it can run on the
 * server or in the browser.
 *
 * The relevance rule is the point of the module: every suggestion names the
 * target role. A headline for an HR Specialist must never read like a Data
 * Analyst headline, even when the candidate happens to have rated SQL.
 */

import { CV_HEADLINE_SUGGESTION_MAX_CHARS } from './cvAiAssist.ts';
import type { AiLanguageCode } from './aiLanguages.ts';

/** The facts a headline can be written from. */
export interface HeadlineSuggestionInput {
  /** The role the CV is aimed at. */
  targetRoleTitle: string;
  /** Other roles the candidate is preparing, used only for compatible combinations. */
  additionalTargetRoles?: readonly string[];
  /** The headline currently in the field, when there is one. */
  currentTitle?: string;
  /** The skills the candidate has actually rated. */
  skills?: readonly string[];
  /**
   * The skills the target role itself asks for.
   *
   * Used only to order the candidate's own skills, so the most role-relevant
   * ones are named first. It never adds a skill the candidate does not have.
   */
  roleSkills?: readonly string[];
  /** The candidate's experience, as role lines such as "HR Coordinator at Acme". */
  experience?: readonly string[];
  /** The candidate's education, as lines such as "BSc — Human Resources — University". */
  education?: readonly string[];
  /** The candidate's projects, as title lines. */
  projects?: readonly string[];
  /** The candidate's certifications, as name lines. */
  certifications?: readonly string[];
  /** The candidate's volunteering, as organisation/role lines. */
  volunteering?: readonly string[];
  /** The candidate's completed training and courses, as title lines. */
  training?: readonly string[];
  /** The candidate's primary career goal. */
  careerGoal?: string | null;
  /** The language the suggestions are written in. */
  language?: AiLanguageCode;
  /** The most suggestions to return. Defaults to five. */
  limit?: number;
}

const DEFAULT_LIMIT = 5;

/** Words that describe seniority rather than the role itself. */
const GENERIC_ROLE_WORDS = new Set([
  'a',
  'an',
  'and',
  'assistant',
  'associate',
  'entry',
  'head',
  'intern',
  'junior',
  'lead',
  'mid',
  'of',
  'principal',
  'senior',
  'staff',
  'the',
]);

/** Lower-cases, normalises ampersands and strips punctuation for comparison. */
function normalizeForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The significant words in a role title, used for the relevance check. */
function roleTokens(roleTitle: string): string[] {
  return normalizeForCompare(roleTitle)
    .split(' ')
    .filter((token) => token.length >= 2 && !GENERIC_ROLE_WORDS.has(token));
}

/** Trims a value and collapses the whitespace inside it. */
function clean(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

/** Removes duplicates while preserving order. */
function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = clean(value);
    if (!cleaned) continue;
    const key = normalizeForCompare(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

/**
 * Sanitises one suggestion before it is shown.
 *
 * A model answer can arrive as a bullet, in quotes, or across two lines. None
 * of those belong in a one-line headline. An over-long answer is cut at a word
 * boundary rather than mid-word.
 */
export function sanitizeHeadlineSuggestion(value: unknown): string {
  if (typeof value !== 'string') return '';
  let text = value
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[\s\-*•\u2022\d.)]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim();

  if (text.length > CV_HEADLINE_SUGGESTION_MAX_CHARS) {
    const cut = text.slice(0, CV_HEADLINE_SUGGESTION_MAX_CHARS);
    const atWord = cut.replace(/\s+\S*$/, '').trim();
    text = (atWord || cut).trim();
  }
  return text;
}

/**
 * True when a headline names one of the roles the candidate is aiming at.
 *
 * The primary role is the strongest match. An additional track is accepted
 * only when the headline names that track too, which is what makes a
 * multi-track headline legitimate rather than a mashup.
 */
export function isRelevantHeadlineSuggestion(
  suggestion: string,
  input: Pick<HeadlineSuggestionInput, 'targetRoleTitle' | 'additionalTargetRoles'>
): boolean {
  const text = sanitizeHeadlineSuggestion(suggestion);
  if (!text) return false;

  const roles = [input.targetRoleTitle, ...(input.additionalTargetRoles ?? [])]
    .map((role) => clean(role))
    .filter(Boolean);
  if (roles.length === 0) return true;

  return roles.some((role) => headlineNamesRole(text, role));
}

/** True when the text names the role by title or by its significant words. */
function headlineNamesRole(text: string, role: string): boolean {
  const normalizedRole = normalizeForCompare(role);
  const normalizedText = normalizeForCompare(text);
  if (normalizedRole && normalizedText.includes(normalizedRole)) return true;

  const tokens = roleTokens(role);
  if (tokens.length === 0) return true;
  const matched = tokens.filter((token) => normalizedText.includes(token)).length;
  return matched >= Math.max(1, Math.ceil(tokens.length * 0.6));
}

/**
 * True when two roles can honestly share one headline.
 *
 * Compatibility is lexical and conservative: the roles must share a
 * significant word ("Data Analyst" and "Business Analyst" share "analyst"),
 * or one title must contain the other. Two unrelated occupations never pass,
 * which is what prevents "Data Analyst & HR Specialist" from being generated.
 */
export function areTargetRolesCompatible(a: string, b: string): boolean {
  const first = roleTokens(a);
  const second = roleTokens(b);
  if (first.length === 0 || second.length === 0) return false;
  const secondSet = new Set(second);
  if (first.some((token) => secondSet.has(token))) return true;
  const normalizedA = normalizeForCompare(a);
  const normalizedB = normalizeForCompare(b);
  return (
    (normalizedA.length > 0 && normalizedB.includes(normalizedA)) ||
    (normalizedB.length > 0 && normalizedA.includes(normalizedB))
  );
}

/**
 * Orders the candidate's own skills so the ones the target role asks for come
 * first. Skills the role does not mention are kept as a fallback: they are
 * still the candidate's own, so they may still describe them.
 */
function selectSkills(input: HeadlineSuggestionInput): string[] {
  const owned = unique(input.skills ?? []);
  const roleSkillKeys = new Set(
    (input.roleSkills ?? []).map((skill) => normalizeForCompare(skill)).filter(Boolean)
  );
  if (roleSkillKeys.size === 0) return owned.slice(0, 3);

  const relevant = owned.filter((skill) => roleSkillKeys.has(normalizeForCompare(skill)));
  const rest = owned.filter((skill) => !roleSkillKeys.has(normalizeForCompare(skill)));
  return [...relevant, ...rest].slice(0, 3);
}

/**
 * The role part of an experience line.
 *
 * The server formats experience as "Role at Company (dates)". A headline only
 * wants the role, so the company and the dates are removed.
 */
function experienceRole(experience: readonly string[] | undefined): string {
  const first = clean(experience?.[0]);
  if (!first) return '';
  return clean(
    first
      .split(' at ')[0]
      .split(' — ')[0]
      .split(' – ')[0]
      .split(' (')[0]
      .replace(/\s*[-|,]\s*$/, '')
  );
}

/** The degree part of an education line. */
function degreePhrase(education: readonly string[] | undefined): string {
  const first = clean(education?.[0]);
  if (!first) return '';
  const degree = clean(first.split(' — ')[0].split(' – ')[0].split(' - ')[0]);
  if (!degree) return '';
  return degree.length > 60 ? `${degree.slice(0, 57).trim()}…` : degree;
}

/** The first project title, trimmed to headline length. */
function projectPhrase(projects: readonly string[] | undefined): string {
  const first = clean(projects?.[0]);
  if (!first) return '';
  const title = clean(first.split(' — ')[0].split(' – ')[0]);
  return title.length > 60 ? `${title.slice(0, 57).trim()}…` : title;
}

/** The first training or certification line, trimmed to headline length. */
function trainingPhrase(
  training: readonly string[] | undefined,
  certifications: readonly string[] | undefined
): string {
  const first = clean(training?.[0]) || clean(certifications?.[0]);
  if (!first) return '';
  // Course lines arrive as "status: title"; the status is not a credential.
  const title = clean(first.replace(/^(completed|in_progress|saved|dismissed):\s*/i, ''));
  return title.length > 55 ? `${title.slice(0, 52).trim()}…` : title;
}

/** The first volunteering organisation, trimmed to headline length. */
function volunteeringPhrase(volunteering: readonly string[] | undefined): string {
  const first = clean(volunteering?.[0]);
  if (!first) return '';
  const organisation = clean(first.split(' (')[0].split(' — ')[0].split(' – ')[0]);
  return organisation.length > 50 ? `${organisation.slice(0, 47).trim()}…` : organisation;
}

/**
 * A combined role phrase, only when the roles are genuinely compatible.
 *
 * Returns null when no additional track can share the line. The caller then
 * keeps the headline on the primary role alone, which is always truthful.
 */
function combinedRolePhrase(
  role: string,
  additional: readonly string[] | undefined
): string | null {
  for (const other of additional ?? []) {
    const candidate = clean(other);
    if (!candidate) continue;
    if (normalizeForCompare(candidate) === normalizeForCompare(role)) continue;
    if (areTargetRolesCompatible(role, candidate)) {
      return `${role} & ${candidate}`;
    }
  }
  return null;
}

/** Separate headlines for tracks that cannot honestly share one line. */
function separateTrackSuggestions(
  additional: readonly string[] | undefined,
  skills: readonly string[]
): string[] {
  const [first] = skills;
  return (additional ?? [])
    .map((role) => clean(role))
    .filter(Boolean)
    .filter((role, index, all) =>
      all.findIndex((entry) => normalizeForCompare(entry) === normalizeForCompare(role)) === index
    )
    .slice(0, 2)
    .map((role) => `${role}${first ? ` | ${first}` : ''}`);
}

/** A goal-specific angle, when the goal supports one. */
function goalHeadline(
  role: string,
  skill: string,
  experienceTitle: string,
  goal: string | null | undefined,
  language: 'en' | 'ar'
): string {
  const isArabic = language === 'ar';
  switch (goal) {
    case 'get_first_job':
      return isArabic
        ? `${role}${skill ? ` | مهارات ${skill}` : ''}`
        : `Entry-level ${role}${skill ? ` with ${skill} skills` : ''}`;
    case 'get_internship':
      return isArabic ? `${role} | متدرب` : `${role} Intern${skill ? ` | ${skill}` : ''}`;
    case 'switch_career':
      if (experienceTitle) {
        return isArabic
          ? `${experienceTitle} في طريقه إلى ${role}`
          : `${experienceTitle} transitioning to ${role}`;
      }
      return isArabic
        ? `محترف يتحول إلى ${role}`
        : `Career switcher focused on ${role}`;
    case 'freelance':
      return isArabic ? `${role} مستقل${skill ? ` | ${skill}` : ''}` : `Freelance ${role}${skill ? ` | ${skill}` : ''}`;
    case 'build_portfolio':
      return isArabic
        ? `${role}${skill ? ` مع أعمال في ${skill}` : ' مع معرض أعمال'}`
        : `${role}${skill ? ` with a ${skill} portfolio` : ' with a portfolio'}`;
    case 'become_manager':
      return isArabic
        ? `${role} | قيادة${skill ? ` و${skill}` : ''}`
        : `${role}${skill ? ` | Leadership and ${skill}` : ' | Leadership'}`;
    case 'become_specialist':
      return isArabic
        ? `${role}${skill ? ` | تخصص ${skill}` : ''}`
        : `${role}${skill ? ` | ${skill} specialist` : ''}`;
    default:
      return '';
  }
}

/** Builds the English suggestions, in priority order. */
function englishSuggestions(input: HeadlineSuggestionInput, role: string): string[] {
  const skills = selectSkills(input);
  const [first, second] = skills;
  const experienceTitle = experienceRole(input.experience);
  const degree = degreePhrase(input.education);
  const project = projectPhrase(input.projects);
  const training = trainingPhrase(input.training, input.certifications);
  const volunteering = volunteeringPhrase(input.volunteering);
  const combined = combinedRolePhrase(role, input.additionalTargetRoles);

  const suggestions: string[] = [];
  suggestions.push(`${role}${first ? ` | ${first}${second ? ` & ${second}` : ''}` : ''}`);

  if (combined && first) {
    suggestions.push(`${combined} | ${first}`);
  }
  if (project) {
    suggestions.push(`${role} | ${project}`);
  }
  if (training) {
    suggestions.push(`${role} | ${training}`);
  }
  if (volunteering) {
    suggestions.push(`${role} | ${volunteering} volunteer`);
  }
  if (first && second) {
    suggestions.push(`${role} focused on ${first} and ${second}`);
  }
  if (first) {
    suggestions.push(`${role} with ${first} expertise`);
  }
  if (experienceTitle && normalizeForCompare(experienceTitle) !== normalizeForCompare(role)) {
    suggestions.push(`${experienceTitle} transitioning to ${role}`);
  }
  if (degree) {
    suggestions.push(`${role} | ${degree}`);
  }

  const goal = goalHeadline(role, first, experienceTitle, input.careerGoal, 'en');
  if (goal) suggestions.push(goal);

  suggestions.push(...separateTrackSuggestions(input.additionalTargetRoles, skills));
  suggestions.push(`Aspiring ${role}`);
  suggestions.push(`${role} professional`);
  suggestions.push(`${role} candidate`);

  return suggestions;
}

/** Builds the Arabic suggestions, in priority order. */
function arabicSuggestions(input: HeadlineSuggestionInput, role: string): string[] {
  const skills = selectSkills(input);
  const [first, second] = skills;
  const experienceTitle = experienceRole(input.experience);
  const degree = degreePhrase(input.education);
  const project = projectPhrase(input.projects);
  const training = trainingPhrase(input.training, input.certifications);
  const volunteering = volunteeringPhrase(input.volunteering);
  const combined = combinedRolePhrase(role, input.additionalTargetRoles);

  const suggestions: string[] = [];
  suggestions.push(`${role}${first ? ` | ${first}${second ? ` و${second}` : ''}` : ''}`);

  if (combined && first) {
    suggestions.push(`${combined} | ${first}`);
  }
  if (project) {
    suggestions.push(`${role} | ${project}`);
  }
  if (training) {
    suggestions.push(`${role} | ${training}`);
  }
  if (volunteering) {
    suggestions.push(`${role} | متطوع في ${volunteering}`);
  }
  if (first && second) {
    suggestions.push(`${role} متخصص في ${first} و${second}`);
  }
  if (first) {
    suggestions.push(`${role} بخبرة في ${first}`);
  }
  if (experienceTitle && normalizeForCompare(experienceTitle) !== normalizeForCompare(role)) {
    suggestions.push(`${experienceTitle} في طريقه إلى ${role}`);
  }
  if (degree) {
    suggestions.push(`${role} | ${degree}`);
  }

  const goal = goalHeadline(role, first, experienceTitle, input.careerGoal, 'ar');
  if (goal) suggestions.push(goal);

  suggestions.push(...separateTrackSuggestions(input.additionalTargetRoles, skills));
  suggestions.push(`مرشح لـ ${role}`);
  suggestions.push(`${role} محترف`);
  suggestions.push(`${role} | مسار مهني`);
  return suggestions;
}

/**
 * Generates deterministic headline suggestions.
 *
 * The result is never empty: when the record is sparse, the role title itself
 * is still a usable headline. Every suggestion names the target role and fits
 * the one-line budget.
 */
export function generateHeadlineSuggestions(input: HeadlineSuggestionInput): string[] {
  const role =
    clean(input.targetRoleTitle) || clean(input.currentTitle) || 'Professional';
  const language = input.language === 'ar' ? 'ar' : 'en';
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, 8));

  const candidates =
    language === 'ar' ? arabicSuggestions(input, role) : englishSuggestions(input, role);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const sanitized = sanitizeHeadlineSuggestion(candidate);
    if (!sanitized) continue;
    if (!isRelevantHeadlineSuggestion(sanitized, {
      targetRoleTitle: role,
      additionalTargetRoles: input.additionalTargetRoles,
    })) continue;
    const key = normalizeForCompare(sanitized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(sanitized);
    if (result.length >= limit) break;
  }

  // A role title is always a valid headline, so this branch only runs if a
  // caller passed a role made entirely of punctuation.
  if (result.length === 0) {
    const fallback = sanitizeHeadlineSuggestion(role) || 'Professional';
    result.push(fallback);
  }
  return result;
}

/**
 * Merges model suggestions with the deterministic set.
 *
 * Model suggestions are kept only when they are relevant to the target role,
 * non-empty and distinct. The deterministic set then fills the remaining
 * slots, so the candidate always gets a useful list even when the model
 * returns one usable line or none at all.
 */
export function mergeHeadlineSuggestions(
  aiSuggestions: readonly unknown[],
  deterministic: readonly string[],
  input: Pick<HeadlineSuggestionInput, 'targetRoleTitle' | 'additionalTargetRoles'>,
  limit = DEFAULT_LIMIT
): string[] {
  const capped = Math.max(1, Math.min(limit, 8));
  const seen = new Set<string>();
  const result: string[] = [];

  const add = (value: unknown) => {
    const sanitized = sanitizeHeadlineSuggestion(value);
    if (!sanitized) return;
    if (!isRelevantHeadlineSuggestion(sanitized, input)) return;
    const key = normalizeForCompare(sanitized);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(sanitized);
  };

  for (const suggestion of aiSuggestions) {
    if (result.length >= capped) break;
    add(suggestion);
  }
  for (const suggestion of deterministic) {
    if (result.length >= capped) break;
    add(suggestion);
  }

  if (result.length === 0) {
    result.push(sanitizeHeadlineSuggestion(input.targetRoleTitle) || 'Professional');
  }
  return result;
}
