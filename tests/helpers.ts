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
import { deleteTestIdentity, runEmailPrefix } from './cleanup.mjs';
import { PRIVACY_VERSION, TERMS_VERSION } from '../shared/legal.ts';

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
  /**
   * A browser client bound to THIS user's session.
   *
   * Each test user gets its own client so that signing one out cannot
   * invalidate another test's session — the shared `anon` client would.
   */
  client: SupabaseClient;
}

export interface CreateTestUserOptions {
  /**
   * Whether to record a current Terms & Privacy acceptance for the user.
   *
   * Defaults to true, because almost every test exercises a signed-in feature
   * and the consent gate would otherwise answer 403 for every request. The
   * consent/access tests pass `false` to exercise the gate itself.
   */
  consent?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
  /**
   * Whether to provision an active subscription and test AI credits.
   * Defaults to true so integration tests can exercise AI features.
   */
  subscription?: boolean;
  planCode?: string;
}

/**
 * Records a consent row for a test user straight through the service role.
 *
 * This is the same row the API writes; the test asserts behaviour against it,
 * so the shape must match.
 */
export async function grantConsent(
  userId: string,
  options: { termsVersion?: string; privacyVersion?: string; status?: string; source?: string } = {}
): Promise<void> {
  const { error } = await admin.from('user_consents').insert({
    user_id: userId,
    terms_version: options.termsVersion ?? TERMS_VERSION,
    privacy_version: options.privacyVersion ?? PRIVACY_VERSION,
    status: options.status ?? 'accepted',
    source: options.source ?? 'registration',
  });
  if (error) throw new Error(`grantConsent failed: ${error.message}`);
}

/** Reads a user's consent rows straight from the database. */
export async function readConsentRows(userId: string): Promise<any[]> {
  const { data, error } = await admin
    .from('user_consents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any[];
}

/**
 * Runs an operation again when the platform answers with a transient error.
 *
 * The suite creates its own Supabase Auth identities, and the hosted Auth
 * service throttles identity creation when a full run creates many of them in
 * a short window. A throttled or momentarily unavailable platform is not a
 * defect in the product, so the harness waits and tries again instead of
 * failing the run. A genuine failure (a wrong password, a rejected row) is
 * reported straight away.
 *
 * A dropped connection counts as transient. Node's fetch reports every
 * network-level problem — a reset connection, a timed-out socket, a refused
 * port — as the single message "fetch failed", and the real cause is on the
 * error's `cause`. Without looking there, the one failure mode this harness
 * is most likely to meet mid-run is the one it cannot recognise, and a
 * momentary blip cancels whole suites instead of waiting them out.
 */
async function withTransientRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const transient = [
    '429',
    'rate limit',
    'timeout',
    'timed out',
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EPIPE',
    'fetch failed',
    'socket hang up',
    '500',
    '502',
    '503',
    '504',
  ];

  /** Everything the error says about itself: its message and its cause. */
  function describe(error: unknown): string {
    const parts: string[] = [];
    let current: unknown = error;
    // The cause chain is at most a few links deep, and it is walked with a
    // bound so a self-referencing cause cannot loop for ever.
    for (let depth = 0; depth < 5 && current; depth += 1) {
      if (current instanceof Error) {
        parts.push(current.message);
        parts.push(current.name);
        const code = (current as { code?: unknown }).code;
        if (typeof code === 'string') parts.push(code);
        current = (current as { cause?: unknown }).cause;
      } else {
        parts.push(String(current));
        break;
      }
    }
    return parts.join(' | ');
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!transient.some((marker) => describe(error).includes(marker))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
    }
  }
  throw new Error(`${label} failed after retries: ${describe(lastError)}`);
}

export async function createTestUser(
  label: string,
  options: CreateTestUserOptions = {}
): Promise<TestUser> {
  // The identity belongs to this run's namespace, so a run never removes the
  // data of a run that is executing at the same time.
  const email = `${runEmailPrefix()}${label}-${randomBytes(6).toString('hex')}@example.invalid`;
  const password = `Tst-${randomBytes(12).toString('hex')}Aa1!`;

  const { data } = await withTransientRetry('createTestUser', async () => {
    const result = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    // A throttled Auth service answers with an error rather than throwing, so
    // it is raised here — otherwise the retry wrapper never sees it and the
    // suite is cancelled by a limit it could simply have waited out.
    if (result.error) {
      throw new Error(
        `createUser refused: ${result.error.message} (status ${result.error.status ?? 'unknown'})`
      );
    }
    return result;
  });
  if (!data?.user) throw new Error('createTestUser failed: the platform returned no user');

  // The profile row is created by a database trigger on auth signup; create it
  // defensively in case the trigger is absent.
  await withTransientRetry('createTestUser profile', () =>
    admin
      .from('profiles')
      .upsert({ id: data.user.id, full_name: `Test ${label}` }, { onConflict: 'id' })
  );

  if (options.consent !== false) {
    await withTransientRetry('grantConsent', () =>
      grantConsent(data.user.id, {
        termsVersion: options.termsVersion,
        privacyVersion: options.privacyVersion,
      })
    );
  }

  if (options.subscription !== false) {
    const targetPlan = options.planCode ?? 'pro';
    const { data: plan } = await admin
      .from('subscription_plans')
      .select('id')
      .eq('code', targetPlan)
      .maybeSingle();

    if (plan?.id) {
      await admin.from('subscriptions').insert({
        profile_id: data.user.id,
        plan_id: plan.id,
        billing_cycle: 'monthly',
        status: 'active',
        current_period_starts_at: new Date().toISOString(),
        current_period_ends_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      });

      await admin.from('ai_credit_ledger').insert({
        profile_id: data.user.id,
        amount: 100,
        running_balance: 100,
        source: 'trial_grant',
        action: 'admin_adjustment',
        idempotency_key: `test_init_${data.user.id}`,
        description: 'Test harness initial credit grant',
      });
    }
  }

  // A dedicated client per user: signing one user out must not affect
  // another user's session.
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session } = await withTransientRetry('signIn', async () => {
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error) {
      throw new Error(
        `signIn refused: ${result.error.message} (status ${result.error.status ?? 'unknown'})`
      );
    }
    return result;
  });
  if (!session?.session) {
    throw new Error('signIn failed: the platform returned no session');
  }

  return {
    id: data.user.id,
    email,
    password,
    token: session.session.access_token,
    client,
  };
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

/**
 * Signs a test user out and back in, returning a FRESH access token.
 *
 * This proves that a user's data survives a logout/login cycle: the token is
 * a new session, so the server reads the rows from the database rather than
 * from any in-memory state.
 */
export async function reauthenticate(user: TestUser): Promise<string> {
  const { data, error } = await user.client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error || !data?.session) {
    throw new Error(`reauthenticate failed: ${error?.message}`);
  }
  return data.session.access_token;
}

/** Signs a test user's session out. */
export async function signOut(user: TestUser): Promise<void> {
  const { error } = await user.client.auth.signOut();
  if (error) throw new Error(`signOut failed: ${error.message}`);
}

/** Reads a user's `experiences` rows straight from the database. */
export async function readExperienceRows(userId: string): Promise<any[]> {
  const { data, error } = await admin
    .from('experiences')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as any[];
}

/** Reads a user's `educations` rows straight from the database. */
export async function readEducationRows(userId: string): Promise<any[]> {
  const { data, error } = await admin
    .from('educations')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as any[];
}

/** Reads a user's `user_skills` rows straight from the database. */
export async function readUserSkillRows(userId: string): Promise<any[]> {
  const { data, error } = await admin
    .from('user_skills')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as any[];
}

export interface ApiResponse {
  status: number;
  body: any;
  headers: Headers;
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
  // A GET/HEAD request must not carry a body — fetch rejects it outright.
  const hasBody = options.body !== undefined && method !== 'GET' && method !== 'HEAD';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, headers: res.headers };
}

/**
 * The same request as `api`, but WITHOUT an Authorization header.
 *
 * Used to prove that a route is genuinely public, and — more importantly —
 * that a private resource stays private from an anonymous caller.
 */
export async function apiAnonymous(
  method: string,
  path: string,
  options: { body?: unknown; baseUrl?: string } = {}
): Promise<ApiResponse> {
  const baseUrl =
    options.baseUrl ??
    process.env.TEST_API_BASE_URL ??
    `http://127.0.0.1:${process.env.TEST_API_PORT ?? '3111'}`;
  // A GET/HEAD request must not carry a body — fetch rejects it outright.
  const hasBody = options.body !== undefined && method !== 'GET' && method !== 'HEAD';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, headers: res.headers };
}
