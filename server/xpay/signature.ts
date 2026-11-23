/**
 * XPay webhook signature verification.
 *
 * XPay signs `${timestamp}.${rawBody}` with the endpoint's `whsec_` secret and
 * sends `XPay-Signature: t=<unix>,v1=<hex>`. The body must be the exact bytes
 * XPay sent: re-serialising the parsed JSON changes whitespace and key order,
 * and the signature will not match.
 *
 * Web Crypto is used because the same code runs in Node and in the Workers
 * runtime, and it removes any need for a dependency.
 *
 * The comparison is constant time by construction: the two digests are walked
 * in full and only their difference is accumulated, so a wrong signature cannot
 * be found byte by byte.
 */

/** Five minutes, as XPay documents for replay protection. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface ParsedSignature {
  timestamp: number;
  signature: string;
}

export interface SignatureFailure {
  valid: false;
  reason:
    | 'missing_header'
    | 'malformed_header'
    | 'timestamp_out_of_tolerance'
    | 'signature_mismatch'
    | 'secret_missing';
}

export type SignatureResult = { valid: true } | SignatureFailure;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Splits `t=1730000000,v1=a1b2...` into its two fields.
 *
 * A value may itself contain `=`, so everything after the first `=` belongs to
 * the value. Anything else is rejected: a header that does not carry both
 * fields cannot be verified.
 */
export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (typeof header !== 'string' || header.trim().length === 0) return null;

  const fields = new Map<string, string>();
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) fields.set(key, value);
  }

  const rawTimestamp = fields.get('t');
  const signature = fields.get('v1');
  if (!rawTimestamp || !signature) return null;

  // Digits only: `parseInt('1730000000abc')` would silently accept junk.
  if (!/^\d{1,12}$/.test(rawTimestamp)) return null;
  if (!/^[0-9a-fA-F]{32,128}$/.test(signature)) return null;

  return { timestamp: Number.parseInt(rawTimestamp, 10), signature: signature.toLowerCase() };
}

/** Computes the hex HMAC-SHA256 of `${timestamp}.${payload}`. */
export async function computeXPaySignature(
  payload: string,
  timestamp: string | number,
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

/** Compares two hex digests without leaking where they differ. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Verifies one delivery.
 *
 * `nowSeconds` is injectable so the tolerance window can be tested without
 * waiting five minutes.
 */
export async function verifyXPaySignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<SignatureResult> {
  if (!secret) return { valid: false, reason: 'secret_missing' };
  if (!header) return { valid: false, reason: 'missing_header' };

  const parsed = parseSignatureHeader(header);
  if (!parsed) return { valid: false, reason: 'malformed_header' };

  // Both directions: a clock behind XPay is as wrong as one ahead of it.
  if (Math.abs(nowSeconds - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'timestamp_out_of_tolerance' };
  }

  const expected = await computeXPaySignature(rawBody, parsed.timestamp, secret);
  return constantTimeEqualHex(expected, parsed.signature)
    ? { valid: true }
    : { valid: false, reason: 'signature_mismatch' };
}
