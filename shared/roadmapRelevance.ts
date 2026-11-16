/**
 * Track-aware relevance scoring for roadmap content.
 *
 * The roadmap used to be able to attach a course, project or skill to a user
 * whose career had nothing to do with it. The cause was that "is this
 * relevant?" was answered with a keyword comparison against the resource
 * title: a project called "Data Warehouse Migration" looked relevant to a
 * "Data Modelling" gap because both contained the word "data".
 *
 * This module is the roadmap's layer on top of the existing catalogue gate.
 * It does not introduce a second recommendation engine:
 *
 *   - eligibility (may this content appear in this role's plan at all) is
 *     decided by `matchCourseToRole` in `learningCoverage.ts`, the same gate
 *     the Learning Hub uses, plus the domain check that gate is paired with;
 *   - this module decides *attachment* (does it address this particular gap),
 *     ranks the survivors, and produces the plain-language reason the
 *     interface shows.
 *
 * Two rules are absolute:
 *
 *   1. Content that is not eligible for the user's role is rejected. Its
 *      title may match perfectly and it still does not enter the plan. This
 *      is the "generic keyword matching must not override role compatibility"
 *      rule.
 *   2. Content with no skill evidence for the gap is rejected. An empty
 *      result is the correct answer; padding the plan with near-misses is
 *      not.
 *
 * Everything here is pure, so the server and the browser score identically and
 * the rules can be tested without a database.
 */

import { categoryServesDomain } from './learningCategories.ts';
import {
  matchCourseToRole,
  type CoverageCourse,
  type CoverageRole,
} from './learningCoverage.ts';
import { skillMatchConfidence } from './skillMatching.ts';

/** Why a piece of content is in the plan. */
export type RelevanceReasonKind = 'role' | 'skill' | 'level' | 'stage' | 'quality';

export interface RelevanceReason {
  kind: RelevanceReasonKind;
  /** Short, human-readable statement of the reason. */
  label: string;
  /** The concrete evidence behind the label, when there is one. */
  detail?: string;
}

/** Why a piece of content was kept out of the plan. */
export type RelevanceRejection =
  | 'role-mismatch'
  | 'no-skill-evidence'
  | 'weak-skill-match'
  | 'no-match';

export interface RelevanceVerdict {
  /** Higher is more relevant. Only meaningful when `eligible` is true. */
  score: number;
  reasons: RelevanceReason[];
  /** False when the content must not enter the roadmap. */
  eligible: boolean;
  /** Present when `eligible` is false. */
  rejection?: RelevanceRejection;
}

/** The context a candidate is judged against. */
export interface RoadmapRelevanceContext {
  /** The target role slug, matching `course_roles.role_slug`. */
  roleId: string;
  /** The role's display title, used in the explanation text. */
  roleTitle: string;
  /** The career domain the role belongs to. */
  domainId: string;
  /** The numeric level the user is aiming at (1..5). */
  targetLevel: number;
  /** The learning stage of the task being filled (0-based). */
  stage: number;
}

/** A role mapping recorded against a catalogue entry. */
export interface RoleMapping {
  slug: string;
  score: number;
}

/**
 * The evidence a candidate carries, gathered from the catalogue.
 *
 * These fields mirror what the database already records: `course_skills`,
 * `course_roles`, `projects.role` and `project_skills`.
 */
export interface RelevanceCandidate {
  /** The skills the entry actually teaches or demonstrates. */
  skillNames?: string[];
  /** The roles the entry is mapped to, when the catalogue records them. */
  roleSlugs?: RoleMapping[];
  /** The catalogue category, used for the domain check. */
  category?: string | null;
  /** The entry's own difficulty: 'Beginner' | 'Intermediate' | 'Advanced'. */
  level?: string | null;
  /** The entry's format, e.g. 'video' or 'article'. */
  format?: string | null;
  /** True when a human or a validation pass confirmed the source. */
  isVerified?: boolean;
  /** Curated provider priority: 1 (priority), 2 (reputable), 3 (other). */
  providerTier?: number | null;
  /** Provider-published rating, when one exists. Never invented. */
  rating?: number | null;
  /** The role this entry belongs to, for a user's own work. */
  roleSlug?: string | null;
  /** 'role' for a catalogue project, 'user' for the user's own work. */
  source?: 'role' | 'user';
}

/**
 * The lowest skill confidence that is still accepted as evidence.
 *
 * 1 is an exact canonical match, 0.8 is a full token subset. 0.55 means the
 * two names merely read alike, which is the same failure mode as a keyword
 * match, so it is not enough.
 */
export const MIN_SKILL_CONFIDENCE = 0.8;

/** Level numbers behind the catalogue's difficulty labels. */
const LEVEL_NUMBERS: Record<string, number> = {
  beginner: 1,
  intermediate: 3,
  advanced: 5,
  foundational: 1,
  expert: 5,
};

function levelNumber(level: string | null | undefined): number | null {
  if (!level) return null;
  return LEVEL_NUMBERS[level.trim().toLowerCase()] ?? null;
}

/** The best confidence that the candidate teaches the wanted skill. */
export function bestSkillConfidence(
  candidate: RelevanceCandidate,
  wantedSkill: string
): number {
  const names = candidate.skillNames ?? [];
  let best = 0;
  for (const name of names) {
    const confidence = skillMatchConfidence(name, wantedSkill);
    if (confidence > best) best = confidence;
  }
  return best;
}

/** Adapts a roadmap candidate to the shape the shared coverage gate expects. */
export function toCoverageCourse(candidate: RelevanceCandidate): CoverageCourse {
  return {
    id: '',
    title: '',
    category: candidate.category ?? '',
    level: candidate.level ?? '',
    format: candidate.format ?? '',
    durationHours: null,
    skills: (candidate.skillNames ?? []).map((name) => ({ name, importance: 1 })),
    roles: (candidate.roleSlugs ?? []).map((entry) => ({
      roleSlug: entry.slug,
      relevanceScore: entry.score,
    })),
  };
}

/**
 * May this content appear in this role's plan at all?
 *
 * The answer comes from the shared catalogue gate, so the roadmap and the
 * Learning Hub agree on what "relevant to this role" means. A course that is
 * mapped to the role directly passes; a course that only shares a skill with
 * the role has to sit in the role's own domain to count.
 */
export function isEligibleForRole(
  candidate: RelevanceCandidate,
  role: CoverageRole
): boolean {
  const match = matchCourseToRole(toCoverageCourse(candidate), role);
  if (!match) return false;
  if (match.direct) return true;

  // The domain check only rejects when the catalogue actually recorded a
  // category. A missing category is missing data, not evidence that the
  // entry belongs to another domain, so the skill overlap the shared gate
  // found is allowed to stand on its own.
  const category = (candidate.category ?? '').trim();
  if (!category) return true;

  return categoryServesDomain(category, role.domainId);
}

/**
 * How the candidate stands against the user's target role.
 *
 * `hasMapping` distinguishes "this entry is mapped to other roles" from "this
 * entry carries no role mapping at all".
 */
export function roleStanding(
  candidate: RelevanceCandidate,
  context: RoadmapRelevanceContext
): { matched: boolean; hasMapping: boolean; score: number } {
  const mappings = candidate.roleSlugs ?? [];
  if (mappings.length === 0) {
    return { matched: false, hasMapping: false, score: 0 };
  }
  let best = 0;
  for (const mapping of mappings) {
    if (mapping.slug !== context.roleId) continue;
    if (mapping.score > best) best = mapping.score;
  }
  return { matched: best > 0, hasMapping: true, score: best };
}

/**
 * The quality of the source itself.
 *
 * An unverified link is not a recommendation. Verified, curated sources score
 * higher, and a provider-published rating only counts when it exists.
 */
function qualityScore(candidate: RelevanceCandidate): { score: number; reason?: RelevanceReason } {
  let score = 0;
  if (candidate.isVerified) score += 8;
  if (candidate.providerTier === 1) score += 6;
  else if (candidate.providerTier === 2) score += 3;
  if (typeof candidate.rating === 'number' && candidate.rating > 0) {
    score += Math.min(4, Math.round(candidate.rating));
  }
  if (score === 0) return { score: 0 };
  return {
    score,
    reason: {
      kind: 'quality',
      label: candidate.isVerified ? 'Verified source' : 'Curated provider',
    },
  };
}

/** How well the entry's difficulty suits the level the user is aiming at. */
function levelStanding(
  candidate: RelevanceCandidate,
  context: RoadmapRelevanceContext
): { score: number; reason?: RelevanceReason } {
  const level = levelNumber(candidate.level);
  if (level === null) return { score: 0 };
  const distance = Math.abs(level - context.targetLevel);
  if (distance <= 1) {
    return {
      score: 6,
      reason: { kind: 'level', label: 'Difficulty matches your target level' },
    };
  }
  if (distance === 2) return { score: 2 };
  // A resource two levels away from the target is a poor fit, but it is not
  // grounds for rejection on its own: the skill evidence decides that.
  return { score: 0 };
}

/**
 * Judges a learning resource against a gap and the user's career context.
 *
 * Rejection order matters. Role compatibility is checked first, so a
 * perfectly skill-matched course for a different career never reaches the
 * user, and the skill check never has to argue with it.
 */
export function evaluateResource(
  candidate: RelevanceCandidate,
  wantedSkill: string,
  context: RoadmapRelevanceContext
): RelevanceVerdict {
  const standing = roleStanding(candidate, context);

  // A resource that is mapped to roles, but not to this one, is out. It does
  // not matter how well its skills line up with the gap.
  if (standing.hasMapping && !standing.matched) {
    return { score: 0, reasons: [], eligible: false, rejection: 'role-mismatch' };
  }

  const confidence = bestSkillConfidence(candidate, wantedSkill);
  if (confidence === 0) {
    return { score: 0, reasons: [], eligible: false, rejection: 'no-skill-evidence' };
  }
  if (confidence < MIN_SKILL_CONFIDENCE) {
    return { score: 0, reasons: [], eligible: false, rejection: 'weak-skill-match' };
  }

  // An entry with no role mapping is weaker evidence than one mapped to this
  // role: the shared gate has already established that its skills overlap the
  // role's own, so the match itself has to be exact rather than a close
  // reading.
  //
  // A missing verification flag is not a disqualification. The flag records
  // whether a link was checked, and an unrecorded flag means "not recorded",
  // not "known to be bad".
  if (!standing.hasMapping && confidence < 1) {
    return { score: 0, reasons: [], eligible: false, rejection: 'weak-skill-match' };
  }

  const reasons: RelevanceReason[] = [];
  let score = confidence >= 1 ? 100 : 80;

  if (standing.matched) {
    reasons.push({
      kind: 'role',
      label: `Mapped to your target role, ${context.roleTitle}`,
      detail: context.roleId,
    });
    score += Math.round(standing.score * 4);
  } else {
    reasons.push({
      kind: 'role',
      label: 'No role mapping recorded, so it is here on the skill alone',
    });
  }

  reasons.push({
    kind: 'skill',
    label: `Teaches ${wantedSkill}`,
    detail: candidate.skillNames?.join(', '),
  });

  const level = levelStanding(candidate, context);
  if (level.reason) reasons.push(level.reason);
  score += level.score;

  const quality = qualityScore(candidate);
  if (quality.reason) reasons.push(quality.reason);
  score += quality.score;

  reasons.push({
    kind: 'stage',
    label: `Selected for stage ${context.stage + 1} of your plan`,
  });

  return { score, reasons, eligible: true };
}

/**
 * Judges a project against a gap and the user's career context.
 *
 * A project has to carry skill evidence like any other piece of content. The
 * old fallback that accepted a project whose *title* merely shared a word with
 * the gap is gone: it is the single reason unrelated work appeared in plans.
 */
export function evaluateProject(
  candidate: RelevanceCandidate,
  wantedSkill: string,
  context: RoadmapRelevanceContext
): RelevanceVerdict {
  // A user's own work that was carried over from a previous role is not
  // relevant to this one, even when the skills line up.
  if (candidate.roleSlug && candidate.roleSlug !== context.roleId) {
    return { score: 0, reasons: [], eligible: false, rejection: 'role-mismatch' };
  }

  const confidence = bestSkillConfidence(candidate, wantedSkill);
  if (confidence === 0) {
    return { score: 0, reasons: [], eligible: false, rejection: 'no-skill-evidence' };
  }
  if (confidence < MIN_SKILL_CONFIDENCE) {
    return { score: 0, reasons: [], eligible: false, rejection: 'weak-skill-match' };
  }

  const reasons: RelevanceReason[] = [];
  let score = confidence >= 1 ? 100 : 80;

  reasons.push({
    kind: 'skill',
    label: `Demonstrates ${wantedSkill}`,
    detail: candidate.skillNames?.join(', '),
  });

  if (candidate.roleSlug === context.roleId) {
    reasons.push({
      kind: 'role',
      label: `Built for ${context.roleTitle}`,
      detail: context.roleId,
    });
    score += 20;
  }

  // Work the user already has is more actionable than a suggestion.
  if (candidate.source === 'user') {
    reasons.push({ kind: 'quality', label: 'From your own project work' });
    score += 15;
  }

  return { score, reasons, eligible: true };
}

/**
 * Judges a project against the role's own topics, for the steps that come from
 * the role catalogue rather than from a skill gap.
 *
 * These steps have no gap to close, so the evidence is the role's own learning
 * topics and core skills, matched against the project's skill mapping. Titles
 * are not evidence here either.
 */
export function evaluateProjectForRole(
  candidate: RelevanceCandidate,
  roleSkills: string[],
  context: RoadmapRelevanceContext
): RelevanceVerdict {
  if (candidate.roleSlug && candidate.roleSlug !== context.roleId) {
    return { score: 0, reasons: [], eligible: false, rejection: 'role-mismatch' };
  }

  const names = candidate.skillNames ?? [];
  if (names.length === 0) {
    return { score: 0, reasons: [], eligible: false, rejection: 'no-skill-evidence' };
  }

  let best = 0;
  let bestSkill = '';
  for (const name of names) {
    for (const roleSkill of roleSkills) {
      const confidence = skillMatchConfidence(name, roleSkill);
      if (confidence > best) {
        best = confidence;
        bestSkill = roleSkill;
      }
    }
  }

  if (best < MIN_SKILL_CONFIDENCE) {
    return { score: 0, reasons: [], eligible: false, rejection: 'weak-skill-match' };
  }

  const reasons: RelevanceReason[] = [
    {
      kind: 'skill',
      label: `Matches ${context.roleTitle} core skills`,
      detail: bestSkill,
    },
  ];

  let score = best >= 1 ? 100 : 80;
  if (candidate.roleSlug === context.roleId) {
    reasons.push({
      kind: 'role',
      label: `Built for ${context.roleTitle}`,
      detail: context.roleId,
    });
    score += 20;
  }
  if (candidate.source === 'user') {
    reasons.push({ kind: 'quality', label: 'From your own project work' });
    score += 15;
  }

  return { score, reasons, eligible: true };
}

/**
 * Renders the reasons as one sentence the interface can show.
 *
 * "Why this was recommended" has to be readable, and it has to be honest:
 * it is built only from reasons that were actually recorded.
 */
export function explainRelevance(reasons: RelevanceReason[]): string {
  if (reasons.length === 0) return 'Recommended for your target role.';
  return reasons
    .map((reason) => (reason.detail ? `${reason.label} (${reason.detail})` : reason.label))
    .join(' · ');
}
