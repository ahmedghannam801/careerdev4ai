-- Migration: 20261118000001_experience_level.sql
--
-- The candidate's TARGET EXPERIENCE LEVEL.
--
-- WHY A NEW COLUMN
-- `profiles.user_type` already exists and answers a different question: who
-- the candidate is right now (student, fresh graduate, working professional,
-- career switcher, exploring). That column is read by the admin audience
-- filter, the AI career context and the career-state vocabulary, so its
-- meaning cannot be changed.
--
-- The experience level answers a different question: what level is the
-- candidate AIMING at — Student, Intern, Junior, Mid, Senior, Lead. A final
-- year student and a fresh graduate both aim at Junior. A working
-- professional aiming at a Lead role aims at Lead. These are different axes
-- and they get different columns.
--
-- It is deliberately nullable: a candidate who has not chosen a level yet has
-- no level, and an empty column says that honestly. It is backfilled from the
-- career state where the mapping is unambiguous, so existing accounts get a
-- sensible starting value instead of an empty dropdown — but it is only ever
-- a starting value, and the candidate can change it at any time.
--
-- The vocabulary is enforced by a CHECK constraint, so a value outside it can
-- never be written, whatever the client sends.

BEGIN;

-- ---------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS experience_level text;

COMMENT ON COLUMN public.profiles.experience_level IS
  'The candidate''s target experience level: student, intern, junior, mid, senior or lead. NULL means not set. Separate from user_type, which records the candidate''s current career state.';

-- ---------------------------------------------------------------------
-- The vocabulary
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_experience_level_vocabulary'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_experience_level_vocabulary
      CHECK (
        experience_level IS NULL OR
        experience_level IN ('student', 'intern', 'junior', 'mid', 'senior', 'lead')
      );
  END IF;
END
$$;

-- ---------------------------------------------------------------------
-- The backfill
--
-- The mapping is only applied where the career state makes it unambiguous.
-- A NULL career state stays NULL: the candidate chooses their own level.
-- ---------------------------------------------------------------------

UPDATE public.profiles
   SET experience_level = CASE user_type
        WHEN 'student'              THEN 'student'
        WHEN 'fresh_graduate'       THEN 'junior'
        WHEN 'working_professional'  THEN 'mid'
        WHEN 'career_switcher'      THEN 'junior'
        WHEN 'exploring'            THEN 'intern'
        ELSE NULL
      END
 WHERE experience_level IS NULL
   AND user_type IS NOT NULL;

-- ---------------------------------------------------------------------
-- The read helper
--
-- The server reads the level through this function so that the vocabulary
-- lives in exactly one place in the database, and a row written before this
-- migration (or by an older client) can never produce an unknown level.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.careerpilot_experience_levels()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY['student', 'intern', 'junior', 'mid', 'senior', 'lead']::text[];
$$;

COMMENT ON FUNCTION public.careerpilot_experience_levels() IS
  'The vocabulary of profiles.experience_level. The application asserts that this list equals shared/experienceLevel.ts EXPERIENCE_LEVELS.';

COMMIT;
