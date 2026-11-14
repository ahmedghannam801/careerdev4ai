/**
 * Canonical CV records.
 *
 * WHY THIS MODULE EXISTS
 * The QA audit found a candidate whose CV carried:
 *
 *   - a skill list reading "SQL, SQL Fundamentals, Python, Python
 *     Fundamentals, Python for Data Analysis, Microsoft Excel, Excel /
 *     Spreadsheets Modeling";
 *   - two education entries for the same university, one of which repeated
 *     the university's name inside itself ("Cairo University, Cairo
 *     University — Faculty of Science");
 *   - a summary whose second paragraph repeated its first in different words;
 *   - an experience record with no title and no company.
 *
 * None of these are lies. They are the result of a candidate describing the
 * same thing three times, each time slightly differently, and the platform
 * copying each description in as a separate record.
 *
 * This module turns those descriptions back into records a hiring manager can
 * read:
 *
 *   1. Skills are canonicalised — "SQL" and "SQL Fundamentals" become one
 *      "SQL" entry, with the specific wording kept as a specialisation tag
 *      so nothing the candidate wrote is thrown away.
 *   2. Education merges into one record per degree, with the institution
 *      cleaned of the duplication that comes from writing the university's
 *      name inside its own faculty.
 *   3. Experience records that say nothing are dropped.
 *   4. Summary paragraphs that say the same thing twice are collapsed.
 *
 * Nothing here deletes the candidate's words. Every function either merges
 * duplicates or drops a record that carries no information at all.
 */

import { skillsMatch } from './skillMatching.ts';

/* -------------------------------------------------------------------------- */
/* Skills                                                                       */
/* -------------------------------------------------------------------------- */

/** One canonical skill, with the specific wordings folded into it. */
export interface CanonicalSkill {
  /** The name the skill is listed under. */
  name: string;
  /**
   * The specific wordings that were folded into this skill.
   *
   * "Python for Data Analysis" is not lost when it becomes "Python" — it
   * becomes a specialisation tag, and the candidate can still see and edit
   * it.
   */
  specializations: string[];
  /**
   * The order the skill should appear in.
   *
   * Lower comes first. The platform orders by how much the target role
   * cares, so the skills the role actually asks for lead.
   */
  relevance: number;
  /** True when the target role asks for this skill. */
  required: boolean;
  /** The strongest level the candidate gave this skill. */
  level: number;
}

/** A skill the candidate wrote, before canonicalisation. */
export interface SkillEntryLike {
  name: string;
  level?: number;
}

/**
 * The words that mean "this is the basic version of that skill".
 *
 * "SQL Fundamentals" is not a different skill from "SQL" — it is SQL. The
 * catalogue has to know which suffix words are decoration, otherwise every
 * candidate's spelling creates a new skill.
 */
const FUNDAMENTAL_SUFFIXES = [
  'fundamentals',
  'basics',
  'basic',
  'introduction',
  'intro',
  'fundamentals',
  'essentials',
  'core',
  'principles',
  'concepts',
  'overview',
];

/**
 * The words that mean "this skill is used in a particular specialisation".
 *
 * These are kept, because "Python for Data Analysis" tells a hiring manager
 * something "Python" does not.
 */
const SPECIALIZATION_MARKERS = ['for', 'in', 'with'];

/**
 * One part of a skill name.
 *
 * "Excel / Spreadsheets Modeling" is two parts: "Excel" and "Spreadsheets
 * Modeling". A part keeps the candidate's own spelling and carries the
 * comparison key the parts are matched on.
 */
interface SkillPart {
  /** The words, as the candidate wrote them. */
  words: string[];
  /** The meaningful words, in lower case, with the decoration removed. */
  key: string[];
}

/**
 * Splits a skill name into the parts that carry meaning.
 *
 * The split happens on the separators that mean "and" — a slash, a comma, a
 * parenthesis — and never inside a phrase, so "Power BI" stays one part and
 * "Spreadsheets Modeling" stays one part.
 */
function skillParts(name: string): SkillPart[] {
  const parts: SkillPart[] = [];

  const push = (text: string) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    const lower = words.map((word) => word.toLowerCase().replace(/[^a-z0-9+#]/g, ''));

    // A specialisation is only a specialisation when a marker word introduces
    // it: "Python for Data Analysis". Without the marker, "data analysis" is
    // the skill's own name.
    const markerIndex = lower.findIndex((token) => SPECIALIZATION_MARKERS.includes(token));
    const baseEnd = markerIndex > 0 ? markerIndex : lower.length;

    const meaningful: Array<{ word: string; key: string }> = [];
    for (let index = 0; index < baseEnd; index += 1) {
      if (!lower[index]) continue;
      if (FUNDAMENTAL_SUFFIXES.includes(lower[index])) continue;
      meaningful.push({ word: words[index], key: lower[index] });
    }

    // A part made only of decoration still names something: "Fundamentals"
    // alone is a skill called "Fundamentals". Keep it rather than lose it.
    const kept =
      meaningful.length > 0
        ? meaningful
        : lower
            .slice(0, baseEnd)
            .map((key, index) => ({ word: words[index], key }))
            .filter((pair) => pair.key);

    if (kept.length === 0) return;

    parts.push({
      words: kept.map((pair) => pair.word),
      key: kept.map((pair) => pair.key),
    });
  };

  // A parenthetical group is its own set of parts: "Data Visualization
  // (Tableau/Power BI)" is three parts, not one long phrase. The group's
  // contents are taken out of the name before the rest is split, so they are
  // not counted twice.
  const parentheticals: string[] = [];
  for (const match of name.matchAll(/[()[\]{}]([^()[\]{}]*)[()[\]{}]/g)) {
    parentheticals.push(match[1]);
  }

  const stripped = name
    .replace(/[()[\]{}]([^()[\]{}]*)[()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const part of stripped.split(/[/|,]/)) push(part);
  for (const inner of parentheticals) {
    for (const part of inner.split(/[/|,]/)) push(part);
  }

  return parts;
}

/**
 * The comparison key of a skill name: every meaningful word, in order.
 *
 * Two names with the same key are the same skill — "SQL" and "SQL
 * Fundamentals" both give "sql".
 */
function skillSignature(name: string): string {
  return skillParts(name)
    .map((part) => part.key.join(' '))
    .filter(Boolean)
    .join(' / ');
}

/**
 * Strips the decoration from a skill name, keeping the specialisation.
 *
 * "SQL Fundamentals" becomes "sql". "Python for Data Analysis" becomes
 * "python" — the specialisation is kept.
 */
export function skillBaseName(name: string): string {
  const parts = skillParts(name);
  if (parts.length === 0) return '';
  return parts[0].key.join(' ');
}

/**
 * The specialisation of a skill name, when it has one.
 *
 * "Python for Data Analysis" gives "data analysis"; "SQL" gives nothing.
 */
export function skillSpecialization(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s&/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const markerIndex = tokens.findIndex((token) => SPECIALIZATION_MARKERS.includes(token));
  if (markerIndex <= 0) return '';
  return tokens
    .slice(markerIndex + 1)
    .filter((token) => !FUNDAMENTAL_SUFFIXES.includes(token))
    .join(' ');
}

/**
 * True when the name carries a decoration word — "SQL Fundamentals".
 *
 * A name without one is the better name for a group: "SQL" beats "SQL
 * Fundamentals" as the name of the skill.
 */
function hasDecorationWord(name: string): boolean {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s&/]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return tokens.some((token) => FUNDAMENTAL_SUFFIXES.includes(token));
}

/**
 * The name a group is listed under, when every member names the same thing.
 *
 * "SQL" wins over "SQL Fundamentals" because it carries no decoration, and
 * "Python" wins over "Python for Data Analysis" because it is the plain name
 * of the skill the specialisation belongs to.
 */
function preferredGroupName(members: string[]): string {
  const ranked = [...members].sort((a, b) => {
    const decoration = Number(hasDecorationWord(a)) - Number(hasDecorationWord(b));
    if (decoration !== 0) return decoration;
    const specialised =
      Number(skillSpecialization(a).length > 0) - Number(skillSpecialization(b).length > 0);
    if (specialised !== 0) return specialised;
    return a.length - b.length || a.localeCompare(b);
  });
  return ranked[0] ?? '';
}

/**
 * The name a group is listed under, when its members name different things.
 *
 * "Microsoft Excel" and "Excel / Spreadsheets Modeling" are one skill the
 * candidate described twice. The union of what the two names say is
 * "Microsoft Excel & Spreadsheets Modeling" — the words the first name
 * already carries are not repeated.
 */
function unionGroupName(members: string[]): string {
  /** One signature: the parts of the names that share it. */
  interface Signature {
    parts: SkillPart[];
    /** The joined signature key. */
    key: string;
    /** How long the name reads. */
    length: number;
  }

  const byKey = new Map<string, Signature>();
  for (const member of members) {
    const parts = skillParts(member);
    if (parts.length === 0) continue;
    const key = parts.map((part) => part.key.join(' ')).join(' / ');
    if (byKey.has(key)) continue;
    byKey.set(key, {
      parts,
      key,
      length: parts.reduce((total, part) => total + part.words.join(' ').length + 1, 0),
    });
  }

  const signatures = [...byKey.values()];
  if (signatures.length === 0) return '';
  if (signatures.length === 1) {
    return preferredGroupName(members);
  }

  // The shortest name leads, because it is the one that says the least and
  // therefore leaves the most for the others to add.
  const lead = [...signatures].sort((a, b) => a.length - b.length)[0];

  const covered = new Set<string>();
  const unionParts: SkillPart[] = [];
  const take = (part: SkillPart) => {
    // Only the words the union does not already say are kept: "Data
    // Visualization Tableau" contributes "Tableau", not its whole phrase.
    const freshIndexes = part.key
      .map((token, index) => ({ token, index }))
      .filter((entry) => !covered.has(entry.token));

    if (freshIndexes.length === 0) return;
    for (const entry of freshIndexes) covered.add(entry.token);

    unionParts.push({
      words: freshIndexes.map((entry) => part.words[entry.index]),
      key: freshIndexes.map((entry) => entry.token),
    });
  };

  for (const part of lead.parts) take(part);
  for (const signature of signatures) {
    if (signature.key === lead.key) continue;
    for (const part of signature.parts) take(part);
  }

  return unionParts.map((part) => part.words.join(' ')).join(' & ');
}


/**
 * The canonical name for a group of overlapping skill names.
 *
 * The shortest name wins, because the shortest is the broadest: "SQL" beats
 * "SQL Fundamentals" as the name of the skill, and "SQL Fundamentals" is
 * kept as its specialisation instead of being thrown away.
 */
function canonicalNameFor(names: string[]): string {
  const signatures = new Set(names.map((name) => skillSignature(name)));
  if (signatures.size <= 1) return preferredGroupName(names);
  return unionGroupName(names);
}

/**
 * Folds overlapping skills into canonical entries.
 *
 * Two skills are the same skill when one of them's base name matches the
 * other's — "SQL" and "SQL Fundamentals" — or when the platform's own
 * matcher says they are the same thing.
 *
 * The result is sorted by how much the target role cares, so the skills the
 * role actually asks for are at the top of the CV.
 */
export function canonicalizeSkills(
  entries: readonly SkillEntryLike[] | null | undefined,
  options?: {
    /** The skills the target role requires. */
    requiredSkills?: readonly string[] | null;
    /** The skills the target role merely prefers. */
    preferredSkills?: readonly string[] | null;
  }
): CanonicalSkill[] {
  if (!entries || entries.length === 0) return [];

  const required = (options?.requiredSkills ?? []).map((name) => name.toLowerCase());
  const preferred = (options?.preferredSkills ?? []).map((name) => name.toLowerCase());

  /** One group of skills that are really the same skill. */
  interface Group {
    names: string[];
    level: number;
  }
  const groups: Group[] = [];

  for (const entry of entries) {
    const name = (entry.name ?? '').trim();
    if (!name) continue;

    const level = entry.level ?? 0;
    const signature = skillSignature(name);

    const existing = groups.find((group) =>
      group.names.some((candidate) => {
        // The same signature is the same skill: "SQL" and "SQL Fundamentals".
        if (skillSignature(candidate) === signature) return true;
        // Otherwise the platform's own matcher decides.
        return skillsMatch(candidate, name);
      })
    );

    if (existing) {
      existing.names.push(name);
      // The strongest level wins: a candidate who rated a skill 4 in one
      // place and 2 in another has it at 4.
      existing.level = Math.max(existing.level, level);
    } else {
      groups.push({ names: [name], level });
    }
  }

  const canonical = groups.map((group) => {
    const name = canonicalNameFor(group.names);
    const specializations = group.names
      .map((candidate) => skillSpecialization(candidate))
      .filter((specialization) => specialization.length > 0);

    // The role's requirement is matched against every name the candidate
    // wrote for this skill, so a role that asks for "SQL" still matches a
    // candidate who only wrote "SQL Fundamentals".
    const isRequired = required.some((candidate) =>
      group.names.some(
        (written) =>
          candidate === written.toLowerCase() ||
          candidate === name.toLowerCase() ||
          skillsMatch(candidate, written)
      )
    );
    const isPreferred = preferred.some((candidate) =>
      group.names.some(
        (written) =>
          candidate === written.toLowerCase() ||
          candidate === name.toLowerCase() ||
          skillsMatch(candidate, written)
      )
    );

    return {
      name,
      specializations: [...new Set(specializations)],
      level: group.level,
      relevance: isRequired ? 0 : isPreferred ? 1 : 2,
      required: isRequired,
    };
  });

  // The role's own skills first, then the preferred ones, then everything
  // else. The sort is stable, so within each tier the candidate's own order
  // survives: they rated their skills in a deliberate order, and folding
  // duplicates together must not reshuffle the rest.
  canonical.sort((a, b) => a.relevance - b.relevance);

  return canonical.map(({ name, specializations, relevance, required, level }) => ({
    name,
    specializations,
    relevance,
    required,
    level,
  }));
}

/**
 * The skill list to write on a CV.
 *
 * Each canonical skill is one line. The specialisations are shown beside it
 * so the candidate can see the specific wording that was folded in, and edit
 * it if they disagree.
 */
export function canonicalSkillLines(
  entries: readonly SkillEntryLike[] | null | undefined,
  options?: {
    requiredSkills?: readonly string[] | null;
    preferredSkills?: readonly string[] | null;
  }
): string[] {
  return canonicalizeSkills(entries, options).map((skill) =>
    skill.specializations.length > 0
      ? `${skill.name} (${skill.specializations.join(', ')})`
      : skill.name
  );
}

/* -------------------------------------------------------------------------- */
/* Education                                                                    */
/* -------------------------------------------------------------------------- */

/** An education record, as this module needs to see it. */
export interface EducationEntryLike {
  id?: string;
  institution?: string | null;
  school?: string | null;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current?: boolean | null;
}

/**
 * Removes a repeated institution name from inside itself.
 *
 * "Cairo University, Cairo University — Faculty of Science" becomes "Cairo
 * University". The faculty is kept as the field of study when it is not
 * already there.
 *
 * The rule is simple and safe: when the institution name appears more than
 * once, the first occurrence is kept and the rest are dropped, and whatever
 * trailed the repeated name is preserved as the faculty.
 */
export function cleanInstitutionName(institution: string | null | undefined): string {
  const raw = (institution ?? '').trim();
  if (!raw) return '';

  const parts = raw
    .split(/\s*[,—–-]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return raw;

  const head = parts[0];
  const repeated = parts.filter(
    (part) =>
      part !== head &&
      (head.toLowerCase().includes(part.toLowerCase()) ||
        part.toLowerCase().includes(head.toLowerCase()))
  );

  if (repeated.length === 0) {
    // No repetition: the parts are a genuine qualification of the name
    // ("Cairo University, Faculty of Science"). Keep the institution name
    // alone and let the field of study carry the rest.
    return head;
  }

  return head;
}

/**
 * The faculty or specialisation mentioned inside the institution name.
 *
 * "Cairo University — Faculty of Science" gives "Faculty of Science".
 *
 * The parts that merely repeat the university's own name are not a faculty
 * and are skipped; the first part that qualifies the name is.
 */
export function institutionFaculty(institution: string | null | undefined): string {
  const raw = (institution ?? '').trim();
  if (!raw) return '';

  const parts = raw
    .split(/\s*[,—–-]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return '';

  const head = parts[0].toLowerCase();
  const faculty = parts.slice(1).find((part) => {
    const candidate = part.toLowerCase();
    // A repeat of the university's own name is not a faculty.
    if (candidate === head) return false;
    if (head.includes(candidate) || candidate.includes(head)) return false;
    return true;
  });

  return faculty ?? '';
}

/**
 * The identity of an education record: the degree and the institution.
 *
 * Two records for the same degree at the same institution are one record,
 * even when one of them spells the institution differently.
 */
export function educationRecordKey(entry: EducationEntryLike): string {
  const institution = (entry.institution ?? entry.school ?? '').trim().toLowerCase();
  const degree = (entry.degree ?? '').trim().toLowerCase();
  return `${institution}|${degree}`;
}

/**
 * Merges education records into one per degree.
 *
 * The merged record keeps the degree, the field of study, the institution,
 * the dates and the status. It never leaves the candidate with two rows for
 * the same degree.
 */
export function mergeEducationRecords<T extends EducationEntryLike>(
  entries: readonly T[] | null | undefined
): T[] {
  if (!entries || entries.length === 0) return [];

  const byKey = new Map<string, T>();

  for (const entry of entries) {
    const institution = cleanInstitutionName(entry.institution ?? entry.school);
    const faculty = institutionFaculty(entry.institution ?? entry.school);
    const field = (entry.field ?? '').trim() || faculty;

    const normalised: T = {
      ...entry,
      institution,
      field,
    };

    const key = educationRecordKey(normalised);
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, normalised);
      continue;
    }

    byKey.set(key, {
      ...existing,
      degree: existing.degree || normalised.degree,
      field: existing.field || normalised.field,
      startDate: existing.startDate || normalised.startDate,
      endDate: existing.endDate || normalised.endDate,
      current: existing.current ?? normalised.current,
    });
  }

  return [...byKey.values()];
}

/* -------------------------------------------------------------------------- */
/* Experience                                                                   */
/* -------------------------------------------------------------------------- */

/** An experience record, as this module needs to see it. */
export interface ExperienceEntryLike {
  id?: string;
  role?: string | null;
  title?: string | null;
  company?: string | null;
  organization?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * The title of an experience record, whichever field it is written in.
 */
export function experienceTitle(entry: ExperienceEntryLike): string {
  return (entry.role ?? entry.title ?? '').trim();
}

/**
 * The organisation of an experience record, whichever field it is written in.
 */
export function experienceOrganization(entry: ExperienceEntryLike): string {
  return (entry.company ?? entry.organization ?? '').trim();
}

/**
 * True when an experience record says nothing at all.
 *
 * A record with neither a title nor a company is a stray row: it cannot be
 * read on a CV and it cannot be matched against a gap. The candidate
 * probably meant to fill it in, but an empty row on a CV is worse than no
 * row.
 */
export function isEmptyExperience(entry: ExperienceEntryLike): boolean {
  return (
    experienceTitle(entry).length === 0 && experienceOrganization(entry).length === 0
  );
}

/**
 * Removes the experience records that say nothing.
 */
export function dropEmptyExperience<T extends ExperienceEntryLike>(
  entries: readonly T[] | null | undefined
): T[] {
  if (!entries) return [];
  return entries.filter((entry) => !isEmptyExperience(entry));
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The comparison key for a summary paragraph.
 *
 * Case, punctuation and spacing are all noise: "Built a dashboard." and
 * "built a dashboard" say the same thing.
 */
export function paragraphKey(paragraph: string): string {
  return paragraph
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The words a paragraph uses, with the common filler removed.
 *
 * The filler is what makes two different sentences say the same thing:
 * "I am a data analyst" and "As a data analyst, I…".
 */
const FILLER_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'as',
  'is',
  'am',
  'are',
  'was',
  'were',
  'be',
  'been',
  'i',
  'my',
  'me',
  'we',
  'our',
  'that',
  'this',
  'it',
  'its',
]);

/**
 * The significant words of a paragraph.
 */
export function paragraphWords(paragraph: string): string[] {
  return paragraphKey(paragraph)
    .split(' ')
    .filter((word) => word.length > 0 && !FILLER_WORDS.has(word));
}

/**
 * How similar two paragraphs are, 0..1.
 *
 * The measure is the overlap of their significant words. It is deliberately
 * generous: near-identical paragraphs are the problem, and a candidate who
 * wrote the same point in two slightly different ways wants one of them
 * kept.
 */
export function paragraphSimilarity(a: string, b: string): number {
  const left = new Set(paragraphWords(a));
  const right = new Set(paragraphWords(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }

  return shared / Math.min(left.size, right.size);
}

/**
 * The threshold at which two paragraphs are treated as the same point.
 *
 * 0.85 means "the same idea said differently" — the two paragraphs share at
 * least 85% of the shorter one's significant words.
 */
export const SUMMARY_PARAGRAPH_SIMILARITY = 0.85;

/**
 * Removes paragraphs that repeat an earlier one.
 *
 * The first occurrence is kept, because it is the one the candidate wrote
 * first, and a summary reads in order.
 */
export function dedupeSummaryParagraphs(
  summary: string | null | undefined,
  similarityThreshold: number = SUMMARY_PARAGRAPH_SIMILARITY
): string {
  if (!summary) return '';

  const paragraphs = summary
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const paragraph of paragraphs) {
    const key = paragraphKey(paragraph);
    const duplicate = kept.some(
      (existing) =>
        paragraphKey(existing) === key ||
        paragraphSimilarity(existing, paragraph) >= similarityThreshold
    );
    if (!duplicate) kept.push(paragraph);
  }

  return kept.join('\n\n');
}
