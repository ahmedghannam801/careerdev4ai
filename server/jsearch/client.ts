/**
 * The job provider client.
 *
 * JSearch is an aggregate over public job boards. It is reached over HTTPS
 * from the server only, so the credential never reaches the browser bundle and
 * never appears in a client-side log.
 *
 * Responsibilities kept here rather than in the route:
 *   - reading the credential and never echoing it;
 *   - asking the provider for exactly the vocabulary it documents;
 *   - caching, so a repeated search does not spend quota;
 *   - turning the provider's failures into states the product can explain.
 */

import {
  buildJobSearchQuery,
  dedupeLiveJobs,
  normalizeLiveJob,
  type JobSearchQuery,
  type LiveJob,
} from '../../shared/jobs.ts';

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

const PROVIDER_HOST = 'jsearch.p.rapidapi.com';
const PROVIDER_BASE = `https://${PROVIDER_HOST}`;

/** How long a search result stays usable before it is fetched again. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** How many searches are kept in memory at once. */
const CACHE_MAX_ENTRIES = 100;

/** How long a single upstream request may take. */
const REQUEST_TIMEOUT_MS = 12_000;

/**
 * The provider credential.
 *
 * The two names are the same credential: the platform's provider account was
 * supplied under both a service-specific name and the generic RapidAPI name.
 * There is only one RapidAPI subscription, so one key serves every endpoint of
 * that account. The service-specific name wins when both are present.
 */
export function getProviderKey(): string | null {
  const specific = (process.env.JSEARCH_RAPIDAPI_KEY ?? '').trim();
  if (specific) return specific;
  const generic = (process.env.RAPIDAPI_KEY ?? '').trim();
  if (generic) return generic;
  return null;
}

/** True when the server can reach the provider. */
export function isJobSearchConfigured(): boolean {
  return getProviderKey() !== null;
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/** Why a search could not be completed. */
export type JobSearchErrorCode =
  | 'not_configured'
  | 'invalid_credential'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'bad_response';

/** A failure the product can explain to the user. */
export class JobSearchError extends Error {
  readonly code: JobSearchErrorCode;
  /** The HTTP status the API should answer with. */
  readonly status: number;
  /** How long to wait before retrying, in seconds. */
  readonly retryAfterSeconds: number | null;

  constructor(
    code: JobSearchErrorCode,
    message: string,
    status: number,
    retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = 'JobSearchError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds =
      typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? Math.ceil(retryAfterSeconds)
        : null;
  }
}

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/** What the provider's quota looks like right now. */
export interface ProviderQuota {
  /** The provider's request budget for the window, when it reported one. */
  limit: number | null;
  /** The requests left in the window, when the provider reported one. */
  remaining: number | null;
}

/** One search, as the product uses it. */
export interface JobSearchResult {
  jobs: LiveJob[];
  /** The provider's own cursor for the next page, when it sent one. */
  cursor: string | null;
  quota: ProviderQuota;
  /** True when this answer came from the cache. */
  cached: boolean;
}

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

interface CacheEntry {
  expiresAt: number;
  value: JobSearchResult;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(query: JobSearchQuery): string {
  return JSON.stringify([
    query.query.toLowerCase(),
    query.location ?? '',
    query.country,
    query.language ?? '',
    query.datePosted,
    query.remoteOnly,
    [...query.employmentTypes].sort().join(','),
    [...query.requirements].sort().join(','),
    query.page,
    query.numPages,
  ]);
}

function readCache(key: string): JobSearchResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return { ...entry.value, cached: true };
}

function writeCache(key: string, value: JobSearchResult): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

/** Empties the cache. Used by the tests. */
export function clearJobSearchCache(): void {
  cache.clear();
}

/* -------------------------------------------------------------------------- */
/* The upstream call                                                           */
/* -------------------------------------------------------------------------- */

function buildRequestUrl(query: JobSearchQuery): string {
  const url = new URL(`${PROVIDER_BASE}/search`);
  url.searchParams.set('query', query.query);
  url.searchParams.set('country', query.country);
  url.searchParams.set('num_pages', String(query.numPages));
  url.searchParams.set('page', String(query.page));
  url.searchParams.set('date_posted', query.datePosted);
  if (query.location) url.searchParams.set('location', query.location);
  if (query.language) url.searchParams.set('language', query.language);
  if (query.remoteOnly) url.searchParams.set('work_from_home', 'true');
  if (query.employmentTypes.length) {
    url.searchParams.set('employment_types', query.employmentTypes.join(','));
  }
  if (query.requirements.length) {
    url.searchParams.set('job_requirements', query.requirements.join(','));
  }
  return url.toString();
}

function readQuota(headers: Headers): ProviderQuota {
  const read = (name: string): number | null => {
    const raw = headers.get(name);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    limit: read('x-ratelimit-requests-limit'),
    remaining: read('x-ratelimit-requests-remaining'),
  };
}

function readRetryAfter(headers: Headers): number | null {
  const raw = headers.get('retry-after');
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed)) return parsed;
  const asDate = Date.parse(raw);
  if (Number.isNaN(asDate)) return null;
  return Math.max(0, Math.round((asDate - Date.now()) / 1000));
}

async function fetchProvider(url: string): Promise<Response> {
  const key = getProviderKey();
  if (!key) {
    throw new JobSearchError(
      'not_configured',
      'Live job search is not configured on this server.',
      503
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': PROVIDER_HOST,
        accept: 'application/json',
      },
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new JobSearchError(
        'upstream_timeout',
        'The job provider did not answer in time.',
        504
      );
    }
    throw new JobSearchError(
      'upstream_unavailable',
      'The job provider could not be reached.',
      502
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Reads the provider's payload, refusing anything that is not an object. */
async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new JobSearchError(
      'bad_response',
      'The job provider returned a response that could not be read.',
      502
    );
  }
}

/** Reads the job array out of the provider's payload. */
function readJobs(payload: Record<string, unknown>): unknown[] {
  const data = payload.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const jobs = (data as Record<string, unknown>).jobs;
    if (Array.isArray(jobs)) return jobs;
  }
  return [];
}

function readCursor(payload: Record<string, unknown>): string | null {
  const data = payload.data;
  if (data && typeof data === 'object') {
    const cursor = (data as Record<string, unknown>).cursor;
    if (typeof cursor === 'string' && cursor.trim()) return cursor.trim();
  }
  return null;
}

/**
 * Searches the provider.
 *
 * The caller's raw query parameters are validated first, so only the
 * provider's own vocabulary ever reaches the upstream request.
 */
export async function searchJobs(
  rawParams: Record<string, unknown>,
  options: { bypassCache?: boolean } = {}
): Promise<JobSearchResult> {
  const query = buildJobSearchQuery(rawParams);
  const key = cacheKey(query);

  if (!options.bypassCache) {
    const cached = readCache(key);
    if (cached) return cached;
  }

  const response = await fetchProvider(buildRequestUrl(query));
  const quota = readQuota(response.headers);

  if (response.status === 401 || response.status === 403) {
    throw new JobSearchError(
      'invalid_credential',
      'The job provider rejected this server credential.',
      502
    );
  }

  if (response.status === 429) {
    throw new JobSearchError(
      'rate_limited',
      'The job provider is rate limiting this server.',
      429,
      readRetryAfter(response.headers)
    );
  }

  if (response.status >= 500) {
    throw new JobSearchError(
      'upstream_unavailable',
      'The job provider is temporarily unavailable.',
      502
    );
  }

  if (!response.ok) {
    throw new JobSearchError(
      'bad_response',
      'The job provider rejected the request.',
      502
    );
  }

  const payload = await readJson(response);

  // The provider answers with status "ERROR" and a 200 when it rejects the
  // request on its own rules, so the body has to be inspected as well.
  if (typeof payload.status === 'string' && payload.status.toUpperCase() === 'ERROR') {
    const data = payload.data as Record<string, unknown> | undefined;
    const error = data?.error as Record<string, unknown> | undefined;
    const providerMessage = typeof error?.message === 'string' ? error.message : '';
    const providerCode = typeof error?.code === 'string' ? error.code : '';
    const lower = `${providerMessage} ${providerCode}`.toLowerCase();
    if (lower.includes('rate') || lower.includes('quota') || lower.includes('429')) {
      throw new JobSearchError(
        'rate_limited',
        'The job provider is rate limiting this server.',
        429
      );
    }
    throw new JobSearchError(
      'bad_response',
      providerMessage
        ? `The job provider rejected the request: ${providerMessage}`
        : 'The job provider rejected the request.',
      502
    );
  }

  const now = new Date();
  const jobs = dedupeLiveJobs(
    readJobs(payload)
      .map((entry) => normalizeLiveJob(entry, now))
      .filter((job): job is LiveJob => job !== null)
  );

  const result: JobSearchResult = {
    jobs,
    cursor: readCursor(payload),
    quota,
    cached: false,
  };

  writeCache(key, result);
  return result;
}

/**
 * Fetches one vacancy by the provider's identifier.
 *
 * The provider answers 404 for an identifier it does not know, which is an
 * ordinary outcome rather than a failure.
 */
export async function getJobDetails(jobId: string): Promise<LiveJob | null> {
  const id = jobId.trim();
  if (!id || id.length > 120) return null;

  const key = getProviderKey();
  if (!key) {
    throw new JobSearchError(
      'not_configured',
      'Live job search is not configured on this server.',
      503
    );
  }

  const url = new URL(`${PROVIDER_BASE}/job-details`);
  url.searchParams.set('job_id', id);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': PROVIDER_HOST,
        accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new JobSearchError(
        'upstream_timeout',
        'The job provider did not answer in time.',
        504
      );
    }
    throw new JobSearchError(
      'upstream_unavailable',
      'The job provider could not be reached.',
      502
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) return null;

  if (response.status === 401 || response.status === 403) {
    throw new JobSearchError(
      'invalid_credential',
      'The job provider rejected this server credential.',
      502
    );
  }

  if (response.status === 429) {
    throw new JobSearchError(
      'rate_limited',
      'The job provider is rate limiting this server.',
      429,
      readRetryAfter(response.headers)
    );
  }

  if (!response.ok) {
    throw new JobSearchError(
      'upstream_unavailable',
      'The job provider is temporarily unavailable.',
      502
    );
  }

  const payload = await readJson(response);
  const data = payload.data;
  const record = Array.isArray(data) ? data[0] : (data as Record<string, unknown> | undefined)?.job;

  return normalizeLiveJob(record, new Date());
}
