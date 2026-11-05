// The task-side view of a background job.
//
// A task runs in a worker with no request and no session. Everything it needs
// arrives in the payload, and everything it learns has to be written back to
// the job row so the interface can see it.
//
// The one thing that is never taken on trust is ownership. The payload says
// which candidate the job is for, but the task re-reads the job row and
// checks it against that id before touching anything. A payload that names a
// different candidate than the row belongs to is refused, so a job can never
// be pointed at somebody else's CV or roadmap.
//
// The worker claims the job before the task starts — that is the atomic step
// that stops two workers running the same job — so this module does not
// decide who owns the job. It checks it, and it reports what the task is
// doing.

import { getJobForProfile, type BackgroundJob } from './jobs.ts';

/** The fields every task payload carries. */
export interface JobPayload {
  /** The row that records this job. */
  jobId: string;
  /** The candidate the job belongs to. */
  profileId: string;
  [key: string]: unknown;
}

/** A failure the task reports, with a code the interface can act on. */
export class JobError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'JobError';
    this.code = code;
  }
}

/**
 * What a task is given besides its payload.
 *
 * The context is how the task talks back to the worker that is holding it:
 * the worker owns the job, so only the worker may write to it.
 */
export interface JobContext {
  /** The worker that holds the job. */
  readonly consumerId: string;
  /** The id of the attempt being carried out. */
  readonly attempt: number;
  /** Records the stage the job has reached. */
  reportStage(stage: string): Promise<void>;
  /**
   * True when the candidate has cancelled the job since it started.
   *
   * A cancelled job is stopped at the next step rather than being carried to
   * the end: the work is expensive and nobody is waiting for it any more.
   */
  isCancelled(): Promise<boolean>;
}

/** A unit of background work. */
export type JobTask = (payload: JobPayload, context: JobContext) => Promise<Record<string, unknown>>;

/**
 * Confirms that the job really belongs to the candidate in the payload.
 *
 * Throws when the row does not exist or does not belong to the candidate. A
 * task that is pointed at the wrong candidate stops before it has done
 * anything.
 */
export async function assertJobOwnership(payload: JobPayload): Promise<BackgroundJob> {
  const job = await getJobForProfile(payload.profileId, payload.jobId);
  if (!job) {
    throw new JobError(
      'job_not_found',
      'This job does not exist, or it does not belong to this candidate.',
    );
  }
  return job;
}

/**
 * Runs a task body, keeping the job row in step with it.
 *
 * Every task is the same shape: check who the job belongs to, say what is
 * happening, do the work. Doing that in one place means no task can forget to
 * report where it got to, and no task can run for a job that was cancelled or
 * handed to somebody else.
 *
 * The outcome itself is recorded by the worker, not by the task: the worker is
 * the one that decides whether a failure is worth another attempt.
 */
export async function runJob(
  payload: JobPayload,
  context: JobContext,
  stage: string,
  body: (job: BackgroundJob) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const job = await assertJobOwnership(payload);

  await context.reportStage(stage);

  if (await context.isCancelled()) {
    throw new JobError('cancelled', 'This job was stopped before it finished.');
  }

  const result = await body(job);
  return result;
}
