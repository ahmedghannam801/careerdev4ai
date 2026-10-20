// Server-side Supabase Auth verification.
// Verifies the caller's access token via the Supabase Auth API (supabase.auth.getUser),
// which validates the JWT server-side. The token payload is NEVER decoded locally and
// the `sub` claim is never trusted without verification.
//
// The service-role client is intentionally NOT used here: identity must be established
// from the caller's own credentials, not from server privileges.

import { createClient } from '@supabase/supabase-js';

export type AuthResult =
  | { status: 'missing_token' }
  | { status: 'invalid_token' }
  | { status: 'expired_token' }
  | { status: 'valid'; userId: string; email?: string };

let anonClient: ReturnType<typeof createClient> | null = null;

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

export async function verifySupabaseToken(authHeader?: string): Promise<AuthResult> {
  const token = extractBearerToken(authHeader);
  if (!token) return { status: 'missing_token' };

  const client = getAnonClient();
  if (!client) return { status: 'invalid_token' };

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      const message = (error?.message || '').toLowerCase();
      if (message.includes('expired')) return { status: 'expired_token' };
      return { status: 'invalid_token' };
    }
    return {
      status: 'valid',
      userId: data.user.id,
      email: data.user.email,
    };
  } catch {
    return { status: 'invalid_token' };
  }
}
