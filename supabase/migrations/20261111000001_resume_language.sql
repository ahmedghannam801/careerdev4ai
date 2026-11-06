-- The resume language.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The platform had three different languages and only two of them had a
-- setting. The interface language and the AI response language were both
-- stored, but the language a CV is written in was not: the CV studio wrote
-- whatever the interface was set to, so an Arabic interface always produced
-- an Arabic CV and an English interface always produced an English one.
--
-- A candidate preparing a CV for an employer in another country needs the
-- document in that language while keeping the product they work in in the
-- language they think in. Those are two settings, and this column is the
-- second one.
--
-- WHAT THIS MIGRATION ADDS
-- ------------------------
--   * One column on `public.user_preferences`: the language the CV is
--     written in.
--
-- WHY IT LIVES HERE
-- -----------------
-- The resume language belongs to the ACCOUNT, not to the browser: a candidate
-- who writes their CV in Arabic on a laptop and in English on a phone should
-- get the document they chose on both. `public.user_preferences` is already
-- the account-owned settings table, it is already covered by owner-only
-- row-level security, and adding a column to it introduces no new table and
-- no new access path.
--
-- Nothing is destroyed. Existing rows get the default, so a CV that was
-- written in English before this migration keeps being written in English.
-- The check constraint keeps the column to the two languages the studio can
-- actually render.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS resume_language text NOT NULL DEFAULT 'en';

-- Only the two languages the CV studio can render are storable. A value
-- outside this set would put the document into a language the studio has no
-- headings for.
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_resume_language_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_resume_language_check
  CHECK (resume_language IN ('ar', 'en'));

COMMENT ON COLUMN public.user_preferences.resume_language IS
  'The language the CV is written in. Independent of the interface language and of the AI response language.';
