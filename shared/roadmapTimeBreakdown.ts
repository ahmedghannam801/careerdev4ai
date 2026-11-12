/**
 * The roadmap's time breakdown.
 *
 * A stage that says "twelve hours" is not a plan until it says how those
 * hours are spent. The four parts — courses, practice, projects and
 * application work — always add up to the total: nothing is rounded away and
 * nothing is hidden in a remainder.
 *
 * This module exists so that the number on the screen is the same number
 * everywhere. The server computes the breakdown when it generates a plan, the
 * browser computes it when it renders a persisted plan, and the tests compute
 * it from the same function. A breakdown that only the server can produce is
 * a breakdown the browser cannot trust.
 *
 * The rules are pure, so the client, the server and the tests agree.
 */

import type { RoadmapStageWorkKind } from './roadmapJourney.ts';

export type { RoadmapStageWorkKind };

/**
 * How the plan's hours are spent, by the kind of work.
 *
 * The four parts always add up to the total. That is the point: a candidate
 * who is told a stage will take twelve hours can see that seven of them are
 * courses, three are practice and two are a project — and can decide which
 * of those they need most.
 */
export interface RoadmapTimeBreakdown {
  learning: number;
  practice: number;
  project: number;
  application: number;
}

/** The label each kind of work is shown under. */
export const TIME_BREAKDOWN_LABELS: Record<RoadmapStageWorkKind, string> = {
  learning: 'Learning Courses',
  practice: 'Hands-on Practice',
  project: 'Mini-Project / Assessment',
  application: 'Application & Interview Prep',
};

/** The order the parts are shown in, so the breakdown reads the same way twice. */
export const TIME_BREAKDOWN_ORDER: readonly RoadmapStageWorkKind[] = [
  'learning',
  'practice',
  'project',
  'application',
];

/** A breakdown with nothing in it. */
export function emptyTimeBreakdown(): RoadmapTimeBreakdown {
  return { learning: 0, practice: 0, project: 0, application: 0 };
}

/**
 * Normalises a stored work kind into one of the four kinds.
 *
 * A plan generated before the work kind was recorded has no kind on its
 * tasks. Those tasks are learning work by construction — they carry a
 * learning resource and close a skill gap — so they are counted as learning
 * rather than being dropped, which would break the additive promise.
 */
export function normalizeWorkKind(value: string | null | undefined): RoadmapStageWorkKind {
  switch (value) {
    case 'practice':
      return 'practice';
    case 'project':
      return 'project';
    case 'application':
      return 'application';
    default:
      return 'learning';
  }
}

/** The parts of a breakdown, in the order they are shown. */
export interface TimeBreakdownPart {
  kind: RoadmapStageWorkKind;
  label: string;
  hours: number;
  /** The share of the total, as a whole percentage. */
  sharePercent: number;
}

/**
 * Splits a breakdown into its parts, dropping the empty ones.
 *
 * A stage with no project work should not show a project row of zero hours.
 */
export function timeBreakdownParts(
  breakdown: RoadmapTimeBreakdown
): TimeBreakdownPart[] {
  const total = breakdownTotal(breakdown);
  return TIME_BREAKDOWN_ORDER.map((kind) => {
    const hours = breakdown[kind];
    return {
      kind,
      label: TIME_BREAKDOWN_LABELS[kind],
      hours,
      sharePercent: total > 0 ? Math.round((hours / total) * 100) : 0,
    };
  }).filter((part) => part.hours > 0);
}

/** The total of a breakdown. It equals the sum of its parts, always. */
export function breakdownTotal(breakdown: RoadmapTimeBreakdown): number {
  return TIME_BREAKDOWN_ORDER.reduce((sum, kind) => sum + breakdown[kind], 0);
}

/**
 * Adds two breakdowns together.
 *
 * Used to roll the stages up into one plan-level breakdown, so the plan
 * total is the sum of the stage totals rather than a second calculation
 * that could disagree with them.
 */
export function addTimeBreakdowns(
  ...breakdowns: RoadmapTimeBreakdown[]
): RoadmapTimeBreakdown {
  const total = emptyTimeBreakdown();
  for (const breakdown of breakdowns) {
    for (const kind of TIME_BREAKDOWN_ORDER) {
      total[kind] += breakdown[kind];
    }
  }
  return total;
}

/**
 * Computes the breakdown for a set of tasks.
 *
 * The result always satisfies `breakdownTotal(result) === sum(estimatedHours)`:
 * every hour of every task lands in exactly one part.
 */
export function computeTimeBreakdown(
  tasks: ReadonlyArray<{
    estimatedHours?: number | null;
    workKind?: string | null;
  }>
): RoadmapTimeBreakdown {
  const breakdown = emptyTimeBreakdown();
  for (const task of tasks) {
    const hours = task.estimatedHours ?? 0;
    if (!Number.isFinite(hours) || hours <= 0) continue;
    breakdown[normalizeWorkKind(task.workKind)] += hours;
  }
  return breakdown;
}
