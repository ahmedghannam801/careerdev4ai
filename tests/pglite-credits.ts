/**
 * A real Postgres for the credit tests.
 * ---------------------------------------------------------------------------
 * The daily allowance is money, so its rules are tested against a database
 * that behaves like the one in production: real transactions, real unique
 * constraints, real advisory locks, real PL/pgSQL.
 *
 * PGlite is Postgres compiled to WebAssembly, so the SQL in
 * `supabase/migrations` runs here exactly as it runs on the platform — the
 * same files, the same functions, the same behaviour. That is the point: a
 * test that re-implements the rules in TypeScript would only prove that the
 * test agrees with itself.
 *
 * The schema is the production schema, built by applying the real migration
 * files in order. Only the parts that the platform itself owns — the `auth`
 * and `storage` schemas, and the three roles the grants name — are stood in
 * for, because they belong to Supabase rather than to this repository.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The migrations that are known not to apply here, and why.
 *
 * Neither of them touches the credit system, and both are known facts about
 * the repository rather than accidents of the harness:
 *
 *   * `20261116000001_daily_credit_allowance_three.sql` does not parse. It
 *     closes a loop with `END LOOP` where the block it opens is an `END IF`,
 *     which is a syntax error. The file was superseded by
 *     `20261117000001_daily_token_claim.sql`, which rewrites every function
 *     it had written, so the production database — which took the later file
 *     — never carries the broken body. A database rebuilt from this folder
 *     alone would have failed on it. The credit functions under test come
 *     from the later file and from the migration this work adds.
 *
 *   * `20261118000002_semantic_matching_and_approval_gate.sql` needs the
 *     `vector` extension, which PGlite does not ship. It is about the
 *     semantic matching of skills and has nothing to do with credits.
 */
const KNOWN_UNAPPLICABLE = new Set([
  '20261116000001_daily_credit_allowance_three.sql',
  '20261118000002_semantic_matching_and_approval_gate.sql',
]);

/**
 * The parts of the platform this repository does not own.
 *
 * The `auth` schema is Supabase's own user table, `storage` is Supabase's own
 * object store, and the three roles are the ones the platform's grants name.
 * They are stood in for here so that the real migrations — which grant to
 * `service_role` and revoke from `anon` — can be applied unchanged.
 */
const PLATFORM_FIXTURE = `
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.jwt.claim.role', true);
$$;

CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text,
  owner uuid,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY,
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION storage.foldername(object_name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(object_name, '/');
$$;

CREATE OR REPLACE FUNCTION public.storage_object_owner(object_name text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT (storage.foldername(object_name))[1];
$$;

-- Two functions that exist on the platform but not in this repository. The
-- migration that hardens them says so itself: the migrations in the
-- migrations folder do not reproduce the production schema, because these
-- two were created outside it. They are stood in for here so that the
-- hardening migration can be applied unchanged.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RETURN;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$$;
`;

/** A database with the credit schema applied and nothing in it. */
export interface CreditDatabase {
  db: PGlite;
  /** Runs a statement that returns rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs a statement that returns nothing. */
  exec(sql: string): Promise<void>;
  /** Removes everything one account owns, so a test starts from nothing. */
  clearAccount(profileId: string): Promise<void>;
  /** Closes the database. */
  close(): Promise<void>;
}

/** Builds a database with the production schema applied. */
export async function createCreditDatabase(): Promise<CreditDatabase> {
  const db = new PGlite();

  await db.exec(PLATFORM_FIXTURE);

  const directory = path.join(root, 'supabase', 'migrations');
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const name of files) {
    if (KNOWN_UNAPPLICABLE.has(name)) continue;
    const sql = readFileSync(path.join(directory, name), 'utf8');
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(
        `The migration ${name} could not be applied: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // The functions the credit system is made of have to be there. If one of
  // them is missing, the tests would pass for the wrong reason.
  const present = await db.query<{ proname: string; arguments: number }>(
    `SELECT p.proname AS proname, p.pronargs AS arguments
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'`
  );
  // A function is named by its name and by the number of arguments it takes:
  // the allowance exists twice — once with no argument and once with a profile
  // — and both have to be there.
  const names = new Set(
    present.rows.map((row) =>
      row.arguments === 0 ? `${row.proname}()` : `${row.proname}/${row.arguments}`
    )
  );
  const required = [
    'careerpilot_daily_credit_allowance()',
    'careerpilot_daily_credit_allowance/1',
    'careerpilot_active_plan_code/1',
    'claim_daily_credits/2',
    'get_daily_credit_state/1',
    'expire_daily_credits/1',
    'expire_all_daily_credits()',
    'ensure_daily_credit_entitlement/1',
    'grant_daily_entitlements_to_all()',
    'grant_daily_credits_to_all()',
    'consume_ai_credits/5',
    'grant_ai_credits/7',
  ];
  const missing = required.filter((name) => !names.has(name));
  if (missing.length > 0) {
    throw new Error(
      `The credit functions are missing from the test database: ${missing.join(', ')}.`
    );
  }

  return {
    db,
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const result = await db.query<T>(sql, params as never[]);
      return result.rows;
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async clearAccount(profileId: string) {
      await db.exec(
        `DELETE FROM public.daily_credit_grants WHERE profile_id = '${profileId}';
         DELETE FROM public.ai_credit_ledger WHERE profile_id = '${profileId}';`
      );
    },
    async close() {
      await db.close();
    },
  };
}

/**
 * A profile id that no test shares with another.
 *
 * The WHOLE seed is hashed. An earlier version used the first eight
 * characters of the seed, so every seed that shared a prefix collapsed onto
 * the same account — which turned "twelve accounts" into "the same account
 * twelve times" and hid the very thing the test was about.
 */
export function profileId(seed: string): string {
  // A UUID built from the seed, so the same seed always means the same
  // account and a failing test can be reproduced.
  const hex = [0, 1, 2, 3]
    .map((block) => fnv1a(seed, block).toString(16).padStart(8, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(
    17,
    20
  )}-${hex.slice(20, 32)}`;
}

/** A 32-bit FNV-1a hash of the seed, salted so four blocks differ. */
function fnv1a(text: string, salt: number): number {
  let hash = (0x811c9dc5 ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash ^ text.charCodeAt(index)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
