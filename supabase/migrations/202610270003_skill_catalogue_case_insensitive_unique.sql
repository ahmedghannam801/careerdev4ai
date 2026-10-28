-- Case-insensitive duplicate protection for the global skill catalogue.
--
-- WHY THIS MIGRATION EXISTS
-- -----------------------
-- `public.skills` is a GLOBAL catalogue: one row per skill, shared by every
-- user. The only constraint on it was `skills_name_key UNIQUE (name)`, which
-- compares the name exactly. Postgres therefore treated "Arabic" and "arabic"
-- as two different skills, and production had both:
--
--   6303f462-4d2f-46f5-a127-a1d511c90b6c  "Arabic"  (2 user ratings)
--   048c2c99-d5d8-47b8-8fb3-a71d3aa4868a  "arabic"  (1 user rating)
--
-- A user who rated one spelling and then added the other would see the same
-- skill twice in their profile, twice in the CV builder's skill list, and
-- twice in the AI context. The gap engine would also treat the two as
-- separate skills.
--
-- The fix has two halves. The application half is in
-- `server/db/userSkills.ts`: the lookup that resolves a typed skill name is
-- now case-insensitive, so a third variant cannot be created. The database
-- half is this migration: a unique index over the normalised name, so even a
-- direct write cannot create a fourth variant.
--
-- NOTHING IS DELETED
-- ------------------
-- The existing pair is left in place. The rating on the lower-case row is
-- MOVED to the canonical row (an UPDATE that preserves the row, the level and
-- the user), and the index below excludes that one legacy row so it can be
-- created.
--
-- Idempotent: every statement can be re-applied. No row is removed.

-- ---------------------------------------------------------------------------
-- 1. Move the rating off the lower-case row onto the canonical one
-- ---------------------------------------------------------------------------
--
-- The canonical row is the one with the correct casing. The unique
-- constraint on (user_id, skill_id) means a user cannot hold both, so a
-- rating is only moved when the user does not already hold the canonical
-- one. The NOT EXISTS clause makes the statement safe to run twice.

UPDATE public.user_skills us
   SET skill_id = '6303f462-4d2f-46f5-a127-a1d511c90b6c'
 WHERE us.skill_id = '048c2c99-d5d8-47b8-8fb3-a71d3aa4868a'
   AND NOT EXISTS (
     SELECT 1
       FROM public.user_skills other
      WHERE other.user_id = us.user_id
        AND other.skill_id = '6303f462-4d2f-46f5-a127-a1d511c90b6c'
   );

-- ---------------------------------------------------------------------------
-- 2. Reject any new case-insensitive duplicate
-- ---------------------------------------------------------------------------
--
-- The index covers every row except the one legacy lower-case row, which is
-- kept for the record. A skill named "ARABIC", "Arabic " or "arabic" is now
-- rejected, because "Arabic" already exists.

CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_unique_normalised_name
    ON public.skills (lower(btrim(name)))
   WHERE id <> '048c2c99-d5d8-47b8-8fb3-a71d3aa4868a';

COMMENT ON INDEX public.idx_skills_unique_normalised_name IS
  'Guards the global skill catalogue against case-insensitive duplicates. The one legacy lower-case row is excluded so nothing is deleted; the application now looks skills up case-insensitively, so no new variant can be created.';
