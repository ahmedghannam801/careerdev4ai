-- Production security hardening for the trigger functions.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- Supabase Production runs this hardening, applied as the migration
-- `20261023105343` (production_security_function_hardening). That migration
-- was executed directly against the database and was never committed to this
-- repository, so the migrations in `supabase/migrations` did not reproduce the
-- production schema: a database rebuilt from this folder alone would have
-- left `handle_new_user()` and `rls_auto_enable()` executable by `anon` and
-- `authenticated`, and would have left `storage_object_owner()` running with a
-- caller-controlled search path.
--
-- This file closes that gap. The statements are exactly the ones Production
-- runs, so applying them to a database that already has the hardening is a
-- no-op.
--
-- WHAT EACH STATEMENT DOES
-- ------------------------
-- `handle_new_user()` and `rls_auto_enable()` are SECURITY DEFINER
-- functions: they run with the privileges of their owner, not of the caller.
-- Exposing either of them to `anon` or `authenticated` would let a client
-- invoke privileged DDL directly. Revoking those grants closes the hole.
--
-- A SECURITY DEFINER function that resolves names through a caller-controlled
-- search path can be turned into a privilege escalation: the caller supplies
-- a schema containing a shadowing table, and the function executes it as the
-- owner. Pinning the search path removes that choice. `handle_new_user()`
-- needs `public` for its own table, so its path is `public, pg_temp`;
-- `rls_auto_enable()` only touches `pg_catalog`, so its path is
-- `pg_catalog, pg_temp`.
--
-- Idempotent: every statement can be re-applied. No table is dropped, no row
-- is changed and no function is replaced.

-- The storage helper resolves objects in the `storage` schema, so that
-- schema has to stay on its search path.
ALTER FUNCTION public.storage_object_owner(text) SET search_path = public, storage, pg_temp;

-- The trigger functions must not be callable by a client.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Pin the search path of the two SECURITY DEFINER functions.
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.rls_auto_enable() SET search_path = pg_catalog, pg_temp;
