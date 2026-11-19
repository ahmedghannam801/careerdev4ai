// Comparing vacancies side by side.
//
// WHY THIS EXISTS
// ---------------
// A candidate holding two postings cannot tell which one suits them by
// reading both. The score helps, but the score is a number, and the question
// behind it is specific: "which one asks for things I do not have, and which
// one does not?"
//
// So a comparison is built from the same explanation the candidate already
// sees, arranged so the differences are visible rather than implied.
//
// WHAT A COMPARISON SHOWS
// -----------------------
//   - what each posting asks for, and what the candidate meets and misses
//   - the skills every posting asks for, and the skills only one asks for
//   - which posting leads on which factor
//
// The comparison never invents a verdict. It shows what is different; the
// candidate decides what that means.

import type { JobMatchBreakdown } from '../../shared/jobMatching.ts';
import type { LiveJob } from '../../shared/jobs.ts';

export interface JobComparisonEntry {
  job: LiveJob;
  match: JobMatchBreakdown;
  /** The skills this posting asks for that the candidate meets. */
  met: string[];
  /** The skills this posting asks for that the candidate does not meet. */
  missing: string[];
  /** The factor that carried this posting's score, by name. */
  strongestFactor: string | null;
}

export interface JobComparison {
  entries: JobComparisonEntry[];
  /** The skills every posting in the comparison asks for. */
  commonRequirements: string[];
  /** The skills only one posting asks for, by posting identifier. */
  uniqueRequirements: Record<string, string[]>;
  /** The factors each posting leads on, by posting identifier. */
  leadsOn: Record<string, string[]>;
}

/** The most a candidate can compare at once. */
export const MAX_COMPARED_JOBS = 4;

/** The skills a posting asks for, whether it lists them or they are in the text. */
function requirementsOf(match: JobMatchBreakdown): string[] {
  const required = match.factors.find((factor) => factor.factor === 'requiredSkills');
  if (required?.evaluated) return [...required.matched, ...required.missing];
  return [...match.requiredSkills.matched, ...match.requiredSkills.missing];
}

/**
 * Builds the comparison.
 *
 * The postings keep the order the caller gave them, so a candidate can see
 * the order they chose rather than an order the server imposed.
 */
export function compareJobs(
  jobs: readonly LiveJob[],
  breakdowns: ReadonlyMap<string, JobMatchBreakdown>
): JobComparison {
  const entries: JobComparisonEntry[] = [];

  for (const job of jobs) {
    const match = breakdowns.get(job.id);
    if (!match) continue;

    const strongest = [...match.factors]
      .filter((factor) => factor.evaluated)
      .sort((a, b) => b.contribution - a.contribution)[0];

    entries.push({
      job,
      match,
      met: match.requiredSkills.matched,
      missing: match.requiredSkills.missing,
      strongestFactor: strongest ? strongest.factor : null,
    });
  }

  // The skills every posting asks for.
  const requirementSets = entries.map((entry) => new Set(requirementsOf(entry.match)));
  const commonRequirements =
    requirementSets.length > 1
      ? [...requirementSets[0]].filter((requirement) =>
          requirementSets.every((set) => set.has(requirement))
        )
      : [];

  // The skills only one posting asks for.
  const uniqueRequirements: Record<string, string[]> = {};
  for (const [index, entry] of entries.entries()) {
    const others = requirementSets.filter((_, other) => other !== index);
    uniqueRequirements[entry.job.id] = [...requirementSets[index]].filter(
      (requirement) => !others.some((set) => set.has(requirement))
    );
  }

  // Which posting leads on which factor.
  const leadsOn: Record<string, string[]> = {};
  for (const entry of entries) leadsOn[entry.job.id] = [];

  const factorNames = [
    ...new Set(entries.flatMap((entry) => entry.match.factors.map((factor) => factor.factor))),
  ];

  for (const factor of factorNames) {
    let best: { id: string; score: number } | null = null;
    let tied = false;

    for (const entry of entries) {
      const breakdown = entry.match.factors.find((item) => item.factor === factor);
      if (!breakdown || !breakdown.evaluated) continue;
      if (!best || breakdown.score > best.score) {
        best = { id: entry.job.id, score: breakdown.score };
        tied = false;
      } else if (breakdown.score === best.score) {
        tied = true;
      }
    }

    // A factor only has a leader when one posting is clearly ahead of the rest.
    if (best && !tied) leadsOn[best.id] = [...leadsOn[best.id], factor];
  }

  return { entries, commonRequirements, uniqueRequirements, leadsOn };
}
