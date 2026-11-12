/**
 * Skill gap engine.
 *
 * This is the single source of truth for "what does this user still need to
 * learn for the role they picked". Before this module the same question was
 * answered in three different places (the AI career context, the learning
 * recommendation context and the roadmap builder in the React tree) with three
 * slightly different rules, which is why the app could tell a user one thing
 * in the skills centre and another thing in the learning hub.
 *
 * The engine is pure: it takes a role, the user's rated skills, and returns a
 * ranked, explainable gap list. It performs no I/O, so it runs identically on
 * the server and in the browser and can be unit tested without a database.
 */

import type { RoleSkill, SkillCategory } from './careerTypes.ts';

/** How urgent it is to close a gap. */
export type SkillGapPriority = 'critical' | 'high' | 'medium' | 'low' | 'sufficient';

export const SKILL_GAP_PRIORITIES: SkillGapPriority[] = [
  'critical',
  'high',
  'medium',
  'low',
  'sufficient',
];

/** Numeric weight per priority, used for sorting and for the readiness score. */
const PRIORITY_RANK: Record<SkillGapPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  sufficient: 0,
};

/** The highest proficiency level the platform records (1..5). */
export const MAX_PROFICIENCY = 5;

/** A skill the user has rated, with the level they gave it (1..5). */
export interface RatedSkill {
  name: string;
  level: number;
}

/** The role-relative skill requirements this engine works against. */
export interface RoleSkillRequirements {
  requiredSkills: RoleSkill[];
  preferredSkills?: RoleSkill[];
}

export interface SkillGap {
  /** Canonical skill name, exactly as the role catalogue writes it. */
  name: string;
  category: SkillCategory;
  /** Level the role expects. */
  requiredLevel: number;
  /** Level the user currently has (0 when the skill was never rated). */
  currentLevel: number;
  /** How many levels are still missing. Never negative. */
  gap: number;
  /** True when the skill is a core requirement rather than a preference. */
  required: boolean;
  /** Urgency bucket. */
  priority: SkillGapPriority;
  /** Sortable urgency score. Higher means "address this first". */
  weight: number;
  /**
   * True when a real record — a project, a finished course, a verified piece
   * of evidence or a certificate — shows the user has this skill.
   *
   * A skill that is only claimed is not verified. The platform reports the
   * difference rather than hiding it, so a candidate can see which of their
   * skills are backed by proof.
   */
  verified: boolean;
  /**
   * The level the user's own records support.
   *
   * It is the level the gap was measured against, and it can be higher than
   * the level the user rated the skill at: doing the work counts even when
   * the rating was never updated.
   */
  verifiedLevel: number;
}

export interface SkillGapSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  sufficient: number;
  /** Total number of required + preferred skills considered. */
  total: number;
  /** Number of skills that still need work (gap > 0), of any kind. */
  open: number;
  /** Open gaps on the role's core requirements. */
  openRequired: number;
  /** Open gaps on the role's preferred, stretch requirements. */
  openPreferred: number;
  /**
   * Percentage of the role's core requirements the user already meets,
   * 0..100. This is the "readiness" figure shown across the product.
   */
  readinessPct: number;
}

/**
 * Normalises a skill name so that "SQL & Database Design", "sql database
 * design" and "SQL Database Design" all match the same entry.
 */
export function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9+#]/g, '');
}

/** Human label for a 1..5 proficiency level. */
export function levelLabel(level: number): string {
  if (level <= 1) return 'Foundation';
  if (level === 2) return 'Basic';
  if (level === 3) return 'Working';
  if (level === 4) return 'Proficient';
  return 'Advanced';
}

/** Difficulty bucket derived from the level a role expects. */
export function difficultyForLevel(level: number): 'foundational' | 'intermediate' | 'advanced' {
  if (level <= 2) return 'foundational';
  if (level === 3) return 'intermediate';
  return 'advanced';
}

/**
 * Converts the two shapes the app uses for a role into the one this engine
 * needs. `TargetRole` exposes `requiredSkills`, the catalogue
 * `RoleDefinition` exposes `coreSkills`.
 */
export function toRoleSkillRequirements(role: {
  requiredSkills?: RoleSkill[];
  coreSkills?: RoleSkill[];
  preferredSkills?: RoleSkill[];
}): RoleSkillRequirements {
  return {
    requiredSkills: role.requiredSkills ?? role.coreSkills ?? [],
    preferredSkills: role.preferredSkills ?? [],
  };
}

/**
 * Decides how urgent a single gap is.
 *
 * Core requirements are weighted above preferences because a role will not
 * hire on a nice-to-have while it will hire on a core skill. The bands are
 * deliberately coarse: three levels of missing proficiency on a core skill is
 * a blocker, one level is a close finish.
 */
export function priorityForGap(
  gap: number,
  required: boolean,
): SkillGapPriority {
  if (gap <= 0) return 'sufficient';
  if (required) {
    if (gap >= 3) return 'critical';
    if (gap === 2) return 'high';
    return 'medium';
  }
  if (gap >= 2) return 'medium';
  return 'low';
}

/**
 * Computes the full, ranked gap list for a role.
 *
 * A skill the user has not rated at all is treated as level 0, not level 1.
 * The old behaviour started unrated skills at 1, which quietly hid the
 * largest possible gap behind an optimistic default.
 */
/**
 * The extra signal the platform has about a skill.
 *
 * The key is the lower-cased skill name. The value is the level the user's
 * own records support.
 */
export type EvidenceSkillLevels = ReadonlyMap<string, number>;

/**
 * Computes the gap between what the role wants and what the user has.
 *
 * The user's own ratings are the baseline. The evidence the platform holds —
 * the projects they built, the courses they finished, the evidence they
 * filed, the certificates they earned — can raise that level, because doing
 * the work counts even when the rating was never updated. Evidence never
 * lowers a rating: the platform does not tell a candidate they are worse at
 * something than they said they were.
 *
 * The optional `evidenceLevels` argument is what the server passes when it
 * can read the user's records. Without it the engine behaves exactly as it
 * did before, so a caller that has no records to offer is not treated as
 * having records that show nothing.
 */
export function computeSkillGaps(
  requirements: RoleSkillRequirements,
  userSkills: RatedSkill[],
  evidenceLevels?: EvidenceSkillLevels,
): SkillGap[] {
  const levels = new Map<string, { name: string; level: number }>();
  for (const skill of userSkills) {
    const key = normalizeSkillName(skill.name);
    if (!key) continue;
    const level = clampLevel(skill.level);
    const existing = levels.get(key);
    // A skill can be recorded more than once (for example under two
    // catalogue entries). Keep the strongest rating so we never invent a gap
    // the user has already covered.
    if (!existing || level > existing.level) {
      levels.set(key, { name: skill.name, level });
    }
  }

  const gaps: SkillGap[] = [];

  const push = (skill: RoleSkill, required: boolean) => {
    const key = normalizeSkillName(skill.name);
    const rated = levels.get(key);
    const claimedLevel = rated?.level ?? 0;
    const evidenceLevel = evidenceLevels?.get(key) ?? 0;
    // The effective level is the stronger of what the user claimed and what
    // their records show.
    const currentLevel = Math.max(claimedLevel, evidenceLevel);
    const requiredLevel = clampLevel(skill.minLevel);
    const gap = Math.max(0, requiredLevel - currentLevel);
    const priority = priorityForGap(gap, required);
    gaps.push({
      name: skill.name,
      category: skill.category,
      requiredLevel,
      currentLevel,
      gap,
      required,
      priority,
      weight:
        PRIORITY_RANK[priority] * 10 +
        gap * 2 +
        (required ? 1 : 0),
      verified: evidenceLevel > 0,
      verifiedLevel: evidenceLevel > 0 ? evidenceLevel : claimedLevel,
    });
  };

  for (const skill of requirements.requiredSkills) push(skill, true);
  for (const skill of requirements.preferredSkills ?? []) push(skill, false);

  gaps.sort(
    (a, b) =>
      b.weight - a.weight ||
      b.gap - a.gap ||
      a.name.localeCompare(b.name),
  );

  return gaps;
}

/** Counts gaps by priority and computes the role readiness percentage. */
export function summarizeSkillGaps(
  gaps: SkillGap[],
  requirements?: RoleSkillRequirements,
): SkillGapSummary {
  const summary: SkillGapSummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    sufficient: 0,
    total: gaps.length,
    open: 0,
    openRequired: 0,
    openPreferred: 0,
    readinessPct: 0,
  };

  for (const gap of gaps) {
    summary[gap.priority] += 1;
    if (gap.gap > 0) {
      summary.open += 1;
      if (gap.required) summary.openRequired += 1;
      else summary.openPreferred += 1;
    }
  }

  const core: RoleSkill[] =
    requirements?.requiredSkills ??
    gaps.filter((gap) => gap.required).map((gap) => ({
      name: gap.name,
      category: gap.category,
      minLevel: gap.requiredLevel,
    }));
  if (core.length > 0) {
    let met = 0;
    let possible = 0;
    for (const skill of core) {
      const required = clampLevel(skill.minLevel);
      const key = normalizeSkillName(skill.name);
      const gapEntry = gaps.find((g) => normalizeSkillName(g.name) === key);
      const current = gapEntry?.currentLevel ?? 0;
      met += Math.min(current, required);
      possible += required;
    }
    summary.readinessPct = possible > 0 ? Math.round((met / possible) * 100) : 0;
  }

  return summary;
}

/** Only the gaps that still need work, in priority order. */
export function openSkillGaps(gaps: SkillGap[]): SkillGap[] {
  return gaps.filter((gap) => gap.gap > 0);
}

/** The skills the user already meets or exceeds for the role. */
export function coveredSkillGaps(gaps: SkillGap[]): SkillGap[] {
  return gaps.filter((gap) => gap.gap === 0);
}

/** Clamps a proficiency into the 1..5 band the database stores. */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  const rounded = Math.round(level);
  if (rounded < 0) return 0;
  if (rounded > MAX_PROFICIENCY) return MAX_PROFICIENCY;
  return rounded;
}

/**
 * Why a gap has the priority it has, as separate pieces.
 *
 * `describeGap` builds a sentence out of these. The pieces are exposed
 * separately so the interface can build the same sentence in the user's own
 * language: a reason that is only ever available in English is a reason the
 * Arabic interface cannot show.
 */
export interface GapExplanation {
  /** The skill the gap is about. */
  name: string;
  /** The level the user is at now. */
  currentLevel: number;
  /** The level the role expects. */
  requiredLevel: number;
  /** True when the user already meets the required level. */
  met: boolean;
  /** How urgent the gap is, as a key the interface can translate. */
  urgency: 'blocks_the_role' | 'major_requirement' | 'worth_closing_next' | 'nice_to_have';
}

/**
 * The structured reason a gap has its priority.
 *
 * Kept here so the same explanation appears in the skills centre, the roadmap
 * and the AI context.
 */
export function explainGap(gap: SkillGap): GapExplanation {
  const urgency =
    gap.priority === 'critical'
      ? 'blocks_the_role'
      : gap.priority === 'high'
        ? 'major_requirement'
        : gap.priority === 'medium'
          ? 'worth_closing_next'
          : 'nice_to_have';
  return {
    name: gap.name,
    currentLevel: gap.currentLevel,
    requiredLevel: gap.requiredLevel,
    met: gap.gap === 0,
    urgency,
  };
}

/**
 * A one-line, user-facing explanation of why a gap has its priority.
 *
 * Kept here so the same sentence appears in the skills centre, the roadmap
 * and the AI context.
 */
export function describeGap(gap: SkillGap): string {
  if (gap.gap === 0) {
    return `You already meet the ${gap.requiredLevel}/5 this role expects for ${gap.name}.`;
  }
  const from = gap.currentLevel;
  const to = gap.requiredLevel;
  const urgency =
    gap.priority === 'critical'
      ? 'blocks the role'
      : gap.priority === 'high'
        ? 'is a major requirement'
        : gap.priority === 'medium'
          ? 'is worth closing next'
          : 'is a nice-to-have';
  return `${gap.name} is at ${from}/5 and this role expects ${to}/5 — ${urgency}.`;
}
