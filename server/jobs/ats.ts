// Reading vacancies from a company's own applicant-tracking system.
//
// WHY THIS EXISTS
// ---------------
// The platform buys one aggregated feed (JSearch on RapidAPI). That feed is
// good at breadth but it only reaches postings that a board republished, so a
// vacancy on a company's own careers page is often missing from it.
//
// Every major ATS publishes a documented, public, key-free JSON endpoint for
// exactly this purpose — Greenhouse, Lever and Ashby all do, and they are the
// same endpoints the ATS vendors point job boards at. Reading them is not
// scraping: it is the sanctioned way to read a board.
//
// The architecture follows the fan-out -> canonical record -> dedupe -> filter
// shape that the `job-forager` and `job-board-aggregator` projects converge on.
// No code is taken from either (one has no licence file at all, the other ships
// its datasets under CC BY-NC 4.0, which is not usable in a paid product).
//
// WHAT THIS DOES NOT DO
// ---------------------
// - It does not read any board that forbids it. Only the three official ATS
//   APIs above, on boards a deployment explicitly configures.
// - It does not bypass CAPTCHAs, rotate proxies, or impersonate browsers. The
//   requests are plain, identifiable, and rate-limited.
// - It does not invent a company, a salary or an application link. Every field
//   is `null` when the board did not state it.
//
// The module returns records in the same `LiveJob` shape the rest of the
// platform already uses, so nothing downstream needs to know where a posting
// came from.

import { normalizeLiveJob, type LiveJob } from '../../shared/jobs.ts';

/* -------------------------------------------------------------------------- */
/* The boards                                                                  */
/* -------------------------------------------------------------------------- */

/** Which applicant-tracking system a board runs on. */
export type AtsProvider = 'greenhouse' | 'lever' | 'ashby';

/**
 * One company's careers board.
 *
 * `boardId` is the part of the company's careers URL that identifies it — for
 * example `stripe` in `boards.greenhouse.io/stripe`, or `linear` in
 * `jobs.ashbyhq.com/linear`. It is not a secret: it is printed on the public
 * careers page of every company that uses the ATS.
 */
export interface AtsBoard {
  provider: AtsProvider;
  /** The company's careers-board identifier. */
  boardId: string;
  /** The employer name to show. */
  company: string;
}

const ATS_ENV_VAR = 'JOB_ATS_BOARDS';

/**
 * Parses the board list out of an environment variable.
 *
 * The format is one board per line:
 *
 *     greenhouse:stripe:Stripe
 *     lever:matchgroup:Match Group
 *     ashby:linear:Linear
 *
 * The company name is optional; when it is left out the board id is used.
 * Anything malformed is ignored rather than failing the whole list, so one bad
 * line cannot take the others down.
 */
export function parseAtsBoards(raw: string | null | undefined): AtsBoard[] {
  const text = (raw ?? '').trim();
  if (!text) return [];

  const seen = new Set<string>();
  const boards: AtsBoard[] = [];

  for (const line of text.split(/[\n,]+/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(':').map((part) => part.trim());
    const provider = parts[0]?.toLowerCase();
    if (provider !== 'greenhouse' && provider !== 'lever' && provider !== 'ashby') continue;

    const boardId = parts[1];
    if (!boardId || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(boardId)) continue;

    const key = `${provider}:${boardId.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    boards.push({
      provider,
      boardId,
      company: parts.slice(2).filter(Boolean).join(':') || boardId,
    });
  }

  return boards;
}

/**
 * The boards this deployment reads.
 *
 * Empty when nothing is configured, and then the feature is simply off — the
 * platform does not reach out to anybody.
 */
export function configuredAtsBoards(): AtsBoard[] {
  return parseAtsBoards(process.env[ATS_ENV_VAR]);
}

/** True when at least one company board is configured. */
export function hasConfiguredAtsBoards(): boolean {
  return configuredAtsBoards().length > 0;
}

/* -------------------------------------------------------------------------- */
/* The requests                                                                */
/* -------------------------------------------------------------------------- */

/** How long one board may take before it is given up on. */
const BOARD_TIMEOUT_MS = 8_000;

/** How many boards are read at the same time. */
const BOARD_CONCURRENCY = 4;

/**
 * The platform identifies itself to the boards it reads.
 *
 * These are public, well-behaved APIs that expect to be polled, and a board
 * that wants less traffic can refuse it. Saying who we are is the difference
 * between a well-behaved reader and an anonymous one.
 */
const USER_AGENT =
  'Mozilla/5.0 (compatible; Aionvia/1.0; +https://aionvia.pages.dev; job-board-aggregator)';

/**
 * Reads one board's JSON.
 *
 * Returns `null` for anything that is not a usable answer: a board that has
 * gone away, a board that answers with something unexpected, a board that
 * takes too long. One bad board must never fail the search.
 */
async function readJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BOARD_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Reading the boards                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The fields a posting's description may arrive in.
 *
 * The order matters: a board that states the description as plain text is
 * preferred over one that states it as HTML, because plain text needs no
 * cleaning.
 */
export function descriptionText(record: Record<string, unknown>): string | null {
  for (const key of ['descriptionPlain', 'description', 'content', 'descriptionBody']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return toPlainText(value);
    }
  }
  return null;
}

/**
 * Turns a posting's markup into plain text.
 *
 * THE ORDER IS THE WHOLE POINT
 * ---------------------------
 * The boards do not all send markup the same way. Lever sends real HTML
 * (`<p>text</p>`). Greenhouse sends HTML that has been *escaped* once
 * (`&lt;p&gt;text&lt;/p&gt;`), so the tags are not markup yet — they are text
 * that will become markup if the entities are decoded.
 *
 * Stripping the tags first and decoding the entities afterwards therefore
 * *creates* markup: the stripper sees nothing to remove, and the decoder
 * then writes `<p>` into the text. A posting read that way arrives carrying
 * the very tags the platform meant to remove.
 *
 * So the entities are decoded first and the markup is stripped afterwards.
 * The result is plain text either way, and it is the same plain text
 * whether the board sent real HTML or escaped HTML.
 *
 * The result is plain text, which is what `LiveJob.description` is typed as
 * and what the interface renders as React text. It is never handed to
 * `dangerouslySetInnerHTML`.
 */
function toPlainText(value: string): string {
  // Decoded once, at the start, and never again. Decoding again after the
  // markup has been stripped would turn any surviving `&lt;` back into a `<`
  // and put the shape of a tag back into the text.
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d|tr|div|section)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Decodes the HTML entities a board may have escaped its markup with.
 *
 * Only the entities that can carry markup are decoded, and they are decoded
 * before the markup is stripped. A `&lt;script&gt;` in the source therefore
 * becomes `<script>` and is then removed as a tag, rather than surviving as
 * text that a later step might turn back into markup.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    // `&amp;` is decoded last, and only once. Decoding it earlier would
    // turn `&amp;lt;` into `&lt;`, which a second pass would then turn into a
    // `<` — decoding the same ampersand twice.
    .replace(/&amp;/gi, '&');
}

function firstText(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** A board's posting, before it becomes a `LiveJob`. */
interface RawPosting {
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
  id: string;
}

/** Greenhouse's board endpoint returns `{ jobs: [...] }`. */
function readGreenhouse(payload: unknown, board: AtsBoard): RawPosting[] {
  const record = payload as Record<string, unknown> | null;
  const jobs = Array.isArray(record?.jobs) ? (record?.jobs as Record<string, unknown>[]) : [];
  const postings: RawPosting[] = [];

  for (const job of jobs) {
    if (!job || typeof job !== 'object') continue;
    const title = firstText(job, ['title']);
    const absoluteUrl = firstText(job, ['absolute_url']);
    if (!title || !absoluteUrl) continue;

    const location = job.location as Record<string, unknown> | undefined;
    const departments = Array.isArray(job.departments)
      ? (job.departments as Record<string, unknown>[])
          .map((entry) => firstText(entry, ['name']))
          .filter((entry): entry is string => Boolean(entry))
          .join(', ')
      : null;

    postings.push({
      id: firstText(job, ['id']) ?? absoluteUrl,
      title,
      company: board.company,
      location: firstText(location ?? {}, ['name']),
      isRemote: /remote/i.test(firstText(location ?? {}, ['name']) ?? '') ? true : null,
      employmentType: departments || null,
      postedAt: firstText(job, ['updated_at']),
      description: descriptionText(job),
      url: absoluteUrl,
      applyUrl: firstText(job, ['absolute_url']),
      logoUrl: null,
    });
  }

  return postings;
}

/** Lever's postings endpoint returns a bare array. */
function readLever(payload: unknown, board: AtsBoard): RawPosting[] {
  const jobs = Array.isArray(payload) ? (payload as Record<string, unknown>[]) : [];
  const postings: RawPosting[] = [];

  for (const job of jobs) {
    if (!job || typeof job !== 'object') continue;
    const title = firstText(job, ['text']);
    const hostedUrl = firstText(job, ['hostedUrl']);
    if (!title || !hostedUrl) continue;

    const categories = job.categories as Record<string, unknown> | undefined;
    const commitment = firstText(categories ?? {}, ['commitment']);
    const workplaceType = firstText(job, ['workplaceType']);
    const locations = Array.isArray(categories?.allLocations)
      ? (categories?.allLocations as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : [];

    postings.push({
      id: firstText(job, ['id']) ?? hostedUrl,
      title,
      company: board.company,
      location: firstText(categories ?? {}, ['location']) ?? locations[0] ?? null,
      isRemote: workplaceType ? /remote/i.test(workplaceType) : null,
      employmentType: commitment ?? null,
      postedAt: firstText(job, ['createdAt']),
      description: descriptionText(job),
      url: hostedUrl,
      applyUrl: firstText(job, ['applyUrl']),
      logoUrl: null,
    });
  }

  return postings;
}

/** Ashby's job-board endpoint returns `{ jobs: [...] }`. */
function readAshby(payload: unknown, board: AtsBoard): RawPosting[] {
  const record = payload as Record<string, unknown> | null;
  const jobs = Array.isArray(record?.jobs) ? (record?.jobs as Record<string, unknown>[]) : [];
  const postings: RawPosting[] = [];

  for (const job of jobs) {
    if (!job || typeof job !== 'object') continue;
    const title = firstText(job, ['title']);
    const jobUrl = firstText(job, ['jobUrl']);
    if (!title || !jobUrl) continue;

    const workplaceType = firstText(job, ['workplaceType']);
    const isRemote = job.isRemote === true ? true : workplaceType ? /remote/i.test(workplaceType) : null;

    postings.push({
      id: firstText(job, ['id']) ?? jobUrl,
      title,
      company: board.company,
      location: firstText(job, ['location']),
      isRemote,
      employmentType: firstText(job, ['employmentType']),
      postedAt: firstText(job, ['publishedAt']),
      description: descriptionText(job),
      url: jobUrl,
      applyUrl: firstText(job, ['applyUrl']) ?? jobUrl,
      logoUrl: null,
    });
  }

  return postings;
}

/** The endpoint each ATS publishes its postings on. */
function boardUrl(board: AtsBoard): string {
  switch (board.provider) {
    case 'greenhouse':
      // `content=true` is what carries the posting's own text. Without it the
      // board answers with the metadata alone and every posting would arrive
      // with an empty description.
      return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardId)}/jobs?content=true`;
    case 'lever':
      return `https://api.lever.co/v0/postings/${encodeURIComponent(board.boardId)}?mode=json`;
    case 'ashby':
      return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardId)}`;
  }
}

/** Reads one board and returns its postings in the platform's own shape. */
async function readBoard(board: AtsBoard): Promise<LiveJob[]> {
  const payload = await readJson(boardUrl(board));
  if (payload === null) return [];

  let postings: RawPosting[];
  switch (board.provider) {
    case 'greenhouse':
      postings = readGreenhouse(payload, board);
      break;
    case 'lever':
      postings = readLever(payload, board);
      break;
    case 'ashby':
      postings = readAshby(payload, board);
      break;
  }

  const jobs: LiveJob[] = [];

  for (const posting of postings) {
    const live = normalizeLiveJob({
      job_id: `ats:${board.provider}:${board.boardId}:${posting.id}`,
      job_title: posting.title,
      employer_name: posting.company,
      job_location: posting.location,
      job_is_remote: posting.isRemote,
      job_employment_type: posting.employmentType,
      job_posted_at: posting.postedAt,
      job_description: posting.description,
      job_url: posting.url,
      job_apply_link: posting.applyUrl,
      job_logo_url: posting.logoUrl,
      // The board is named so a posting says where it came from. It is not
      // one of the aggregated boards, so it is attributed to the company.
      job_publisher: posting.company,
      // The platform read this posting from the company's own careers board,
      // so it says so rather than guessing from the text.
      job_source: 'company_careers',
    });

    // A record without an id, a title and an employer cannot be shown
    // honestly, so it is dropped rather than completed with placeholders.
    if (!live) continue;

    jobs.push(live);
  }

  return jobs;
}

/* -------------------------------------------------------------------------- */
/* The search                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Runs `tasks` with a cap on how many are in flight at once.
 *
 * The boards are independent, so they are read in parallel — but not all at
 * once, because a burst of two hundred simultaneous requests is exactly what
 * makes a board decide to block a reader.
 */
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

/** What one search of the ATS boards found. */
export interface AtsSearchResult {
  jobs: LiveJob[];
  /** The boards that were read. */
  boardsRead: string[];
  /** The boards that could not be read. */
  boardsFailed: string[];
  /** When the boards were read. */
  fetchedAt: string;
}

/**
 * Reads every configured board and returns the postings found.
 *
 * A board that cannot be read is reported in `boardsFailed` and does not stop
 * the others. The platform would rather show eleven boards and say that one
 * was unreachable than show nothing at all.
 */
export async function searchAtsBoards(
  boards: AtsBoard[] = configuredAtsBoards()
): Promise<AtsSearchResult> {
  const fetchedAt = new Date().toISOString();

  if (boards.length === 0) {
    return { jobs: [], boardsRead: [], boardsFailed: [], fetchedAt };
  }

  const results = await withConcurrency(
    boards.map((board) => async () => {
      const jobs = await readBoard(board);
      return { board, jobs };
    }),
    BOARD_CONCURRENCY
  );

  const jobs: LiveJob[] = [];
  const boardsRead: string[] = [];
  const boardsFailed: string[] = [];

  for (const result of results) {
    if (result.jobs.length > 0) {
      boardsRead.push(`${result.board.company} (${result.board.provider})`);
      jobs.push(...result.jobs);
    } else {
      boardsFailed.push(`${result.board.company} (${result.board.provider})`);
    }
  }

  return { jobs, boardsRead, boardsFailed, fetchedAt };
}
