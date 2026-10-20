import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Browser-side Supabase client.
//
// Only the PUBLISHABLE (anon) key may appear in the browser bundle. The
// service-role key, database password and any other server secret must never
// be referenced here — those are server-only (see server/db/supabase.ts).
//
// The session is persisted by the Supabase client itself and refreshed
// automatically on expiry.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!client) {
    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error('Supabase browser credentials are not configured');
    }
    client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Returns the current access token, or null when there is no session. */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await getBrowserSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
