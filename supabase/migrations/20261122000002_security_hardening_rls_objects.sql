-- Migration: 20261122000002_security_hardening_rls_objects.sql
-- Description: Closes the administrative credit view, revokes direct execution
-- of trigger functions and pins the search path of the six remaining public
-- functions.
--
-- Everything here was verified against the deployed project before it was
-- written:
--
--   * `admin_daily_credit_summary` is a view owned by `postgres`, created
--     without `security_invoker`, and it carries the project's default table
--     grants for `anon` and `authenticated` (`arwdDxtm`). Anonymous callers
--     could therefore read the daily credit totals of every account through
--     PostgREST, even though the base table `daily_credit_grants` is closed to
--     clients.
--   * `audit_admin_role_change`, `careerpilot_handle_new_user`,
--     `handle_referral_signup` and `handle_referral_email_confirmation` are
--     SECURITY DEFINER trigger functions that still carry the default
--     `EXECUTE` grant for PUBLIC (and therefore anon/authenticated).
--   * Six public functions have no explicit search path:
--     `background_jobs_touch_updated_at`, `careerpilot_daily_credit_allowance`,
--     `careerpilot_egypt_date`, `careerpilot_egypt_next_reset`,
--     `careerpilot_experience_levels` and `careerpilot_set_updated_at`.
--
-- No table is created, dropped, truncated or rewritten. No RLS policy is
-- removed or weakened. No function body changes.

-- ---------------------------------------------------------------------------
-- 1. The administrative daily credit summary
--
-- The Admin Center reads this view through the server's service-role client
-- (`server/admin/creditMonitor.ts`), and nothing in the browser reads it. So:
--
--   * `security_invoker = true` makes the view run with the caller's rights
--     instead of the owner's, which is the correct behaviour for an aggregate
--     over protected data (PostgreSQL 15+; the deployed project is 17);
--   * the client roles lose every privilege on the view, so an anonymous or
--     ordinary authenticated call is refused before RLS is even consulted;
--   * the service role keeps SELECT, which is all the dashboard needs.
--
-- The defence is layered on purpose: even if a grant were ever restored by
-- mistake, the invoker design would still make the view read the base table
-- with the caller's rights, and the base table has no client grant.
-- ---------------------------------------------------------------------------

alter view public.admin_daily_credit_summary set (security_invoker = true);

revoke all on public.admin_daily_credit_summary from public, anon, authenticated;
grant select on public.admin_daily_credit_summary to service_role;

-- ---------------------------------------------------------------------------
-- 2. The SECURITY DEFINER trigger functions
--
-- All four are trigger functions (`RETURNS trigger`), so they cannot be
-- invoked directly through PostgREST even today; the grant is still an
-- unnecessary privilege surface, and it is removed. A trigger does not need
-- the caller to hold EXECUTE on the function it fires.
--
-- Trigger dependencies that must keep working (verified on the deployed
-- project):
--
--   trg_audit_admin_role_change          AFTER UPDATE ON public.admin_users
--   trg_handle_referral_signup           AFTER INSERT ON auth.users
--   trg_handle_referral_email_confirmation
--                                        AFTER UPDATE OF email_confirmed_at
--                                        ON auth.users
--
-- `careerpilot_handle_new_user` is the baseline's signup function. The
-- deployed project's signup trigger uses `handle_new_user`, already
-- restricted, so this legacy copy is not on any trigger there; the grant is
-- revoked and the function is kept (never dropped) so a database rebuilt from
-- the migrations still finds it.
-- ---------------------------------------------------------------------------

-- `careerpilot_handle_new_user` was pinned to `public` without a temporary
-- schema; make its path explicit and complete. Its body already
-- schema-qualifies every object it touches.
alter function public.careerpilot_handle_new_user()
  set search_path = public, pg_temp;

revoke all on function public.audit_admin_role_change()
  from public, anon, authenticated;
revoke all on function public.careerpilot_handle_new_user()
  from public, anon, authenticated;
revoke all on function public.handle_referral_signup()
  from public, anon, authenticated;
revoke all on function public.handle_referral_email_confirmation()
  from public, anon, authenticated;

grant execute on function public.audit_admin_role_change() to service_role;
grant execute on function public.careerpilot_handle_new_user() to service_role;
grant execute on function public.handle_referral_signup() to service_role;
grant execute on function public.handle_referral_email_confirmation() to service_role;

-- ---------------------------------------------------------------------------
-- 3. The six functions with a mutable search path
--
-- None of these is SECURITY DEFINER, so the escalation risk was low, but a
-- caller-controlled path is still an ambiguity the function should not have.
-- Each body only touches `pg_catalog` built-ins and unqualified objects in
-- `public`, so `public, pg_temp` is the path they already resolved through.
--
-- `careerpilot_egypt_date` and `careerpilot_egypt_next_reset` take a defaulted
-- timestamp argument, so the signature includes it.
-- ---------------------------------------------------------------------------

alter function public.background_jobs_touch_updated_at()
  set search_path = public, pg_temp;
alter function public.careerpilot_daily_credit_allowance()
  set search_path = public, pg_temp;
alter function public.careerpilot_egypt_date(timestamptz)
  set search_path = public, pg_temp;
alter function public.careerpilot_egypt_next_reset(timestamptz)
  set search_path = public, pg_temp;
alter function public.careerpilot_experience_levels()
  set search_path = public, pg_temp;
alter function public.careerpilot_set_updated_at()
  set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 4. Deliberately private tables (documented, no policy added)
--
-- The audit reported six tables with RLS enabled and no policy:
--
--   admin_audit_log, background_job_consumers, cv_template_unlocks,
--   cv_templates, daily_credit_grants, stripe_webhook_events
--
-- All six are server-only. The client roles hold no privilege on any of them
-- (`has_table_privilege('anon'|'authenticated', ..., 'SELECT')` is false for
-- every one), and the server reads and writes them through the service-role
-- client. RLS with no policy is therefore the intended default-deny state, not
-- a missing grant. Adding a policy here would open a surface the product does
-- not use, so this migration adds none.
--
-- Not covered here on purpose: the foreign-key index, Auth RLS InitPlan,
-- unused-index and permissive-policy advisories are performance findings, not
-- part of these five defects. They are listed in the delivery report for a
-- separate, approved change.
-- ---------------------------------------------------------------------------
