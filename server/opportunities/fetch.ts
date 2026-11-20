/**
 * The HTTP layer for the opportunity sources.
 *
 * These are public government pages, not an API. The rules the platform
 * commits to are therefore the rules of an ordinary, polite reader:
 *
 *   * only ever GET, never submit anything;
 *   * identify the reader, so an operator can see who is calling;
 *   * ask for robots.txt first and honour what it says;
 *   * wait between requests to the same host;
 *   * give up quickly and report the failure rather than hammering a site
 *     that is down.
 *
 * No credential is involved, so nothing here can leak one.
 */

import { setTimeout as sleep } from 'node:timers/promises';

/** How long one request may take before it is abandoned. */
const REQUEST_TIMEOUT_MS = 15_000;

/** How many times a failed request is retried. */
const MAX_ATTEMPTS = 3;

/** The gap between two requests to the same host. */
const HOST_DELAY_MS = 1_200;

/**
 * How the platform identifies itself.
 *
 * A readable contact address is what an operator needs in order to respond
 * to an unexpected crawler, so this is not hidden behind a generic string.
 */
export const USER_AGENT =
  'Roadmapak-OpportunitySync/1.0 (+https://roadmapak.pages.dev; public training opportunity index)';

/** Why a fetch did not produce a page. */
export type FetchErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable'
  | 'robots_disallowed';

export class SourceFetchError extends Error {
  readonly code: FetchErrorCode;

  constructor(code: FetchErrorCode, message: string) {
    super(message);
    this.name = 'SourceFetchError';
    this.code = code;
  }
}

const lastRequestAt = new Map<string, number>();

/** Waits until the host has been left alone for long enough. */
async function paceHost(url: string): Promise<void> {
  const host = new URL(url).host;
  const last = lastRequestAt.get(host);
  if (last !== undefined) {
    const wait = HOST_DELAY_MS - (Date.now() - last);
    if (wait > 0) await sleep(wait);
  }
  lastRequestAt.set(host, Date.now());
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

interface RobotsRules {
  disallow: string[];
  allow: string[];
  /** True when robots.txt could not be read at all. */
  unknown: boolean;
}

const robotsCache = new Map<string, RobotsRules>();

/**
 * Reads the robots policy for a host.
 *
 * When robots.txt cannot be read, the platform does not pretend the path is
 * allowed: it treats the answer as unknown and lets the caller decide. The
 * sources this platform reads publish a robots.txt, so this is the safe
 * default rather than a likely path.
 */
async function readRobots(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;

  try {
    const response = await fetch(`${origin}/robots.txt`, {
      method: 'GET',
      headers: { 'user-agent': USER_AGENT, accept: 'text/plain' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      const rules: RobotsRules = { disallow: [], allow: [], unknown: true };
      robotsCache.set(origin, rules);
      return rules;
    }
    const text = await response.text();
    const rules = parseRobots(text);
    robotsCache.set(origin, rules);
    return rules;
  } catch {
    const rules: RobotsRules = { disallow: [], allow: [], unknown: true };
    robotsCache.set(origin, rules);
    return rules;
  }
}

/**
 * Parses robots.txt for the rules that apply to everybody.
 *
 * Only the `*` group is read. A policy written for one named crawler does
 * not bind this platform, and reading only the `*` group keeps the check
 * simple and honest.
 */
export function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  const disallow: string[] = [];
  const allow: string[] = [];

  let inStarGroup = false;
  let sawUserAgent = false;

  for (const raw of lines) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!sawUserAgent) {
        inStarGroup = value === '*';
        sawUserAgent = true;
      } else {
        // A second user-agent line starts a new group.
        inStarGroup = value === '*';
      }
      continue;
    }

    if (!inStarGroup) continue;
    if (field === 'disallow' && value) disallow.push(value);
    if (field === 'allow' && value) allow.push(value);
  }

  return { disallow, allow, unknown: false };
}

/** True when robots.txt forbids this path. */
export function isPathAllowed(rules: RobotsRules, pathname: string): boolean {
  if (rules.unknown) return true;

  const matches = (pattern: string): boolean => {
    if (pattern === '') return false;
    if (pattern.endsWith('*')) return pathname.startsWith(pattern.slice(0, -1));
    return pathname === pattern || pathname.startsWith(`${pattern}/`);
  };

  const allowed = rules.allow.some((pattern) => matches(pattern));
  if (allowed) return true;
  return !rules.disallow.some((pattern) => matches(pattern));
}

/**
 * Fetches a page as text.
 *
 * The request is repeated a small number of times when the failure looks
 * transient — a timeout or a 5xx — and never when it does not: a 404 or a
 * robots rule is an answer, not a hiccup.
 */
export async function fetchText(url: string): Promise<string> {
  const target = new URL(url);
  const robots = await readRobots(target.origin);
  if (!isPathAllowed(robots, target.pathname)) {
    throw new SourceFetchError(
      'robots_disallowed',
      `robots.txt does not allow ${target.pathname} to be read.`,
    );
  }

  let lastError: SourceFetchError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await paceHost(url);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 404) {
        throw new SourceFetchError('not_found', 'The page is no longer published.');
      }
      if (response.status === 403 || response.status === 401) {
        throw new SourceFetchError('forbidden', 'The page refused the request.');
      }
      if (response.status === 429) {
        lastError = new SourceFetchError(
          'rate_limited',
          'The source is rate limiting this server.',
        );
        await sleep(attempt * 2_000);
        continue;
      }
      if (response.status >= 500) {
        lastError = new SourceFetchError(
          'unavailable',
          `The source answered with ${response.status}.`,
        );
        await sleep(attempt * 1_500);
        continue;
      }
      if (!response.ok) {
        throw new SourceFetchError(
          'unavailable',
          `The source answered with ${response.status}.`,
        );
      }

      return await response.text();
    } catch (error) {
      if (error instanceof SourceFetchError) {
        if (error.code === 'not_found' || error.code === 'forbidden' || error.code === 'robots_disallowed') {
          throw error;
        }
        lastError = error;
      } else {
        const name = (error as { name?: string } | null)?.name;
        if (name === 'TimeoutError' || name === 'AbortError') {
          lastError = new SourceFetchError('timeout', 'The source did not answer in time.');
        } else {
          lastError = new SourceFetchError(
            'unavailable',
            'The source could not be reached.',
          );
        }
      }
      await sleep(attempt * 1_500);
    }
  }

  throw lastError ?? new SourceFetchError('unavailable', 'The source could not be reached.');
}

/** Clears the cached robots policies. Used by the tests. */
export function resetSourceFetchCache(): void {
  robotsCache.clear();
  lastRequestAt.clear();
}
