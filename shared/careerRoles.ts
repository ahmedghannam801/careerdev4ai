/**
 * The career role catalogue.
 *
 * This is the single source of truth for the roles CareerPilot supports. It is
 * imported by the React frontend (`src/`) and by the API (`server/`, `app.ts`)
 * so that both sides resolve the same role, the same skills and the same
 * learning-resource mapping.
 *
 * Roles are authored in the compact `RoleDefinition` shape and expanded by
 * `buildRole` into the full `TargetRole` contract, so no role has to repeat
 * boilerplate.
 */

import { CAREER_DOMAINS, getCareerDomainLabel, type CareerDomainId } from './careerDomains.ts';
import type { RoleDefinition, RoleSkill, TargetRole } from './careerTypes.ts';
import { TECHNOLOGY_ROLES } from './roles/technology.ts';
import { CREATIVE_ROLES } from './roles/creative.ts';
import { BUSINESS_ROLES } from './roles/business.ts';
import { PEOPLE_ROLES } from './roles/people.ts';

const ROLE_DEFINITIONS: RoleDefinition[] = [
  ...TECHNOLOGY_ROLES,
  ...CREATIVE_ROLES,
  ...BUSINESS_ROLES,
  ...PEOPLE_ROLES,
];

/**
 * The compact role definitions, keyed by their catalogue slug.
 *
 * The roadmap generator and the volunteer matcher need the raw definition
 * (the named entry / intermediate / advanced paths and the role's own project
 * ideas), which the expanded `TargetRole` contract does not carry.
 */
export const ROLE_DEFINITION_LIST: RoleDefinition[] = ROLE_DEFINITIONS;

/** Looks up a role definition by its catalogue slug. */
export function findRoleDefinitionById(
  id: string | null | undefined
): RoleDefinition | undefined {
  if (!id) return undefined;
  const key = id.trim().toLowerCase();
  return ROLE_DEFINITIONS.find((role) => role.id.toLowerCase() === key);
}

/**
 * Looks up a role definition by slug or by title.
 *
 * Profiles store the role title, so the title lookup is the path that
 * actually resolves for existing users.
 */
export function resolveRoleDefinition(
  reference: string | null | undefined
): RoleDefinition | undefined {
  if (!reference) return undefined;
  const byId = findRoleDefinitionById(reference);
  if (byId) return byId;
  const byTitle = findRoleByTitle(reference);
  if (!byTitle) return undefined;
  return findRoleDefinitionById(byTitle.id);
}

/** Default proficiency expectations used when a role does not define its own. */
const DEFAULT_PROFICIENCY: TargetRole['proficiencyExpectations'] = [
  { level: 'Entry', expectation: 'Supports delivery with supervision and learns the domain quickly.' },
  { level: 'Mid', expectation: 'Works independently across the full range of the role.' },
  { level: 'Senior', expectation: 'Owns outcomes, mentors others and improves the way the work is done.' },
  { level: 'Lead', expectation: 'Sets direction for a team and holds the standard.' },
];

/**
 * Expands a compact role definition into the full `TargetRole` shape.
 *
 * The `category` field keeps its original meaning — the human-readable group
 * the role belongs to — so existing UI that renders `role.category` keeps
 * working, but it is now derived from the domain taxonomy instead of being
 * typed in per role.
 */
export function buildRole(definition: RoleDefinition): TargetRole {
  const requiredSkills: RoleSkill[] = definition.coreSkills.map((skill) => ({ ...skill }));
  const preferredSkills: RoleSkill[] = (definition.preferredSkills ?? []).map((skill) => ({ ...skill }));

  return {
    id: definition.id,
    title: definition.title,
    category: getCareerDomainLabel(definition.domainId),
    level: definition.level,
    overview: definition.summary,
    responsibilities: [...definition.responsibilities],
    requiredSkills,
    preferredSkills,
    tools: [...(definition.tools ?? [])],
    experienceExpectation: definition.experienceExpectation,
    salaryRange: definition.salaryRange ?? 'Varies by employer, location and experience',
    typicalProjects: [...(definition.projects ?? [])],
    certifications: [...(definition.certifications ?? [])],
    interviewTopics: [...definition.interviewTopics],
    careerProgression: [...definition.progression],
    relatedRoles: [...(definition.relatedRoles ?? [])],

    domainId: definition.domainId,
    aliases: [...(definition.aliases ?? [])],
    entryPath: [...(definition.entryPath ?? [])],
    intermediatePath: [...(definition.intermediatePath ?? [])],
    advancedPath: [...(definition.advancedPath ?? [])],
    proficiencyExpectations: (definition.proficiencyExpectations ?? DEFAULT_PROFICIENCY).map((entry) => ({
      ...entry,
    })),
    evidenceSuggestions: [...(definition.evidence ?? [])],
    learningTopics: [...(definition.learningTopics ?? [])],
  };
}

/** Every role in the catalogue, in domain order. */
export const CAREER_ROLES: TargetRole[] = ROLE_DEFINITIONS.map(buildRole);

/**
 * The name the rest of the application has always imported.
 *
 * Kept as an alias of `CAREER_ROLES` so existing imports keep working
 * unchanged.
 */
export const TARGET_ROLES: TargetRole[] = CAREER_ROLES;

const ROLE_BY_ID = new Map<string, TargetRole>(CAREER_ROLES.map((role) => [role.id, role]));

export function findRoleById(id: string | null | undefined): TargetRole | undefined {
  if (!id) return undefined;
  return ROLE_BY_ID.get(id);
}

/** Finds a role by exact title (case-insensitive). */
export function findRoleByTitle(title: string | null | undefined): TargetRole | undefined {
  if (!title) return undefined;
  const needle = title.trim().toLowerCase();
  return CAREER_ROLES.find((role) => role.title.toLowerCase() === needle);
}

/**
 * Resolves a persisted role reference.
 *
 * The profile stores the role title as free text (older records) while newer
 * code stores the role id, so both are accepted.
 */
export function resolveRole(reference: string | null | undefined): TargetRole | undefined {
  if (!reference) return undefined;
  return findRoleById(reference) ?? findRoleByTitle(reference);
}

/** All roles belonging to a domain. */
export function getRolesByDomain(domainId: CareerDomainId | string): TargetRole[] {
  return CAREER_ROLES.filter((role) => role.domainId === domainId);
}

/**
 * Every skill named anywhere in the catalogue, de-duplicated.
 *
 * The learning recommender matches on these names, so this is the vocabulary
 * that course `skill_name` values are expected to use.
 */
export const CATALOG_SKILL_NAMES: string[] = Array.from(
  new Set(
    CAREER_ROLES.flatMap((role) => [
      ...role.requiredSkills.map((skill) => skill.name),
      ...role.preferredSkills.map((skill) => skill.name),
    ]),
  ),
);

export { CAREER_DOMAINS };
