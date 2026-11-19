// What the live market is asking for, measured against this candidate.
//
// WHY THIS EXISTS
// ---------------
// A candidate can see that a posting fits. What they cannot see is the shape
// of the market around them: which skills employers keep asking for that
// their record does not have, how much of the market is remote, how many
// openings the platform can actually read.
//
// Those are numbers, and a number without its calculation is decoration. So
// every figure below is computed here, from the postings that were really
// read, and each one states how it was calculated.
//
// THE RULES
// ---------
// 1. Only real postings. The figures come from the feed the platform read,
//    not from a model of what the market looks like.
// 2. Every figure names its own calculation, so the interface can show it
//    and a reader can check it.
// 3. A figure that cannot be computed is absent, never zero. "No openings
//    were read" and "no openings matched" are different facts.

import type { JobMatchBreakdown } from '../../shared/jobMatching.ts';
import type { LiveJob } from '../../shared/jobs.ts';

export interface CountedValue {
  /** The value itself. */
  value: string;
  /** How many postings carry it. */
  count: number;
}

export interface JobInsights {
  /** How many openings the platform read. */
  openingsRead: number;
  /** How many of those could be compared with the candidate's record. */
  openingsMeasured: number;
  /** How many scored at or above the strong threshold. */
  strongMatches: number;
  /** The score a posting must reach to count as a strong match. */
  strongThreshold: number;
  /** The openings per board, as the platform read them. */
  bySource: CountedValue[];
  /** The openings per seniority, as the posting's own words said it. */
  bySeniority: CountedValue[];
  /** The openings per employment type. */
  byEmploymentType: CountedValue[];
  /** How much of the market is remote, as a share of the postings that said. */
  remoteShare: { remote: number; of: number; percent: number } | null;
  /**
   * The skills the market asks for most that the candidate does not have.
   *
   * This is the gap: what is being asked for, across the postings read, that
   * the candidate's own record does not show.
   */
  topMissingSkills: CountedValue[];
  /**
   * The skills the market asks for most that the candidate does have.
   */
  topMatchedSkills: CountedValue[];
  /** The postings with the biggest gap, so the candidate can start somewhere. */
  biggestGaps: { jobId: string; title: string; company: string; missing: string[]; score: number }[];
}

/** The score a posting must reach to be counted as a strong match. */
export const STRONG_MATCH_THRESHOLD = 70;

/** How many skills each list names. */
const TOP_SKILL_COUNT = 8;

/** How many gaps the list names. */
const TOP_GAP_COUNT = 5;

function count(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** The counted values, most common first, and the name of each value. */
function ranked(counts: Map<string, number>, limit: number): CountedValue[] {
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, amount]) => ({ value, count: amount }));
}

/**
 * Works out the figures.
 *
 * The breakdowns are the platform's own explanations, so a skill is counted
 * as missing only when the matcher said the candidate does not meet it — not
 * because the posting happened to mention the word.
 */
export function computeJobInsights(
  jobs: readonly LiveJob[],
  breakdowns: ReadonlyMap<string, JobMatchBreakdown>
): JobInsights {
  const measured = jobs.filter((job) => breakdowns.has(job.id));
  const strongMatches = measured.filter(
    (job) => (breakdowns.get(job.id)?.score ?? 0) >= STRONG_MATCH_THRESHOLD
  ).length;

  const sourceCounts = count(jobs.map((job) => job.source));
  const seniorityCounts = count(
    measured.map((job) => breakdowns.get(job.id)?.jobSeniority ?? 'not stated')
  );
  const employmentCounts = count(
    jobs.map((job) => job.employmentType?.trim() || 'not stated')
  );

  // Remote: only the postings that said whether they are remote, because the
  // rest are not evidence either way.
  const remoteAnswers = jobs.filter((job) => job.isRemote !== null);
  const remoteCount = remoteAnswers.filter((job) => job.isRemote === true).length;
  const remoteShare = remoteAnswers.length
    ? {
        remote: remoteCount,
        of: remoteAnswers.length,
        percent: Math.round((remoteCount / remoteAnswers.length) * 100),
      }
    : null;

  // The skills the market asks for, split by whether the candidate meets them.
  const missingCounts = new Map<string, number>();
  const matchedCounts = new Map<string, number>();

  for (const job of measured) {
    const breakdown = breakdowns.get(job.id);
    if (!breakdown) continue;

    for (const skill of breakdown.requiredSkills.missing) {
      missingCounts.set(skill, (missingCounts.get(skill) ?? 0) + 1);
    }
    for (const skill of breakdown.requiredSkills.matched) {
      matchedCounts.set(skill, (matchedCounts.get(skill) ?? 0) + 1);
    }
  }

  // The postings with the biggest gap: the ones that ask for the most the
  // candidate does not have.
  const biggestGaps = measured
    .map((job) => {
      const breakdown = breakdowns.get(job.id)!;
      return {
        jobId: job.id,
        title: job.title,
        company: job.company,
        missing: breakdown.requiredSkills.missing,
        score: breakdown.score,
      };
    })
    .filter((entry) => entry.missing.length > 0)
    .sort((a, b) => b.missing.length - a.missing.length || b.score - a.score || a.jobId.localeCompare(b.jobId))
    .slice(0, TOP_GAP_COUNT);

  return {
    openingsRead: jobs.length,
    openingsMeasured: measured.length,
    strongMatches,
    strongThreshold: STRONG_MATCH_THRESHOLD,
    bySource: ranked(sourceCounts, 12),
    bySeniority: ranked(seniorityCounts, 12),
    byEmploymentType: ranked(employmentCounts, 12),
    remoteShare,
    topMissingSkills: ranked(missingCounts, TOP_SKILL_COUNT),
    topMatchedSkills: ranked(matchedCounts, TOP_SKILL_COUNT),
    biggestGaps,
  };
}
