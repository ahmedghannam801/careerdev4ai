/**
 * CV import de-duplication and skill clean-up.
 *
 * A CV import used to fragment and duplicate. One experience block —
 * title, organisation, employment type, location, dates, description and
 * bullets — could arrive as several records, and importing the same CV twice,
 * or pressing "Fill from my records" after an import, appended a second copy of
 * everything. The skill list was copied verbatim, so a section heading such as
 * "SOFT SKILLS" or "TECHNICAL SKILLS" became a skill.
 *
 * The rules below are the single definition of "the same record":
 *
 *   experience   normalised (title + organisation + dates)
 *   education    normalised (institution + degree)
 *   summary      the exact text
 *   skills       the normalised skill name, with section headings removed
 *
 * Nothing here touches the database. The import path, the import review step
 * and the CV projection all call these functions, so an entry can only be
 * counted once no matter which route it took.
 */

/* -------------------------------------------------------------------------- */
/* Skills                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Headings that are section labels, not skills.
 *
 * A parser sees these lines in the skills section and cannot tell them apart
 * from a skill unless it is told. Every heading is listed here in the form a
 * CV actually writes it; comparison strips punctuation and case.
 */
export const SKILL_SECTION_HEADERS: readonly string[] = [
  'skills',
  'skill',
  'skills summary',
  'summary of skills',
  'technical skills',
  'technical skill',
  'technical expertise',
  'technical proficiencies',
  'technical competencies',
  'soft skills',
  'soft skill',
  'soft skills and attributes',
  'hard skills',
  'core skills',
  'core competencies',
  'key skills',
  'professional skills',
  'personal skills',
  'interpersonal skills',
  'additional skills',
  'other skills',
  'skills and tools',
  'skills & tools',
  'skills and technologies',
  'tools',
  'tools and technologies',
  'tools & technologies',
  'technologies',
  'tech stack',
  'technology stack',
  'technologies used',
  'competencies',
  'areas of expertise',
  'expertise',
  'proficiencies',
  'programming languages',
  'languages and frameworks',
  'frameworks and libraries',
  'libraries and frameworks',
];

const SKILL_HEADER_SET = new Set(SKILL_SECTION_HEADERS.map((header) => header.toLowerCase()));

/** Normalises a skills-section heading for comparison. */
function stripSkillHeaderDecoration(value: string): string {
  return value
    .toLowerCase()
    .replace(/[:&/,]+/g, ' ')
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a line is a section heading rather than a skill. */
export function isSkillSectionHeader(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = stripSkillHeaderDecoration(value);
  if (!normalized) return false;
  if (SKILL_HEADER_SET.has(normalized)) return true;
  // "Soft Skills:" and "TECHNICAL SKILLS" are the same heading; so are the
  // plural and singular forms.
  if (SKILL_HEADER_SET.has(normalized.replace(/s$/, ''))) return true;
  return false;
}

/**
 * A few spellings that mean the same technology.
 *
 * Kept deliberately small: the map removes obvious duplication ("JS" and
 * "JavaScript") without pretending to understand every synonym.
 */
const SKILL_ALIASES: Record<string, string> = {
  js: 'javascript',
  'java script': 'javascript',
  ts: 'typescript',
  'type script': 'typescript',
  reactjs: 'react',
  'react js': 'react',
  nodejs: 'node.js',
  'node js': 'node.js',
  'node': 'node.js',
  nextjs: 'next.js',
  'next js': 'next.js',
  vuejs: 'vue',
  'vue js': 'vue',
  angularjs: 'angular',
  'angular js': 'angular',
  postgres: 'postgresql',
  'postgre sql': 'postgresql',
  pg: 'postgresql',
  mssql: 'sql server',
  'microsoft sql server': 'sql server',
  ml: 'machine learning',
  ai: 'artificial intelligence',
  'power bi': 'power bi',
  powerbi: 'power bi',
  'excel': 'microsoft excel',
  ms: 'microsoft',
  'ms excel': 'microsoft excel',
  'ms office': 'microsoft office',
  'google analytics ga4': 'google analytics 4',
  ga4: 'google analytics 4',
  seo: 'search engine optimization',
  'rest api': 'rest apis',
  'restful api': 'rest apis',
};

/** The comparison key for a skill; the displayed name keeps the candidate's spelling. */
export function normalizeSkillKey(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return SKILL_ALIASES[normalized] ?? normalized;
}

/** A display name with stray punctuation removed but the candidate's wording kept. */
export function cleanSkillName(value: string): string {
  return value
    .replace(/^[\s•·*\-–—:;,.]+/, '')
    .replace(/[\s•·*\-–—:;,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans a skill list: drops headings, empties, duplicates and one-character
 * fragments. The result preserves the first spelling seen for each skill.
 */
export function normalizeSkillList(values: readonly string[] | null | undefined): string[] {
  if (!values) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const name = cleanSkillName(raw);
    if (!name || name.length < 2) continue;
    if (isSkillSectionHeader(name)) continue;
    const key = normalizeSkillKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** De-duplicates a skill list without changing the spelling of the first entry. */
export function dedupeSkills(values: readonly string[] | null | undefined): string[] {
  return normalizeSkillList(values);
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/** The year and month tokens a date range carries, used for comparison. */
export function dateTokens(value: string | null | undefined): string {
  if (!value) return '';
  const years = value.match(/(?:19|20)\d{2}/g) ?? [];
  const months = value.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi
  );
  return `${years.join('-')}|${(months ?? []).map((month) => month.slice(0, 3).toLowerCase()).join('-')}`;
}

function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Experience                                                                */
/* -------------------------------------------------------------------------- */

export interface ExperienceLike {
  id?: string;
  role?: string | null;
  title?: string | null;
  company?: string | null;
  organization?: string | null;
  location?: string | null;
  employmentType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  period?: string | null;
  isCurrent?: boolean | null;
  description?: string | null;
  bullets?: string[] | null;
}

function experienceTitle(entry: ExperienceLike): string {
  return entry.role ?? entry.title ?? '';
}

function experienceOrganization(entry: ExperienceLike): string {
  return entry.company ?? entry.organization ?? '';
}

/**
 * The identity of an experience record: what was done, where, and when.
 *
 * Dates are part of the key because the same title at the same organisation
 * held twice is two entries. When no date is present at all, the key falls back
 * to title and organisation, which is still enough to stop an exact re-import
 * from doubling the history.
 */
export function experienceDedupeKey(entry: ExperienceLike): string {
  const title = normalizeText(experienceTitle(entry));
  const organization = normalizeText(experienceOrganization(entry));
  const dates = [entry.period, entry.startDate, entry.endDate]
    .map((value) => dateTokens(value))
    .filter(Boolean)
    .join('~');
  return `${title}|${organization}|${dates}`;
}

function richness(entry: ExperienceLike): number {
  const bullets = entry.bullets?.length ?? 0;
  const description = entry.description?.trim().length ?? 0;
  return bullets * 20 + description;
}

function mergeExperience<T extends ExperienceLike>(keeper: T, incoming: T): T {
  const bullets = [...(keeper.bullets ?? [])];
  for (const bullet of incoming.bullets ?? []) {
    if (!bullets.some((existing) => normalizeText(existing) === normalizeText(bullet))) {
      bullets.push(bullet);
    }
  }
  return {
    ...keeper,
    // Fill a field only when the keeper does not have it; never overwrite a
    // value the user has already written.
    role: keeper.role ?? incoming.role,
    title: keeper.title ?? incoming.title,
    company: keeper.company ?? incoming.company,
    organization: keeper.organization ?? incoming.organization,
    location: keeper.location ?? incoming.location,
    employmentType: keeper.employmentType ?? incoming.employmentType,
    startDate: keeper.startDate ?? incoming.startDate,
    endDate: keeper.endDate ?? incoming.endDate,
    period: keeper.period ?? incoming.period,
    isCurrent: keeper.isCurrent ?? incoming.isCurrent,
    description: keeper.description ?? incoming.description,
    bullets: bullets.length > 0 ? bullets : keeper.bullets,
  };
}

/**
 * Collapses duplicate experience records.
 *
 * The richer record survives: the copy with the bullets is the one a reader
 * wants, and its wording is kept. Duplicates are merged into it so a bullet
 * only one copy carried is not lost.
 */
export function dedupeExperience<T extends ExperienceLike>(
  entries: readonly T[] | null | undefined
): T[] {
  if (!entries) return [];
  const byKey = new Map<string, T>();
  for (const entry of entries) {
    const key = experienceDedupeKey(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    const [keeper, incoming] =
      richness(entry) > richness(existing) ? [entry, existing] : [existing, entry];
    byKey.set(key, mergeExperience(keeper, incoming));
  }

  // A FRAGMENT is a record that names the organisation but no role and no
  // dates.
  //
  // It is what is left when a placement written as a block of lines is read
  // one line at a time: the organisation becomes a record of its own. Kept,
  // it shows the candidate a job they never had.
  //
  // A fragment is folded into the record that names the same organisation
  // and has a role, and dropped when there is no such record — at that point
  // it carries nothing the candidate wrote.
  const fragments = [...byKey.values()].filter(isFragment);
  const kept = [...byKey.values()].filter((entry) => !isFragment(entry));

  for (const fragment of fragments) {
    const organization = normalizeText(experienceOrganization(fragment));
    if (!organization) continue;
    const host = kept.find(
      (entry) =>
        normalizeText(experienceOrganization(entry)) === organization &&
        normalizeText(experienceTitle(entry)).length > 0
    );
    if (!host) continue;
    const merged = mergeExperience(host, fragment);
    const index = kept.indexOf(host);
    kept[index] = merged;
  }

  return kept;
}

/**
 * Whether a record is only a fragment of a placement.
 *
 * It names an organisation but no role, and it carries no dates and no
 * description of its own.
 */
function isFragment(entry: ExperienceLike): boolean {
  const hasOrganization = normalizeText(experienceOrganization(entry)).length > 0;
  const hasRole = normalizeText(experienceTitle(entry)).length > 0;
  const hasDates = Boolean(
    entry.startDate?.trim() || entry.endDate?.trim() || entry.period?.trim()
  );
  return hasOrganization && !hasRole && !hasDates;
}

/** True when two experience records describe the same block. */
export function isDuplicateExperience(a: ExperienceLike, b: ExperienceLike): boolean {
  return experienceDedupeKey(a) === experienceDedupeKey(b);
}

/* -------------------------------------------------------------------------- */
/* Education                                                                  */
/* -------------------------------------------------------------------------- */

export interface EducationLike {
  id?: string;
  institution?: string | null;
  school?: string | null;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  period?: string | null;
  current?: boolean | null;
  description?: string | null;
}

function educationInstitution(entry: EducationLike): string {
  return entry.institution ?? entry.school ?? '';
}

/** The identity of an education record: where, and what was studied. */
export function educationDedupeKey(entry: EducationLike): string {
  return `${normalizeText(educationInstitution(entry))}|${normalizeText(entry.degree)}`;
}

function mergeEducation<T extends EducationLike>(keeper: T, incoming: T): T {
  return {
    ...keeper,
    institution: keeper.institution ?? incoming.institution,
    school: keeper.school ?? incoming.school,
    degree: keeper.degree ?? incoming.degree,
    field: keeper.field ?? incoming.field,
    startDate: keeper.startDate ?? incoming.startDate,
    endDate: keeper.endDate ?? incoming.endDate,
    period: keeper.period ?? incoming.period,
    current: keeper.current ?? incoming.current,
    description: keeper.description ?? incoming.description,
  };
}

/** Collapses duplicate education records, keeping the fuller copy. */
export function dedupeEducation<T extends EducationLike>(
  entries: readonly T[] | null | undefined
): T[] {
  if (!entries) return [];
  const byKey = new Map<string, T>();
  for (const entry of entries) {
    const key = educationDedupeKey(entry);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    const [keeper, incoming] =
      (entry.description?.length ?? 0) > (existing.description?.length ?? 0)
        ? [entry, existing]
        : [existing, entry];
    byKey.set(key, mergeEducation(keeper, incoming));
  }
  return [...byKey.values()];
}

export function isDuplicateEducation(a: EducationLike, b: EducationLike): boolean {
  return educationDedupeKey(a) === educationDedupeKey(b);
}

/* -------------------------------------------------------------------------- */
/* Text and whole-document de-duplication                                     */
/* -------------------------------------------------------------------------- */

/** The comparison key for a free-text field such as the summary. */
export function exactTextKey(value: string | null | undefined): string {
  return normalizeText(value);
}

/**
 * De-duplicates a text field, returning the first non-empty value.
 *
 * Used for the summary, where two candidates for the same field are only
 * duplicates when the text is actually the same; different wording is left for
 * the user to choose at the review step.
 */
export function sameExactText(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = exactTextKey(a);
  const right = exactTextKey(b);
  return left.length > 0 && left === right;
}

export interface CvDocumentLike {
  experiences?: ExperienceLike[] | null;
  education?: EducationLike[] | null;
  skillsList?: string[] | null;
  certifications?: string[] | null;
  languages?: string[] | null;
}

/**
 * Cleans a whole CV document in place-equivalent form.
 *
 * A document produced by "Fill from my records" can contain an imported entry,
 * a record of the same job, and the fragment the parser split off — all three
 * describing one role. Running the document through this function leaves one
 * entry per real block, and a skill list that contains skills.
 */
export function dedupeCvDocument<T extends CvDocumentLike>(document: T): T {
  return {
    ...document,
    experiences: dedupeExperience(document.experiences ?? []),
    education: dedupeEducation(document.education ?? []),
    skillsList: dedupeSkills(document.skillsList ?? []),
    certifications: dedupeSkills((document.certifications ?? []).map((name) => cleanSkillName(name))),
    languages: document.languages
      ? dedupeSkills(document.languages.map((name) => cleanSkillName(name)))
      : document.languages,
  };
}

/**
 * Compares two imported CV documents for the review step.
 *
 * The review step needs to tell the user what an import would add and what it
 * would duplicate before anything is written. Only the differences are
 * returned, so the user sees a short, honest list rather than the whole
 * document twice.
 */
export interface CvDedupeSummary {
  duplicateExperiences: number;
  newExperiences: number;
  duplicateEducation: number;
  newEducation: number;
  duplicateSkills: string[];
  newSkills: string[];
  summaryIsDuplicate: boolean;
}

export function compareCvDocuments(input: {
  incoming: CvDocumentLike & { summary?: string | null };
  existing: CvDocumentLike & { summary?: string | null };
}): CvDedupeSummary {
  const existingExperienceKeys = new Set(
    (input.existing.experiences ?? []).map((entry) => experienceDedupeKey(entry))
  );
  const existingEducationKeys = new Set(
    (input.existing.education ?? []).map((entry) => educationDedupeKey(entry))
  );
  const existingSkillKeys = new Set(
    normalizeSkillList(input.existing.skillsList ?? []).map((name) => normalizeSkillKey(name))
  );

  const incomingExperiences = dedupeExperience(input.incoming.experiences ?? []);
  const incomingEducation = dedupeEducation(input.incoming.education ?? []);
  const incomingSkills = normalizeSkillList(input.incoming.skillsList ?? []);

  let duplicateExperiences = 0;
  for (const entry of incomingExperiences) {
    if (existingExperienceKeys.has(experienceDedupeKey(entry))) duplicateExperiences += 1;
  }

  let duplicateEducationCount = 0;
  for (const entry of incomingEducation) {
    if (existingEducationKeys.has(educationDedupeKey(entry))) duplicateEducationCount += 1;
  }

  const duplicateSkills: string[] = [];
  const newSkills: string[] = [];
  for (const name of incomingSkills) {
    if (existingSkillKeys.has(normalizeSkillKey(name))) duplicateSkills.push(name);
    else newSkills.push(name);
  }

  return {
    duplicateExperiences,
    newExperiences: incomingExperiences.length - duplicateExperiences,
    duplicateEducation: duplicateEducationCount,
    newEducation: incomingEducation.length - duplicateEducationCount,
    duplicateSkills,
    newSkills,
    summaryIsDuplicate: sameExactText(input.incoming.summary, input.existing.summary),
  };
}
