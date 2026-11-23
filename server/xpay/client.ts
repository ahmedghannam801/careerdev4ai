/**
 * A small XPay REST client built on `fetch`.
 *
 * The API is JSON over HTTPS: a bearer key, a JSON body, and a structured
 * `error.code` on every 4xx/5xx. There is no SDK in the server bundle, which
 * keeps the Workers build small and free of Node-only resolution surprises.
 *
 * Two things a caller must be able to tell apart, and therefore this client
 * does not collapse them:
 *
 *   * a request that never reached XPay (status 0, e.g. a timeout), which is
 *     safe to retry with the same Idempotency-Key;
 *   * a request XPay answered and refused (4xx), which carries a code that
 *     belongs in the interface rather than in a log.
 */

import { getXPayConfig, type XPayConfig } from './config.ts';

const REQUEST_TIMEOUT_MS = 15_000;

export class XPayError extends Error {
  /** 0 when the request never got an answer. */
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;
  /** The API's own words. For logs, never for a candidate. */
  readonly detail: string | null;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    requestId: string | null = null,
    detail: string | null = null
  ) {
    super(message);
    this.name = 'XPayError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.detail = detail;
  }
}

export interface XPayRequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Makes the write safe to retry: XPay replays the first response for a key
   * instead of running the operation twice.
   */
  idempotencyKey?: string;
  config?: XPayConfig;
}

function buildUrl(apiBase: string, path: string, query?: XPayRequestOptions['query']): string {
  const url = new URL(`${apiBase}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** The `error.code` and `request_id` of a refusal, or nulls. */
function readError(payload: unknown): { code: string | null; message: string | null; requestId: string | null } {
  if (!payload || typeof payload !== 'object') return { code: null, message: null, requestId: null };
  const record = payload as Record<string, unknown>;
  const error = record.error;
  const requestId =
    typeof record.request_id === 'string'
      ? record.request_id
      : typeof record.requestId === 'string'
        ? record.requestId
        : null;

  if (typeof error === 'string') return { code: null, message: error, requestId };
  if (error && typeof error === 'object') {
    const body = error as Record<string, unknown>;
    return {
      code: typeof body.code === 'string' ? body.code : null,
      message: typeof body.message === 'string' ? body.message : null,
      requestId,
    };
  }
  return { code: null, message: null, requestId };
}

export async function xpayRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: XPayRequestOptions = {}
): Promise<T> {
  const config = options.config ?? getXPayConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secretKey}`,
    Accept: 'application/json',
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildUrl(config.apiBase, path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new XPayError(
      timedOut ? 'XPay did not answer in time.' : 'XPay could not be reached.',
      0,
      timedOut ? 'request_timeout' : 'network_error'
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text.length) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const parsed = readError(payload);
    throw new XPayError(
      parsed.message ?? `XPay rejected the request (HTTP ${response.status}).`,
      response.status,
      parsed.code,
      parsed.requestId,
      text.slice(0, 500)
    );
  }

  if (payload === null) {
    throw new XPayError('XPay returned a body this server could not read.', response.status, 'bad_response');
  }

  return payload as T;
}

export function xpayGet<T>(path: string, options: XPayRequestOptions = {}): Promise<T> {
  return xpayRequest<T>('GET', path, options);
}

export function xpayPost<T>(path: string, options: XPayRequestOptions = {}): Promise<T> {
  return xpayRequest<T>('POST', path, options);
}
