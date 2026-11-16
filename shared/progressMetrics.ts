/**
 * The Progress page's own numbers.
 *
 * WHY THIS IS A SEPARATE MODULE
 * The Progress page used to compute its figures inline, which meant the page
 * could only be checked by rendering it. A page that renders a production
 * account — one whose skills were migrated from an older shape, whose fields
 * are null, or whose skills are all at 5/5 — has to survive that data.
 *
 * Everything here is therefore a pure function over the raw context values,
 * and every one of them tolerates a missing field, a legacy field name and a
 * null. The page reads these figures; the tests feed them migrated rows.
 */

import { computeCareerMetrics, isSkillMastered, toMetricSkills } from './careerMetrics.ts';

export interface ProgressSkill {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  currentLevel?: number | null;
  targetLevel?: number | null;
  gap?: number | null;
  source?: string | null;
  assessedLevel?: number | null;
  required?: boolean | null;
}

export interface ProgressTask {
  id?: string | null;
  status?: string | null;
}

export interface ProgressMilestone {
  tasks?: ProgressTask[] | null;
}

export interface ProgressPhase {
  milestones?: ProgressMilestone[] | null;
}

export interface ProgressSnapshot {
  /** Total roadmap tasks across every phase and milestone. */
  totalTasks: number;
  /** Roadmap tasks whose status is 'completed'. */
  completedTasks: number;
  /** Completed tasks over total tasks, as a whole percentage. */
  roadmapPct: number;
  /** Skills at or above their target level. */
  skillsAtTarget: number;
  /** At-target skills the platform can back with proof. */
  masteredSkills: number;
  /** At-target skills that rest on the candidate's claim alone. */
  unverifiedAtTarget: number;
  /** Skills still short of their target level. */
  inProgressSkills: number;
  /** Every skill the page knows about. */
  totalSkills: number;
}

/** A level that is safe to compare. Anything unreadable becomes zero. */
function level(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * A level the row actually carries, or null when it carries none.
 *
 * The difference from `level()` matters for the gap: an unreadable level is
 * not the same fact as a level of zero, and only a readable pair of levels can
 * be trusted to describe the current shortfall.
 */
function readableLevel(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Whether a skill counts as mastered.
 *
 * The rule is the platform's shared one: the level meets the target and the
 * platform can back the level. A legacy row that carries no `source` at all
 * is treated as claimed, not proven, because nothing confirms it.
 */
export function isProgressSkillMastered(skill: ProgressSkill): boolean {
  const target = level(skill.targetLevel);
  const current = level(skill.currentLevel);
  return isSkillMastered({
    targetLevel: target,
    gap: Math.max(0, target - current),
    source: skill.source,
  });
}

/**
 * The gap of a skill, worked out from the levels.
 *
 * The stored gap is a cache of `targetLevel - currentLevel` and it goes stale
 * the moment either level changes: a row that was 3/5 yesterday and is 5/5
 * today must not keep reporting a gap of two. So whenever the row carries both
 * levels the gap is calculated from them and the stored value is ignored.
 *
 * A legacy row that predates the levels, or one whose level columns are null
 * or unreadable, still has no pair to compare; for those the stored gap is the
 * only fact available and it is used. A row with neither levels nor a usable
 * gap reports zero rather than an invented shortfall.
 */
export function progressSkillGap(skill: ProgressSkill): number {
  const target = readableLevel(skill.targetLevel);
  const current = readableLevel(skill.currentLevel);
  if (target !== null && current !== null) {
    return Math.max(0, target - current);
  }

  const stored = readableLevel(skill.gap);
  if (stored !== null) return Math.max(0, stored);

  return Math.max(0, (target ?? 0) - (current ?? 0));
}

/** Reads the task list of a phase, whatever shape it arrived in. */
export function progressPhaseTasks(phase: ProgressPhase | null | undefined): ProgressTask[] {
  if (!phase || !Array.isArray(phase.milestones)) return [];
  return phase.milestones.flatMap((milestone) =>
    milestone && Array.isArray(milestone.tasks) ? milestone.tasks.filter(Boolean) : []
  );
}

/**
 * The Progress page's figures, computed from whatever the context holds.
 *
 * Every input is optional: a candidate who has never opened the platform, an
 * account whose data has not loaded yet and a migrated account with legacy
 * skill rows all produce a readable page.
 */
export function computeProgressSnapshot(input: {
  skills?: readonly ProgressSkill[] | null;
  roadmapPhases?: readonly ProgressPhase[] | null;
}): ProgressSnapshot {
  const skills = Array.isArray(input.skills) ? input.skills.filter(Boolean) : [];
  const phases = Array.isArray(input.roadmapPhases) ? input.roadmapPhases.filter(Boolean) : [];

  const allTasks = phases.flatMap((phase) => progressPhaseTasks(phase));
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((task) => task?.status === 'completed').length;
  const engine = computeCareerMetrics({
    skills: toMetricSkills(skills.map((skill) => ({
      name: skill.name ?? '',
      currentLevel: level(skill.currentLevel),
      targetLevel: level(skill.targetLevel),
      gap: skill.gap ?? undefined,
      required: skill.required ?? undefined,
      source: skill.source ?? undefined,
    }))),
    roadmapTasks: allTasks.map((task) => ({ status: task.status })),
  });

  const skillsAtTarget = skills.filter(
    (skill) => level(skill.targetLevel) > 0 && level(skill.currentLevel) >= level(skill.targetLevel)
  ).length;

  return {
    totalTasks,
    completedTasks,
    roadmapPct: engine.roadmapCompletionPct,
    skillsAtTarget,
    masteredSkills: engine.skillsMastered,
    unverifiedAtTarget: Math.max(0, skillsAtTarget - engine.skillsMastered),
    inProgressSkills: skills.filter((skill) => progressSkillGap(skill) > 0).length,
    totalSkills: skills.length,
  };
}
