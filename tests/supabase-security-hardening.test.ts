/**
 * The database security corrections are the ones the audit asked for.
 *
 * Each assertion pins one decision of
 * `20261122000002_security_hardening_rls_objects.sql`, so a later edit cannot
 * quietly re-open the administrative credit view, hand a trigger function back
 * to the browser, or leave a function's search path mutable again.
 *
 * The behaviour against anonymous, authenticated and administrator callers was
 * verified against the deployed project; this file keeps the migration honest
 * in review.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const migration = read('../supabase/migrations/20261122000002_security_hardening_rls_objects.sql');
const adminCreditMonitor = read('../server/admin/creditMonitor.ts');

const TRIGGER_FUNCTIONS = [
  'audit_admin_role_change',
  'careerpilot_handle_new_user',
  'handle_referral_signup',
  'handle_referral_email_confirmation',
];

const MUTABLE_PATH_FUNCTIONS = [
  'background_jobs_touch_updated_at()',
  'careerpilot_daily_credit_allowance()',
  'careerpilot_egypt_date(timestamptz)',
  'careerpilot_egypt_next_reset(timestamptz)',
  'careerpilot_experience_levels()',
  'careerpilot_set_updated_at()',
];

describe('database security hardening', () => {
  it('makes the daily credit summary a security-invoker view', () => {
    assert.match(
      migration,
      /alter view public\.admin_daily_credit_summary set \(security_invoker = true\)/
    );
  });

  it('removes every client privilege on the daily credit summary and keeps the service role', () => {
    assert.match(
      migration,
      /revoke all on public\.admin_daily_credit_summary from public, anon, authenticated/
    );
    assert.match(
      migration,
      /grant select on public\.admin_daily_credit_summary to service_role/
    );
  });

  it('keeps the administrator dashboard on its existing service-role read', () => {
    assert.match(adminCreditMonitor, /getSupabaseServer\(\)/);
    assert.match(adminCreditMonitor, /from\('admin_daily_credit_summary'\)/);
    assert.match(
      adminCreditMonitor,
      /grant_day, accounts_granted, credits_granted, credits_remaining, accounts_with_credits/
    );
  });

  it('revokes direct execution of the four trigger functions from the client roles', () => {
    for (const name of TRIGGER_FUNCTIONS) {
      assert.match(
        migration,
        new RegExp(`revoke all on function public\\.${name}\\(\\)\\s*\\n?\\s*from public, anon, authenticated`),
        `${name} is revoked`
      );
      assert.match(
        migration,
        new RegExp(`grant execute on function public\\.${name}\\(\\) to service_role`),
        `${name} is kept for the service role`
      );
    }
  });

  it('pins the signup function’s search path to an explicit schema', () => {
    assert.match(
      migration,
      /alter function public\.careerpilot_handle_new_user\(\)\s*\\?\s*set search_path = public, pg_temp/
    );
  });

  it('pins the six functions the advisor reported', () => {
    for (const signature of MUTABLE_PATH_FUNCTIONS) {
      assert.match(
        migration,
        new RegExp(
          `alter function public\\.${signature.replace(/[()]/g, '\\$&')}\\s*\\n?\\s*set search_path = public, pg_temp`
        ),
        `${signature} has an explicit search path`
      );
    }
  });

  it('does not add a broad policy, disable RLS, or drop an object', () => {
    const body = migration.toLowerCase();
    assert.doesNotMatch(body, /create policy/);
    assert.doesNotMatch(body, /using \(true\)/);
    assert.doesNotMatch(body, /with check \(true\)/);
    assert.doesNotMatch(body, /disable row level security/);
    assert.doesNotMatch(body, /drop function/);
    assert.doesNotMatch(body, /drop table/);
    assert.doesNotMatch(body, /drop view/);
  });

  it('documents the six deliberately private tables instead of opening them', () => {
    for (const table of [
      'admin_audit_log',
      'background_job_consumers',
      'cv_template_unlocks',
      'cv_templates',
      'daily_credit_grants',
      'stripe_webhook_events',
    ]) {
      assert.ok(migration.includes(table), `${table} is documented`);
    }
    assert.match(migration, /default-deny/);
  });

  it('leaves the performance advisories out of this fix', () => {
    assert.match(migration, /foreign-key index/);
    assert.match(migration, /unused-index/);
    assert.match(migration, /permissive-policy/);
  });
});
