/**
 * Progress momentum: streaks and milestone timelines.
 *
 * WHY THIS EXISTS
 * A progress dashboard that only shows totals cannot answer the question a
 * candidate actually asks while they are working: "am I keeping this up?"
 * Totals go up slowly. A streak shows the pace.
 *
 * NOTHING HERE IS INVENTED.
 *
 *   - The streak is computed from the timestamps of the user's own recorded
 *     activity — rows that are already in the activity log. If the user did
 *     nothing for two weeks, the streak reads zero. It does not estimate, it
 *     does not carry over, and it does not assume weekends are different.
 *   - The milestones are the milestones the user actually recorded. They are
 *     read, never inferred from a percentage.
 *
 * The rules are pure so the browser and the tests compute the same number.
 */

/** One recorded activity, reduced to the only field the streak needs. */
export interface StreakActivity {
  /** The moment the activity happened. */
  timestamp: string;
}

/**
 * The local calendar day of a timestamp, as `YYYY-MM-DD`.
 *
 * The day is taken in the user's own timezone rather than in UTC. A streak
 * that flips at 00:00 UTC would break for most of the world at dinner time.
 */
export function localDayKey(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The local day keys that have activity, most recent first. */
export function activeDays(activities: readonly StreakActivity[]): string[] {
  const seen = new Set<string>();
  for (const activity of activities) {
    const key = localDayKey(activity.timestamp);
    if (key) seen.add(key);
  }
  return [...seen].sort().reverse();
}

/**
 * The difference between two `YYYY-MM-DD` day keys, in whole days.
 *
 * It is computed on the parsed dates rather than by parsing the strings, so
 * it stays correct across month and year boundaries and across daylight
 * saving changes.
 */
function daysBetween(laterKey: string, earlierKey: string): number {
  const later = new Date(`${laterKey}T00:00:00`);
  const earlier = new Date(`${earlierKey}T00:00:00`);
  if (Number.isNaN(later.getTime()) || Number.isNaN(earlier.getTime())) return 0;
  const ms = later.getTime() - earlier.getTime();
  return Math.round(ms / 86_400_000);
}

export interface ActivityStreak {
  /**
   * The number of consecutive active days ending today or yesterday.
   *
   * A streak survives "today" only if the user has already acted today. If
   * today has no activity yet, the streak is still alive as long as yesterday
   * was active — the user has not broken it, they have not started it yet.
   */
  current: number;
  /** The longest run of consecutive active days the user has ever had. */
  longest: number;
  /** How many distinct days have activity at all. */
  activeDayCount: number;
  /** The most recent active day, or null when there is none. */
  lastActiveDay: string | null;
}

/**
 * Computes the user's activity streak from their recorded activity.
 *
 * `today` is a parameter rather than `new Date()` so the result is testable
 * and so the browser can pass the user's own notion of today.
 */
export function computeActivityStreak(
  activities: readonly StreakActivity[],
  today: Date = new Date()
): ActivityStreak {
  const days = activeDays(activities);
  if (days.length === 0) {
    return { current: 0, longest: 0, activeDayCount: 0, lastActiveDay: null };
  }

  const todayKey = localDayKey(today) ?? '';

  // The longest run: walk the days from oldest to newest and count the
  // consecutive ones.
  const ordered = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let index = 1; index < ordered.length; index += 1) {
    if (daysBetween(ordered[index], ordered[index - 1]) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  // The current run: it ends today, or yesterday if today has no activity
  // yet. Anything older than that has already been broken.
  let current = 0;
  const mostRecent = days[0];
  const gapFromToday = daysBetween(todayKey, mostRecent);
  if (gapFromToday === 0 || gapFromToday === 1) {
    current = 1;
    for (let index = 1; index < days.length; index += 1) {
      if (daysBetween(days[index - 1], days[index]) === 1) {
        current += 1;
      } else {
        break;
      }
    }
  }

  return {
    current,
    longest,
    activeDayCount: days.length,
    lastActiveDay: mostRecent,
  };
}

/**
 * A milestone the user recorded, placed on a timeline.
 *
 * The milestone itself is a fact the user entered. This helper only sorts
 * and groups it — it never invents one.
 */
export interface TimelineMilestone {
  id: string;
  title: string;
  /** What kind of achievement this is. */
  category: string;
  /** The day it was achieved, as `YYYY-MM-DD`. */
  dateAchieved: string;
  /** A short, plain-language note about it. */
  note?: string;
  /** Whether the user marked it as verified. */
  verified?: boolean;
}

/** A group of milestones that share the same year. */
export interface MilestoneYearGroup {
  year: string;
  milestones: TimelineMilestone[];
}

/**
 * Groups recorded milestones by year, most recent year first.
 *
 * Milestones without a usable date are put in the current year rather than
 * being dropped, because a milestone the user recorded is still a milestone.
 */
export function groupMilestonesByYear(
  milestones: readonly TimelineMilestone[],
  today: Date = new Date()
): MilestoneYearGroup[] {
  const fallbackYear = String(today.getFullYear());
  const groups = new Map<string, TimelineMilestone[]>();

  for (const milestone of milestones) {
    const year = /^\d{4}/.test(milestone.dateAchieved)
      ? milestone.dateAchieved.slice(0, 4)
      : fallbackYear;
    const bucket = groups.get(year);
    if (bucket) bucket.push(milestone);
    else groups.set(year, [milestone]);
  }

  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, items]) => ({
      year,
      // Most recent first inside the year.
      milestones: [...items].sort((a, b) =>
        a.dateAchieved < b.dateAchieved ? 1 : -1
      ),
    }));
}
