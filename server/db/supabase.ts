import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase client — service role for trusted server operations.
// NEVER expose this to the frontend; never commit credentials.
//
// The credentials are read lazily (on first use) so that dotenv has populated
// process.env before the client is constructed, regardless of import order.
let client: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Supabase server credentials are not configured');
    }
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
