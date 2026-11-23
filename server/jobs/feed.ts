// One search across every board the platform reads.
//
// The platform reads three kinds of source:
//
//   1. THE AGGREGATED PROVIDER (JSearch on RapidAPI). Broad but shallow, and
//      sold as a monthly number of requests — when that number is spent the
//      subscription answers 429 until the month resets.
//
//   2. THE KEY-FREE BOARD FEEDS (Remotive, Arbeitnow, Jobicy, Himalayas,
//      Remote OK). Documented, public JSON, no credential. They are read by
//      the platform itself and are what keeps live vacancies on the screen
//      when the paid account is out of quota.
//
//   3. THE COMPANY CAREERS BOARDS the deployment configures (Greenhouse,
//      Lever, Ashby). A vacancy on a company's own board is often missing
//      from every aggregate.
//
// This module puts the three behind the one endpoint the interface already
// calls, so the rest of the product does not need to know that there is more
// than one source.
//
// WHAT THIS GUARANTEES
// ---------------------
// 1. HONEST PROVENANCE. Every posting says which board it came from. A
//    posting read from a company's own board is never presented as if it came
//    from a board the platform did not read.
//
// 2. A FAILURE IS NEVER HIDDEN. A source that fails is reported with the
//    reason in `boardErrors`, and when EVERY source fails the search throws
//    instead of answering with an empty list. "The boards are all down" and
//    "no vacancy matched" are different answers, and the candidate is told
//    which one they are looking at.
//
// 3. A BROKEN BOARD DOES NOT BREAK THE SEARCH. The sources are read
//    independently; a board that times out is reported as unread and the
//    postings from the others are still returned.
//
// 4. NOTHING IS DUPLICATED. The same vacancy found on two boards is shown
//    once, keeping the copy that carries the most information.
//
// 5. EACH SOURCE KEEPS ITS OWN CACHE, because they have different lifetimes.

import {
  dedupeLiveJobs,
  filterLiveJobsByKind,
  filterLiveJobsBySource,
  KEY_FREE_JOB_SOURCE_IDS,
  type JobKind,
  type JobSourceId,
  type LiveJob,
} from '../../shared/jobs.ts';
import {
  isJobSearchConfigured,
  JobSearchError,
  searchJobs,
  type JobSearchResult,
} from '../jsearch/client.ts';
import { configuredAtsBoards, searchAtsBoards } from './ats.ts';
import { searchPublicFeeds } from './publicFeeds.ts';

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
  /** Why each board that failed did so, so nothing is silently dropped. */
  boardErrors: Array<{ board: string; message: string }>;
}

/** The label the provider's own quota belongs to. */
const PROVIDER_BOARD_LABEL = 'JSearch';

/** The boards the aggregated provider can return a posting for. */
const PROVIDER_SOURCE_IDS = new Set<JobSourceId>([
  'google_jobs',
  'indeed',
  'ziprecruiter',
  'handshake',
  'wonderin',
]);

/** Whether a source list still wants something from a given group of boards. */
function wantsAny(requested: JobSourceId[], sources: ReadonlySet<JobSourceId>): boolean {
  if (!requested.length) return true;
  return requested.some((source) => sources.has(source));
}

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
 * When the provider last refused for quota reasons, and why.
 *
 * A subscription that has spent its month answers 429 to every request until
 * the month resets. Calling it again on every search spends a round trip to be
 * told the same thing, and it slows every search down. So a rate-limit answer
 * is remembered for as long as the provider said to wait, and the reason is
 * reported without a call in between.
 */
let providerBlockedUntil = 0;
let providerBlockedReason: string | null = null;

/** How long to wait after a rate-limit answer that named no delay. */
const PROVIDER_DEFAULT_BLOCK_MS = 5 * 60 * 1000;

/** A one-sentence account of a provider failure, for the interface. */
function providerFailureMessage(error: unknown): string {
  if (error instanceof JobSearchError) return error.message;
  if (error instanceof Error) return error.message.slice(0, 200);
  return 'The aggregated job provider could not be read.';
}

/**
 * Searches every board the platform reads.
 *
 * The provider is asked for the postings the candidate asked for. The key-free
 * feeds and the configured company boards are read whole — they have no query
 * parameter — so the candidate's filters are applied to their records in this
 * process.
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
    providerConfigured && wantsAny(requestedSources, PROVIDER_SOURCE_IDS);
  const wantsPublicFeeds = wantsAny(
    requestedSources,
    new Set<JobSourceId>(KEY_FREE_JOB_SOURCE_IDS)
  );
  const wantsAtsBoards = boards.length > 0 && (!requestedSources.length || requestedSources.includes('company_careers'));

  const kind = (rawParams.kind as JobKind) ?? 'all';

  // Every source is read independently. A failure is captured with its own
  // reason rather than collapsed into an empty list.
  const providerBlockedFor = providerBlockedUntil - Date.now();

  const providerPromise: Promise<{
    result: JobSearchResult | null;
    error: string | null;
  }> = !wantsProvider
    ? Promise.resolve({ result: null, error: null })
    : providerBlockedFor > 0
      ? Promise.resolve({
          result: null,
          error:
            providerBlockedReason ??
            'The aggregated job provider is resting after a rate limit.',
        })
      : searchJobs(rawParams, options)
          .then((result) => {
            providerBlockedUntil = 0;
            providerBlockedReason = null;
            return { result, error: null };
          })
          .catch((error: unknown) => {
            if (error instanceof JobSearchError && error.code === 'rate_limited') {
              const waitMs = (error.retryAfterSeconds ?? PROVIDER_DEFAULT_BLOCK_MS / 1000) * 1000;
              providerBlockedUntil = Date.now() + Math.max(waitMs, 60_000);
              providerBlockedReason = error.message;
            }
            return { result: null, error: providerFailureMessage(error) };
          });

  const atsPromise = wantsAtsBoards
    ? searchAtsBoards(boards)
        .then((result) => ({ result, error: null as string | null }))
        .catch((error: unknown) => ({
          result: null,
          error: error instanceof Error ? error.message.slice(0, 200) : 'The company boards could not be read.',
        }))
    : Promise.resolve({ result: null, error: null as string | null });

  // The key-free feeds are read whenever the candidate has not restricted the
  // search to the paid provider's boards: they are the source that does not
  // depend on a paid quota, and they are what makes the screen useful when
  // the provider cannot answer.
  const publicPromise = wantsPublicFeeds
    ? searchPublicFeeds(rawParams)
        .then((result) => ({ result, error: null as string | null }))
        .catch((error: unknown) => ({
          result: null,
          error: error instanceof Error ? error.message.slice(0, 200) : 'The public job boards could not be read.',
        }))
    : Promise.resolve({ result: null, error: null as string | null });

  const [provider, ats, publicFeeds] = await Promise.all([
    providerPromise,
    atsPromise,
    publicPromise,
  ]);

  const providerResult = provider.result;
  const providerFailure = provider.error;
  const providerJobs = providerResult?.jobs ?? [];
  const atsJobs = ats.result?.jobs ?? [];
  const publicJobs = filterLiveJobsBySource(publicFeeds.result?.jobs ?? [], requestedSources);

  // The company boards are read whole — a company board has no query
  // parameter — so the candidate's own filters are applied here.
  const filteredAts = filterLiveJobsBySource(
    filterLiveJobsByKind(atsJobs, kind),
    requestedSources
  );

  const jobs = dedupeLiveJobs(
    preferRicherCopy([...providerJobs, ...publicJobs, ...filteredAts])
  );

  const boardsRead = [
    ...(providerResult ? readBoardLabels(providerResult) : []),
    ...(publicFeeds.result?.boardsRead ?? []),
    ...(ats.result?.boardsRead ?? []),
  ];
  const boardsFailed = [
    ...(providerFailure ? [PROVIDER_BOARD_LABEL] : []),
    ...(publicFeeds.result?.boardsFailed ?? []),
    ...(ats.result?.boardsFailed ?? []),
  ];
  const boardErrors = [
    ...(providerFailure ? [{ board: PROVIDER_BOARD_LABEL, message: providerFailure }] : []),
    ...(publicFeeds.result?.boardErrors ?? []),
    ...(publicFeeds.error ? [{ board: 'Public job boards', message: publicFeeds.error }] : []),
    ...(ats.error ? [{ board: 'Company careers pages', message: ats.error }] : []),
  ];

  const fetchedAt =
    [
      providerResult?.fetchedAt,
      publicFeeds.result?.fetchedAt,
      ats.result?.fetchedAt,
    ]
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() ?? new Date().toISOString();

  // Nothing at all answered and everything that was asked failed. Answering
  // with an empty list here would tell the candidate "there are no jobs",
  // which is not what happened. The first real reason is carried up so the
  // screen can name it.
  const everySourceFailed =
    boardsRead.length === 0 &&
    boardErrors.length > 0 &&
    providerJobs.length === 0 &&
    publicJobs.length === 0 &&
    atsJobs.length === 0;

  if (everySourceFailed) {
    throw new JobSearchError(
      'upstream_unavailable',
      'The job boards could not be read right now.',
      502
    );
  }

  return {
    jobs,
    quota: providerResult?.quota ?? { limit: null, remaining: null },
    cached: providerResult?.cached ?? false,
    fetchedAt,
    boardsRead,
    boardsFailed,
    boardErrors,
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
