// Recommending vacancies to a candidate, and explaining the recommendation.
//
// WHY THIS EXISTS
// ---------------
// The search route answers a question the candidate asked: "show me postings
// for X". A recommendation answers a different one: "what should I look at?".
// Nothing in the platform did that — the candidate had to know what to type.
//
// So this ranks what the platform can read against the candidate's own
// record, using the matcher that already explains a match, and writes the
// reason in words.
//
// THE RULES
// ---------
// 1. One engine. The ranking uses `explainJobMatch`, the same function the
//    interface uses, so a recommendation and a search result are scored the
//    same way and a candidate is never shown two different numbers for one
//    posting.
//
// 2. An unknown never beats a known. A posting whose fit could not be
//    compared is not a poor match; it is an unmeasured one, so it never
//    outranks a posting that was measured.
//
// 3. Every recommendation says why. A ranking the candidate cannot read is a
//    ranking they cannot act on, so each one carries the skills that matched
//    and the factor that carried the score.
//
// 4. Nothing is invented. The reason names only terms that are in the
//    candidate's record or in the posting.

import type { JobMatchBreakdown } from '../../shared/jobMatching.ts';
import type { LiveJob } from '../../shared/jobs.ts';
import type { MatchCandidate } from './candidate.ts';

export interface RecommendedJob {
  job: LiveJob;
  /** The same explanation the search shows for this posting. */
  match: JobMatchBreakdown;
  /** Why this posting is here, in one sentence. */
  reason: string;
  /** The terms that drove the recommendation. */
  highlights: string[];
}

/**
 * The search text used when the candidate has not said what to look for.
 *
 * It is built from the candidate's own record: the role they are aiming at,
 * or the skills they have. Nothing is guessed about a job title they did not
 * write.
 */
export function buildRecommendationQuery(candidate: MatchCandidate): string {
  if (candidate.targetRole?.trim()) return candidate.targetRole.trim();

  const skills = candidate.skillNames.slice(0, 4).join(' ');
  if (skills) return skills;

  if (candidate.targetOpportunityType === 'internship') return 'internship';
  if (candidate.targetOpportunityType === 'full_time_entry') return 'entry level job';

  return 'jobs';
}

/** The terms that drove a match, strongest first. */
export function matchHighlights(breakdown: JobMatchBreakdown, limit = 6): string[] {
  const terms = new Set<string>();

  for (const factor of breakdown.factors) {
    for (const term of factor.matched) terms.add(term);
  }
  for (const term of breakdown.semantic?.matched ?? []) terms.add(term);

  return [...terms].slice(0, limit);
}

/**
 * The factor that carried the most weight in a match.
 *
 * Two kinds of factor are left out of the answer it gives. The location is
 * not a reason to recommend a job — a posting in the same city is not a fit.
 * And a skills factor that matched nothing is not a reason either: "0 of 5
 * skills match" says the posting was not a fit, which is the opposite of the
 * point. What is left is a factor that found something.
 */
function strongestFactor(breakdown: JobMatchBreakdown) {
  return [...breakdown.factors]
    .filter((factor) => factor.evaluated && factor.factor !== 'location')
    .filter((factor) => !(factor.factor === 'preferredSkills' && factor.score === 0))
    .filter((factor) => !(factor.factor === 'requiredSkills' && factor.score === 0))
    .sort((a, b) => b.contribution - a.contribution)[0];
}

/**
 * Writes why a posting is recommended.
 *
 * The sentence is built from the match itself, so it cannot drift away from
 * the number beside it.
 */
export function describeRecommendation(
  job: LiveJob,
  breakdown: JobMatchBreakdown
): { reason: string; highlights: string[] } {
  const highlights = matchHighlights(breakdown);

  const required = breakdown.factors.find((factor) => factor.factor === 'requiredSkills');
  const preferred = breakdown.factors.find((factor) => factor.factor === 'preferredSkills');
  const experience = breakdown.factors.find((factor) => factor.factor === 'experience');
  const location = breakdown.factors.find((factor) => factor.factor === 'location');
  const strongest = strongestFactor(breakdown);

  // What the fit itself says. A location on its own is not a reason to put a
  // posting in front of someone, so it is kept apart: it is added to a fit,
  // never used instead of one.
  const fit: string[] = [];

  if (required?.evaluated && required.matched.length) {
    fit.push(
      `Your record matches ${required.matched.length} of the ${required.matched.length + required.missing.length} skills it asks for (${required.matched.slice(0, 4).join(', ')}).`
    );
  } else if (required?.evaluated && required.missing.length) {
    fit.push(`It asks for ${required.missing.slice(0, 4).join(', ')}, which your record does not show yet.`);
  } else if (breakdown.semantic?.evaluated && breakdown.semantic.matched.length) {
    fit.push(
      `It reads like the work you already do: ${breakdown.semantic.matched.slice(0, 4).join(', ')}.`
    );
  } else if (preferred?.evaluated && preferred.matched.length) {
    fit.push(`It asks for ${preferred.matched.slice(0, 4).join(', ')}, which your record shows.`);
  }

  if (experience?.evaluated && breakdown.jobSeniority && breakdown.candidateBand) {
    const gap = Math.abs(
      ['student', 'intern', 'junior', 'mid', 'senior', 'lead'].indexOf(breakdown.jobSeniority) -
        ['student', 'intern', 'entry', 'professional', 'senior'].indexOf(breakdown.candidateBand)
    );
    if (gap === 0) fit.push('Its level is the one you are aiming at.');
    else if (gap === 1) fit.push('Its level is one step from the one you are aiming at.');
  }

  if (!fit.length && strongest) {
    fit.push(strongest.reason);
  }

  // The fit could not be compared at all. That is said plainly rather than
  // dressed up as a reason.
  if (!fit.length) {
    return {
      reason:
        'There is not enough in your record yet to say why this fits, so it is offered as it was posted.',
      highlights,
    };
  }

  // The aside: where it is, when it is remote.
  const aside: string[] = [];
  if (location?.evaluated && location.score === 100) {
    aside.push(job.isRemote ? 'It is remote.' : location.reason);
  }

  return { reason: [...fit, ...aside].join(' '), highlights };
}

/**
 * Ranks postings for a candidate.
 *
 * The order is by the score, then by how recently the posting arrived, then
 * by the posting's own identifier, so the same set always produces the same
 * order — a recommendation list that reshuffles itself on every reload is
 * not a recommendation.
 */
export function rankRecommendations(
  jobs: readonly LiveJob[],
  breakdowns: ReadonlyMap<string, JobMatchBreakdown>,
  limit = 12
): RecommendedJob[] {
  const bandOrder = ['student', 'intern', 'entry', 'professional', 'senior'] as const;
  const seniorityOrder = ['student', 'intern', 'junior', 'mid', 'senior', 'lead'] as const;

  const scored = jobs.map((job) => {
    const breakdown = breakdowns.get(job.id);
    if (!breakdown) return null;

    // An unmeasured fit never outranks a measured one.
    const measured = breakdown.factors.some((factor) => factor.evaluated);
    const seniorityGap =
      breakdown.jobSeniority && breakdown.candidateBand
        ? Math.abs(
            seniorityOrder.indexOf(breakdown.jobSeniority) -
              bandOrder.indexOf(breakdown.candidateBand)
          )
        : null;

    return { job, breakdown, measured, seniorityGap };
  });

  const ranked = scored
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => {
      if (a.measured !== b.measured) return a.measured ? -1 : 1;
      if (b.breakdown.score !== a.breakdown.score) return b.breakdown.score - a.breakdown.score;
      if (a.seniorityGap !== b.seniorityGap) {
        return (a.seniorityGap ?? 99) - (b.seniorityGap ?? 99);
      }
      const left = a.job.postedAt ? Date.parse(a.job.postedAt) : 0;
      const right = b.job.postedAt ? Date.parse(b.job.postedAt) : 0;
      if (left !== right) return right - left;
      return a.job.id.localeCompare(b.job.id);
    });

  return ranked.slice(0, limit).map(({ job, breakdown }) => {
    const { reason, highlights } = describeRecommendation(job, breakdown);
    return { job, match: breakdown, reason, highlights };
  });
}
