/**
 * The figures the Career Timeline dashboard is drawn from.
 *
 * THIS MODULE IS PURE
 * -------------------
 * Everything the dashboard shows is worked out here, from the milestone list
 * the timeline already builds, with no React and no DOM. The component that
 * draws the charts reads these numbers and does nothing else, so a figure can
 * be reasoned about — and tested — on its own.
 *
 * NOTHING IS INVENTED
 * -------------------
 * Every number is a count of records the candidate really has, or a share of
 * such a count. A candidate with four records gets a chart of four records.
 * When a series cannot be built — no record carries a date — it comes back
 * empty and the chart shows its empty state rather than an axis with nothing
 * on it.
 */

import {
  SPIRAL_STATE_LABELS,
  type SpiralMilestone,
  type SpiralMilestoneKind,
  type SpiralMilestoneState,
} from './spiralTimeline';

/** One value in a dashboard chart, before it is translated or formatted. */
export interface TimelineDatum {
  key: string;
  /** The English source word for the thing counted; the view translates it. */
  label: string;
  value: number;
}

/** How one kind of record is progressing. */
export interface TimelineKindProgress {
  kind: SpiralMilestoneKind;
  /** The English source word for the kind; the view translates it. */
  label: string;
  total: number;
  completed: number;
  /** How many of this kind are still ahead. */
  upcoming: number;
  /** The share of this kind that is finished, 0-100. */
  percent: number;
}

/** One point on the "records over time" line. */
export interface TimelineYearPoint {
  /** The year, as the axis label. */
  label: string;
  /** How many records are dated in that year. */
  value: number;
  /** How many records the candidate already had by the end of that year. */
  cumulative: number;
}

/** Everything the dashboard shows, worked out once. */
export interface TimelineMetrics {
  total: number;
  completed: number;
  current: number;
  upcoming: number;
  /** The share of all records that are finished, 0-100. */
  completionPercent: number;
  /** The three states, in the order the legend reads. */
  stateDistribution: Array<TimelineDatum & { state: SpiralMilestoneState }>;
  /** The records by kind, largest first. */
  kindDistribution: TimelineDatum[];
  /** Each kind's own progress, largest first. */
  kindProgress: TimelineKindProgress[];
  /** How many records are dated in each year, oldest first. */
  yearlyActivity: TimelineYearPoint[];
  /** The earliest year a record states, or null when none is dated. */
  firstYear: number | null;
  /** The latest year a record states, or null when none is dated. */
  lastYear: number | null;
  /** The dated record count, so the view can say what the line is drawn from. */
  datedCount: number;
}

/** The English source word for each kind. */
export const KIND_LABELS: Record<SpiralMilestoneKind, string> = {
  education: 'Education',
  experience: 'Experience',
  certification: 'Certification',
  project: 'Project',
  application: 'Application',
  milestone: 'Milestone',
};

/** Reads the year a record states, or null when it states none. */
export function recordYear(date: string | null | undefined): number | null {
  if (!date) return null;
  const match = /^(\d{4})/.exec(date.trim());
  if (!match) return null;
  const year = Number(match[1]);
  // A year outside this range is a typo or a placeholder, not a record.
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null;
  return year;
}

/** Rounds a share to a whole percentage, with a zero total answered as zero. */
function percentOf(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** Counts how many records each value of `keyOf` appears with. */
function countBy<T extends string>(
  milestones: SpiralMilestone[],
  keyOf: (milestone: SpiralMilestone) => T
): Map<T, number> {
  const counts = new Map<T, number>();
  for (const milestone of milestones) {
    const key = keyOf(milestone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Works out every figure the Career Timeline dashboard shows.
 *
 * The order of the kinds and states is fixed rather than sorted by count, so a
 * colour keeps its meaning between two readings: Education is not terracotta
 * on one visit and sage on the next just because the candidate added a project.
 */
export function computeTimelineMetrics(milestones: SpiralMilestone[]): TimelineMetrics {
  const list = milestones ?? [];
  const total = list.length;

  const stateCounts = countBy(list, (milestone) => milestone.state);
  const completed = stateCounts.get('completed') ?? 0;
  const current = stateCounts.get('current') ?? 0;
  const upcoming = stateCounts.get('upcoming') ?? 0;

  const stateDistribution: Array<TimelineDatum & { state: SpiralMilestoneState }> = (
    ['completed', 'current', 'upcoming'] as SpiralMilestoneState[]
  ).map((state) => ({
    key: state,
    state,
    label: SPIRAL_STATE_LABELS[state],
    value: stateCounts.get(state) ?? 0,
  }));

  const kindCounts = countBy(list, (milestone) => milestone.kind);
  const kindOrder = Object.keys(KIND_LABELS) as SpiralMilestoneKind[];

  const kindDistribution: TimelineDatum[] = kindOrder.map((kind) => ({
    key: kind,
    label: KIND_LABELS[kind],
    value: kindCounts.get(kind) ?? 0,
  }));

  const kindProgress: TimelineKindProgress[] = kindOrder
    .map((kind) => {
      const ofKind = list.filter((milestone) => milestone.kind === kind);
      const done = ofKind.filter((milestone) => milestone.state === 'completed').length;
      return {
        kind,
        label: KIND_LABELS[kind],
        total: ofKind.length,
        completed: done,
        upcoming: ofKind.filter((milestone) => milestone.state !== 'completed').length,
        percent: percentOf(done, ofKind.length),
      };
    })
    .filter((entry) => entry.total > 0);

  // The years the records state. A record with no date is not placed on the
  // line: guessing a year for it would draw a trend that did not happen.
  const dated = list
    .map((milestone) => ({ milestone, year: recordYear(milestone.date) }))
    .filter((entry): entry is { milestone: SpiralMilestone; year: number } => entry.year !== null);

  const datedCount = dated.length;
  const years = dated.map((entry) => entry.year);
  const firstYear = years.length ? Math.min(...years) : null;
  const lastYear = years.length ? Math.max(...years) : null;

  const yearlyActivity: TimelineYearPoint[] = [];
  if (firstYear !== null && lastYear !== null) {
    // A career that spans decades is drawn by the years it actually has, so
    // the axis never becomes a wall of empty columns.
    const presentYears = new Set(years);
    const countsByYear = new Map<number, number>();
    for (const year of years) countsByYear.set(year, (countsByYear.get(year) ?? 0) + 1);

    let cumulative = 0;
    for (let year = firstYear; year <= lastYear; year += 1) {
      const value = countsByYear.get(year) ?? 0;
      cumulative += value;
      if (!presentYears.has(year) && value === 0 && cumulative === 0) continue;
      yearlyActivity.push({
        label: String(year),
        value,
        cumulative,
      });
    }
  }

  return {
    total,
    completed,
    current,
    upcoming,
    completionPercent: percentOf(completed, total),
    stateDistribution,
    kindDistribution,
    kindProgress,
    yearlyActivity,
    firstYear,
    lastYear,
    datedCount,
  };
}
