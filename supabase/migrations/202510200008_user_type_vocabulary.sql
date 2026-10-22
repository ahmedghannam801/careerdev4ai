-- Phase B.4 — Align the profiles.user_type CHECK constraint with the
-- CareerState vocabulary the application actually uses.
--
-- The live database enforces:
--   user_type IN ('student', 'graduate', 'working', 'career_shift')
--
-- but the domain type (src/types/career.ts) and the onboarding UI produce:
--   student | fresh_graduate | working_professional | career_switcher | exploring
--
-- This was verified live: with the B.4 H-4 fix the server's allow-list
-- accepted the domain vocabulary, and the DATABASE then rejected
-- 'working_professional' with
--   "new row for relation profiles violates check constraint
--    profiles_user_type_check"
-- so every onboarding submission that selected a persona other than
-- 'student' failed at the database.
--
-- The constraint is replaced with a SUPERSET: every value that was valid
-- before stays valid, so no existing row is invalidated and no row is
-- deleted. The statement is idempotent and can be applied to a database
-- that already has the wider constraint without changing anything.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_type_check
  CHECK (
    user_type IS NULL OR user_type IN (
      -- the CareerState vocabulary (src/types/career.ts)
      'student',
      'fresh_graduate',
      'working_professional',
      'career_switcher',
      'exploring',
      -- the legacy vocabulary, kept so no existing row is invalidated
      'graduate',
      'working',
      'career_shift'
    )
  );
