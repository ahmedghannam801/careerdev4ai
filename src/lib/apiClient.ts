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
 * Sends one authenticated request to the application's API and returns the
 * parsed JSON body.
 *
 * A non-2xx answer throws an ApiRequestError carrying the status and the
 * message the server sent.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new ApiRequestError(res.status, message, code);
  }
  return payload as T;
}
