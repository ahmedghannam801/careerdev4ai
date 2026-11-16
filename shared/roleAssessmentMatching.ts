import { normalizeSkillKey } from './skillNormalizer.ts';

export interface AssessmentSkillDescriptor {
  skillName: string;
  aliases?: readonly string[];
}

/**
 * Labels that name the same skill with different words.
 *
 * The shared normaliser already resolves the common technology aliases
 * ("JS" → "javascript", "excel" → "microsoft excel", "reactjs" → "react").
 * This table only covers the whole-label phrasings it does not know. It is
 * deliberately tiny: a wrong entry here recommends the candidate the wrong
 * knowledge check.
 */
const CONTROLLED_SYNONYMS: Readonly<Record<string, string>> = {
  'excel spreadsheet': 'microsoft excel',
  'excel spreadsheets': 'microsoft excel',
  'microsoft excel spreadsheet': 'microsoft excel',
  'microsoft excel spreadsheets': 'microsoft excel',
  spreadsheet: 'microsoft excel',
  spreadsheets: 'microsoft excel',
};

/**
 * Words that join two names rather than describe a skill. They are dropped
 * before the names are compared, so "Python for Data Analysis" is read as
 * "python data analysis" and "Excel & Spreadsheets" as "excel spreadsheets".
 */
const JOINING_WORDS = new Set([
  'and',
  'for',
  'from',
  'into',
  'the',
  'using',
  'via',
  'with',
  'your',
]);

/**
 * The canonical identity of a skill name.
 *
 * Two names with the same identity are the same skill. The normaliser's key is
 * the platform's comparison key; this adds the controlled synonyms above and
 * strips the ".js" extension, because "React.js" and "React" are one skill
 * (the extension is dropped on both sides, so "node.js" stays equivalent to
 * "node" too).
 */
function canonicalSkillId(value: string): string {
  const key = normalizeSkillKey(value);
  if (!key) return '';
  const bare = key.replace(/\.js$/, '');
  return CONTROLLED_SYNONYMS[bare] ?? bare;
}

/** The meaningful words of a canonical id, for the partial-match rule. */
function skillTokens(id: string): Set<string> {
  return new Set(
    id
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !JOINING_WORDS.has(token))
  );
}

function isSubsetOf(candidate: Set<string>, container: Set<string>): boolean {
  if (candidate.size === 0) return false;
  for (const token of candidate) {
    if (!container.has(token)) return false;
  }
  return true;
}

/**
 * Whether a check named `assessmentId` covers the role skill named `roleId`.
 *
 * There are exactly two ways a check belongs to a requirement:
 *
 *   1. The two names are the same skill (exact identity, declared alias or
 *      controlled synonym).
 *   2. The check is the more general skill and the requirement is a specific
 *      form of it: "Python" covers "Python for Data Analysis". The relation is
 *      intentionally one-way. "Python" is not covered by "Python for Data
 *      Analysis", and "Data Analysis" is not covered by "Data Visualization":
 *      a specialization and a neighbouring subject are different things, and
 *      sharing one ordinary word ("data", "python") used to make them look the
 *      same.
 */
function assessmentCovers(roleId: string, assessmentId: string): boolean {
  if (roleId === assessmentId) return true;
  return isSubsetOf(skillTokens(assessmentId), skillTokens(roleId));
}

/**
 * Keep the assessment catalog limited to checks that match the active role's
 * stated skills. With no role configured, preserve the general catalog so a
 * candidate can still explore available checks.
 */
export function assessmentsForRole<T extends AssessmentSkillDescriptor>(
  assessments: readonly T[],
  roleSkillNames: readonly string[] | null | undefined
): T[] {
  if (!roleSkillNames?.length) return [...assessments];

  const roleIds = roleSkillNames
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map((name) => canonicalSkillId(name))
    .filter((id) => id.length > 0);
  if (roleIds.length === 0) return [];

  return assessments.filter((assessment) => {
    const assessmentIds = [assessment.skillName, ...(assessment.aliases ?? [])]
      .map((name) => canonicalSkillId(name))
      .filter((id) => id.length > 0);

    return roleIds.some((roleId) =>
      assessmentIds.some((assessmentId) => assessmentCovers(roleId, assessmentId))
    );
  });
}
