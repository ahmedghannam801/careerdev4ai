// Server-side Supabase Auth verification.
// Verifies the caller's access token via the Supabase Auth API (supabase.auth.getUser),
// which validates the JWT server-side. The token payload is NEVER decoded locally to
// establish identity, and the `sub` claim is never trusted without verification.
//
// The service-role client is intentionally NOT used here: identity must be established
// from the caller's own credentials, not from server privileges.
//
// Performance note: a signed-in dashboard hydrates ~26 domains in parallel, and every
// API request used to call Supabase Auth again. The verification result is therefore
// cached for a very short time and concurrent verifications of the same token are
// coalesced. The cache key is the caller's full token, so one user's identity can never
// be returned for another user's request. Only a successful verification is cached;
// invalid, expired and missing tokens always return immediately.

import { createClient } from '@supabase/supabase-js';

export type AuthResult =
  | { status: 'missing_token' }
  | { status: 'invalid_token' }
  | { status: 'expired_token' }
  | { status: 'valid'; userId: string; email?: string };

type ValidAuthResult = Extract<AuthResult, { status: 'valid' }>;

let anonClient: ReturnType<typeof createClient> | null = null;

/** How long a successful verification may be reused. Kept short so a revoked
 *  session stops working quickly. */
const VERIFICATION_TTL_MS = 15_000;
/** Bound the cache so a long-lived isolate cannot accumulate tokens forever. */
const MAX_CACHE_ENTRIES = 500;

interface CachedVerification {
  result: ValidAuthResult;
  expiresAt: number;
}

const verifiedTokens = new Map<string, CachedVerification>();
const inFlightVerifications = new Map<string, Promise<AuthResult>>();

// Read env lazily so the client is built after dotenv has populated process.env.
function getAnonClient() {
  if (!anonClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (url && key) {
      anonClient = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }
  return anonClient;
}

export function extractBearerToken(header?: string): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * The expiry embedded in an already-verified token, used only to cap how long
 * its verification may be cached. It is never used to grant access.
 */
function verifiedTokenExpiry(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function readCachedVerification(token: string): ValidAuthResult | null {
  const cached = verifiedTokens.get(token);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    verifiedTokens.delete(token);
    return null;
  }
  // Refresh insertion order so the oldest entry is evicted first.
  verifiedTokens.delete(token);
  verifiedTokens.set(token, cached);
  return cached.result;
}

function writeCachedVerification(token: string, result: ValidAuthResult): void {
  const expiry = verifiedTokenExpiry(token);
  const now = Date.now();
  // Never cache past the token's own expiry (with a small safety margin).
  const ttl = expiry === null
    ? VERIFICATION_TTL_MS
    : Math.min(VERIFICATION_TTL_MS, Math.max(0, expiry - now - 5_000));
  if (ttl <= 0) return;

  if (verifiedTokens.size >= MAX_CACHE_ENTRIES) {
    const oldest = verifiedTokens.keys().next().value;
    if (oldest !== undefined) verifiedTokens.delete(oldest);
  }
  verifiedTokens.set(token, { result, expiresAt: now + ttl });
}

async function verifyWithSupabase(token: string): Promise<AuthResult> {
  const client = getAnonClient();
  if (!client) return { status: 'invalid_token' };

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      const message = (error?.message || '').toLowerCase();
      if (message.includes('expired')) return { status: 'expired_token' };
      return { status: 'invalid_token' };
    }
    const result: ValidAuthResult = {
      status: 'valid',
      userId: data.user.id,
      email: data.user.email,
    };
    writeCachedVerification(token, result);
    return result;
  } catch {
    return { status: 'invalid_token' };
  }
}

export async function verifySupabaseToken(authHeader?: string): Promise<AuthResult> {
  const token = extractBearerToken(authHeader);
  if (!token) return { status: 'missing_token' };

  const cached = readCachedVerification(token);
  if (cached) return cached;

  // A dashboard fires many requests with the same token at once. Share the
  // single Supabase Auth call between them instead of sending a burst.
  const existing = inFlightVerifications.get(token);
  if (existing) return existing;

  const verification = verifyWithSupabase(token);
  inFlightVerifications.set(token, verification);
  try {
    return await verification;
  } finally {
    inFlightVerifications.delete(token);
  }
}
