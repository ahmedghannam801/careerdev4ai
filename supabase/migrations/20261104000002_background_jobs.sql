-- Background jobs — the durable record of a Trigger.dev background run.
--
-- Trigger.dev executes the work; Supabase remains the system of record for
-- what happened. This table is the single place where a candidate's job state
-- lives, so the interface can show "queued / processing / completed / failed"
-- and — crucially — can recover that state after a page refresh, a navigation
-- away, or a return the next day. Without it, a result that finished while the
-- browser was closed would be invisible and unrecoverable.
--
-- The table is intentionally narrow. It records *that* a job exists, *whose* it
-- is, *what* it was for, and *how it ended*. The work itself stays in the
-- domain tables (cvs, cv_versions, application_packages, cover_letters,
-- roadmaps), so nothing that already reads those tables has to change.
--
-- Ownership: every row belongs to exactly one profile, and the profile id is
-- the id verified from the caller's Supabase JWT — never a value supplied by
-- the browser. Row Level Security is enabled with the same own-rows-only
-- policies the rest of the schema uses, so a browser request that somehow
-- bypassed the server would still read nothing belonging to anyone else.
--
-- Idempotency: `idempotency_key` is a deterministic hash of the request
-- (profile, kind, source record, request content). A double submit produces
-- the same key, so it can never produce a second row. A deliberate retry bumps
-- `attempt` instead of creating a new row, which keeps the history of one
-- logical job in one place.
--
-- Backward compatible: this migration only creates a new table and its
-- policies. No existing table is altered, no row is rewritten and no existing
-- query changes meaning.

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The owner. The id comes from the verified Supabase session, so it is the
  -- only identity the application trusts.
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The Trigger.dev task that does the work, e.g. 'process-cv'.
  task_id text NOT NULL,

  -- The Trigger.dev run that carries it out. Null until the run is created.
  run_id text,

  -- Which workflow this is, e.g. 'process-cv'. Kept separately from task_id so
  -- the interface can filter by workflow even if a task is renamed.
  kind text NOT NULL,

  -- queued -> processing -> completed | failed | cancelled.
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),

  -- A real, honest description of the current stage. Never a made-up
  -- percentage: this is the last thing the task actually reported doing.
  stage text,

  -- The domain record the job is about, e.g. the cv it processes.
  source_type text,
  source_id uuid,

  -- Deterministic hash of the request. Unique, so the same request can never
  -- create two rows.
  idempotency_key text NOT NULL,

  -- How many times this job has been started. 1 on the first attempt.
  attempt integer NOT NULL DEFAULT 1,

  -- The request the job was started with.
  --
  -- A retry replays exactly this, so the second attempt cannot quietly do
  -- something different from the first one.
  request jsonb,

  -- The reference to the finished work: ids of the rows that were written.
  result jsonb,

  -- Why it failed, in a form the interface can show and act on.
  error_code text,
  error_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- One row per logical job, however many times the request is repeated.
CREATE UNIQUE INDEX IF NOT EXISTS background_jobs_idempotency_key_key
  ON public.background_jobs (idempotency_key);

-- The listing query: one user's jobs, newest first.
CREATE INDEX IF NOT EXISTS background_jobs_profile_created_idx
  ON public.background_jobs (profile_id, created_at DESC);

-- Lets the server find a job by the run it created.
CREATE INDEX IF NOT EXISTS background_jobs_run_id_idx
  ON public.background_jobs (run_id);

-- Keeps `updated_at` honest without the application having to remember it.
CREATE OR REPLACE FUNCTION public.background_jobs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS background_jobs_touch_updated_at ON public.background_jobs;
CREATE TRIGGER background_jobs_touch_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.background_jobs_touch_updated_at();

-- Row Level Security: a candidate reads and writes only their own jobs.
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='background_jobs' AND policyname='background_jobs_select_own') THEN
    CREATE POLICY background_jobs_select_own ON public.background_jobs FOR SELECT USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='background_jobs' AND policyname='background_jobs_insert_own') THEN
    CREATE POLICY background_jobs_insert_own ON public.background_jobs FOR INSERT WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='background_jobs' AND policyname='background_jobs_update_own') THEN
    CREATE POLICY background_jobs_update_own ON public.background_jobs FOR UPDATE USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='background_jobs' AND policyname='background_jobs_delete_own') THEN
    CREATE POLICY background_jobs_delete_own ON public.background_jobs FOR DELETE USING (auth.uid() = profile_id);
  END IF;
END $$;

-- The table is written through the server (service_role) because a Trigger.dev
-- task has no end-user session. The browser never needs to write it directly,
-- so the client grants are revoked: a leak of the anon or authenticated key
-- must not allow anyone to fabricate a "completed" job.
REVOKE ALL ON public.background_jobs FROM anon;
REVOKE ALL ON public.background_jobs FROM authenticated;
