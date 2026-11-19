// Explaining a match, on the server.
//
// WHY THIS IS HERE
// ----------------
// The platform has one matcher: `explainJobMatch`. The interface used to
// call it in the browser, on a candidate picture assembled from whatever the
// page held. That meant two sources of truth for the same candidate, and a
// server that could only ever explain skills.
//
// This module calls the same matcher, on the server, with the candidate read
// from the database. So:
//
//   - a recommendation, a comparison and a search result are all scored by
//     one function with one candidate;
//   - the browser no longer has to re-derive a score it can be given;
//   - the explanation a candidate reads is the explanation the server
//     computed, not a second opinion formed in the page.
//
// The semantic factor joins the exact factors when one was computed, and is
// left out entirely when it was not — a comparison that was never made is
// not a comparison that failed.

import { explainJobMatch, type JobMatchBreakdown } from '../../shared/jobMatching.ts';
import { CATALOG_SKILL_NAMES, CAREER_ROLES } from '../../shared/careerRoles.ts';
import type { LiveJob } from '../../shared/jobs.ts';
import type { SemanticMatchFactor } from './semantic.ts';
import type { MatchCandidate } from './candidate.ts';

/**
 * Explains every posting against the candidate.
 *
 * The result is keyed by the posting's identifier, so a caller can look up
 * one posting without searching the list.
 */
export function explainJobs(
  jobs: readonly LiveJob[],
  candidate: MatchCandidate,
  semantic?: ReadonlyMap<string, SemanticMatchFactor>
): Map<string, JobMatchBreakdown> {
  const breakdowns = new Map<string, JobMatchBreakdown>();

  for (const job of jobs) {
    // The semantic factor is already written in the same shape as the exact
    // factors, so it is handed over as it is.
    breakdowns.set(
      job.id,
      explainJobMatch(
        job,
        candidate,
        CATALOG_SKILL_NAMES,
        CAREER_ROLES,
        semantic?.get(job.id) ?? null
      )
    );
  }

  return breakdowns;
}
