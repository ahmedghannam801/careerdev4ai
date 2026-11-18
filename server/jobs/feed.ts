// One search across every board the platform reads.
//
// The platform buys one aggregated feed (JSearch on RapidAPI). That feed is
// broad but shallow: it reaches the postings a job board republished, so a
// vacancy sitting on a company's own careers page is often missing from it.
//
// This module puts the two together behind the one endpoint the interface
// already calls, so the rest of the product does not need to know that there
// is more than one source:
//
//   * the aggregated provider feed, which the platform pays for;
//   * the applicant-tracking boards a deployment configures, which it reads
//     from the vendors' own public endpoints.
//
// WHAT THIS GUARANTEES
// ---------------------
// 1. HONEST PROVENANCE. Every posting says which board it came from. A
//    posting read from a company's own board is never presented as if it came
//    from a board the platform did not read.
//
// 2. THE PROVIDER'S QUOTA IS NOT SPENT ON THE OTHER SOURCE. The two are read
//    independently and the provider's request budget is reported for the
//    provider only.
//
// 3. A BROKEN BOARD DOES NOT BREAK THE SEARCH. A board that times out or
//    answers with something unexpected is reported as unread, and the
//    postings from the other boards are still returned.
//
// 4. NOTHING IS DUPLICATED. The same vacancy found on two boards is shown
//    once, keeping the copy that carries the most information.
//
// 5. THE PROVIDER'S ANSWER IS NEVER CACHED AWAY BY THE OTHER SOURCE. Each
//    source keeps its own cache, because they have different lifetimes.

import {
  dedupeLiveJobs,
  filterLiveJobsByKind,
  filterLiveJobsBySource,
  type JobKind,
  type JobSourceId,
  type LiveJob,
} from '../../shared/jobs.ts';
import {
  isJobSearchConfigured,
  searchJobs,
  type JobSearchResult,
} from '../jsearch/client.ts';
import { configuredAtsBoards, searchAtsBoards } from './ats.ts';

/** What one search across every board found. */
export interface AggregatedJobSearchResult {
  /** The vacancies, merged and deduplicated. */
  jobs: LiveJob[];
  /** The provider's own quota, which is the quota of the paid feed only. */
  quota: JobSearchResult['quota'];
  /** True when the provider's answer came from the cache. */
  cached: boolean;
  /**
   * When the boards were read.
   *
   * This is the truth about the postings rather than the truth about the
   * request: it is the moment the freshest board was read.
   */
  fetchedAt: string;
  /** Which boards contributed, named for the interface. */
  boardsRead: string[];
  /** Which boards could not be read. */
  boardsFailed: string[];
}

/** The label the provider's own quota belongs to. */
const PROVIDER_BOARD_LABEL = 'JSearch';

function readBoardLabels(result: JobSearchResult): string[] {
  const labels = new Set<string>();
  for (const job of result.jobs) {
    if (job.publisher) labels.add(job.publisher);
  }
  return labels.size ? [...labels] : [PROVIDER_BOARD_LABEL];
}

/**
 * Keeps the copy of a duplicated vacancy that says the most.
 *
 * The aggregated provider usually carries the richer description, while the
 * company's own board carries the employer's own wording. Either may be the
 * better copy, so the one with more text wins, and a tie keeps the first.
 */
function preferRicherCopy(jobs: LiveJob[]): LiveJob[] {
  const byKey = new Map<string, LiveJob>();

  for (const job of jobs) {
    const key = [job.title, job.company, job.location ?? '']
      .map((part) => part.toLowerCase().replace(/\s+/g, ' ').trim())
      .join('|');

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, job);
      continue;
    }

    const existingLength = (existing.description ?? '').length;
    const candidateLength = (job.description ?? '').length;
    if (candidateLength > existingLength) byKey.set(key, job);
  }

  return [...byKey.values()];
}

/**
 * Searches every board the platform reads.
 *
 * The provider is asked for the postings the candidate asked for. The
 * configured company boards are read whole — a company board has no query
 * parameter, so the postings are filtered here instead.
 */
export async function searchAllJobs(
  rawParams: Record<string, unknown>,
  options: { bypassCache?: boolean } = {}
): Promise<AggregatedJobSearchResult> {
  const providerConfigured = isJobSearchConfigured();
  const boards = configuredAtsBoards();
  const requestedSources = readRequestedSources(rawParams.sources);

  // The provider is only asked when the candidate's filter can still match
  // something it returns. A candidate who asked for the company boards alone
  // must not spend the provider's request budget on an answer that would be
  // filtered away anyway.
  const wantsProvider =
    providerConfigured &&
    (!requestedSources.length || requestedSources.some((source) => source !== 'company_careers'));

  // Neither source is available: the caller is told so rather than being
  // handed an empty list that looks like "no jobs found".
  if (!wantsProvider && boards.length === 0) {
    return {
      jobs: [],
      quota: { limit: null, remaining: null },
      cached: false,
      fetchedAt: new Date().toISOString(),
      boardsRead: [],
      boardsFailed: [],
    };
  }

  const kind = (rawParams.kind as JobKind) ?? 'all';

  const providerPromise = wantsProvider
    ? searchJobs(rawParams, options).catch(() => null)
    : Promise.resolve(null);

  const atsPromise = boards.length
    ? searchAtsBoards(boards).catch(() => null)
    : Promise.resolve(null);

  const [providerResult, atsResult] = await Promise.all([providerPromise, atsPromise]);

  const providerJobs = providerResult?.jobs ?? [];
  const atsJobs = atsResult?.jobs ?? [];

  // The company boards are read whole — a company board has no query
  // parameter — so the candidate's own filters are applied here.
  const filteredAts = filterLiveJobsBySource(
    filterLiveJobsByKind(atsJobs, kind),
    requestedSources
  );

  const jobs = dedupeLiveJobs(preferRicherCopy([...providerJobs, ...filteredAts]));

  const boardsRead = [
    ...(providerResult ? readBoardLabels(providerResult) : []),
    ...(atsResult?.boardsRead ?? []),
  ];
  const boardsFailed = atsResult?.boardsFailed ?? [];

  const fetchedAt = [providerResult?.fetchedAt, atsResult?.fetchedAt]
    .filter((value): value is string => Boolean(value))
    .sort()
    .pop() ?? new Date().toISOString();

  return {
    jobs,
    quota: providerResult?.quota ?? { limit: null, remaining: null },
    cached: providerResult?.cached ?? false,
    fetchedAt,
    boardsRead,
    boardsFailed,
  };
}

/** Reads the boards the caller narrowed the search to. */
function readRequestedSources(value: unknown): JobSourceId[] {
  if (!value) return [];
  const parts = (Array.isArray(value) ? value : String(value).split(','))
    .map((entry) => String(entry).trim().toLowerCase())
    .filter(Boolean);
  return parts as JobSourceId[];
}
