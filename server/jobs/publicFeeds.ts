// The vacancies the platform reads for itself.
//
// WHY THIS EXISTS
// ---------------
// The aggregated provider the platform buys (JSearch on RapidAPI) is sold as a
// monthly number of requests. When that number is spent the subscription
// answers 429 until the month resets, and the product used to fall silent: the
// search route swallowed the provider failure and answered with an empty list,
// which the interface honestly showed as "no openings matched this search".
// A candidate cannot tell "there are no jobs" from "the account is out of
// quota", and that is the wrong thing to be ambiguous about.
//
// So the platform also reads the boards that publish a documented, public,
// key-free JSON feed:
//
//   * Remotive        https://remotive.com/api/remote-jobs
//   * Arbeitnow       https://www.arbeitnow.com/api/job-board-api
//   * Jobicy          https://jobicy.com/api/v2/remote-jobs
//   * Himalayas       https://himalayas.app/jobs/api
//   * Remote OK       https://remoteok.com/api
//
// These are the boards' own sanctioned feeds, polled politely, identified by a
// real user agent, cached, and read concurrently. No scraping, no proxy
// rotation, no CAPTCHA bypass. Every field a posting carries is the field the
// board stated; nothing is completed with a guess.
//
// WHAT A CANDIDATE SEES
// ---------------------
// One merged list. Each posting says which board it came from, because
// `LiveJob.source` is set from the board that was really read — a Remotive
// posting is never presented as if it came from Indeed.
//
// HOW THE FILTERS WORK HERE
// -------------------------
// These feeds answer with a whole remote-first catalogue rather than with an
// answer to a query, so the candidate's own filters are applied here:
//
//   * the query is matched against the title, the tags and the description;
//   * the kind (job / internship) and the remote filter are applied exactly;
//   * the date filter is applied to the date the board stated;
//   * the location filter is applied softly, because these boards publish
//     remote roles whose location is a restriction note ("USA only") rather
//     than a place of work — a posting open anywhere, or with no location
//     stated, still matches.
//
// The country filter is deliberately NOT applied to these boards. Their geo
// field is free text written by the employer ("EMEA", "USA only", "Anywhere"),
// and treating it as a country code would hide roles a candidate can do
// remotely. The restriction is shown on the card instead, in the employer's
// own words, which is more honest than a filter that silently drops them.

import {
  filterLiveJobsByKind,
  normalizeLiveJob,
  readJobKind,
  type JobKind,
  type JobSourceId,
  type LiveJob,
} from '../../shared/jobs.ts';
import { toPlainText } from './ats.ts';

/* -------------------------------------------------------------------------- */
/* The boards                                                                  */
/* -------------------------------------------------------------------------- */

/** How long one feed stays usable before it is fetched again. */
const FEED_TTL_MS = 10 * 60 * 1000;

/** How long one feed may take before it is given up on. */
const FEED_TIMEOUT_MS = 6_000;

/** How many feeds are read at the same time. */
const FEED_CONCURRENCY = 5;

/**
 * How many postings one board may contribute to a single search.
 *
 * A board publishes its whole catalogue, and every posting on it is a real
 * vacancy. The cap is not a judgement about the vacancies: it is what keeps one
 * board from filling the screen with four hundred cards, which is both an
 * unusable list and an expensive one to render. The newest postings are kept,
 * because a candidate is looking for something they can still apply to.
 */
const MAX_POSTINGS_PER_BOARD = 20;

/** The platform identifies itself to the boards it reads. */
const USER_AGENT =
  'Mozilla/5.0 (compatible; Aionvia/1.0; +https://aionvia.pages.dev; job-board-aggregator)';

/** One posting, as a board stated it, before it becomes a `LiveJob`. */
interface RawPosting {
  id: string;
  title: string;
  company: string;
  location: string | null;
  isRemote: boolean | null;
  employmentType: string | null;
  postedAt: string | null;
  description: string | null;
  url: string | null;
  applyUrl: string | null;
  logoUrl: string | null;
  salary: string | null;
  skills: string[];
}

/** A board the platform reads directly. */
interface PublicFeed {
  id: JobSourceId;
  label: string;
  url: string;
  /** Turns the board's payload into postings, or an empty list. */
  read: (payload: unknown) => RawPosting[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => text(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 40);
}

/** Reads an ISO date, or an epoch date, into an ISO string. */
function isoDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // A ten-digit number is seconds; thirteen digits is milliseconds.
    const millis = value < 1e12 ? value * 1000 : value;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/** Builds the salary sentence a board implied, when it stated a range. */
function salaryRange(
  min: unknown,
  max: unknown,
  currency: unknown,
  period: unknown
): string | null {
  const low = typeof min === 'number' && min > 0 ? Math.round(min) : null;
  const high = typeof max === 'number' && max > 0 ? Math.round(max) : null;
  if (low === null && high === null) return null;
  const code = text(currency) ?? '';
  const unit = text(period) ?? '';
  const amount =
    low !== null && high !== null && low !== high
      ? `${low.toLocaleString('en-GB')} – ${high.toLocaleString('en-GB')}`
      : `${(low ?? high)!.toLocaleString('en-GB')}`;
  return [code, amount, unit].filter(Boolean).join(' ').trim();
}

/* -------------------------------------------------------------------------- */
/* Reading each board                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Remotive answers `{ jobs: [...] }`.
 *
 * `job_type` is written as a slug ("full_time", "contract"), which is turned
 * into the wording the rest of the platform already understands.
 */
function readRemotive(payload: unknown): RawPosting[] {
  const root = record(payload);
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];
  const postings: RawPosting[] = [];

  for (const entry of jobs) {
    const job = record(entry);
    if (!job) continue;
    const title = text(job.title);
    const company = text(job.company_name);
    if (!title || !company) continue;

    const type = text(job.job_type);
    postings.push({
      id: text(job.id) ?? text(job.url) ?? '',
      title,
      company,
      location: text(job.candidate_required_location),
      // The board is remote-first; a posting with no restriction is open
      // anywhere, and a restricted one is still a remote role.
      isRemote: true,
      employmentType: type ? type.replace(/_/g, ' ') : null,
      postedAt: isoDate(job.publication_date),
      description: text(job.description) ? toPlainText(String(job.description)) : null,
      url: text(job.url),
      applyUrl: text(job.url),
      logoUrl: text(job.company_logo),
      salary: text(job.salary),
      skills: textList(job.tags),
    });
  }

  return postings;
}

/**
 * Arbeitnow answers `{ data: [...] }`.
 *
 * `created_at` is an epoch in seconds and `remote` is a boolean. The feed is
 * Europe-heavy, so the location is the city the board stated.
 */
function readArbeitnow(payload: unknown): RawPosting[] {
  const root = record(payload);
  const jobs = Array.isArray(root?.data) ? root.data : [];
  const postings: RawPosting[] = [];

  for (const entry of jobs) {
    const job = record(entry);
    if (!job) continue;
    const title = text(job.title);
    const company = text(job.company_name);
    if (!title || !company) continue;
    const url = text(job.url);

    const types = textList(job.job_types);
    postings.push({
      id: text(job.slug) ?? url ?? '',
      title,
      company,
      location: text(job.location),
      isRemote: job.remote === true ? true : job.remote === false ? false : null,
      employmentType: types.length ? types.join(', ') : null,
      postedAt: isoDate(job.created_at),
      description: text(job.description) ? toPlainText(String(job.description)) : null,
      url,
      applyUrl: url,
      logoUrl: null,
      salary: null,
      skills: textList(job.tags),
    });
  }

  return postings;
}

/** Jobicy answers `{ jobs: [...] }`. */
function readJobicy(payload: unknown): RawPosting[] {
  const root = record(payload);
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];
  const postings: RawPosting[] = [];

  for (const entry of jobs) {
    const job = record(entry);
    if (!job) continue;
    const title = text(job.jobTitle);
    const company = text(job.companyName);
    if (!title || !company) continue;
    const url = text(job.url);

    const types = textList(job.jobType);
    postings.push({
      id: text(job.id) ?? url ?? '',
      title,
      company,
      location: text(job.jobGeo),
      isRemote: true,
      employmentType: types.length ? types.join(', ') : null,
      postedAt: isoDate(job.pubDate),
      description: text(job.jobDescription)
        ? toPlainText(String(job.jobDescription))
        : text(job.jobExcerpt),
      url,
      applyUrl: url,
      logoUrl: text(job.companyLogo),
      salary: salaryRange(job.annualSalaryMin, job.annualSalaryMax, job.salaryCurrency, 'per year'),
      skills: [...textList(job.jobIndustry), ...textList(job.jobLevel)].slice(0, 40),
    });
  }

  return postings;
}

/** Himalayas answers `{ jobs: [...] }`. */
function readHimalayas(payload: unknown): RawPosting[] {
  const root = record(payload);
  const jobs = Array.isArray(root?.jobs) ? root.jobs : [];
  const postings: RawPosting[] = [];

  for (const entry of jobs) {
    const job = record(entry);
    if (!job) continue;
    const title = text(job.title);
    const company = text(job.companyName);
    if (!title || !company) continue;
    const url = text(job.guid) ?? text(job.applicationLink);
    const restrictions = textList(job.locationRestrictions);

    postings.push({
      id: text(job.guid) ?? url ?? '',
      title,
      company,
      location: restrictions.length ? restrictions.join(', ') : null,
      isRemote: true,
      employmentType: text(job.employmentType),
      postedAt: isoDate(job.pubDate),
      description: text(job.description) ? toPlainText(String(job.description)) : text(job.excerpt),
      url,
      applyUrl: text(job.applicationLink) ?? url,
      logoUrl: text(job.companyLogo),
      salary: salaryRange(job.minSalary, job.maxSalary, job.currency, job.salaryPeriod),
      skills: [...textList(job.categories), ...textList(job.seniority)].slice(0, 40),
    });
  }

  return postings;
}

/**
 * Remote OK answers a bare array whose first element is the licence notice.
 *
 * The notice is not a posting: it has no title and no employer, and it is
 * skipped by the same check every other board's records go through.
 */
function readRemoteOk(payload: unknown): RawPosting[] {
  const jobs = Array.isArray(payload) ? payload : [];
  const postings: RawPosting[] = [];

  for (const entry of jobs) {
    const job = record(entry);
    if (!job) continue;
    const title = text(job.position);
    const company = text(job.company);
    if (!title || !company) continue;
    const url = text(job.url);

    const min = typeof job.salary_min === 'number' && job.salary_min > 0 ? job.salary_min : null;
    const max = typeof job.salary_max === 'number' && job.salary_max > 0 ? job.salary_max : null;

    postings.push({
      id: text(job.id) ?? text(job.slug) ?? url ?? '',
      title,
      company,
      location: text(job.location),
      isRemote: true,
      employmentType: null,
      postedAt: isoDate(job.date) ?? isoDate(job.epoch),
      description: text(job.description) ? toPlainText(String(job.description)) : null,
      url,
      applyUrl: text(job.apply_url) ?? url,
      logoUrl: text(job.company_logo) ?? text(job.logo),
      salary: salaryRange(min, max, 'USD', 'per year'),
      skills: textList(job.tags),
    });
  }

  return postings;
}

/**
 * The boards, newest first.
 *
 * Order is not cosmetic: it decides which copy of a duplicated vacancy wins a
 * tie, and the boards at the top state the most complete description.
 */
const FEEDS: PublicFeed[] = [
  {
    id: 'remotive',
    label: 'Remotive',
    url: 'https://remotive.com/api/remote-jobs?limit=200',
    read: readRemotive,
  },
  {
    id: 'jobicy',
    label: 'Jobicy',
    url: 'https://jobicy.com/api/v2/remote-jobs?count=50',
    read: readJobicy,
  },
  {
    id: 'himalayas',
    label: 'Himalayas',
    url: 'https://himalayas.app/jobs/api?limit=50',
    read: readHimalayas,
  },
  {
    id: 'remoteok',
    label: 'Remote OK',
    url: 'https://remoteok.com/api',
    read: readRemoteOk,
  },
  {
    id: 'arbeitnow',
    label: 'Arbeitnow',
    url: 'https://www.arbeitnow.com/api/job-board-api',
    read: readArbeitnow,
  },
];

/* -------------------------------------------------------------------------- */
/* Cache                                                                       */
/* -------------------------------------------------------------------------- */

interface FeedCacheEntry {
  expiresAt: number;
  postings: RawPosting[];
  fetchedAt: string;
}

const cache = new Map<string, FeedCacheEntry>();

/** Empties the cache. Used by the tests. */
export function clearPublicFeedCache(): void {
  cache.clear();
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** Reads one board's JSON, or explains why it could not. */
async function readFeed(
  feed: PublicFeed
): Promise<{ postings: RawPosting[]; fetchedAt: string; error: string | null }> {
  const cached = cache.get(feed.id);
  if (cached && cached.expiresAt > Date.now()) {
    return { postings: cached.postings, fetchedAt: cached.fetchedAt, error: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);

  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      return {
        postings: [],
        fetchedAt: new Date().toISOString(),
        error: `${feed.label} answered ${response.status}`,
      };
    }

    const payload = (await response.json()) as unknown;
    const postings = feed.read(payload);
    const fetchedAt = new Date().toISOString();

    cache.set(feed.id, { expiresAt: Date.now() + FEED_TTL_MS, postings, fetchedAt });
    return { postings, fetchedAt, error: null };
  } catch (error) {
    const aborted = (error as { name?: string } | null)?.name === 'AbortError';
    return {
      postings: [],
      fetchedAt: new Date().toISOString(),
      error: aborted ? `${feed.label} did not answer in time` : `${feed.label} could not be reached`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** What one read of the key-free boards found. */
export interface PublicFeedSearchResult {
  jobs: LiveJob[];
  /** The boards that answered with at least one usable posting. */
  boardsRead: string[];
  /** The boards that could not be read, and why. */
  boardsFailed: string[];
  /** The failure of each board that could not be read. */
  boardErrors: Array<{ board: string; message: string }>;
  /** When the freshest board was read. */
  fetchedAt: string;
  /** True when every board that was asked answered. */
  allBoardsAnswered: boolean;
}

/** The filters the candidate asked for, applied to a whole catalogue. */
interface FeedFilters {
  query: string;
  location: string;
  datePosted: string;
  remoteOnly: boolean;
  /** Jobs, internships, or everything. */
  kind: JobKind;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back a date filter reaches. `all` reaches back forever. */
const DATE_WINDOW_MS: Record<string, number | null> = {
  today: 1 * DAY_MS,
  '3days': 3 * DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  all: null,
};

/** Splits a query into the words a posting has to contain. */
function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.\s-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, 8);
}

/**
 * Whether a posting answers the candidate's query.
 *
 * A short query has to be answered in full; a longer one is answered when most
 * of its words appear, because a candidate typing "junior data analyst" is
 * describing one role rather than demanding those three words in that order.
 * The words are matched against what the board stated — the title, the
 * employer, the tags and the posting's own text — and nothing is inferred.
 */
function matchesQuery(posting: RawPosting, words: string[]): boolean {
  if (words.length === 0) return true;
  const haystack = [
    posting.title,
    posting.company,
    posting.location ?? '',
    posting.employmentType ?? '',
    posting.skills.join(' '),
    (posting.description ?? '').slice(0, 4_000),
  ]
    .join(' ')
    .toLowerCase();
  const hits = words.filter((word) => haystack.includes(word)).length;
  const needed = Math.max(1, Math.ceil(words.length * 0.6));
  return hits >= needed;
}

/** Whether a posting is inside the date window the candidate asked for. */
function matchesDate(posting: RawPosting, datePosted: string): boolean {
  const window = DATE_WINDOW_MS[datePosted] ?? null;
  if (window === null) return true;
  // A posting with no stated date is not old: the board simply did not say.
  // Hiding it would drop real, current vacancies on the strength of a field
  // the board never sent.
  if (!posting.postedAt) return true;
  const posted = Date.parse(posting.postedAt);
  if (Number.isNaN(posted)) return true;
  return Date.now() - posted <= window;
}

/** Whether a posting is anywhere near the place the candidate asked for. */
function matchesLocation(posting: RawPosting, location: string): boolean {
  const wanted = location.trim().toLowerCase();
  if (!wanted) return true;
  const stated = (posting.location ?? '').toLowerCase();
  // The boards publish remote roles, whose location is a restriction note.
  // A posting open anywhere, or with no note at all, is a legitimate match.
  if (!stated) return true;
  if (stated.includes(wanted)) return true;
  return /\b(anywhere|worldwide|global|remote)\b/.test(stated);
}

/** Turns one board's postings into the platform's own vacancy shape. */
function toLiveJobs(
  feed: PublicFeed,
  postings: RawPosting[],
  filters: FeedFilters
): LiveJob[] {
  const words = queryWords(filters.query);
  const jobs: LiveJob[] = [];

  for (const posting of postings) {
    if (!matchesQuery(posting, words)) continue;
    if (!matchesDate(posting, filters.datePosted)) continue;
    if (filters.remoteOnly && posting.isRemote !== true) continue;
    if (!matchesLocation(posting, filters.location)) continue;

    const live = normalizeLiveJob({
      job_id: `${feed.id}:${posting.id || posting.url || posting.title}`,
      job_title: posting.title,
      employer_name: posting.company,
      job_location: posting.location,
      job_is_remote: posting.isRemote,
      job_employment_type: posting.employmentType,
      job_posted_at: posting.postedAt,
      job_description: posting.description,
      job_url: posting.url,
      job_apply_link: posting.applyUrl,
      job_company_logo: posting.logoUrl,
      job_salary: posting.salary,
      // The board's tags are search keywords, not the skills the employer
      // asked for. Handing them to the matcher would score a candidate against
      // words like "Remote" or "Senior", so the skills are left to the
      // platform's own extractor, which reads the posting's text against the
      // catalogue and states that provenance.
      // The board the posting was really read from, said explicitly rather
      // than guessed from the text.
      job_publisher: feed.label,
      job_source: feed.id,
    });

    // A record without an id, a title and an employer cannot be shown
    // honestly, so it is dropped rather than completed with placeholders.
    if (!live) continue;
    jobs.push(live);
  }

  // One board may state the same vacancy once per country it is open to; a
  // candidate is looking at vacancies, not at rows. The newest are kept, so
  // the cap removes the oldest postings rather than an arbitrary slice.
  return dedupeAcrossBoards(jobs)
    .sort((a, b) => {
      const left = a.postedAt ? Date.parse(a.postedAt) : 0;
      const right = b.postedAt ? Date.parse(b.postedAt) : 0;
      return right - left;
    })
    .slice(0, MAX_POSTINGS_PER_BOARD);
}

/**
 * Removes the same vacancy stated once per country.
 *
 * Himalayas publishes a remote posting once for every country it is open to,
 * with the same title and the same employer and a different restricted
 * location on each copy. Five cards for one vacancy is not five vacancies, so
 * the copies are collapsed on title + employer, keeping the copy that states
 * the most about itself. A posting with a different employer or a different
 * title is a different vacancy and is kept.
 */
function dedupeAcrossBoards(jobs: LiveJob[]): LiveJob[] {
  const byKey = new Map<string, LiveJob>();
  const order: string[] = [];

  for (const job of jobs) {
    const key = [job.title, job.company]
      .map((part) => part.toLowerCase().replace(/\s+/g, ' ').trim())
      .join('|');
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, job);
      order.push(key);
      continue;
    }
    // Keep whichever copy says more: a longer description is a better card,
    // and the location is a restriction note either way.
    const existingWeight = (existing.description ?? '').length + (existing.location ? 20 : 0);
    const candidateWeight = (job.description ?? '').length + (job.location ? 20 : 0);
    if (candidateWeight > existingWeight) byKey.set(key, job);
  }

  return order.map((key) => byKey.get(key)!);
}

/** Reads `tasks` with a cap on how many are in flight at once. */
async function withConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Reads every key-free board and applies the candidate's filters.
 *
 * A board that cannot be read is named in `boardsFailed` with the reason, so a
 * shorter list is never presented as a complete one. `allBoardsAnswered` tells
 * the caller whether it is worth offering a retry.
 */
export async function searchPublicFeeds(
  rawParams: Record<string, unknown>
): Promise<PublicFeedSearchResult> {
  const filters: FeedFilters = {
    query: typeof rawParams.query === 'string' ? rawParams.query : '',
    location: typeof rawParams.location === 'string' ? rawParams.location : '',
    datePosted: typeof rawParams.datePosted === 'string' ? rawParams.datePosted : 'all',
    remoteOnly: rawParams.remoteOnly === true || rawParams.remoteOnly === 'true',
    kind: readJobKind(rawParams.kind),
  };

  const results = await withConcurrency(
    FEEDS.map((feed) => async () => ({ feed, ...(await readFeed(feed)) })),
    FEED_CONCURRENCY
  );

  const jobs: LiveJob[] = [];
  const boardsRead: string[] = [];
  const boardsFailed: string[] = [];
  const boardErrors: Array<{ board: string; message: string }> = [];
  const timestamps: string[] = [];
  let allBoardsAnswered = true;

  for (const result of results) {
    if (result.error) {
      allBoardsAnswered = false;
      boardsFailed.push(result.feed.label);
      boardErrors.push({ board: result.feed.label, message: result.error });
      continue;
    }

    timestamps.push(result.fetchedAt);
    const found = toLiveJobs(result.feed, result.postings, filters);
    // A board that answered with nothing the candidate asked for is still a
    // board that WAS read: it is reported as read, and the empty result is the
    // honest answer of that board rather than a failure.
    boardsRead.push(result.feed.label);
    jobs.push(...found);
  }

  return {
    // The board's own employment type decides what a posting is, so the kind
    // filter is applied to the record rather than to the request.
    jobs: filterLiveJobsByKind(jobs, filters.kind),
    boardsRead,
    boardsFailed,
    boardErrors,
    fetchedAt: timestamps.sort().pop() ?? new Date().toISOString(),
    allBoardsAnswered,
  };
}
