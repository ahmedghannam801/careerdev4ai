-- Phase B.4 — Job bookmarks persistence
--
-- The "Saved Jobs" filter and the bookmark toggle lived only in React state,
-- so a saved job vanished on every reload and on every device change. The
-- feature could not be persisted without a table.
--
-- The table stores ONLY the catalogue id (public.job_bookmarks.job_id): the
-- job listings themselves are the static catalogue in src/data/jobsData.ts,
-- so there is no duplicated job data that could drift from the catalogue.
--
-- Ownership model: auth.users.id -> public.profiles.id -> job_bookmarks.profile_id
-- (the same model as every other domain table).
--
-- The statement is idempotent: it creates no row and deletes no row, and it
-- can be applied to a database that already has the table without changing
-- anything.

CREATE TABLE IF NOT EXISTS public.job_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_bookmarks_profile_job_key UNIQUE (profile_id, job_id)
);

-- Index for the user's bookmark list.
CREATE INDEX IF NOT EXISTS idx_job_bookmarks_profile
  ON public.job_bookmarks(profile_id, created_at);

-- Row Level Security: the owner sees only their own bookmarks, and may insert
-- and delete only their own. The policy expressions match the ownership model
-- used by every other domain table.
ALTER TABLE public.job_bookmarks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_bookmarks' AND policyname='job_bookmarks_select_own') THEN
    CREATE POLICY job_bookmarks_select_own ON public.job_bookmarks FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_bookmarks' AND policyname='job_bookmarks_insert_own') THEN
    CREATE POLICY job_bookmarks_insert_own ON public.job_bookmarks FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_bookmarks' AND policyname='job_bookmarks_delete_own') THEN
    CREATE POLICY job_bookmarks_delete_own ON public.job_bookmarks FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;
