/**
 * Stripe webhook signature verification.
 *
 * Stripe signs `<timestamp>.<raw body>` with the endpoint's signing secret and
 * sends `t=<unix>,v1=<hex>`. The body must be the exact bytes Stripe sent:
 * re-serialising the parsed JSON changes whitespace and key order, and the
 * signature will not match.
 *
 * This uses Web Crypto (`crypto.subtle`), which exists both in Node 24 and in
 * the Workers runtime, so there is no dependency and one implementation runs
 * everywhere.
 */

const DEFAULT_TOLERANCE_SECONDS = 300;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Computes the hex HMAC-SHA256 of `${timestamp}.${payload}`. */
export async function computeStripeSignature(
  payload: string,
  timestamp: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`)
  );
  return toHex(signature);
}

/** Compares two hex strings without leaking the position of the first difference. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

export interface ParsedSignatureHeader {
  timestamp: number;
  signatures: string[];
}

export function parseStripeSignatureHeader(header: string): ParsedSignatureHeader | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const rawPart of header.split(',')) {
    const part = rawPart.trim();
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === 't') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === 'v1') {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/**
 * Verifies a Stripe signature header against the raw request body.
 *
 * Returns false for a missing or malformed header, a timestamp outside the
 * tolerance window, or a signature that does not match. It never throws, so a
 * route can answer 400 without a try/catch around the verification itself.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  const parsed = parseStripeSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;

  const expected = await computeStripeSignature(rawBody, String(parsed.timestamp), secret);

  // Stripe may send more than one v1 during a secret rotation; any match is valid.
  return parsed.signatures.some((candidate) => timingSafeEqualHex(candidate, expected));
}
