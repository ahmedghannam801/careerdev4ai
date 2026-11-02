/**
 * IndexNow.
 *
 * IndexNow is the shared endpoint several search engines accept, so one
 * submission notifies every participating engine — Bing first, then the
 * others that support it. When a public opportunity or a learning resource is
 * published or changed, the affected URLs are submitted so the engines know
 * to recrawl them without waiting for the next crawl cycle.
 *
 * The protocol has one requirement beyond the POST: the key file must be
 * fetchable at `<host>/<key>.txt`, and it must contain exactly the key. The
 * worker serves that file.
 *
 * The key is a server-side secret. It is never sent to the browser, never
 * written into a page, and never appears in the sitemap. When it is not
 * configured, IndexNow is simply switched off — the site keeps working and no
 * submission is attempted.
 */

import { siteOrigin } from './config.ts';

/** The endpoint that accepts a submission and forwards it to every engine. */
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** The maximum number of URLs one submission may carry. */
const MAX_URLS_PER_SUBMISSION = 10_000;

/**
 * The IndexNow key, or `null` when the integration is not configured.
 *
 * The key is read from the environment so it can be rotated without a code
 * change, and so a deployment without it does not fail.
 */
export function indexNowKey(): string | null {
  const key = (process.env.INDEXNOW_KEY ?? '').trim();
  if (key.length < 8 || key.length > 128) return null;
  return key;
}

/**
 * The public path of the key file.
 *
 * `null` when IndexNow is switched off, because there is no file to serve.
 */
export function indexNowKeyPath(): string | null {
  const key = indexNowKey();
  if (!key) return null;
  return `/${key}.txt`;
}

/** The absolute URL of the key file. */
export function indexNowKeyLocation(): string | null {
  const path = indexNowKeyPath();
  if (!path) return null;
  return `${siteOrigin()}${path}`;
}

/** The outcome of a submission attempt. */
export interface IndexNowResult {
  /** Whether a submission was actually sent. */
  submitted: boolean;
  /** The HTTP status the endpoint answered with, when one was reached. */
  status?: number;
  /** The number of URLs that were included. */
  urlCount: number;
  /** Why no submission was sent, or why it failed. */
  reason?: string;
}

/**
 * Submits a set of URLs to the IndexNow endpoint.
 *
 * The function never throws: a failed submission is logged and reported, but
 * it must not break the action that triggered it. A publish that succeeded is
 * still a publish even when the notification could not be delivered.
 */
export async function submitIndexNow(paths: string[]): Promise<IndexNowResult> {
  const key = indexNowKey();
  const keyLocation = indexNowKeyLocation();

  if (!key || !keyLocation) {
    return { submitted: false, urlCount: 0, reason: 'IndexNow is not configured' };
  }

  const unique = Array.from(
    new Set(
      paths
        .filter((path) => typeof path === 'string' && path.length > 0)
        .map((path) => (path.startsWith('/') ? path : `/${path}`))
    )
  ).slice(0, MAX_URLS_PER_SUBMISSION);

  if (unique.length === 0) {
    return { submitted: false, urlCount: 0, reason: 'No URLs to submit' };
  }

  const body = {
    host: new URL(siteOrigin()).host,
    key,
    keyLocation,
    urlList: unique.map((path) => `${siteOrigin()}${path}`),
  };

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        `IndexNow submission failed with ${response.status}:`,
        detail.slice(0, 300)
      );
      return {
        submitted: false,
        status: response.status,
        urlCount: unique.length,
        reason: `IndexNow answered ${response.status}`,
      };
    }

    return { submitted: true, status: response.status, urlCount: unique.length };
  } catch (error) {
    console.error('IndexNow submission failed:', error);
    return {
      submitted: false,
      urlCount: unique.length,
      reason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
