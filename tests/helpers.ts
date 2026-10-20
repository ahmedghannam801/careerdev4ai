// Shared helpers for the automated test suite.
//
// The suite creates its own Supabase Auth identities (random addresses under
// example.invalid) and its own rows, and deletes every row it created by
// explicit id. It never truncates, never drops and never touches a row it did
// not create.
//
// Credentials come from the environment only:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { loadTestEnv } from './env.mjs';
import { deleteTestIdentity } from './cleanup.mjs';

// The environment must be loaded before the clients are constructed: the
// module-level createClient calls below need the credentials immediately.
loadTestEnv();

export const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
export const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const anon: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
}

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `cp-test-${label}-${randomBytes(6).toString('hex')}@example.invalid`;
  const password = `Tst-${randomBytes(12).toString('hex')}Aa1!`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user) throw new Error(`createTestUser failed: ${error?.message}`);

  // The profile row is created by a database trigger on auth signup; create it
  // defensively in case the trigger is absent.
  await admin
    .from('profiles')
    .upsert({ id: data.user.id, full_name: `Test ${label}` }, { onConflict: 'id' });

  const { data: session, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session?.session) {
    throw new Error(`signIn failed: ${signInError?.message}`);
  }

  return { id: data.user.id, email, password, token: session.session.access_token };
}

/**
 * Deletes a test user and everything it owns: the storage objects in its
 * bucket folder, its `user_preferences` row, its domain rows, its profile and
 * finally its auth identity.
 *
 * The domain rows cascade from the auth identity, but the storage objects do
 * not — Storage has no cascade — so they are removed explicitly.
 */
export async function deleteTestUser(user: TestUser): Promise<void> {
  try {
    await deleteTestIdentity(admin, user.id);
  } catch {
    // best effort — the runner's final sweep is the backstop
  }
}

/**
 * Removes every test identity the suite may have left behind. The suite only
 * ever creates identities whose email starts with 'cp-test-', so this is
 * narrowly scoped and can never touch a real account.
 */
export async function deleteAllTestIdentities(): Promise<number> {
  const { deleteAllTestIdentities: sweep } = await import('./cleanup.mjs');
  return (await sweep(admin)).length;
}

/** Removes a row by its primary key — never a table-wide delete. */
export async function deleteRow(
  table: string,
  id: string,
  idColumn = 'id'
): Promise<void> {
  await admin.from(table).delete().eq(idColumn, id);
}

export async function deleteStorageObject(path: string): Promise<void> {
  await admin.storage.from('cv-files').remove([path]);
}

export interface ApiResponse {
  status: number;
  body: any;
}

export async function api(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; baseUrl?: string } = {}
): Promise<ApiResponse> {
  // The runner exports TEST_API_BASE_URL for the server it started. Each test
  // file is a separate process, so the variable is passed down explicitly
  // rather than inherited from a setup hook.
  const baseUrl =
    options.baseUrl ??
    process.env.TEST_API_BASE_URL ??
    `http://127.0.0.1:${process.env.TEST_API_PORT ?? '3111'}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}
