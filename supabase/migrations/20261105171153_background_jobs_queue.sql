-- Background jobs — the Cloudflare Queues transport.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The background work used to be carried out by Trigger.dev. It is now carried
-- out by a Cloudflare Worker that consumes a Cloudflare Queue. That change
-- moves the *transport*, not the record: Supabase Postgres stays the system of
-- record for what a job is and what happened to it, and the queue only carries
-- the message that tells a worker "come and do job X".
--
-- The split is deliberate:
--
--   * A queue message can be delivered twice, or not at all. A database row
--     cannot. So the row is written first and the message is published after.
--   * A queue message is short-lived. A job may run for minutes and must
--     survive a restart, so its payload and its progress live in the row.
--   * Two workers may receive the same message at the same time. The row is
--     claimed with a conditional update, so exactly one of them wins.
--
-- WHAT THIS MIGRATION ADDS
-- -------------------------
--   * `pending` joins the status vocabulary: the row is written and admitted,
--     but its message has not been accepted by the queue yet.
--   * The columns the dispatcher, the retry schedule and the recovery sweep
--     read by.
--   * The indexes those three readers need.
--   * `background_job_consumers`: the heartbeat table that lets the API say
--     truthfully whether a worker is picking work up.
--   * Three functions — claim, complete, fail — that move a job between states
--     atomically. They are the only way a job changes state.
--
-- Nothing is destroyed. Every existing row keeps its values, its status and its
-- meaning; `run_id` is kept and now carries the id of the queue message that
-- carries the job out, which is the same thing it used to carry — the id of
-- the run that does the work.

-- ---------------------------------------------------------------------------
-- The status vocabulary
-- ---------------------------------------------------------------------------
--
-- `pending`  the row is written and admitted; the message has not been
--             accepted by the queue yet.
-- `queued`   the message is in the queue and no worker has started the job.
-- `processing` a worker holds the job and is doing the work.
-- `completed` the work finished and the result is stored.
-- `failed`   the work failed, or never started; `error_code` says why.
-- `cancelled` the candidate stopped it.
--
-- The check is replaced rather than widened in place so that a row can never
-- hold a status outside this list. Existing rows all hold a status that is
-- still in the list, so the constraint is satisfied by every row that exists.
ALTER TABLE public.background_jobs DROP CONSTRAINT IF EXISTS background_jobs_status_check;

ALTER TABLE public.background_jobs
  ADD CONSTRAINT background_jobs_status_check
  CHECK (status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled'));

-- ---------------------------------------------------------------------------
-- The columns the queue needs
-- ---------------------------------------------------------------------------
--
-- `run_id`          the id of the queue message that carries this job out.
--                   The same column the previous runtime used for the id of
--                   the run; it is still the handle on the execution.
-- `queued_at`       when the current attempt was put back into the queue. The
--                   "never started" sweep measures against this, not against
--                   `created_at`, so that a retried job is not given up on
--                   because of how old the row is.
-- `scheduled_at`    when the job should next be handed to the queue. NULL
--                   means "as soon as possible".
-- `dispatched_at`   when the job was last handed to the queue.
-- `dispatch_needed` true when the job still has to be handed to the queue.
--                   This flag is what makes a failed publication recoverable:
--                   it stays true until a message is really on the queue, and
--                   the scheduled sweep picks it up again.
-- `dispatch_attempts` how many times the job has been handed to the queue.
-- `recovery_attempts` how many times a worker was interrupted while holding
--                   the job. Kept apart from `attempt` so that an interrupted
--                   worker does not spend the job's own retry allowance.
-- `max_attempts`    how many times the job's own work may be attempted.
-- `locked_at`       when the worker claimed the job.
-- `locked_by`       which worker holds the job.
-- `lease_expires_at` when the worker's hold on the job runs out. A job whose
--                   lease expired is recovered by the scheduled sweep.
-- `error_detail`    the structured failure information: which step failed and
--                   what the error was, without any credential in it.
ALTER TABLE public.background_jobs
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_detail jsonb;

-- The rows that already exist were written before there was a queue. For them
-- the moment they started waiting is the moment they were created, which is
-- the only evidence there is. Backfilling it means the sweep that gives up on
-- a job that never started can measure against one clock for every row, and
-- the legacy rows are not left without one.
UPDATE public.background_jobs
   SET queued_at = created_at
 WHERE queued_at IS NULL;

-- ---------------------------------------------------------------------------
-- The indexes the queue readers need
-- ---------------------------------------------------------------------------

-- The dispatcher reads the jobs that still have to be handed to the queue. The
-- index is partial so it holds only the waiting jobs, not the finished ones.
CREATE INDEX IF NOT EXISTS background_jobs_dispatch_idx
  ON public.background_jobs (scheduled_at)
  WHERE dispatch_needed AND status IN ('pending', 'queued');

-- The recovery sweep reads the jobs a worker was interrupted while holding.
CREATE INDEX IF NOT EXISTS background_jobs_lease_idx
  ON public.background_jobs (lease_expires_at)
  WHERE status = 'processing';

-- The "never started" sweep reads the jobs that are waiting and have been
-- waiting for too long.
CREATE INDEX IF NOT EXISTS background_jobs_waiting_idx
  ON public.background_jobs (queued_at)
  WHERE status IN ('pending', 'queued');

-- The listing of one candidate's jobs, and the ownership check on it.
CREATE INDEX IF NOT EXISTS background_jobs_profile_status_idx
  ON public.background_jobs (profile_id, status);

-- One candidate's work on one record never overlaps itself: this index is what
-- the claim function's overlap check reads.
CREATE INDEX IF NOT EXISTS background_jobs_concurrency_idx
  ON public.background_jobs (profile_id, kind, source_id)
  WHERE status = 'processing';

-- ---------------------------------------------------------------------------
-- The consumer heartbeat
-- ---------------------------------------------------------------------------
--
-- The API has to be able to say whether a worker is picking work up. It cannot
-- ask the queue, and it must not guess: a queue that is configured but has no
-- worker behind it is a service that cannot do anything, and the interface has
-- to say so out loud.
--
-- So the worker writes a row here every time it runs its scheduled sweep, and
-- the API reads the last one. A heartbeat that has gone quiet is evidence, not
-- a guess.
CREATE TABLE IF NOT EXISTS public.background_job_consumers (
  consumer_id text PRIMARY KEY,
  queue text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  jobs_processed bigint NOT NULL DEFAULT 0,
  metadata jsonb
);

-- The heartbeat is a service-side record. No client reads it and no client
-- writes it; the API reaches it with the service role, which bypasses RLS.
ALTER TABLE public.background_job_consumers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.background_job_consumers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.background_job_consumers TO service_role;

-- ---------------------------------------------------------------------------
-- Claiming a job
-- ---------------------------------------------------------------------------
--
-- `claim_background_job` is the only place a job starts running, and it is
-- written so that two workers holding the same message cannot both win.
--
-- The claim is a single conditional UPDATE. Postgres takes a row lock for it
-- and re-checks the WHERE clause when the lock is granted, so exactly one of
-- two concurrent callers updates the row and the other updates zero rows. The
-- caller that updated zero rows is told to skip: the job has already been
-- claimed, has already finished, was cancelled, or belongs to a newer attempt.
--
-- `p_attempt` is the attempt the message carries. A message left over from an
-- older attempt is refused, so a redelivered old message cannot revive a job
-- that has already moved on.
--
-- The function returns JSON because it has two kinds of answer: the outcome,
-- and — when the job was claimed — the row itself.
CREATE OR REPLACE FUNCTION public.claim_background_job(
  p_job_id uuid,
  p_attempt integer,
  p_consumer_id text,
  p_stage text,
  p_lease_seconds integer DEFAULT 600
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.background_jobs;
  v_conflict boolean;
BEGIN
  UPDATE public.background_jobs j
     SET status = 'processing',
         stage = left(coalesce(p_stage, j.stage), 200),
         started_at = coalesce(j.started_at, now()),
         locked_at = now(),
         locked_by = p_consumer_id,
         lease_expires_at = now() + make_interval(secs => greatest(30, coalesce(p_lease_seconds, 600))),
         dispatch_needed = false,
         updated_at = now()
   WHERE j.id = p_job_id
     AND j.attempt = p_attempt
     AND j.status IN ('pending', 'queued')
  RETURNING j.* INTO v_job;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'skip', 'job', NULL);
  END IF;

  -- One candidate's work on one record does not overlap itself. The same CV is
  -- never processed twice at the same time, and the same roadmap is never
  -- rewritten twice at the same time.
  SELECT EXISTS (
           SELECT 1
             FROM public.background_jobs o
            WHERE o.id <> v_job.id
              AND o.profile_id = v_job.profile_id
              AND o.kind = v_job.kind
              AND coalesce(o.source_id::text, 'none') = coalesce(v_job.source_id::text, 'none')
              AND o.status = 'processing'
         ) INTO v_conflict;

  IF v_conflict THEN
    -- Hand it straight back. The caller waits a little and asks again rather
    -- than running two copies of the same work at once.
    UPDATE public.background_jobs
       SET status = 'queued',
           stage = NULL,
           locked_at = NULL,
           locked_by = NULL,
           lease_expires_at = NULL,
           dispatch_needed = TRUE,
           scheduled_at = now() + interval '30 seconds',
           queued_at = now(),
           updated_at = now()
     WHERE id = p_job_id;

    RETURN jsonb_build_object('outcome', 'busy', 'job', NULL);
  END IF;

  RETURN jsonb_build_object('outcome', 'claimed', 'job', to_jsonb(v_job));
END;
$$;

-- ---------------------------------------------------------------------------
-- Finishing a job
-- ---------------------------------------------------------------------------
--
-- Only the worker that holds the job may finish it, and only while it holds
-- it. A worker whose lease ran out must not write a result over the result of
-- the worker that took over from it.
CREATE OR REPLACE FUNCTION public.complete_background_job(
  p_job_id uuid,
  p_consumer_id text,
  p_result jsonb,
  p_stage text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.background_jobs;
BEGIN
  UPDATE public.background_jobs j
     SET status = 'completed',
         stage = left(coalesce(p_stage, j.stage), 200),
         result = coalesce(p_result, j.result),
         completed_at = now(),
         locked_at = NULL,
         locked_by = NULL,
         lease_expires_at = NULL,
         dispatch_needed = FALSE,
         error_code = NULL,
         error_message = NULL,
         error_detail = NULL,
         updated_at = now()
   WHERE j.id = p_job_id
     AND j.status = 'processing'
     AND j.locked_by = p_consumer_id
  RETURNING j.* INTO v_row;

  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- Failing a job
-- ---------------------------------------------------------------------------
--
-- A failure is either worth another attempt or it is not. The function decides
-- which, and it does so in the same statement that writes the state, so two
-- workers can never both schedule a retry for the same failure.
--
-- While a job is waiting for its next attempt it keeps the error that stopped
-- it, so the candidate is told what happened rather than being shown a job
-- that simply stopped.
CREATE OR REPLACE FUNCTION public.fail_background_job(
  p_job_id uuid,
  p_consumer_id text,
  p_error_code text,
  p_error_message text,
  p_error_detail jsonb,
  p_max_attempts integer,
  p_backoff_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.background_jobs;
  v_attempt integer;
  v_outcome text;
  v_next_attempt integer;
  v_retry_at timestamptz;
BEGIN
  -- Read the row the worker actually holds. If the lease is gone, the worker
  -- does not own the job any more and must not write to it.
  SELECT j.* INTO v_job
    FROM public.background_jobs j
   WHERE j.id = p_job_id
     AND j.status = 'processing'
     AND j.locked_by = p_consumer_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'skip', 'attempt', NULL, 'retryAt', NULL);
  END IF;

  v_attempt := v_job.attempt;
  v_next_attempt := v_attempt + 1;

  IF v_attempt < coalesce(p_max_attempts, v_job.max_attempts, 3) THEN
    v_outcome := 'retry';
    v_retry_at := now() + make_interval(secs => greatest(1, coalesce(p_backoff_seconds, 30)));

    UPDATE public.background_jobs j
       SET status = 'queued',
           attempt = v_next_attempt,
           stage = NULL,
           error_code = left(coalesce(p_error_code, 'failed'), 100),
           error_message = left(coalesce(p_error_message, 'The job failed.'), 1000),
           error_detail = p_error_detail,
           queued_at = now(),
           scheduled_at = v_retry_at,
           dispatched_at = NULL,
           dispatch_needed = TRUE,
           dispatch_attempts = 0,
           locked_at = NULL,
           locked_by = NULL,
           lease_expires_at = NULL,
           updated_at = now()
     WHERE j.id = p_job_id;

    RETURN jsonb_build_object('outcome', 'retry', 'attempt', v_next_attempt, 'retryAt', v_retry_at);
  END IF;

  UPDATE public.background_jobs j
     SET status = 'failed',
         stage = NULL,
         error_code = left(coalesce(p_error_code, 'failed'), 100),
         error_message = left(coalesce(p_error_message, 'The job failed.'), 1000),
         error_detail = p_error_detail,
         completed_at = now(),
         locked_at = NULL,
         locked_by = NULL,
         lease_expires_at = NULL,
         dispatch_needed = FALSE,
         updated_at = now()
   WHERE j.id = p_job_id;

  RETURN jsonb_build_object('outcome', 'failed', 'attempt', v_attempt, 'retryAt', NULL);
END;
$$;

-- ---------------------------------------------------------------------------
-- Who may call these
-- ---------------------------------------------------------------------------
--
-- They are SECURITY DEFINER functions: they run with the privileges of their
-- owner, not of the caller, and they reach rows that RLS keeps away from
-- clients. A client that could call them could claim another candidate's job
-- and read the row back, so the execution right belongs to the service role
-- alone.
REVOKE ALL ON FUNCTION public.claim_background_job(uuid, integer, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_background_job(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_background_job(uuid, text, text, text, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_background_job(uuid, integer, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_background_job(uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_background_job(uuid, text, text, text, jsonb, integer, integer) TO service_role;
