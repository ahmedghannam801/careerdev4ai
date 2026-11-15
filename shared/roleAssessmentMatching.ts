import { normalizeSkillKey } from './skillNormalizer.ts';

export interface AssessmentSkillDescriptor {
  skillName: string;
  aliases?: readonly string[];
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

  const roleKeys = roleSkillNames
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map((name) => normalizeSkillKey(name));
  if (roleKeys.length === 0) return [];

  return assessments.filter((assessment) => {
    const assessmentKeys = [assessment.skillName, ...(assessment.aliases ?? [])]
      .map((name) => normalizeSkillKey(name))
      .filter((key) => key.length > 0);

    return roleKeys.some((roleKey) =>
      assessmentKeys.some((assessmentKey) => {
        if (roleKey === assessmentKey) return true;
        // Keep narrow, meaningful expansions: e.g. "Python for Data Analysis"
        // can use the Python check, and "Excel & Spreadsheets" the Excel check.
        if (roleKey.includes(assessmentKey) || assessmentKey.includes(roleKey)) return true;
        const assessmentTokens = new Set(assessmentKey.split(' ').filter((token) => token.length >= 3));
        return roleKey.split(' ').some((token) => token.length >= 3 && assessmentTokens.has(token));
      })
    );
  });
}
