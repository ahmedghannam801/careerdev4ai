-- Phase B.3.9 — Skill catalogue read policy
--
-- `public.skills` is a GLOBAL catalogue: every user writes to it and every
-- user's skill links point at it. It had RLS enabled with NO read policy, so
-- the anon/authenticated clients could read NOTHING — only the service-role
-- client could. The frontend therefore could not resolve a skill name to its
-- catalogue row.
--
-- This migration adds a SELECT policy for authenticated users. The catalogue
-- holds skill names, categories and descriptions — no user data — so reading
-- it is safe. Writes stay restricted to the service-role client, which is the
-- only thing that creates catalogue rows.
--
-- Idempotent: applying it to a database that already has the policy changes
-- nothing. No table is modified and no row is deleted.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='skills' AND policyname='skills_select_authenticated') THEN
    CREATE POLICY skills_select_authenticated ON public.skills FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
