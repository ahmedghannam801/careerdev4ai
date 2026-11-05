// The durable record of a background job.
//
// One row per logical job. The API writes it when the job is admitted, the
// queue worker updates it as the work proceeds, and the interface reads it to
// show the state. Because the state lives in Supabase and not in the browser, a
// candidate who closes the tab comes back to a finished result instead of an
// empty screen.
//
// The row is the record of truth; the queue message is only the knock on the
// door. That ordering is the whole point: a message can be lost or delivered
// twice, and neither may change what actually happened to a job.
//
// This module is used from both sides of the system — the API and the worker —
// so it goes through the service-role client. Ownership is never taken from
// the request: it is always the verified profile id of the caller, and every
// read is scoped to it.

import { getSupabaseServer } from '../db/supabase';

export type BackgroundJobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * The workflows that can run in the background.
 *
 * The union is the point: the API refuses a kind it does not know, so a
 * browser cannot ask the platform to run an arbitrary task.
 */
export const BACKGROUND_JOB_KINDS = [
  'process-cv',
  'generate-targeted-cv',
  'match-jobs',
  'generate-career-roadmap',
  'update-roadmap-progress',
  'process-ai-mentor-workflow',
  'validate-learning-resources',
] as const;

export type BackgroundJobKind = (typeof BACKGROUND_JOB_KINDS)[number];

/**
 * The queue task that carries out each workflow.
 *
 * The name is the routing key the worker uses to find the code for a job. It
 * is the same string as the kind, kept in its own map so that a kind and the
 * task that runs it can be told apart later without touching every caller.
 */
export const BACKGROUND_JOB_TASKS: Record<BackgroundJobKind, string> = {
  'process-cv': 'process-cv',
  'generate-targeted-cv': 'generate-targeted-cv',
  'match-jobs': 'match-jobs',
  'generate-career-roadmap': 'generate-career-roadmap',
  'update-roadmap-progress': 'update-roadmap-progress',
  'process-ai-mentor-workflow': 'process-ai-mentor-workflow',
  'validate-learning-resources': 'validate-learning-resources',
};

export interface BackgroundJob {
  id: string;
  profile_id: string;
  task_id: string;
  /** The id of the queue message that carries this job out. */
  run_id: string | null;
  kind: BackgroundJobKind;
  status: BackgroundJobStatus;
  stage: string | null;
  source_type: string | null;
  source_id: string | null;
  idempotency_key: string;
  attempt: number;
  request: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  error_detail: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  queued_at: string | null;
  scheduled_at: string | null;
  dispatched_at: string | null;
  dispatch_needed: boolean;
  dispatch_attempts: number;
  recovery_attempts: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  lease_expires_at: string | null;
}

/** The shape the interface receives. Deliberately narrower than the row. */
export interface PublicBackgroundJob {
  id: string;
  kind: BackgroundJobKind;
  status: BackgroundJobStatus;
  stage: string | null;
  sourceType: string | null;
  sourceId: string | null;
  attempt: number;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** True when the job is waiting and no worker has picked it up yet. */
  waitingForRunner: boolean;
}

/**
 * How long a job may sit waiting before the interface says it is waiting.
 *
 * A worker normally picks a job up within seconds. Three minutes is long
 * enough that an ordinary slow start is not reported as a problem, and short
 * enough that a candidate is not left watching a spinner with no explanation.
 */
export const QUEUE_WAITING_AFTER_MS = 3 * 60_000;

/**
 * How long a job may sit waiting before it is given up on.
 *
 * A job that has not started after this long has no worker behind it, and
 * leaving it waiting for ever would be a lie. It is failed with a reason
 * instead, and the candidate can start it again by hand.
 *
 * The window is generous on purpose. A job can legitimately wait — a
 * candidate's work on one record runs one at a time — so the threshold has to
 * clear the slowest ordinary wait before it concludes that nothing is coming.
 * If a task does eventually start, it overwrites the row with what it really
 * did, so a wrong call here is corrected rather than permanent.
 */
export const QUEUE_STALE_AFTER_MS = 30 * 60_000;

/**
 * Fails the jobs that have been waiting for a worker for too long.
 *
 * A job that never started is not "in progress" — nothing is happening to it.
 * Leaving the row waiting would show a spinner for ever and tell the candidate
 * nothing, so the row is given an outcome with a reason, and the candidate can
 * start it again by hand.
 *
 * The sweep measures against `queued_at` — when the *current* attempt started
 * waiting — rather than against `created_at`. A job that was retried ten
 * minutes ago has been waiting ten minutes, not since the day it was first
 * submitted, and giving up on it would be wrong.
 *
 * The sweep is safe to run repeatedly: it only touches rows that are still
 * waiting, and a task that does eventually start overwrites the row with what
 * it really did.
 */
export async function failStaleQueuedJobs(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - QUEUE_STALE_AFTER_MS).toISOString();
  const nowIso = new Date(now).toISOString();

  const supabase = getSupabaseServer();

  // Two passes, because the two clocks are not the same column. A row written
  // after the queue migration has a `queued_at` — the moment the *current*
  // attempt started waiting. A row that predates the migration has none, and
  // for that row `created_at` is the best evidence there is.
  //
  // The first pass is the one that matters: a retried job has been waiting
  // since its last attempt, not since the day it was first submitted.
  const { data: byQueueTime, error: queueTimeError } = await supabase
    .from('background_jobs')
    .update({
      status: 'failed',
      error_code: 'no_runner_available',
      error_message:
        'No worker picked this job up, so it did not start. It can be started again from the background jobs list.',
      completed_at: nowIso,
      dispatch_needed: false,
      updated_at: nowIso,
    })
    .in('status', ['pending', 'queued'])
    .lt('queued_at', cutoff)
    .select('id');

  if (queueTimeError) {
    // A failed sweep is not worth breaking the request over: the jobs are still
    // readable, and the next sweep will try again.
    console.error('Could not fail the stale background jobs:', queueTimeError.message);
    return 0;
  }

  const { data: byCreateTime, error: createTimeError } = await supabase
    .from('background_jobs')
    .update({
      status: 'failed',
      error_code: 'no_runner_available',
      error_message:
        'No worker picked this job up, so it did not start. It can be started again from the background jobs list.',
      completed_at: nowIso,
      dispatch_needed: false,
      updated_at: nowIso,
    })
    .in('status', ['pending', 'queued'])
    .is('queued_at', null)
    .lt('created_at', cutoff)
    .select('id');

  if (createTimeError) {
    console.error('Could not fail the stale background jobs:', createTimeError.message);
    return Array.isArray(byQueueTime) ? byQueueTime.length : 0;
  }

  return (
    (Array.isArray(byQueueTime) ? byQueueTime.length : 0) +
    (Array.isArray(byCreateTime) ? byCreateTime.length : 0)
  );
}

/** True when a waiting job has been waiting long enough to be worth reporting. */
export function isWaitingForRunner(job: BackgroundJob, now = Date.now()): boolean {
  if (job.status !== 'queued' && job.status !== 'pending') return false;
  const queued = new Date(job.queued_at ?? job.created_at).getTime();
  if (!Number.isFinite(queued)) return false;
  return now - queued > QUEUE_WAITING_AFTER_MS;
}

export function toPublicJob(job: BackgroundJob): PublicBackgroundJob {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    sourceType: job.source_type,
    sourceId: job.source_id,
    attempt: job.attempt,
    result: job.result,
    errorCode: job.error_code,
    errorMessage: job.error_message,
    runId: job.run_id,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    waitingForRunner: isWaitingForRunner(job),
  };
}

/**
 * A deterministic fingerprint of a request.
 *
 * The same request must always produce the same key, so a double submit is
 * recognised as the same job rather than a new one. It is a hash of what the
 * job is *for*, never of anything that varies between two identical clicks.
 */
export async function computeIdempotencyKey(parts: (string | number | null | undefined)[]): Promise<string> {
  const material = parts.map((part) => (part === null || part === undefined ? '' : String(part))).join(' ');
  const bytes = new TextEncoder().encode(material);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function isBackgroundJobKind(value: unknown): value is BackgroundJobKind {
  return typeof value === 'string' && (BACKGROUND_JOB_KINDS as readonly string[]).includes(value);
}

/** The job for a given key, if it already exists. */
export async function findJobByIdempotencyKey(key: string): Promise<BackgroundJob | null> {
  const { data, error } = await getSupabaseServer()
    .from('background_jobs')
    .select('*')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw new Error(`Could not read the background job: ${error.message}`);
  return (data as BackgroundJob | null) ?? null;
}

/** The job with this id, but only if it belongs to this profile. */
export async function getJobForProfile(profileId: string, jobId: string): Promise<BackgroundJob | null> {
  const { data, error } = await getSupabaseServer()
    .from('background_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the background job: ${error.message}`);
  return (data as BackgroundJob | null) ?? null;
}

/** Every job of one candidate, newest first. */
export async function listJobsForProfile(profileId: string, limit = 25): Promise<BackgroundJob[]> {
  const { data, error } = await getSupabaseServer()
    .from('background_jobs')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  if (error) throw new Error(`Could not list the background jobs: ${error.message}`);
  return (data as BackgroundJob[]) ?? [];
}

export interface NewJobInput {
  profileId: string;
  kind: BackgroundJobKind;
  taskId: string;
  idempotencyKey: string;
  sourceType?: string | null;
  sourceId?: string | null;
  stage?: string | null;
  /** The request the job was started with, replayed verbatim on a retry. */
  request?: Record<string, unknown> | null;
  /** How many times the job's own work may be attempted. */
  maxAttempts?: number;
}

/**
 * Creates the row for a new job, or returns the one that already exists.
 *
 * The row is written as `pending`: it exists, it is admitted, and it still has
 * to be handed to the queue. It only becomes `queued` once a message really is
 * on the queue — see `markJobDispatched`.
 *
 * The race between two simultaneous submits is handled by the unique index on
 * the idempotency key: the second insert loses and reads the row the first
 * one wrote, so a double click produces one job and one message.
 */
export async function createJob(input: NewJobInput): Promise<{ job: BackgroundJob; created: boolean }> {
  const supabase = getSupabaseServer();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('background_jobs')
    .insert({
      profile_id: input.profileId,
      task_id: input.taskId,
      kind: input.kind,
      status: 'pending',
      stage: input.stage ?? null,
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      idempotency_key: input.idempotencyKey,
      attempt: 1,
      request: input.request ?? null,
      queued_at: now,
      scheduled_at: now,
      dispatch_needed: true,
      dispatch_attempts: 0,
      recovery_attempts: 0,
      max_attempts: input.maxAttempts ?? 2,
    })
    .select('*')
    .maybeSingle();

  if (!error && data) {
    return { job: data as BackgroundJob, created: true };
  }

  // A unique violation means another request with the same fingerprint won the
  // race. That is the desired outcome, not a failure.
  if (error && (error.code === '23505' || /duplicate key/i.test(error.message))) {
    const existing = await findJobByIdempotencyKey(input.idempotencyKey);
    if (existing) return { job: existing, created: false };
  }
  throw new Error(`Could not create the background job: ${error?.message ?? 'unknown error'}`);
}

/**
 * Records that a message for this job is on the queue.
 *
 * The message id is recorded because it is the handle on the execution — the
 * same thing `run_id` used to hold. The "still to be dispatched" flag is
 * cleared, which is what tells the scheduled sweep that this job does not need
 * publishing again.
 */
export async function recordDispatch(jobId: string, messageId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseServer()
    .from('background_jobs')
    .update({
      run_id: messageId,
      queued_at: now,
      dispatched_at: now,
      dispatch_needed: false,
      dispatch_attempts: 1,
      updated_at: now,
    })
    .eq('id', jobId);
  if (error) throw new Error(`Could not update the background job: ${error.message}`);
}

/**
 * Records that the job's message is on the queue.
 *
 * From this moment the job is `queued`: it is in the queue and no worker has
 * started it.
 */
export async function markJobDispatched(jobId: string, messageId: string): Promise<void> {
  await recordDispatch(jobId, messageId);
  const { error } = await getSupabaseServer()
    .from('background_jobs')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`Could not update the background job: ${error.message}`);
}

/**
 * Records that the job's message could not be handed to the queue.
 *
 * The job stays `pending` with `dispatch_needed` set, so the worker's
 * scheduled sweep will pick it up and publish it again. A publication that
 * failed must never leave a job stranded for ever.
 */
export async function markJobDispatchPending(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getSupabaseServer()
    .from('background_jobs')
    .update({
      status: 'pending',
      stage: null,
      dispatch_needed: true,
      dispatch_attempts: 1,
      scheduled_at: now,
      queued_at: now,
      updated_at: now,
    })
    .eq('id', jobId);
  if (error) throw new Error(`Could not update the background job: ${error.message}`);
}

/**
 * Fails a job whose message could never be handed to the queue.
 *
 * This is only for a permanent condition — there is no queue on this server at
 * all. A publication that failed for a temporary reason is not failed here: it
 * stays pending and is published again by the scheduled sweep.
 */
export async function markJobFailed(
  jobId: string,
  errorCode: string,
  errorMessage: string,
  stage?: string | null,
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('background_jobs')
    .update({
      status: 'failed',
      stage: stage ?? null,
      error_code: errorCode,
      error_message: errorMessage.slice(0, 500),
      completed_at: new Date().toISOString(),
      dispatch_needed: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Could not update the background job: ${error.message}`);
}

/**
 * Records the stage the task has reached.
 *
 * The stage is what the candidate reads while the job runs, so it has to be
 * the real thing: the last thing the task actually started doing, never a
 * percentage that was invented to look busy.
 */
export async function updateJobStage(jobId: string, stage: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('background_jobs')
    .update({ stage: stage.slice(0, 200), updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`Could not update the background job: ${error.message}`);
}

/** Marks a job the candidate stopped. */
export async function markJobCancelled(jobId: string, stage?: string | null): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('background_jobs')
    .update({
      status: 'cancelled',
      stage: stage ?? null,
      completed_at: new Date().toISOString(),
      dispatch_needed: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Could not update the background job: ${error.message}`);
}

/**
 * Prepares a job for another attempt.
 *
 * A retry reuses the same row so the history of one logical job stays in one
 * place; the attempt counter goes up and the previous failure is cleared. The
 * job goes back to `pending`, because it still has to be handed to the queue.
 */
export async function prepareJobRetry(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: current, error: readError } = await getSupabaseServer()
    .from('background_jobs')
    .select('attempt')
    .eq('id', jobId)
    .maybeSingle();
  if (readError) throw new Error(`Could not read the background job: ${readError.message}`);

  const { error } = await getSupabaseServer()
    .from('background_jobs')
    .update({
      status: 'pending',
      stage: null,
      attempt: ((current as { attempt?: number } | null)?.attempt ?? 1) + 1,
      run_id: null,
      result: null,
      error_code: null,
      error_message: null,
      error_detail: null,
      started_at: null,
      completed_at: null,
      queued_at: now,
      scheduled_at: now,
      dispatched_at: null,
      dispatch_needed: true,
      dispatch_attempts: 0,
      updated_at: now,
    })
    .eq('id', jobId);
  if (error) throw new Error(`Could not update the background job: ${error.message}`);
}

/**
 * The jobs that still have to be handed to the queue.
 *
 * The worker's scheduled sweep reads these and publishes them. A job that is
 * still marked as needing a dispatch has either never been published or was
 * published for an attempt that did not happen — both are recovered here.
 */
export async function listJobsNeedingDispatch(limit = 50): Promise<BackgroundJob[]> {
  const { data, error } = await getSupabaseServer()
    .from('background_jobs')
    .select('*')
    .eq('dispatch_needed', true)
    .in('status', ['pending', 'queued'])
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(Math.max(1, Math.min(200, limit)));
  if (error) throw new Error(`Could not list the background jobs to dispatch: ${error.message}`);
  return (data as BackgroundJob[]) ?? [];
}

/**
 * The jobs a worker was interrupted while holding.
 *
 * The lease on a job runs out if the worker dies mid-job. The row is still
 * 'processing' and nobody is working on it, so the scheduled sweep hands it
 * back to the queue.
 */
export async function listJobsWithExpiredLease(now = Date.now()): Promise<BackgroundJob[]> {
  const { data, error } = await getSupabaseServer()
    .from('background_jobs')
    .select('*')
    .eq('status', 'processing')
    .lt('lease_expires_at', new Date(now).toISOString())
    .limit(50);
  if (error) throw new Error(`Could not list the interrupted background jobs: ${error.message}`);
  return (data as BackgroundJob[]) ?? [];
}

/**
 * Hands an interrupted job back to the queue.
 *
 * The recovery is counted apart from the job's own attempts: a worker that was
 * interrupted is not the job's fault, and it should not spend the job's retry
 * allowance. It is still bounded, so a job that keeps killing its worker is
 * eventually given up on.
 */
export async function recoverInterruptedJob(jobId: string, maxRecoveryAttempts = 3): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('background_jobs')
    .update({
      status: 'pending',
      stage: null,
      locked_at: null,
      locked_by: null,
      lease_expires_at: null,
      dispatch_needed: true,
      scheduled_at: new Date().toISOString(),
      queued_at: new Date().toISOString(),
      dispatched_at: null,
      dispatch_attempts: 0,
      recovery_attempts: 1,
      error_code: 'worker_interrupted',
      error_message: 'The worker running this job was interrupted. It has been handed back to the queue.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'processing')
    .select('id, recovery_attempts');
  if (error) throw new Error(`Could not recover the background job: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) return false;

  const attempts = Number((data[0] as { recovery_attempts?: number }).recovery_attempts ?? 1);
  if (attempts >= maxRecoveryAttempts) {
    const { error: failError } = await getSupabaseServer()
      .from('background_jobs')
      .update({
        status: 'failed',
        error_code: 'worker_interrupted',
        error_message:
          'The worker running this job was interrupted several times, so the job was given up on. It can be started again by hand.',
        completed_at: new Date().toISOString(),
        dispatch_needed: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    if (failError) throw new Error(`Could not fail the background job: ${failError.message}`);
    return false;
  }
  return true;
}
