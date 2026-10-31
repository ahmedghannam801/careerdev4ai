/**
 * Learning-catalogue coverage model.
 *
 * "Covered" must mean more than "the role has one course attached". A role is
 * considered covered only when the catalogue can serve every stage of its
 * learning path:
 *
 *   foundations  a beginner on-ramp (at least two relevant courses)
 *   core         the role's required skills, not only its job title
 *   tools        the software and platforms the role actually uses
 *   advanced     material beyond the basics
 *   practical    an applied course that can be finished in a month
 *   roleSpecific a course tied to this role rather than its whole domain
 *
 * The audit is deterministic and shared by tests and tooling. It uses the same
 * skill matcher as the recommender, so a course is not counted twice under two
 * spellings of the same skill.
 */

import { categoryServesDomain } from './learningCategories.ts';
import { skillMatchConfidence } from './skillMatching.ts';

export const COVERAGE_DIMENSIONS = [
  'foundations',
  'core',
  'tools',
  'advanced',
  'practical',
  'roleSpecific',
] as const;

export type CoverageDimension = (typeof COVERAGE_DIMENSIONS)[number];

export interface CoverageSkill {
  name: string;
  category?: string;
  minLevel: number;
}

export interface CoverageRole {
  id: string;
  title: string;
  domainId: string;
  coreSkills: CoverageSkill[];
  preferredSkills?: CoverageSkill[];
  tools?: string[];
}

export interface CoverageCourse {
  id: string;
  title: string;
  category: string;
  level: string;
  format: string;
  durationHours: number | null;
  skills: Array<{ name: string; importance: number }>;
  roles: Array<{ roleSlug: string; relevanceScore: number }>;
}

export interface DimensionResult {
  covered: boolean;
  reason: string;
  evidence: string[];
}

export interface RoleCoverage {
  roleId: string;
  roleTitle: string;
  domainId: string;
  relevantCourseIds: string[];
  directCourseIds: string[];
  matchedRequiredSkills: string[];
  missingRequiredSkills: string[];
  matchedPreferredSkills: string[];
  coreCoverage: number;
  dimensions: Record<CoverageDimension, DimensionResult>;
  coveredDimensions: number;
  complete: boolean;
}

export interface DomainCoverage {
  domainId: string;
  roleCount: number;
  completeRoles: number;
  averageDimensions: number;
  failingDimensions: CoverageDimension[];
}

export interface CoverageAudit {
  roles: RoleCoverage[];
  domains: DomainCoverage[];
  completeRoles: number;
  totalRoles: number;
  /** Role-skill names no course teaches, across the whole catalogue. */
  missingSkills: string[];
}

export interface CourseMatch {
  course: CoverageCourse;
  direct: boolean;
  matchedSkills: string[];
  matchedTools: string[];
}

const FOUNDATION_MIN_COURSES = 2;
const CORE_MIN_RATIO = 1 / 3;
const CORE_MIN_SKILLS = 2;
const PRACTICAL_MAX_HOURS = 40;
const ROLE_SPECIFIC_MIN_RELEVANCE = 70;

const MATCH_THRESHOLD = 0.8;

/** True when a course skill teaches a role skill. */
function matches(skillName: string, roleSkillName: string): boolean {
  return skillMatchConfidence(skillName, roleSkillName) >= MATCH_THRESHOLD;
}

/**
 * Scores one course against one role. A direct mapping counts, and so does a
 * genuine skill overlap; being in the same category is recorded separately by
 * the caller and never enough on its own.
 */
export function matchCourseToRole(course: CoverageCourse, role: CoverageRole): CourseMatch | null {
  const direct = course.roles.find((entry) => entry.roleSlug === role.id);

  const roleSkills = [...role.coreSkills, ...(role.preferredSkills ?? [])];
  const matchedSkills = new Set<string>();
  for (const roleSkill of roleSkills) {
    if (course.skills.some((courseSkill) => matches(courseSkill.name, roleSkill.name))) {
      matchedSkills.add(roleSkill.name);
    }
  }

  const matchedTools = new Set<string>();
  for (const tool of role.tools ?? []) {
    if (course.skills.some((courseSkill) => matches(courseSkill.name, tool))) {
      matchedTools.add(tool);
    }
  }

  if (!direct && matchedSkills.size === 0 && matchedTools.size === 0) return null;

  return {
    course,
    direct: Boolean(direct),
    matchedSkills: [...matchedSkills],
    matchedTools: [...matchedTools],
  };
}

function dimension(covered: boolean, reason: string, evidence: string[]): DimensionResult {
  return { covered, reason, evidence: evidence.slice(0, 6) };
}

/** Assesses one role against the whole catalogue. */
export function assessRoleCoverage(role: CoverageRole, courses: CoverageCourse[]): RoleCoverage {
  const matches: CourseMatch[] = [];
  for (const course of courses) {
    const match = matchCourseToRole(course, role);
    if (!match) continue;
    // A skill-word overlap outside the role's discipline is not evidence that
    // the role's learning path is covered. Direct role mappings are curated
    // and may intentionally cross categories.
    if (!match.direct && !categoryServesDomain(course.category, role.domainId)) continue;
    matches.push(match);
  }

  const direct = matches.filter((match) => match.direct);
  const relevantCourseIds = matches.map((match) => match.course.id);
  const matchedSkills = new Set(matches.flatMap((match) => match.matchedSkills));

  const required = role.coreSkills;
  const matchedRequiredSkills = required.filter((skill) => matchedSkills.has(skill.name)).map((skill) => skill.name);
  const missingRequiredSkills = required.filter((skill) => !matchedSkills.has(skill.name)).map((skill) => skill.name);
  const matchedPreferredSkills = (role.preferredSkills ?? [])
    .filter((skill) => matchedSkills.has(skill.name))
    .map((skill) => skill.name);

  const coreCoverage = required.length === 0 ? 0 : matchedRequiredSkills.length / required.length;

  const foundations = matches.filter(
    (match) => match.course.level === 'Beginner' || match.matchedSkills.some((name) => {
      const skill = required.find((candidate) => candidate.name === name);
      return (skill?.minLevel ?? 5) <= 2;
    })
  );

  const toolMatches = matches.filter(
    (match) =>
      match.matchedTools.length > 0 ||
      match.matchedSkills.some((name) => {
        const skill = [...required, ...(role.preferredSkills ?? [])].find((candidate) => candidate.name === name);
        return skill?.category === 'tools';
      })
  );

  const advanced = matches.filter(
    (match) =>
      match.course.level === 'Advanced' ||
      match.matchedSkills.some((name) => {
        const skill = (role.preferredSkills ?? []).find((candidate) => candidate.name === name);
        return (skill?.minLevel ?? 0) >= 4;
      }) ||
      (match.direct && (match.course.roles.find((entry) => entry.roleSlug === role.id)?.relevanceScore ?? 0) >= 85)
  );

  const practical = matches.filter(
    (match) =>
      (match.course.format === 'course' || match.course.format === 'tutorial') &&
      match.course.durationHours !== null &&
      match.course.durationHours <= PRACTICAL_MAX_HOURS
  );

  const roleSpecific = matches.filter(
    (match) =>
      (match.direct &&
        (match.course.roles.find((entry) => entry.roleSlug === role.id)?.relevanceScore ?? 0) >=
          ROLE_SPECIFIC_MIN_RELEVANCE) ||
      match.matchedSkills.length >= CORE_MIN_SKILLS
  );

  const inDomain = matches.filter((match) =>
    categoryServesDomain(match.course.category, role.domainId)
  );

  const dimensions: Record<CoverageDimension, DimensionResult> = {
    foundations: dimension(
      foundations.length >= FOUNDATION_MIN_COURSES,
      foundations.length >= FOUNDATION_MIN_COURSES
        ? `${foundations.length} beginner or entry-level courses`
        : `Only ${foundations.length} beginner or entry-level course${foundations.length === 1 ? '' : 's'}`,
      foundations.map((match) => match.course.title)
    ),
    core: dimension(
      matchedRequiredSkills.length >= CORE_MIN_SKILLS && coreCoverage >= CORE_MIN_RATIO,
      `${matchedRequiredSkills.length}/${required.length} required skills (${Math.round(
        coreCoverage * 100
      )}%)`,
      matchedRequiredSkills
    ),
    tools: dimension(
      toolMatches.length > 0 && inDomain.length > 0,
      toolMatches.length > 0
        ? `${toolMatches.length} course${toolMatches.length === 1 ? '' : 's'} teach a role tool`
        : 'No course teaches a tool the role uses',
      toolMatches.map((match) => match.course.title)
    ),
    advanced: dimension(
      advanced.length > 0,
      advanced.length > 0
        ? `${advanced.length} advanced or senior-level course${advanced.length === 1 ? '' : 's'}`
        : 'No advanced or senior-level course',
      advanced.map((match) => match.course.title)
    ),
    practical: dimension(
      practical.length > 0,
      practical.length > 0
        ? `${practical.length} applied course${practical.length === 1 ? '' : 's'} of ${PRACTICAL_MAX_HOURS} hours or less`
        : 'No applied course that fits a month',
      practical.map((match) => match.course.title)
    ),
    roleSpecific: dimension(
      roleSpecific.length > 0,
      roleSpecific.length > 0
        ? `${roleSpecific.length} course${roleSpecific.length === 1 ? '' : 's'} tied to this role`
        : 'Only broad domain material; no role-specific course',
      roleSpecific.map((match) => match.course.title)
    ),
  };

  const coveredDimensions = COVERAGE_DIMENSIONS.filter((key) => dimensions[key].covered).length;

  return {
    roleId: role.id,
    roleTitle: role.title,
    domainId: role.domainId,
    relevantCourseIds,
    directCourseIds: direct.map((match) => match.course.id),
    matchedRequiredSkills,
    missingRequiredSkills,
    matchedPreferredSkills,
    coreCoverage,
    dimensions,
    coveredDimensions,
    complete: coveredDimensions === COVERAGE_DIMENSIONS.length,
  };
}

/** Audits every role and rolls the results up by domain. */
export function auditLearningCoverage(
  roles: CoverageRole[],
  courses: CoverageCourse[]
): CoverageAudit {
  const roleCoverage = roles.map((role) => assessRoleCoverage(role, courses));

  const domainIds = [...new Set(roles.map((role) => role.domainId))];
  const domains: DomainCoverage[] = domainIds.map((domainId) => {
    const rows = roleCoverage.filter((row) => row.domainId === domainId);
    const failing = new Set<CoverageDimension>();
    for (const row of rows) {
      for (const key of COVERAGE_DIMENSIONS) {
        if (!row.dimensions[key].covered) failing.add(key);
      }
    }
    return {
      domainId,
      roleCount: rows.length,
      completeRoles: rows.filter((row) => row.complete).length,
      averageDimensions:
        rows.reduce((sum, row) => sum + row.coveredDimensions, 0) / Math.max(1, rows.length),
      failingDimensions: [...failing],
    };
  });

  const skillNames = new Set<string>();
  for (const role of roles) {
    for (const skill of [...role.coreSkills, ...(role.preferredSkills ?? [])]) {
      skillNames.add(skill.name);
    }
  }
  const missingSkills = [...skillNames].filter(
    (skill) => !courses.some((course) => course.skills.some((entry) => matches(entry.name, skill)))
  );

  return {
    roles: roleCoverage,
    domains,
    completeRoles: roleCoverage.filter((row) => row.complete).length,
    totalRoles: roles.length,
    missingSkills,
  };
}
