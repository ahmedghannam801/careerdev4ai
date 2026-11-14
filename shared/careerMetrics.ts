/**
 * The Career Intelligence Engine.
 *
 * WHY THIS MODULE EXISTS
 * The QA audit found the same candidate being told four different numbers:
 * the Dashboard said "Role Readiness 77%", the Career Journey said "38%", the
 * Roadmap said "0%" and the Skills Center counted "8 skills below target" —
 * each computed by a different piece of code, each with its own definition.
 * A number the platform cannot explain is a number the candidate cannot trust.
 *
 * This module is the single place where every career metric is defined. Every
 * page — Dashboard, Career Journey, Skills Center, Roadmap, Progress, My
 * Career — reads these numbers instead of recomputing them, so the same
 * candidate always sees the same figures everywhere.
 *
 * THE SIX DEFINITIONS, EXACTLY
 *   1. Skill Gap        — a target-role skill where currentLevel < targetLevel.
 *   2. Critical Gap     — a gap whose skill has high/core importance for the
 *                         target role, OR whose targetLevel - currentLevel >= 2.
 *   3. Active Blocker   — a critical gap that directly blocks the candidate's
 *                         current roadmap stage or their primary career goal.
 *   4. Role Readiness % — weighted match of current levels against the target
 *                         role's required levels.
 *   5. Roadmap Completion % — completed steps / total steps.
 *   6. Career Journey Progress % — weighted progress across the five journey
 *                         stages (Profile -> Assessment -> Learning -> Projects
 *                         -> Apply).
 *
 * Everything here is pure: no I/O, no clock reads that are not injected, no
 * database. The server, the browser and the tests all call the same functions
 * and therefore get the same numbers.
 */

import { normalizeSkillName, type SkillGap } from './skillGap.ts';

/* -------------------------------------------------------------------------- */
/* Inputs                                                                       */
/* -------------------------------------------------------------------------- */

/** How important a skill is for the target role. */
export type SkillImportance = 'core' | 'high' | 'medium' | 'low';

/** The five stages of the career journey, in order. */
export const CAREER_JOURNEY_STAGES = [
  'profile',
  'assessment',
  'learning',
  'projects',
  'apply',
] as const;

export type CareerJourneyStage = (typeof CAREER_JOURNEY_STAGES)[number];

/** The label each stage is shown under. */
export const CAREER_JOURNEY_STAGE_LABELS: Record<CareerJourneyStage, string> = {
  profile: 'Profile',
  assessment: 'Assessment',
  learning: 'Learning',
  projects: 'Projects',
  apply: 'Apply',
};

/**
 * How much each stage contributes to the overall journey progress.
 *
 * The weights sum to 100. They are not arbitrary: the early stages are cheap
 * to leave incomplete and would otherwise let a candidate look far along the
 * journey while having done none of the work, so they are weighted lightly,
 * while the later stages — where the evidence of being ready actually lives —
 * are weighted heavily.
 */
export const CAREER_JOURNEY_STAGE_WEIGHTS: Record<CareerJourneyStage, number> = {
  profile: 10,
  assessment: 20,
  learning: 25,
  projects: 25,
  apply: 20,
};

/** One skill, as the engine needs to see it. */
export interface MetricSkill {
  name: string;
  /** The level the candidate has, 0..5. */
  currentLevel: number;
  /** The level the target role expects, 0..5. */
  targetLevel: number;
  /** How important this skill is for the target role. */
  importance?: SkillImportance;
  /** True when the skill is a core requirement of the role. */
  required?: boolean;
}

/** One roadmap step, as the engine needs to see it. */
export interface MetricRoadmapTask {
  id?: string;
  status?: string | null;
  /** The skill this task closes. */
  skillName?: string | null;
  /** The stage of the journey this task belongs to. */
  stage?: CareerJourneyStage | null;
  estimatedHours?: number | null;
}

/** The five stages, with the facts that describe each one's completion. */
export interface CareerJourneyFacts {
  profile: { complete: boolean };
  assessment: { attempted: boolean; completed?: boolean };
  learning: { started: boolean; completedCourses?: number; totalCourses?: number };
  projects: { completed: number; target: number };
  apply: { applications: number; target?: number };
}

/* -------------------------------------------------------------------------- */
/* Outputs                                                                      */
/* -------------------------------------------------------------------------- */

/** A skill gap, with the classification the platform uses everywhere. */
export interface CareerMetricGap {
  /** Canonical skill name. */
  name: string;
  currentLevel: number;
  targetLevel: number;
  /** How many levels are missing. Never negative. */
  gap: number;
  importance: SkillImportance;
  required: boolean;
  /** True when this gap is a Critical Gap. */
  critical: boolean;
  /** True when this gap is an Active Blocker. */
  blocker: boolean;
  /** Why the gap has the classification it has, in plain words. */
  reason: string;
  /** A short, translatable reason key for the interface. */
  reasonKey:
    | 'gap_core_requirement'
    | 'gap_high_importance'
    | 'gap_two_levels'
    | 'gap_below_target';
}

/** The numbers every page reads. */
export interface CareerMetrics {
  /** Definition 1 — every skill below its target level. */
  gaps: CareerMetricGap[];
  /** Definition 2 — the gaps that are critical. */
  criticalGaps: CareerMetricGap[];
  /** Definition 3 — the critical gaps that block the current stage or goal. */
  activeBlockers: CareerMetricGap[];
  /** How many skills the candidate meets at or above target. */
  skillsMastered: number;
  /** How many target-role skills were considered. */
  skillsTotal: number;
  /** Definition 4 — weighted match against the target role's requirements. */
  roleReadinessPct: number;
  /** Definition 5 — completed roadmap steps over total steps. */
  roadmapCompletionPct: number;
  /** Completed roadmap steps. */
  roadmapCompleted: number;
  /** Total roadmap steps. */
  roadmapTotal: number;
  /** Definition 6 — weighted progress across the five journey stages. */
  journeyProgressPct: number;
  /** The stage the candidate is currently in. */
  currentStage: CareerJourneyStage;
  /** Per-stage completion, 0..100 each. */
  stageProgress: Record<CareerJourneyStage, number>;
}

/* -------------------------------------------------------------------------- */
/* Classification                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The importance of a skill, read from the role catalogue's own vocabulary.
 *
 * The role data writes "high" and "core" in different places, so both are
 * accepted and normalised to one scale.
 */
export function normalizeImportance(value: string | null | undefined): SkillImportance {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === 'core' || raw === 'critical' || raw === 'required' || raw === 'essential') return 'core';
  if (raw === 'high' || raw === 'important') return 'high';
  if (raw === 'medium' || raw === 'normal' || raw === 'standard') return 'medium';
  return 'low';
}

/**
 * The two levels at which a gap stops being a nice-to-have.
 *
 * A skill the role calls core or high is critical the moment it is short of
 * its target. Any other skill becomes critical once it is two levels short,
 * because at that distance it is no longer a small shortfall.
 */
export function isCriticalGap(input: {
  gap: number;
  importance: SkillImportance;
  required?: boolean;
}): boolean {
  if (input.gap <= 0) return false;
  if (input.required) return true;
  if (input.importance === 'core' || input.importance === 'high') return true;
  return input.gap >= 2;
}

/**
 * The reason a gap is classified the way it is.
 *
 * The interface shows this sentence next to the badge, so a candidate can see
 * why a skill was called critical rather than having to guess.
 */
export function gapReason(input: {
  name: string;
  gap: number;
  importance: SkillImportance;
  required?: boolean;
}): { reason: string; reasonKey: CareerMetricGap['reasonKey'] } {
  const { name, gap, importance, required } = input;
  if (required) {
    return {
      reason: `${name} is a core requirement of this role and is ${gap} level${
        gap === 1 ? '' : 's'
      } below the target.`,
      reasonKey: 'gap_core_requirement',
    };
  }
  if (importance === 'high') {
    return {
      reason: `${name} has high importance for this role and is ${gap} level${
        gap === 1 ? '' : 's'
      } below the target.`,
      reasonKey: 'gap_high_importance',
    };
  }
  if (gap >= 2) {
    return {
      reason: `${name} is ${gap} levels below the target, which is too far short to leave for later.`,
      reasonKey: 'gap_two_levels',
    };
  }
  return {
    reason: `${name} is 1 level below the target level for this role.`,
    reasonKey: 'gap_below_target',
  };
}

/* -------------------------------------------------------------------------- */
/* The engine                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Computes every career metric from the same inputs.
 *
 * This is the only function that decides what "readiness" or "blocker" means.
 * The Dashboard, the Roadmap, the Skills Center, the Career Journey and the
 * Progress page all call it, so a number cannot mean two things.
 */
export function computeCareerMetrics(input: {
  /** The candidate's target-role skills, with their levels. */
  skills: MetricSkill[];
  /** The candidate's roadmap steps. */
  roadmapTasks?: MetricRoadmapTask[];
  /** The facts behind the five journey stages. */
  journey?: CareerJourneyFacts;
  /**
   * The skills that block the candidate's current roadmap stage or their
   * primary career goal.
   *
   * When the caller knows these — the roadmap knows the skills its current
   * stage works on, and the goal knows what it needs — it passes them in and
   * the Active Blockers are exact. When it does not, the engine falls back to
   * the critical gaps that the current stage is built around.
   */
  blockingSkillNames?: string[];
  /** The candidate's primary career goal, used in the blocker reason. */
  careerGoal?: string | null;
}): CareerMetrics {
  const skills = input.skills ?? [];
  const roadmapTasks = input.roadmapTasks ?? [];

  /* 1. Skill gaps ------------------------------------------------------- */

  const gaps: CareerMetricGap[] = [];
  for (const skill of skills) {
    const targetLevel = clamp(skill.targetLevel);
    const currentLevel = clamp(skill.currentLevel);
    const gap = Math.max(0, targetLevel - currentLevel);
    if (gap === 0) continue;

    const importance = normalizeImportance(skill.importance);
    const required = Boolean(skill.required) || importance === 'core';
    const critical = isCriticalGap({ gap, importance, required });
    const reason = gapReason({ name: skill.name, gap, importance, required });

    gaps.push({
      name: skill.name,
      currentLevel,
      targetLevel,
      gap,
      importance,
      required,
      critical,
      blocker: false,
      reason: reason.reason,
      reasonKey: reason.reasonKey,
    });
  }

  // The most urgent gap first: required before preferred, then by size.
  gaps.sort(
    (a, b) =>
      Number(b.required) - Number(a.required) ||
      b.gap - a.gap ||
      Number(b.critical) - Number(a.critical) ||
      a.name.localeCompare(b.name)
  );

  /* 3. Active blockers --------------------------------------------------- */

  const criticalGaps = gaps.filter((gap) => gap.critical);

  // The skills the candidate's current stage actually works on. When the
  // caller passes them, they are authoritative; otherwise the engine reads
  // them from the roadmap tasks of the current stage.
  const explicitBlocking = new Set(
    (input.blockingSkillNames ?? [])
      .map((name) => normalizeSkillName(name))
      .filter((name) => name.length > 0)
  );

  const currentStage = determineCurrentStage(input.journey);

  const stageBlocking = new Set<string>();
  for (const task of roadmapTasks) {
    // A task that names a different stage is not part of the current one. A
    // task with no stage at all belongs to whatever stage the candidate is
    // standing in — that is where an unstaged task would be worked on.
    if (task.stage && task.stage !== currentStage) continue;
    if (!task.skillName) continue;
    if (task.status === 'completed' || task.status === 'skipped') continue;
    const key = normalizeSkillName(task.skillName);
    if (key) stageBlocking.add(key);
  }

  const blockers: CareerMetricGap[] = [];
  for (const gap of criticalGaps) {
    const key = normalizeSkillName(gap.name);
    const blocks =
      (explicitBlocking.has(key) || stageBlocking.has(key) ||
        // A gap on a core requirement always blocks: the role cannot be
        // entered without it, whatever stage the candidate is standing in.
        gap.required) &&
      gap.gap > 0;
    if (!blocks) continue;
    blockers.push({
      ...gap,
      blocker: true,
      reason: input.careerGoal
        ? `${gap.reason} It blocks progress towards your goal: ${input.careerGoal}.`
        : gap.reason,
    });
  }

  /* 4. Role readiness ---------------------------------------------------- */

  let met = 0;
  let possible = 0;
  let mastered = 0;
  for (const skill of skills) {
    const targetLevel = clamp(skill.targetLevel);
    const currentLevel = clamp(skill.currentLevel);
    const importance = normalizeImportance(skill.importance);
    const required = Boolean(skill.required) || importance === 'core';
    if (!required) continue;
    met += Math.min(currentLevel, targetLevel);
    possible += targetLevel;
    if (currentLevel >= targetLevel && targetLevel > 0) mastered += 1;
  }
  const roleReadinessPct = possible > 0 ? Math.round((met / possible) * 100) : 0;

  // "Skills mastered" is counted across every target-role skill, because a
  // candidate is not "half ready" for a role — the mastered count is a
  // progress indicator over the whole skill list.
  const skillsTotal = skills.filter((skill) => clamp(skill.targetLevel) > 0).length;
  const skillsMastered = skills.filter(
    (skill) => clamp(skill.targetLevel) > 0 && clamp(skill.currentLevel) >= clamp(skill.targetLevel)
  ).length;

  /* 5. Roadmap completion ------------------------------------------------ */

  const roadmapTotal = roadmapTasks.length;
  const roadmapCompleted = roadmapTasks.filter(
    (task) => task.status === 'completed'
  ).length;
  const roadmapCompletionPct =
    roadmapTotal > 0 ? Math.round((roadmapCompleted / roadmapTotal) * 100) : 0;

  /* 6. Career journey progress ------------------------------------------- */

  const stageProgress = computeStageProgress(input.journey);
  let journeyWeighted = 0;
  let journeyWeightTotal = 0;
  for (const stage of CAREER_JOURNEY_STAGES) {
    const weight = CAREER_JOURNEY_STAGE_WEIGHTS[stage];
    journeyWeighted += stageProgress[stage] * weight;
    journeyWeightTotal += weight;
  }
  const journeyProgressPct =
    journeyWeightTotal > 0 ? Math.round(journeyWeighted / journeyWeightTotal) : 0;

  return {
    gaps,
    criticalGaps,
    activeBlockers: blockers,
    skillsMastered,
    skillsTotal,
    roleReadinessPct,
    roadmapCompletionPct,
    roadmapCompleted,
    roadmapTotal,
    journeyProgressPct,
    currentStage,
    stageProgress,
  };
}

/**
 * The per-stage completion of the journey.
 *
 * Each stage reports 0..100, so a candidate who finished the profile but has
 * not applied yet can see exactly which stages are done.
 */
export function computeStageProgress(
  journey: CareerJourneyFacts | undefined
): Record<CareerJourneyStage, number> {
  if (!journey) {
    return {
      profile: 0,
      assessment: 0,
      learning: 0,
      projects: 0,
      apply: 0,
    };
  }

  const profile = journey.profile.complete ? 100 : 0;

  const assessment = journey.assessment.completed
    ? 100
    : journey.assessment.attempted
      ? 50
      : 0;

  const learningTotal = journey.learning.totalCourses ?? 0;
  const learning =
    learningTotal > 0
      ? Math.round(
          Math.min(
            100,
            ((journey.learning.completedCourses ?? 0) / learningTotal) * 100
          )
        )
      : journey.learning.started
        ? 25
        : 0;

  const projectTarget = journey.projects.target > 0 ? journey.projects.target : 1;
  const projects = Math.round(
    Math.min(100, (journey.projects.completed / projectTarget) * 100)
  );

  const applyTarget = journey.apply.target ?? 1;
  const apply = Math.round(Math.min(100, (journey.apply.applications / applyTarget) * 100));

  return { profile, assessment, learning, projects, apply };
}

/**
 * The stage the candidate is standing in.
 *
 * The first stage that is not finished is the current one. A candidate who has
 * finished everything is at the last stage.
 */
export function determineCurrentStage(
  journey: CareerJourneyFacts | undefined
): CareerJourneyStage {
  if (!journey) return 'profile';
  const progress = computeStageProgress(journey);
  for (const stage of CAREER_JOURNEY_STAGES) {
    if (progress[stage] < 100) return stage;
  }
  return 'apply';
}

/* -------------------------------------------------------------------------- */
/* Explanations                                                                 */
/* -------------------------------------------------------------------------- */

/** One metric, with the explanation the tooltip shows. */
export interface MetricExplanation {
  title: string;
  definition: string;
  formula: string;
}

/**
 * The explanation for every metric, keyed by the metric's id.
 *
 * The tooltip, the breakdown panel and the AI context quote the same text, so
 * the platform can never explain a number one way on the Dashboard and
 * another way in the Skills Center.
 */
export const METRIC_EXPLANATIONS: Record<string, MetricExplanation> = {
  roleReadiness: {
    title: 'Role readiness',
    definition:
      'How much of your target role’s required skill level you already meet. 100% means every required skill is at or above the level the role expects.',
    formula: 'sum(min(your level, required level)) ÷ sum(required level) × 100',
  },
  skillsMastered: {
    title: 'Skills mastered',
    definition:
      'How many of your target role’s skills you already meet at the level the role expects. A skill counts as mastered only when your level is at or above its target.',
    formula: 'count(level ≥ target) ÷ count(target role skills) × 100',
  },
  roadmapCompletion: {
    title: 'Roadmap completion',
    definition:
      'The share of roadmap steps you have finished. Each step is a concrete learning or practice action, not a phase.',
    formula: 'completed steps ÷ total steps × 100',
  },
  journeyProgress: {
    title: 'Career journey progress',
    definition:
      'Your progress across the five stages of your career journey: Profile, Assessment, Learning, Projects and Apply. Each stage is weighted, so finishing the later stages moves the number further than ticking the earlier ones.',
    formula:
      'Σ(stage completion × stage weight) ÷ Σ(stage weights), where the weights are Profile 10, Assessment 20, Learning 25, Projects 25, Apply 20',
  },
  skillGap: {
    title: 'Skill gap',
    definition:
      'A skill your target role needs that you have not yet reached the required level for.',
    formula: 'target level − your level, when your level is below the target',
  },
  criticalGap: {
    title: 'Critical gap',
    definition:
      'A gap that is holding you back: either the skill is a core or high-importance requirement for your target role, or you are at least two levels short of the target.',
    formula: 'gap > 0 AND (core/high importance OR target − current ≥ 2)',
  },
  activeBlocker: {
    title: 'Active blocker',
    definition:
      'A critical gap that directly blocks your current roadmap stage or your primary career goal. Closing it is the fastest way forward right now.',
    formula: 'critical gap AND blocks the current stage or the career goal',
  },
};

/**
 * The explanation for a metric, with the numbers plugged into the formula.
 *
 * The tooltip shows the arithmetic on the candidate's own data, not a
 * generic description of it.
 */
export function explainMetric(
  id: keyof typeof METRIC_EXPLANATIONS,
  metrics: CareerMetrics
): MetricExplanation & { arithmetic: string } {
  const base = METRIC_EXPLANATIONS[id];
  switch (id) {
    case 'roadmapCompletion':
      return {
        ...base,
        arithmetic: `${metrics.roadmapCompleted} ÷ ${metrics.roadmapTotal} × 100 = ${metrics.roadmapCompletionPct}%`,
      };
    case 'skillsMastered':
      return {
        ...base,
        arithmetic: `${metrics.skillsMastered} ÷ ${metrics.skillsTotal} skills at or above target`,
      };
    default:
      return { ...base, arithmetic: base.formula };
  }
}

/* -------------------------------------------------------------------------- */
/* Bridging to the existing gap engine                                         */
/* -------------------------------------------------------------------------- */

/**
 * Converts the platform's existing gap list into this engine's shape.
 *
 * The gap engine (`skillGap.ts`) already knows how to compare a candidate's
 * levels against a role's requirements. This bridge lets both live side by
 * side without either having to know about the other.
 */
export function fromSkillGaps(
  gaps: SkillGap[],
  requirements?: { requiredSkills?: Array<{ name: string }> }
): CareerMetricGap[] {
  const requiredNames = new Set(
    (requirements?.requiredSkills ?? []).map((skill) => normalizeSkillName(skill.name))
  );

  return gaps
    .filter((gap) => gap.gap > 0)
    .map((gap) => {
      const required = gap.required || requiredNames.has(normalizeSkillName(gap.name));
      const importance: SkillImportance = required
        ? 'core'
        : gap.priority === 'critical'
          ? 'high'
          : gap.priority === 'high'
            ? 'medium'
            : 'low';
      const critical = isCriticalGap({ gap: gap.gap, importance, required });
      const reason = gapReason({ name: gap.name, gap: gap.gap, importance, required });
      return {
        name: gap.name,
        currentLevel: gap.currentLevel,
        targetLevel: gap.requiredLevel,
        gap: gap.gap,
        importance,
        required,
        critical,
        blocker: false,
        reason: reason.reason,
        reasonKey: reason.reasonKey,
      };
    });
}

/** Clamps a level into the 0..5 band the platform stores. */
function clamp(level: number): number {
  if (!Number.isFinite(level)) return 0;
  const rounded = Math.round(level);
  if (rounded < 0) return 0;
  if (rounded > 5) return 5;
  return rounded;
}
