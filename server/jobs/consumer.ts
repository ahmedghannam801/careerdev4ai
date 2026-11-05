// The worker side of the queue.
//
// A message arrives, a worker picks it up, and this module decides what
// happens to the job it names. Everything here is written around one fact:
// a message can arrive more than once, and it can arrive after the job it
// names has already moved on.
//
// So the job is claimed before anything is done to it, and the claim is
// atomic — a conditional update in the database. Two workers that receive the
// same message both try to claim it and exactly one wins; the other is told to
// skip. That single rule is what makes duplicate delivery harmless, and it is
// what makes a redelivered message after a worker crash safe.

import { getSupabaseServer } from '../db/supabase.ts';
import { JobError, type JobContext, type JobPayload } from './runtime.ts';
import { getJobTask } from './tasks/index.ts';
import { getJobPolicy, backoffSeconds } from './tasks/policies.ts';
import type { JobQueueMessage } from './queue.ts';
import { recordDispatch } from './jobs.ts';

/** How long a worker may hold a job before the job is handed back to the queue. */
export const DEFAULT_LEASE_SECONDS = 600;

/** How long to wait before trying again when the same record is already busy. */
const BUSY_RETRY_SECONDS = 30;

/**
 * One delivery of one message.
 *
 * This is the shape of a Cloudflare queue message, reduced to the two things
 * the worker needs: the body, and the choice of what to do with it.
 */
export interface JobDelivery {
  body: unknown;
  ack(): Promise<void>;
  retry(): Promise<void>;
}

/** What the worker needs to know about itself. */
export interface WorkerContext {
  /** The id of this worker, recorded on the job so that ownership is visible. */
  consumerId: string;
  /** How long this worker may hold a job before the job is handed back. */
  leaseSeconds?: number;
  /**
   * Publishes a message — used to schedule a retry or to hand a busy job back.
   *
   * It returns the id of the message it published, which is what the job row
   * records: that id is the handle on the execution.
   */
  publish(message: JobQueueMessage, options?: { delaySeconds?: number }): Promise<string>;
}

/** What the worker did with a delivery. */
export type DeliveryOutcome =
  | 'completed'
  | 'failed'
  | 'retry_scheduled'
  | 'deferred'
  | 'skipped'
  | 'malformed';

interface ClaimResult {
  outcome: 'claimed' | 'skip' | 'busy';
  job: Record<string, unknown> | null;
}

/**
 * Claims the job the message names.
 *
 * The database does the work; this is only the call. The claim sets the job
 * to `processing`, stamps the lease, and — if another job of the same
 * candidate on the same record is already running — hands it straight back.
 */
async function claimJob(
  jobId: string,
  attempt: number,
  consumerId: string,
  stage: string,
  leaseSeconds: number,
): Promise<ClaimResult> {
  const { data, error } = await getSupabaseServer().rpc('claim_background_job', {
    p_job_id: jobId,
    p_attempt: attempt,
    p_consumer_id: consumerId,
    p_stage: stage,
    p_lease_seconds: leaseSeconds,
  });

  if (error) {
    throw new Error(`Could not claim the background job: ${error.message}`);
  }

  const result = (data ?? {}) as { outcome?: string; job?: Record<string, unknown> | null };
  const outcome = result.outcome === 'claimed' || result.outcome === 'busy' ? result.outcome : 'skip';
  return { outcome, job: result.job ?? null };
}

/**
 * Describes a failure without repeating anything secret.
 *
 * The detail is stored on the job row and shown in the interface, so it must
 * never carry a credential, a token or a header.
 */
export function describeError(error: unknown): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    name: error instanceof Error ? error.name : 'Error',
  };

  if (error instanceof JobError) detail.code = error.code;

  const message = error instanceof Error ? error.message : String(error);
  detail.message = redact(message).slice(0, 1000);

  return detail;
}

/**
 * Removes anything that looks like a credential from a message.
 *
 * The rule is deliberately blunt: a bearer token, an API key, a long
 * base64-looking run of characters is dropped whether or not it really was one.
 * A failure message that loses a little detail is better than a failure message
 * that publishes a key.
 */
export function redact(text: string): string {
  return text
    // `Authorization: Bearer <token>`
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[redacted]')
    // `api_key=…`, `token: …`, `secret = …` — the name, the separator, the value.
    .replace(
      /\b([a-z_]*(?:api[_-]?key|secret|token|password|passwd|authorization|credential)[a-z_]*)\s*[=:]\s*["']?[A-Za-z0-9._~+/=-]{6,}["']?/gi,
      '$1=[redacted]',
    )
    // The prefixes the well-known providers use: `sk_…`, `pk_…`, `ghp_…`, `xoxb…`.
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghu|ghs|xox[baprs])[-_][A-Za-z0-9]{6,}\b/gi, '[redacted]')
    // A JSON web token.
    .replace(/eyJ[A-Za-z0-9._-]{20,}/g, '[redacted]');
}

/** The code a failure is filed under. */
function errorCodeOf(error: unknown): string {
  if (error instanceof JobError) return error.code;
  return 'job_failed';
}

/** The message a failure is filed under. */
function errorMessageOf(error: unknown): string {
  if (error instanceof JobError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'The job failed.';
}

/**
 * Keeps the worker's hold on a long job alive.
 *
 * A job that takes longer than the lease would otherwise be handed back to
 * the queue while it is still running. The lease is renewed in the
 * background, so a long job keeps its place.
 */
function startLeaseRenewal(jobId: string, consumerId: string, leaseSeconds: number): () => void {
  const intervalMs = Math.max(30_000, Math.floor((leaseSeconds * 1000) / 3));

  const timer = setInterval(() => {
    void (async () => {
      try {
        await getSupabaseServer()
          .from('background_jobs')
          .update({
            lease_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
          .eq('status', 'processing')
          .eq('locked_by', consumerId);
      } catch {
        // A renewal that fails is not worth stopping the work for: the recovery
        // sweep will notice if the lease really ran out.
      }
    })();
  }, intervalMs);

  // Node keeps the process alive for a pending timer. The work is finished by
  // the time this runs, so the timer must not hold the process open.
  if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
    (timer as unknown as { unref: () => void }).unref();
  }

  return () => clearInterval(timer);
}

/**
 * Handles one delivery.
 *
 * The order of the steps is the whole design:
 *
 *   1. Claim the job. If it cannot be claimed, acknowledge the message and
 *      stop — there is nothing to do, and saying so is what stops a duplicate
 *      from being worked on twice.
 *   2. Do the work.
 *   3. Record the outcome, and decide whether the work is worth another
 *      attempt.
 *   4. Acknowledge the message only once the outcome is safely recorded.
 *
 * The last point matters: a message that is acknowledged before its outcome
 * is written loses the work. A message that is never acknowledged is redelivered,
 * and redelivery is safe because of the claim.
 */
export async function handleJobDelivery(
  delivery: JobDelivery,
  worker: WorkerContext,
): Promise<DeliveryOutcome> {
  const message = delivery.body as Partial<JobQueueMessage> | null;
  const jobId = typeof message?.jobId === 'string' ? message.jobId : null;
  const attempt = typeof message?.attempt === 'number' ? message.attempt : null;

  if (!jobId || attempt === null) {
    // A message that is not one of ours. Acknowledging it is the only way to
    // stop it coming back.
    console.warn('A background job message could not be read and was discarded.');
    await delivery.ack();
    return 'malformed';
  }

  const leaseSeconds = worker.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const kind = await readJobKind(jobId);
  const task = kind ? getJobTask(kind) : null;

  if (!task || !kind) {
    await failUnclaimedJob(jobId, worker.consumerId, 'unknown_task', 'This job is not a workflow this server knows how to carry out.');
    await delivery.ack();
    return 'failed';
  }

  const policy = getJobPolicy(kind);
  const stage = `starting ${kind}`;

  let claim: ClaimResult;
  try {
    claim = await claimJob(jobId, attempt, worker.consumerId, stage, leaseSeconds);
  } catch (error) {
    // The database could not be reached. The message is not acknowledged, so
    // it comes back and the job is not lost.
    console.error('Could not claim the background job:', error instanceof Error ? error.message : error);
    await delivery.retry();
    return 'skipped';
  }

  if (claim.outcome === 'skip') {
    // Already claimed, already finished, cancelled, or the message belongs to
    // an attempt that has been superseded. Nothing to do.
    await delivery.ack();
    return 'skipped';
  }

  if (claim.outcome === 'busy') {
    // The same candidate's work on the same record is already running. Wait a
    // little and try again rather than running two copies at once.
    try {
      const messageId = await worker.publish(
        { id: globalThis.crypto.randomUUID(), jobId, attempt },
        { delaySeconds: BUSY_RETRY_SECONDS },
      );
      await recordDispatch(jobId, messageId);
    } catch (error) {
      console.error('Could not hand the busy background job back to the queue:', error instanceof Error ? error.message : error);
      await delivery.retry();
      return 'deferred';
    }
    await delivery.ack();
    return 'deferred';
  }

  const job = claim.job as Record<string, unknown> | null;
  const profileId = typeof job?.profile_id === 'string' ? job.profile_id : '';
  const request = (job?.request ?? {}) as Record<string, unknown>;
  const payload: JobPayload = {
    ...request,
    jobId,
    profileId,
  };

  const context: JobContext = {
    consumerId: worker.consumerId,
    attempt,
    reportStage: async (nextStage: string) => {
      await getSupabaseServer()
        .from('background_jobs')
        .update({ stage: nextStage.slice(0, 200), updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('status', 'processing')
        .eq('locked_by', worker.consumerId);
    },
    isCancelled: async () => {
      const { data } = await getSupabaseServer()
        .from('background_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();
      return (data as { status?: string } | null)?.status === 'cancelled';
    },
  };

  const stopRenewal = startLeaseRenewal(jobId, worker.consumerId, leaseSeconds);

  try {
    const result = await task(payload, context);

    const { data: completed, error: completeError } = await getSupabaseServer().rpc(
      'complete_background_job',
      {
        p_job_id: jobId,
        p_consumer_id: worker.consumerId,
        p_result: result ?? null,
        p_stage: 'done',
      },
    );

    if (completeError) {
      console.error('Could not record the finished background job:', completeError.message);
      await delivery.retry();
      return 'skipped';
    }

    if (!completed) {
      // The job is no longer ours: it was cancelled, or its lease ran out and
      // another worker took it over. The result is not written over the
      // outcome that is already there.
      console.warn('The background job was no longer held by this worker when it finished.', jobId);
    }

    await delivery.ack();
    return 'completed';
  } catch (error) {
    const detail = describeError(error);
    const code = errorCodeOf(error);

    if (code === 'cancelled') {
      // The candidate stopped the job. The row already says so; do not write a
      // failure over it.
      await delivery.ack();
      return 'skipped';
    }

    const maxAttempts = policy?.maxAttempts ?? 2;
    const wait = policy ? backoffSeconds(policy, attempt) : 30;

    const { data: failure, error: failError } = await getSupabaseServer().rpc('fail_background_job', {
      p_job_id: jobId,
      p_consumer_id: worker.consumerId,
      p_error_code: code,
      p_error_message: errorMessageOf(error),
      p_error_detail: detail,
      p_max_attempts: maxAttempts,
      p_backoff_seconds: wait,
    });

    if (failError) {
      console.error('Could not record the failed background job:', failError.message);
      await delivery.retry();
      return 'skipped';
    }

    const outcome = (failure ?? {}) as { outcome?: string; attempt?: number };
    if (outcome.outcome !== 'retry') {
      // The job has run out of attempts, or it was not ours to fail.
      await delivery.ack();
      return outcome.outcome === 'failed' ? 'failed' : 'skipped';
    }

    const nextAttempt = typeof outcome.attempt === 'number' ? outcome.attempt : attempt + 1;

    try {
      const messageId = await worker.publish(
        { id: globalThis.crypto.randomUUID(), jobId, attempt: nextAttempt },
        { delaySeconds: wait },
      );
      await recordDispatch(jobId, messageId);
    } catch (publishError) {
      // The retry could not be handed to the queue. The job stays marked as
      // needing a dispatch, so the scheduled sweep publishes it again — a
      // failed publication must never leave a job stranded for ever.
      console.error(
        'Could not schedule the retry of a background job:',
        publishError instanceof Error ? publishError.message : publishError,
      );
      await delivery.retry();
      return 'retry_scheduled';
    }

    await delivery.ack();
    return 'retry_scheduled';
  } finally {
    stopRenewal();
  }
}

/** The kind of a job, read from its row. */
async function readJobKind(jobId: string): Promise<string | null> {
  const { data, error } = await getSupabaseServer()
    .from('background_jobs')
    .select('kind')
    .eq('id', jobId)
    .maybeSingle();
  if (error) return null;
  return (data as { kind?: string } | null)?.kind ?? null;
}

/** Fails a job that no worker claimed, because its kind is not one we know. */
async function failUnclaimedJob(
  jobId: string,
  consumerId: string,
  code: string,
  message: string,
): Promise<void> {
  await getSupabaseServer()
    .from('background_jobs')
    .update({
      status: 'failed',
      error_code: code,
      error_message: message,
      completed_at: new Date().toISOString(),
      dispatch_needed: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .in('status', ['pending', 'queued']);
}
