// The single HTTP client for the application's own API.
//
// Every API module used to carry its own copy of the same request helper:
// the same Bearer header, the same JSON parsing and the same non-OK
// handling. They had drifted apart — some threw a plain Error, some threw an
// error that also carried the HTTP status — so the behaviour depended on
// which module the call happened to live in.
//
// This module is the one implementation they all share. The behaviour of a
// call is unchanged: the same header is sent, the same body is parsed, and a
// non-2xx answer still throws with the server's own message.
import { getAccessToken } from './supabase';
import { apiUrl } from './native';
import { creditActivityForPath, emitCreditActivity } from './creditActivity';

/**
 * The error thrown when the API answers with a non-2xx status.
 *
 * It carries the HTTP status so a caller can tell a rejected request from a
 * missing record without parsing the message, and the server's own machine
 * readable `code` when there is one — `CONSENT_REQUIRED` is the code the
 * application uses to know it has to show the consent screen rather than an
 * error.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  /** The server's machine-readable error code, when it sent one. */
  readonly code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/** The code the server sends when the caller has not accepted the current terms. */
export const CONSENT_REQUIRED_CODE = 'CONSENT_REQUIRED';

/**
 * True when the failure was caused by a missing legal acceptance.
 *
 * The gate lives on the server, so a client that ignored it would only see
 * this as a stream of unexplained failures. Reading the code here lets the
 * application show the right screen.
 */
export function isConsentRequiredError(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 403 &&
    error.code === CONSENT_REQUIRED_CODE
  );
}

/**
 * The reads that are in flight right now, by path.
 *
 * Two components that mount together often ask for the same thing — the
 * Dashboard and the Progress screen both read the interview history, the
 * sidebar and the profile both read the credits balance. Each of those used to
 * be a separate request for the same bytes.
 *
 * Sharing the promise of a read that has not finished yet answers both callers
 * with one request. It is deliberately limited to GET: a POST or a PATCH
 * changes something, and two of those must reach the server twice.
 *
 * The entry is removed when the request settles, so a later mount reads fresh
 * data rather than a cached answer, and a failure is not propagated to a
 * request made after it.
 */
const inFlightReads = new Map<string, Promise<unknown>>();

/**
 * Sends one authenticated request to the application's API and returns the
 * parsed JSON body.
 *
 * A non-2xx answer throws an ApiRequestError carrying the status and the
 * message the server sent.
 */
export function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') return sendRequest<T>(path, init);

  const inFlight = inFlightReads.get(path);
  if (inFlight) return inFlight as Promise<T>;

  const request = sendRequest<T>(path, init).finally(() => {
    inFlightReads.delete(path);
  });
  inFlightReads.set(path, request);
  return request;
}

/** Sends the request itself. `apiRequest` is the only caller. */
async function sendRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Never satisfy an authenticated read from the browser HTTP cache. The
  // server also sends Cache-Control: no-store, but an entry written before
  // that change may still exist, so the client opts out as well.
  //
  // `apiUrl` leaves the path untouched in the web build, where the request
  // stays same-origin, and points at the production API in the Android build.
  const res = await fetch(apiUrl(path), { cache: 'no-store', ...init, headers });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const payloadObject =
      payload && typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : null;
    const message =
      payloadObject && 'error' in payloadObject
        ? String(payloadObject.error)
        : `Request failed with status ${res.status}`;
    const code =
      payloadObject && typeof payloadObject.code === 'string' ? payloadObject.code : null;

    // A refused token spend means the balance on the screen is known to be
    // wrong. Announce it even though nothing was taken, so the store can
    // correct itself instead of waiting for a reload. The announcement carries
    // the reason only: the store re-reads the authoritative balance rather
    // than guessing a new number from an error body.
    const failedActivity = creditActivityForPath(path);
    if (failedActivity && code === 'INSUFFICIENT_CREDITS') {
      emitCreditActivity({ reason: failedActivity, path });
    }

    throw new ApiRequestError(res.status, message, code);
  }

  // A successful call to a route that spends a token may have moved the
  // balance. The API client is the one place every request passes through, so
  // it is the one place that can notice this without each feature having to
  // remember. The store re-reads the server rather than subtracting locally.
  const activity = creditActivityForPath(path);
  if (activity) {
    emitCreditActivity({ reason: activity, path });
  }

  return payload as T;
}
