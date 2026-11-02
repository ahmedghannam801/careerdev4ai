-- Public profiles and column-level privacy
--
-- `profiles_select_public` was a ROW-level policy: it let anyone read a row
-- whose `is_public` flag is true. RLS does not restrict COLUMNS, so a direct
-- PostgREST request with the public anon key could select every column of a
-- public profile - including `phone`, which the product never shows on the
-- public profile page.
--
-- The public profile page is served by `GET /api/profile/public/:username`,
-- which uses the server-side service role and returns only the fields it
-- explicitly maps. No browser code reads `profiles` directly. The grants below
-- therefore remove direct table access from `anon` and drop the broad public
-- row policy. An authenticated user can still read their own row through
-- `profiles_select_own`; the service role is unaffected.
--
-- Idempotent: dropping an absent policy and revoking an absent privilege are
-- no-ops.

DROP POLICY IF EXISTS profiles_select_public ON public.profiles;

REVOKE SELECT ON public.profiles FROM anon;

-- The previous version of this migration replaced the authenticated table
-- grant with a column list. Restore the table grant: RLS already limits an
-- authenticated caller to their own row.
GRANT SELECT ON public.profiles TO authenticated;
