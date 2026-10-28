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
 * missing record without parsing the message.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
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
    const message =
      payload && typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new ApiRequestError(res.status, message);
  }
  return payload as T;
}
