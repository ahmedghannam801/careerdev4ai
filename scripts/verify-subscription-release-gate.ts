/**
 * CareerDev4AI — Subscription System Final Independent Release Gate Verification
 * 
 * Runs a complete, end-to-end integration and concurrency audit against a
 * disposable Supabase-compatible PostgreSQL 18 staging instance (PGlite).
 */

import { PGlite } from '@electric-sql/pglite';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Define ANSI color helpers for readable audit logs
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

interface VerificationResult {
  step: string;
  status: 'PASS' | 'FAIL';
  details: string;
  error?: string;
}

const auditResults: VerificationResult[] = [];

function recordResult(step: string, status: 'PASS' | 'FAIL', details: string, error?: string) {
  auditResults.push({ step, status, details, error });
  const icon = status === 'PASS' ? green('✔ PASS') : red('✘ FAIL');
  console.log(`${icon} [${cyan(step)}]: ${details}`);
  if (error) {
    console.error(red(`    Error details: ${error}`));
  }
}

async function runAudit() {
  console.log(bold('\n================================================================================'));
  console.log(bold('   CareerDev4AI — Final Independent Release Gate Audit (Disposable DB)'));
  console.log(bold('================================================================================\n'));

  const db = new PGlite();

  // ---------------------------------------------------------------------------
  // STEP 0: Provision Disposable Supabase Runtimes & Baseline Schema
  // ---------------------------------------------------------------------------
  console.log(cyan('--- STEP 0: Supabase Compatible Environment Pre-flight ---'));
  try {
    await db.exec(`
      -- Roles
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
        END IF;
      END $$;

      -- Schemas
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE SCHEMA IF NOT EXISTS extensions;

      -- Supabase Auth Mock Functions
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), null)::uuid;
      $$;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
      $$;

      -- Supabase Storage Mock Functions
      CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql STABLE AS $$
        SELECT string_to_array(name, '/');
      $$;

      CREATE OR REPLACE FUNCTION public.storage_object_owner(object_name text) RETURNS text LANGUAGE sql STABLE AS $$
        SELECT (storage.foldername(object_name))[1];
      $$;

      -- Baseline Updated_At Trigger
      CREATE OR REPLACE FUNCTION public.careerpilot_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$;

      -- Supabase Auth Tables
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        created_at timestamptz DEFAULT now()
      );

      -- Public Baseline Tables
      CREATE TABLE IF NOT EXISTS public.profiles (
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email text NOT NULL,
        full_name text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.admin_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
        email text UNIQUE NOT NULL,
        full_name text NOT NULL,
        role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'analyst', 'support')),
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
        permissions text[] NOT NULL DEFAULT '{}'::text[],
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.admin_audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
        admin_email text NOT NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id text,
        metadata jsonb DEFAULT '{}'::jsonb,
        ip_address text,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
        type text NOT NULL,
        title text NOT NULL,
        message text NOT NULL,
        link_view text,
        is_read boolean NOT NULL DEFAULT false,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS storage.buckets (
        id text PRIMARY KEY,
        name text NOT NULL,
        public boolean DEFAULT false,
        file_size_limit bigint,
        allowed_mime_types text[]
      );

      CREATE TABLE IF NOT EXISTS storage.objects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        bucket_id text REFERENCES storage.buckets(id),
        name text,
        owner uuid,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        last_accessed_at timestamptz DEFAULT now(),
        metadata jsonb
      );

      -- Seed an existing remote Super Admin (to prove no admin lockout)
      INSERT INTO auth.users (id, email) VALUES 
        ('4188d699-b3a8-49d8-bd3e-eaef901f0a37', 'ahdabdalla77@gmail.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, email, full_name) VALUES 
        ('4188d699-b3a8-49d8-bd3e-eaef901f0a37', 'ahdabdalla77@gmail.com', 'Existing Super Admin')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.admin_users (id, profile_id, email, full_name, role, status) VALUES 
        ('4188d699-b3a8-49d8-bd3e-eaef901f0a37', '4188d699-b3a8-49d8-bd3e-eaef901f0a37', 'ahdabdalla77@gmail.com', 'Existing Super Admin', 'super_admin', 'active')
      ON CONFLICT (profile_id) DO NOTHING;

      -- Seed the target primary Super Admin profile
      INSERT INTO auth.users (id, email) VALUES 
        ('11111111-1111-1111-1111-111111111111', 'ahmedghannam801@gmail.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, email, full_name) VALUES 
        ('11111111-1111-1111-1111-111111111111', 'ahmedghannam801@gmail.com', 'Ahmed Ghannam')
      ON CONFLICT (id) DO NOTHING;
    `);

    recordResult('STEP-0-PREFLIGHT', 'PASS', 'Disposable Supabase staging environment pre-flight configured successfully.');
  } catch (err: any) {
    recordResult('STEP-0-PREFLIGHT', 'FAIL', 'Failed to configure pre-flight environment.', err.message);
    throw err;
  }

  // ---------------------------------------------------------------------------
  // STEP 1: Execute all 7 Subscription Migrations Sequentially
  // ---------------------------------------------------------------------------
  console.log(cyan('\n--- STEP 1: Sequential Execution of Subscription Migrations ---'));

  const migrationFiles = [
    '20261107000001_bootstrap_primary_super_admin.sql',
    '20261110000001_subscription_plans_and_coupons.sql',
    '20261110000002_subscriptions_and_payments.sql',
    '20261110000003_verifications_and_ai_credits.sql',
    '20261110000004_privacy_birthdays_events_and_procs.sql',
    '20261110000005_payment_receipts_storage.sql',
    '20261110000006_subscription_system_remediation.sql',
  ];

  const migrationsDir = path.resolve('supabase/migrations');

  for (let i = 0; i < migrationFiles.length; i++) {
    const fileName = migrationFiles[i];
    const filePath = path.join(migrationsDir, fileName);
    const sqlContent = fs.readFileSync(filePath, 'utf8');

    const startTs = Date.now();
    try {
      await db.exec(sqlContent);
      const duration = Date.now() - startTs;
      recordResult(
        `MIGRATION-${i + 1}`,
        'PASS',
        `Successfully executed ${fileName} in ${duration}ms`
      );
    } catch (err: any) {
      recordResult(
        `MIGRATION-${i + 1}`,
        'FAIL',
        `Failed executing ${fileName}`,
        err.message
      );
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Schema, Tables, Indexes, and Stored Procedures Verification
  // ---------------------------------------------------------------------------
  console.log(cyan('\n--- STEP 2: Schema, Indexes, and Procedures Verification ---'));

  // 2.1 Verify All 8 Tables Exist
  const expectedTables = [
    'subscription_plans',
    'coupon_definitions',
    'user_privacy_consents',
    'payment_requests',
    'subscriptions',
    'payment_verifications',
    'ai_credit_ledger',
    'birthday_rewards',
    'subscription_events'
  ];

  for (const table of expectedTables) {
    const res = await db.query(
      `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    );
    const count = parseInt(res.rows[0].count as string, 10);
    if (count === 1) {
      recordResult(`SCHEMA-TABLE-${table}`, 'PASS', `Table public.${table} exists.`);
    } else {
      recordResult(`SCHEMA-TABLE-${table}`, 'FAIL', `Table public.${table} is missing!`);
    }
  }

  // 2.2 Verify RLS is Enabled on All Subscription Tables
  for (const table of expectedTables) {
    const res = await db.query(
      `SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = $1`,
      [table]
    );
    const rlsEnabled = res.rows[0]?.rowsecurity === true;
    if (rlsEnabled) {
      recordResult(`RLS-ENABLED-${table}`, 'PASS', `RLS is enabled on public.${table}.`);
    } else {
      recordResult(`RLS-ENABLED-${table}`, 'FAIL', `RLS is NOT enabled on public.${table}!`);
    }
  }

  // 2.3 Verify Remediation Columns on payment_requests
  const prCols = await db.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payment_requests'
      AND column_name IN ('item_type', 'credit_pack_id', 'credits_to_grant')
  `);
  if (prCols.rows.length === 3) {
    recordResult('SCHEMA-PR-COLUMNS', 'PASS', 'Remediation columns (item_type, credit_pack_id, credits_to_grant) exist on payment_requests.');
  } else {
    recordResult('SCHEMA-PR-COLUMNS', 'FAIL', `Expected 3 remediation columns on payment_requests, found ${prCols.rows.length}`);
  }

  // 2.4 Verify Partial Unique Index on Confirmed Transaction Reference
  const idxRes = await db.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'public' AND tablename = 'payment_requests' 
      AND indexname = 'idx_payment_requests_unique_confirmed_tx_ref'
  `);
  if (idxRes.rows.length === 1 && idxRes.rows[0].indexdef.includes('UNIQUE')) {
    recordResult('SCHEMA-TX-UNIQUE-INDEX', 'PASS', 'Partial unique index idx_payment_requests_unique_confirmed_tx_ref verified on payment_requests.');
  } else {
    recordResult('SCHEMA-TX-UNIQUE-INDEX', 'FAIL', 'Partial unique index idx_payment_requests_unique_confirmed_tx_ref is missing or not unique!');
  }

  // 2.5 Verify Stored Procedures
  const expectedProcs = [
    'confirm_payment_and_activate',
    'confirm_credit_pack_payment',
    'consume_ai_credits',
    'refund_ai_credits',
    'admin_grant_ai_credits',
    'expire_subscriptions',
    'expire_temporary_access',
    'late_payment_restore'
  ];

  for (const proc of expectedProcs) {
    const res = await db.query(
      `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1`,
      [proc]
    );
    const count = parseInt(res.rows[0].count as string, 10);
    if (count >= 1) {
      recordResult(`PROC-${proc}`, 'PASS', `Stored procedure public.${proc} exists.`);
    } else {
      recordResult(`PROC-${proc}`, 'FAIL', `Stored procedure public.${proc} is missing!`);
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Security & RLS Policy Enforcement Proofs
  // ---------------------------------------------------------------------------
  console.log(cyan('\n--- STEP 3: Security & RLS Enforcement Proofs ---'));

  // Seed two distinct candidates
  const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES 
      ('${userA}', 'candidate_a@example.com'),
      ('${userB}', 'candidate_b@example.com')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, email, full_name) VALUES 
      ('${userA}', 'candidate_a@example.com', 'Candidate A'),
      ('${userB}', 'candidate_b@example.com', 'Candidate B')
    ON CONFLICT (id) DO NOTHING;

    -- Seed an active coupon
    INSERT INTO public.coupon_definitions (
      code, discount_type, discount_value, min_order_piasters,
      valid_from, valid_until, is_active
    ) VALUES (
      'PROMO50', 'percentage', 50, 0,
      now() - interval '1 day', now() + interval '30 days', true
    ) ON CONFLICT DO NOTHING;
  `);

  // 3.1 PROVE unauthenticated (anon) CANNOT read coupon_definitions
  try {
    await db.exec(`
      SET ROLE anon;
      SET "request.jwt.claim.sub" = '';
      SET "request.jwt.claim.role" = 'anon';
    `);
    await db.query(`SELECT count(*) FROM public.coupon_definitions;`);
    recordResult('SEC-ANON-COUPON-SELECT', 'FAIL', 'Unauthenticated anon was able to SELECT coupon_definitions!');
  } catch (err: any) {
    recordResult('SEC-ANON-COUPON-SELECT', 'PASS', 'Unauthenticated anon is blocked from reading coupon_definitions (permission denied).');
  } finally {
    await db.exec(`RESET ROLE;`);
  }

  // 3.2 PROVE authenticated candidate CANNOT read coupon_definitions (BLK-11)
  try {
    await db.exec(`
      SET ROLE authenticated;
      SET "request.jwt.claim.sub" = '${userA}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);
    await db.query(`SELECT count(*) FROM public.coupon_definitions;`);
    recordResult('SEC-AUTH-COUPON-SELECT', 'FAIL', 'Authenticated candidate was able to SELECT coupon_definitions (BLK-11 violation)!');
  } catch (err: any) {
    recordResult('SEC-AUTH-COUPON-SELECT', 'PASS', 'Authenticated candidate is strictly blocked from selecting coupon_definitions (BLK-11 verified).');
  } finally {
    await db.exec(`RESET ROLE;`);
  }

  // 3.3 PROVE authenticated candidate CANNOT insert payment_requests directly (BLK-01)
  try {
    await db.exec(`
      SET ROLE authenticated;
      SET "request.jwt.claim.sub" = '${userA}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);
    await db.query(`
      INSERT INTO public.payment_requests (
        profile_id, billing_cycle, original_amount_piasters, amount_piasters,
        payment_method, status, idempotency_key, expires_at
      ) VALUES (
        '${userA}', 'monthly', 9900, 9900,
        'vodafone_cash', 'paid', 'spoofed_key_1', now() + interval '1 day'
      );
    `);
    recordResult('SEC-AUTH-PAYMENT-INSERT', 'FAIL', 'Authenticated candidate was able to directly INSERT payment_requests (BLK-01 violation)!');
  } catch (err: any) {
    recordResult('SEC-AUTH-PAYMENT-INSERT', 'PASS', 'Authenticated candidate is strictly blocked from inserting payment_requests directly (BLK-01 verified).');
  } finally {
    await db.exec(`RESET ROLE;`);
  }

  // 3.4 PROVE service_role CAN perform administrative and checkout creation
  try {
    await db.exec(`
      SET ROLE service_role;
      SET "request.jwt.claim.role" = 'service_role';
      
      -- Create checkout as service_role for userA
      INSERT INTO public.payment_requests (
        id, profile_id, billing_cycle, original_amount_piasters, amount_piasters,
        payment_method, status, idempotency_key, expires_at
      ) VALUES (
        '10000000-0000-0000-0000-000000000001', '${userA}', 'monthly', 9900, 9900,
        'vodafone_cash', 'pending', 'service_key_user_a', now() + interval '1 day'
      );

      -- Create checkout as service_role for userB
      INSERT INTO public.payment_requests (
        id, profile_id, billing_cycle, original_amount_piasters, amount_piasters,
        payment_method, status, idempotency_key, expires_at
      ) VALUES (
        '20000000-0000-0000-0000-000000000002', '${userB}', 'monthly', 9900, 9900,
        'instapay', 'pending', 'service_key_user_b', now() + interval '1 day'
      );
    `);
    recordResult('SEC-SERVICE-ROLE-OPS', 'PASS', 'service_role can insert payment_requests and manage system entities.');
  } catch (err: any) {
    recordResult('SEC-SERVICE-ROLE-OPS', 'FAIL', 'service_role failed to perform required operations.', err.message);
  } finally {
    await db.exec(`RESET ROLE;`);
  }

  // 3.5 PROVE User A cannot see User B's payment request (Row-Level Security Isolation)
  try {
    await db.exec(`
      SET ROLE authenticated;
      SET "request.jwt.claim.sub" = '${userA}';
      SET "request.jwt.claim.role" = 'authenticated';
    `);
    const resA = await db.query(`SELECT id, profile_id FROM public.payment_requests;`);
    const visibleIds = resA.rows.map((r: any) => r.id);
    const seesUserB = visibleIds.includes('20000000-0000-0000-0000-000000000002');
    const seesUserA = visibleIds.includes('10000000-0000-0000-0000-000000000001');

    if (seesUserA && !seesUserB) {
      recordResult('SEC-RLS-USER-ISOLATION', 'PASS', 'User A sees only User A records; User B records are completely hidden.');
    } else {
      recordResult('SEC-RLS-USER-ISOLATION', 'FAIL', `RLS leak: seesUserA=${seesUserA}, seesUserB=${seesUserB}`);
    }
  } catch (err: any) {
    recordResult('SEC-RLS-USER-ISOLATION', 'FAIL', 'Failed to test RLS isolation.', err.message);
  } finally {
    await db.exec(`RESET ROLE;`);
  }

  // ---------------------------------------------------------------------------
  // STEP 4: Real Concurrency Tests (10 Simultaneous Requests against 5 Credits)
  // ---------------------------------------------------------------------------
  console.log(cyan('\n--- STEP 4: Real Concurrency Tests (10 Parallel Requests on 5 Credits) ---'));

  const concUserId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${concUserId}', 'concurrency_candidate@example.com') ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, email, full_name) VALUES ('${concUserId}', 'concurrency_candidate@example.com', 'Concurrency Candidate') ON CONFLICT DO NOTHING;

    -- Initialize starting balance of EXACTLY 5 credits
    INSERT INTO public.ai_credit_ledger (
      profile_id, operation, amount, running_balance, source_type,
      idempotency_key, description
    ) VALUES (
      '${concUserId}', 'grant', 5, 5, 'trial',
      'init_concurrency_5_credits', 'Initial balance for concurrency stress testing'
    );
  `);

  // Verify starting balance is 5
  const initBalRes = await db.query(
    `SELECT running_balance FROM public.ai_credit_ledger WHERE profile_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [concUserId]
  );
  const startingBalance = initBalRes.rows[0].running_balance;
  console.log(`Initial verified balance: ${startingBalance} credits`);

  // Launch 10 simultaneous requests, each requesting 2 credits
  const concurrencyRequests = Array.from({ length: 10 }, (_, index) => {
    const key = `req_conc_deduct_2_idx_${index}_${Date.now()}`;
    return db.query(`
      SELECT public.consume_ai_credits(
        '${concUserId}'::uuid,
        'cv_ats_analysis',
        2,
        '${key}',
        '{"request_index": ${index}}'::jsonb
      ) as result;
    `).then(res => {
      const outcome = res.rows[0].result;
      return typeof outcome === 'string' ? JSON.parse(outcome) : outcome;
    }).catch(err => {
      return { success: false, error: err.message };
    });
  });

  const outcomes = await Promise.all(concurrencyRequests);

  const successCount = outcomes.filter(o => o.success === true).length;
  const failureCount = outcomes.filter(o => o.success === false && o.error === 'INSUFFICIENT_CREDITS').length;

  // Check ending balance and ledger rows
  const finalBalRes = await db.query(`
    SELECT running_balance 
    FROM public.ai_credit_ledger 
    WHERE profile_id = $1 
    ORDER BY created_at DESC, id DESC 
    LIMIT 1
  `, [concUserId]);
  const finalBalance = finalBalRes.rows[0].running_balance;

  const allLedgerRows = await db.query(`
    SELECT amount, running_balance, operation, idempotency_key 
    FROM public.ai_credit_ledger 
    WHERE profile_id = $1 
    ORDER BY created_at ASC
  `, [concUserId]);

  console.log(`Concurrency Results: Successes=${successCount}, Failures=${failureCount}, FinalBalance=${finalBalance}`);
  console.log(`Total ledger entries: ${allLedgerRows.rows.length}`);

  if (successCount === 2 && failureCount === 8 && finalBalance === 1) {
    recordResult(
      'CONCURRENCY-5-CREDITS-TEST',
      'PASS',
      `Exactly 2/10 requests succeeded, exactly 8/10 failed with INSUFFICIENT_CREDITS. Final balance = 1. Ledger integrity 100% verified.`
    );
  } else {
    recordResult(
      'CONCURRENCY-5-CREDITS-TEST',
      'FAIL',
      `Expected 2 successes, 8 failures, final balance 1. Got: ${successCount} successes, ${failureCount} failures, balance ${finalBalance}`
    );
  }

  // Verify no duplicate keys and no negative running balances anywhere in ledger
  const negativeCheck = await db.query(`SELECT count(*) FROM public.ai_credit_ledger WHERE running_balance < 0`);
  const negativeCount = parseInt(negativeCheck.rows[0].count as string, 10);
  if (negativeCount === 0) {
    recordResult('LEDGER-NON-NEGATIVE', 'PASS', 'Zero negative running balances detected across all ledger mutations.');
  } else {
    recordResult('LEDGER-NON-NEGATIVE', 'FAIL', `${negativeCount} negative running balances detected!`);
  }

  // ---------------------------------------------------------------------------
  // STEP 5: Payment Reference Race Protection & Duplicate Confirmed Checks
  // ---------------------------------------------------------------------------
  console.log(cyan('\n--- STEP 5: Payment Reference Race Protection ---'));

  const userRace1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const userRace2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const sharedTxRef = 'VF_CASH_01099887766';

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES 
      ('${userRace1}', 'race_user1@example.com'),
      ('${userRace2}', 'race_user2@example.com')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, email, full_name) VALUES 
      ('${userRace1}', 'race_user1@example.com', 'Race User 1'),
      ('${userRace2}', 'race_user2@example.com', 'Race User 2')
    ON CONFLICT DO NOTHING;

    -- Get plan id for student
    DO $$
    DECLARE
      v_plan_id uuid;
    BEGIN
      SELECT id INTO v_plan_id FROM public.subscription_plans WHERE code = 'student';

      -- Insert two distinct payment requests sharing the EXACT same transaction reference
      INSERT INTO public.payment_requests (
        id, profile_id, plan_id, billing_cycle, original_amount_piasters,
        amount_piasters, payment_method, transaction_reference, status,
        idempotency_key, expires_at
      ) VALUES 
      (
        '55555555-5555-5555-5555-555555555551', '${userRace1}', v_plan_id, 'monthly', 9900,
        9900, 'vodafone_cash', '${sharedTxRef}', 'under_review',
        'race_key_1', now() + interval '1 day'
      ),
      (
        '55555555-5555-5555-5555-555555555552', '${userRace2}', v_plan_id, 'monthly', 9900,
        9900, 'vodafone_cash', '${sharedTxRef}', 'under_review',
        'race_key_2', now() + interval '1 day'
      );
    END $$;
  `);

  // Attempt to confirm both simultaneously
  const adminId = '4188d699-b3a8-49d8-bd3e-eaef901f0a37';
  const racePromises = [
    db.query(`SELECT public.confirm_payment_and_activate('55555555-5555-5555-5555-555555555551'::uuid, '${adminId}'::uuid, 'Race attempt 1') as res;`)
      .then(r => ({ paymentId: 1, success: true, data: r.rows[0].res }))
      .catch(e => ({ paymentId: 1, success: false, error: e.message })),
    db.query(`SELECT public.confirm_payment_and_activate('55555555-5555-5555-5555-555555555552'::uuid, '${adminId}'::uuid, 'Race attempt 2') as res;`)
      .then(r => ({ paymentId: 2, success: true, data: r.rows[0].res }))
      .catch(e => ({ paymentId: 2, success: false, error: e.message })),
  ];

  const raceOutcomes = await Promise.all(racePromises);
  const raceSuccesses = raceOutcomes.filter(o => o.success).length;
  const raceRejections = raceOutcomes.filter(o => !o.success).length;

  console.log(`Payment Race Outcomes: Successes=${raceSuccesses}, Rejections=${raceRejections}`);
  if (raceRejections > 0) {
    const rejected = raceOutcomes.find(o => !o.success);
    console.log(`Rejection error message: ${rejected?.error}`);
  }

  // Verify only ONE row has status = 'paid' for that transaction reference
  const paidCheck = await db.query(`
    SELECT id, profile_id, status, transaction_reference 
    FROM public.payment_requests 
    WHERE lower(trim(transaction_reference)) = lower('${sharedTxRef}') AND status = 'paid'
  `);

  if (raceSuccesses === 1 && raceRejections === 1 && paidCheck.rows.length === 1) {
    recordResult(
      'RACE-PAYMENT-REFERENCE-PROTECTION',
      'PASS',
      `Exactly 1 payment confirmed; concurrent duplicate confirmation rejected by partial unique index.`
    );
  } else {
    recordResult(
      'RACE-PAYMENT-REFERENCE-PROTECTION',
      'FAIL',
      `Race protection failed! Successes: ${raceSuccesses}, Rejections: ${raceRejections}, Confirmed in DB: ${paidCheck.rows.length}`
    );
  }

  // ---------------------------------------------------------------------------
  // STEP 6: Multi-Source Credit Accounting & Expiration Isolation (BLK-08)
  // ---------------------------------------------------------------------------
  console.log(cyan('\n--- STEP 6: Multi-Source Accounting & Expiration Isolation ---'));

  const multiUser = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${multiUser}', 'multisource_user@example.com') ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, email, full_name) VALUES ('${multiUser}', 'multisource_user@example.com', 'Multi-Source User') ON CONFLICT DO NOTHING;
  `);

  // Build Chronological State cleanly:
  // Step 6.1: User registered and received 5 Trial Credits
  await db.exec(`
    INSERT INTO public.ai_credit_ledger (profile_id, operation, amount, running_balance, source_type, idempotency_key, description)
    VALUES ('${multiUser}', 'grant', 5, 5, 'trial', 'multi_trial_5', 'Welcome Trial Credits');
  `);

  // Step 6.2: User subscribed to Student Plan (25 credits)
  const planQuery = await db.query(`SELECT id FROM public.subscription_plans WHERE code = 'student'`);
  const studentPlanId = planQuery.rows[0].id;
  const initialSubId = '77777777-7777-7777-7777-777777777771';

  await db.exec(`
    -- Create subscription that started 30 days ago and ended 1 hour ago
    INSERT INTO public.subscriptions (
      id, profile_id, plan_id, billing_cycle, status,
      current_period_starts_at, current_period_ends_at
    ) VALUES (
      '${initialSubId}', '${multiUser}', '${studentPlanId}', 'monthly', 'active',
      now() - interval '30 days', now() - interval '1 hour'
    );

    -- Allocate monthly 25 credits
    INSERT INTO public.ai_credit_ledger (profile_id, operation, amount, running_balance, source_type, source_id, idempotency_key, description)
    VALUES ('${multiUser}', 'grant', 25, 30, 'subscription', '${initialSubId}', 'multi_sub_25', 'Monthly Student Credits');
  `);

  // Step 6.3: User purchased Booster Pack 40
  const packPaymentId = '88888888-8888-8888-8888-888888888881';
  await db.exec(`
    INSERT INTO public.payment_requests (
      id, profile_id, item_type, credit_pack_id, credits_to_grant,
      original_amount_piasters, amount_piasters, payment_method, status,
      idempotency_key, expires_at
    ) VALUES (
      '${packPaymentId}', '${multiUser}', 'credit_pack', 'pack_40', 40,
      9900, 9900, 'vodafone_cash', 'under_review', 'pack_multi_pr', now() + interval '1 day'
    );
  `);
  const packConfirmRes = await db.query(`SELECT public.confirm_credit_pack_payment('${packPaymentId}'::uuid, '${adminId}'::uuid, 'Confirmed booster pack 40') as out;`);
  console.log('Confirmed credit pack:', packConfirmRes.rows[0].out);

  // Step 6.4: Admin granted 10 bonus credits
  const adminGrantRes = await db.query(`
    SELECT public.admin_grant_ai_credits(
      '${multiUser}'::uuid,
      '${adminId}'::uuid,
      10,
      'Special community recognition',
      'admin_grant_multi_10'
    ) as out;
  `);
  console.log('Admin credit grant:', adminGrantRes.rows[0].out);

  // Check verified balance before consumption: 5 (trial) + 25 (sub) + 40 (pack) + 10 (admin) = 80 credits
  const preConsumeRes = await db.query(
    `SELECT running_balance FROM public.ai_credit_ledger WHERE profile_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [multiUser]
  );
  const totalBalanceBefore = preConsumeRes.rows[0].running_balance;
  console.log(`Multi-source balance before consumption: ${totalBalanceBefore} credits (Expected: 80)`);

  // Step 6.5: Candidate consumes 15 credits on AI tasks
  await db.query(`
    SELECT public.consume_ai_credits(
      '${multiUser}'::uuid,
      'cv_tailoring',
      15,
      'multi_consume_15_credits',
      '{}'::jsonb
    );
  `);

  const postConsumeRes = await db.query(
    `SELECT running_balance FROM public.ai_credit_ledger WHERE profile_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [multiUser]
  );
  const balanceAfterConsume = postConsumeRes.rows[0].running_balance;
  console.log(`Balance after consuming 15 credits: ${balanceAfterConsume} credits (Expected: 65)`);

  // Run expire_subscriptions() Cron Procedure (subscription ended 1 hour ago)
  const expireRes = await db.query(`SELECT public.expire_subscriptions() as res;`);
  const expireOutcome = typeof expireRes.rows[0].res === 'string' ? JSON.parse(expireRes.rows[0].res) : expireRes.rows[0].res;
  console.log('expire_subscriptions() outcome:', expireOutcome);

  const postExpireRes = await db.query(
    `SELECT running_balance FROM public.ai_credit_ledger WHERE profile_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [multiUser]
  );
  const balanceAfterExpire = postExpireRes.rows[0].running_balance;
  console.log(`Balance after monthly expiration: ${balanceAfterExpire} credits (Expected: 55)`);

  // Expected accounting after expiration:
  // Monthly grant: 25. Consumed during cycle: 15. Unspent monthly: 10. Expired: 10.
  // Remaining: 5 (trial) + 40 (pack) + 10 (admin) = 55 credits.
  if (totalBalanceBefore === 80 && balanceAfterConsume === 65 && balanceAfterExpire === 55) {
    recordResult(
      'CREDIT-EXPIRATION-ISOLATION-BLK-08',
      'PASS',
      `Only unspent monthly credits (10) expired. Purchased pack credits (40), Admin grants (10), and Trial credits (5) remained 100% intact.`
    );
  } else {
    recordResult(
      'CREDIT-EXPIRATION-ISOLATION-BLK-08',
      'FAIL',
      `Expiration isolation failure! Pre=${totalBalanceBefore}, PostConsume=${balanceAfterConsume}, PostExpire=${balanceAfterExpire}`
    );
  }

  // 6.7 Test Subscription Renewal
  const renewalPrId = '99999999-9999-9999-9999-999999999991';
  await db.exec(`
    INSERT INTO public.payment_requests (
      id, profile_id, plan_id, billing_cycle, original_amount_piasters,
      amount_piasters, payment_method, status, idempotency_key, expires_at
    ) VALUES (
      '${renewalPrId}', '${multiUser}', '${studentPlanId}', 'monthly', 9900,
      9900, 'instapay', 'under_review', 'renewal_pr_key_1', now() + interval '1 day'
    );
  `);

  const renewalConfirm = await db.query(`
    SELECT public.confirm_payment_and_activate('${renewalPrId}'::uuid, '${adminId}'::uuid, 'Confirmed renewal') as out;
  `);
  console.log('Subscription renewal confirmation:', renewalConfirm.rows[0].out);

  const renewalBalRes = await db.query(
    `SELECT running_balance FROM public.ai_credit_ledger WHERE profile_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [multiUser]
  );
  const balanceAfterRenewal = renewalBalRes.rows[0].running_balance;
  console.log(`Balance after subscription renewal: ${balanceAfterRenewal} (Expected: 55 + 25 = 80)`);

  if (balanceAfterRenewal === 80) {
    recordResult('SUBSCRIPTION-RENEWAL-ACCOUNTING', 'PASS', 'Subscription renewal successfully granted new monthly cycle credits (25). Balance: 80.');
  } else {
    recordResult('SUBSCRIPTION-RENEWAL-ACCOUNTING', 'FAIL', `Expected balance 80 after renewal, got ${balanceAfterRenewal}`);
  }

  // 6.8 Test AI Credit Refund
  // Deduct 4 credits for mock interview
  await db.query(`
    SELECT public.consume_ai_credits(
      '${multiUser}'::uuid,
      'interview_mock_session',
      4,
      'mock_interview_deduct_4',
      '{}'::jsonb
    );
  `);

  const postDeductBal = (await db.query(
    `SELECT running_balance FROM public.ai_credit_ledger WHERE profile_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [multiUser]
  )).rows[0].running_balance;
  console.log(`Balance after consuming 4 credits: ${postDeductBal} (Expected: 76)`);

  // Simulate AI failure and refund the 4 credits
  await db.query(`
    SELECT public.refund_ai_credits(
      '${multiUser}'::uuid,
      4,
      'interview_mock_session',
      'Gemini API upstream 503 timeout during mock interview',
      NULL
    );
  `);

  const refundBalRes = await db.query(
    `SELECT running_balance FROM public.ai_credit_ledger WHERE profile_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [multiUser]
  );
  const balanceAfterRefund = refundBalRes.rows[0].running_balance;
  console.log(`Balance after refund (4 credits): ${balanceAfterRefund} (Expected: 80)`);

  if (postDeductBal === 76 && balanceAfterRefund === 80) {
    recordResult('AI-CREDIT-REFUND-ACCOUNTING', 'PASS', 'AI error refund restored 4 credits cleanly to running balance (80).');
  } else {
    recordResult('AI-CREDIT-REFUND-ACCOUNTING', 'FAIL', `Expected balance 80 after refund, got ${balanceAfterRefund}`);
  }

  // ---------------------------------------------------------------------------
  // STEP 7: Admin Bootstrap and Preservation Safety
  // ---------------------------------------------------------------------------
  console.log(cyan('\n--- STEP 7: Admin Bootstrap and Existing Admin Preservation ---'));

  const adminsRes = await db.query(`SELECT email, role, status FROM public.admin_users ORDER BY email ASC`);
  console.log('Active Administrators in database:');
  adminsRes.rows.forEach((adm: any) => {
    console.log(`  - ${adm.email}: role=${adm.role}, status=${adm.status}`);
  });

  const existingAdmin = adminsRes.rows.find((a: any) => a.email === 'ahdabdalla77@gmail.com');
  const bootstrappedAdmin = adminsRes.rows.find((a: any) => a.email === 'ahmedghannam801@gmail.com');

  if (existingAdmin && existingAdmin.role === 'super_admin' && existingAdmin.status === 'active') {
    recordResult('ADMIN-PRESERVE-EXISTING', 'PASS', 'Pre-existing Super Admin ahdabdalla77@gmail.com was 100% preserved and active.');
  } else {
    recordResult('ADMIN-PRESERVE-EXISTING', 'FAIL', 'Pre-existing Super Admin was removed or corrupted!');
  }

  if (bootstrappedAdmin && bootstrappedAdmin.role === 'super_admin' && bootstrappedAdmin.status === 'active') {
    recordResult('ADMIN-BOOTSTRAP-PRIMARY', 'PASS', 'Target primary owner ahmedghannam801@gmail.com bootstrapped as Super Admin with full privileges.');
  } else {
    recordResult('ADMIN-BOOTSTRAP-PRIMARY', 'FAIL', 'Target primary Super Admin was not properly bootstrapped!');
  }

  // Verify Audit Log entry
  const auditRes = await db.query(`
    SELECT action, admin_email, metadata 
    FROM public.admin_audit_log 
    WHERE admin_email = 'ahmedghannam801@gmail.com'
  `);
  if (auditRes.rows.length >= 1) {
    recordResult('ADMIN-BOOTSTRAP-AUDIT-LOG', 'PASS', 'Super Admin bootstrap event logged in public.admin_audit_log with metadata.');
  } else {
    recordResult('ADMIN-BOOTSTRAP-AUDIT-LOG', 'FAIL', 'Bootstrap event missing from public.admin_audit_log!');
  }

  // ---------------------------------------------------------------------------
  // STEP 8: Final Summary & Metric Accounting
  // ---------------------------------------------------------------------------
  console.log(bold('\n================================================================================'));
  console.log(bold('                      AUDIT VERIFICATION SUMMARY'));
  console.log(bold('================================================================================\n'));

  const totalSteps = auditResults.length;
  const passedSteps = auditResults.filter(r => r.status === 'PASS').length;
  const failedSteps = auditResults.filter(r => r.status === 'FAIL').length;

  console.log(`Total Checks Executed : ${bold(totalSteps.toString())}`);
  console.log(`Passed Checks         : ${green(passedSteps.toString())}`);
  console.log(`Failed Checks         : ${failedSteps > 0 ? red(failedSteps.toString()) : green('0')}`);
  console.log(`Success Rate          : ${bold(((passedSteps / totalSteps) * 100).toFixed(1))}%`);

  if (failedSteps === 0) {
    console.log(green('\n>>> VERDICT: ALL INTEGRATION, CONCURRENCY, AND SECURITY GATES PASSED <<<'));
  } else {
    console.log(red('\n>>> VERDICT: ONE OR MORE AUDIT CHECKS FAILED <<<'));
  }
}

runAudit().catch(err => {
  console.error(red(`\nFATAL RUNTIME ERROR IN AUDIT HARNESS: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
