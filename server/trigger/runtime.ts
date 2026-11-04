// The task-side view of a background job.
//
// A Trigger.dev task runs in its own process, with no request and no session.
// Everything it needs arrives in the payload, and everything it learns has to
// be written back to the job row so the interface can see it.
//
// The one thing that is never taken on trust is ownership. The payload says
// which candidate the job is for, but the task re-reads the job row and
// checks it against that id before touching anything. A payload that names a
// different candidate than the row belongs to is refused, so a job can never
// be pointed at somebody else's CV or roadmap.

import {
  getJobForProfile,
  markJobCompleted,
  markJobFailed,
  markJobProcessing,
  updateJobStage,
  type BackgroundJob,
} from './jobs.ts';

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
 * Claims the job and confirms who it belongs to.
 *
 * Throws when the row does not exist or does not belong to the candidate in
 * the payload. A task that is pointed at the wrong candidate stops before it
 * has done anything.
 */
export async function beginJob(payload: JobPayload, stage: string): Promise<BackgroundJob> {
  const job = await getJobForProfile(payload.profileId, payload.jobId);
  if (!job) {
    throw new JobError(
      'job_not_found',
      'This job does not exist, or it does not belong to this candidate.',
    );
  }
  await markJobProcessing(job.id, stage);
  return job;
}

/** Records the stage the task has reached. */
export async function reportStage(jobId: string, stage: string): Promise<void> {
  await updateJobStage(jobId, stage);
}

/** Finishes the job and records what it produced. */
export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  await markJobCompleted(jobId, result);
}

/** Fails the job with a code the interface can act on. */
export async function failJob(jobId: string, code: string, message: string): Promise<void> {
  await markJobFailed(jobId, code, message);
}

/**
 * Runs a task body, keeping the job row in step with it.
 *
 * Every task is the same shape: claim the job, do the work, record the
 * outcome. Doing that in one place means no task can forget to report a
 * failure, and a job can never be left 'processing' for ever because of a
 * missing catch.
 */
export async function runJob(
  payload: JobPayload,
  stage: string,
  body: (job: BackgroundJob) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const job = await beginJob(payload, stage);
  try {
    const result = await body(job);
    await completeJob(job.id, result);
    return result;
  } catch (error) {
    const code = error instanceof JobError ? error.code : 'job_failed';
    const message = error instanceof Error ? error.message : 'The job failed.';
    await failJob(job.id, code, message).catch(() => {
      // The job row could not be updated. The run itself still fails, so the
      // platform records the failure and the job can be retried by hand.
    });
    throw error;
  }
}
