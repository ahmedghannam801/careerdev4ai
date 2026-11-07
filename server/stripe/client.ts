/**
 * A small Stripe REST client built on `fetch`.
 *
 * Why not the official SDK: the API is served from Cloudflare Pages Functions
 * (a Workers runtime), and this project has already been bitten once by a
 * dependency that resolved Node-only modules in that bundle (body-parser's
 * iconv-lite). The Stripe REST API is form-encoded over HTTPS, so a focused
 * client removes that class of failure entirely and keeps the Worker small.
 *
 * Every request is a single fetch with a timeout. Errors carry the Stripe
 * error type and code so callers can distinguish a bad key (401), a missing
 * price (404) and a validation problem (400) without parsing messages.
 */

import { getStripeConfig } from './config.ts';

export class StripeError extends Error {
  readonly status: number;
  readonly type: string | null;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    message: string,
    status: number,
    type: string | null = null,
    code: string | null = null,
    requestId: string | null = null
  ) {
    super(message);
    this.name = 'StripeError';
    this.status = status;
    this.type = type;
    this.code = code;
    this.requestId = requestId;
  }
}

export type ParamValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ParamValue[]
  | { [key: string]: ParamValue };

export type StripeParams = Record<string, ParamValue>;

/**
 * The API version Stripe answered with.
 *
 * Every Stripe response carries a `Stripe-Version` header describing the
 * version the account is actually on. That matters because Stripe renamed
 * several Checkout Session parameters between versions — the `ui_mode` value
 * `hosted` became `hosted_page`, and setting the old name now fails. Rather
 * than guess, the client remembers what Stripe said.
 */
let observedApiVersion: string | null = null;

/** The API version the last Stripe response was served with, if any. */
export function getObservedStripeApiVersion(): string | null {
  return observedApiVersion;
}

function isPlainObject(value: unknown): value is Record<string, ParamValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Flattens a nested parameter object into Stripe's bracketed form encoding.
 * `{ metadata: { a: 'b' } }` becomes `metadata[a]=b`; arrays become `key[0]`.
 */
export function encodeParams(params: StripeParams): string {
  const parts: string[] = [];

  const encode = (key: string, value: ParamValue): void => {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => encode(`${key}[${index}]`, item));
      return;
    }

    if (isPlainObject(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        encode(key ? `${key}[${childKey}]` : childKey, childValue);
      }
      return;
    }

    const rendered = typeof value === 'boolean' ? String(value) : String(value);
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(rendered)}`);
  };

  for (const [key, value] of Object.entries(params)) {
    encode(key, value);
  }

  return parts.join('&');
}

interface RequestOptions {
  idempotencyKey?: string;
  timeoutMs?: number;
}

async function request<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params: StripeParams = {},
  options: RequestOptions = {}
): Promise<T> {
  const config = getStripeConfig();
  const encoded = encodeParams(params);
  const query = method === 'GET' && encoded ? `?${encoded}` : '';
  const url = `${config.apiBase}${path}${query}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secretKey}`,
  };
  if (method !== 'GET') headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : encoded,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const reason = error instanceof Error ? error.message : String(error);
    throw new StripeError(`Stripe request failed: ${reason}`, 0);
  }
  clearTimeout(timeout);

  const text = await response.text();
  const servedVersion = response.headers.get('stripe-version');
  if (servedVersion) observedApiVersion = servedVersion;
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const parsed = body as {
      error?: { message?: string; type?: string; code?: string };
    } | null;
    throw new StripeError(
      parsed?.error?.message ?? `Stripe returned HTTP ${response.status}`,
      response.status,
      parsed?.error?.type ?? null,
      parsed?.error?.code ?? null,
      response.headers.get('request-id')
    );
  }

  return body as T;
}

export function stripeGet<T>(path: string, params: StripeParams = {}): Promise<T> {
  return request<T>('GET', path, params);
}

export function stripePost<T>(
  path: string,
  params: StripeParams = {},
  options: RequestOptions = {}
): Promise<T> {
  return request<T>('POST', path, params, options);
}

export function stripeDelete<T>(path: string, params: StripeParams = {}): Promise<T> {
  return request<T>('DELETE', path, params);
}
