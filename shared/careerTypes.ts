/**
 * Canonical career types shared by the React frontend and the API.
 *
 * These types used to live in `src/types/career.ts` and were imported by the
 * server through the frontend's data file, which inverted the dependency
 * direction. They now live here so both sides import the same declarations.
 *
 * `src/types/career.ts` re-exports everything below, so existing frontend
 * imports keep working unchanged.
 */

import type { CareerDomainId } from './careerDomains.ts';

export type SkillCategory =
  | 'technical'
  | 'analytical'
  | 'business'
  | 'communication'
  | 'leadership'
  | 'tools'
  | 'domain'
  | 'soft_skills';

export interface RoleSkill {
  name: string;
  category: SkillCategory;
  minLevel: number;
}

/**
 * A career role in the catalogue.
 *
 * The first block of fields is the original contract (unchanged, so every
 * existing consumer keeps working). The second block is the richer role
 * intelligence added for multi-domain support: which domain the role belongs
 * to, the level-by-level progression, how proficiency is judged, and what
 * evidence a candidate can present.
 */
export interface TargetRole {
  id: string;
  title: string;
  /** Domain label, e.g. "Finance & Accounting". */
  category: string;
  level: 'Entry' | 'Entry-Mid' | 'Mid' | 'Senior' | 'Lead';
  overview: string;
  responsibilities: string[];
  requiredSkills: RoleSkill[];
  preferredSkills: RoleSkill[];
  tools: string[];
  experienceExpectation: string;
  salaryRange: string;
  typicalProjects: string[];
  certifications: string[];
  interviewTopics: string[];
  careerProgression: string[];
  relatedRoles: string[];

  // ---------------------------------------------------------------------
  // Multi-domain additions
  // ---------------------------------------------------------------------

  /** Owning domain. Persisted — treat the slug as immutable. */
  domainId: CareerDomainId;
  /** Alternative titles and abbreviations used for search. */
  aliases: string[];
  /** Named entry path for someone starting out in this role. */
  entryPath: string[];
  /** Named progression path once established in the role. */
  intermediatePath: string[];
  /** Named path to senior / leadership scope in this role. */
  advancedPath: string[];
  /** How proficiency is judged at each level, keyed by level name. */
  proficiencyExpectations: { level: string; expectation: string }[];
  /** Concrete artefacts a candidate can show as proof of capability. */
  evidenceSuggestions: string[];
  /** Topic keywords used to match this role to learning resources. */
  learningTopics: string[];
}

/**
 * Compact authoring format for the catalogue.
 *
 * `shared/careerRoles.ts` uses this so a role can be described once and
 * expanded into the full `TargetRole` shape by `buildRole`, instead of every
 * role repeating the same boilerplate.
 */
export interface RoleDefinition {
  id: string;
  title: string;
  domainId: CareerDomainId;
  level: TargetRole['level'];
  /** One-paragraph description of the role. */
  summary: string;
  /** Alternative names, abbreviations and colloquial terms. */
  aliases?: string[];
  responsibilities: string[];
  coreSkills: RoleSkill[];
  preferredSkills?: RoleSkill[];
  tools?: string[];
  experienceExpectation: string;
  salaryRange?: string;
  /** Portfolio-scale work a candidate can point to. */
  projects?: string[];
  /** Artefacts that evidence the role's skills. */
  evidence?: string[];
  certifications?: string[];
  interviewTopics: string[];
  /** Ordered progression through the role's career ladder. */
  progression: string[];
  relatedRoles?: string[];
  entryPath?: string[];
  intermediatePath?: string[];
  advancedPath?: string[];
  proficiencyExpectations?: TargetRole['proficiencyExpectations'];
  learningTopics?: string[];
}
