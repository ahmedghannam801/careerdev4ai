// The retry budget of each workflow.
//
// These are kept apart from the tasks themselves because the API needs to know
// how many attempts a job is allowed, and the API must not have to pull the
// whole task library — and the model SDK with it — into its own bundle to
// learn a number.
//
// The policies are the retry budgets that used to live in each task's own
// definition. They are a property of the *kind* — how many times this work may
// be attempted and how long to wait between attempts — and the worker is what
// enforces them.

/** How a kind of work is allowed to fail and be tried again. */
export interface JobPolicy {
  /**
   * How many times the work itself may be attempted.
   *
   * One means no retry. Two means one retry after a failure.
   */
  maxAttempts: number;
  /** The wait before the first retry, in seconds. */
  baseBackoffSeconds: number;
  /** The longest the wait may grow to, in seconds. */
  maxBackoffSeconds: number;
}

export const JOB_POLICIES: Record<string, JobPolicy> = {
  // Reading a document is cheap enough to try again, but a document the model
  // cannot score would fail the same way a second time.
  'process-cv': { maxAttempts: 2, baseBackoffSeconds: 5, maxBackoffSeconds: 30 },
  // A second attempt costs another unit of the day's allowance, so it is only
  // worth it for a failure that might not repeat.
  'generate-targeted-cv': { maxAttempts: 2, baseBackoffSeconds: 10, maxBackoffSeconds: 60 },
  // The provider is a third party that sometimes rate-limits. A second attempt
  // after a pause is reasonable; more than that is not.
  'match-jobs': { maxAttempts: 2, baseBackoffSeconds: 15, maxBackoffSeconds: 60 },
  // The plan is built from the candidate's own record, so a failure is a
  // failure of that read. One retry is enough.
  'generate-career-roadmap': { maxAttempts: 2, baseBackoffSeconds: 10, maxBackoffSeconds: 60 },
  // There is nothing transient about a step being marked done. Retrying would
  // only repeat a write that already succeeded.
  'update-roadmap-progress': { maxAttempts: 1, baseBackoffSeconds: 5, maxBackoffSeconds: 30 },
  // The mentor reads the account and writes an answer; a failed read is worth
  // one more try.
  'process-ai-mentor-workflow': { maxAttempts: 2, baseBackoffSeconds: 10, maxBackoffSeconds: 60 },
  // A sweep should not stack up attempts. One pass, and the next run picks up
  // whatever was left.
  'validate-learning-resources': { maxAttempts: 1, baseBackoffSeconds: 30, maxBackoffSeconds: 60 },
};

/** The policy for a kind, or `null` when the kind is not one we know. */
export function getJobPolicy(kind: string): JobPolicy | null {
  return JOB_POLICIES[kind] ?? null;
}

/**
 * How long to wait before the next attempt.
 *
 * The wait doubles with every failure and stops at the policy's ceiling. The
 * attempt number is the one that just failed, so the first retry waits the
 * base time.
 */
export function backoffSeconds(policy: JobPolicy, failedAttempt: number): number {
  const exponent = Math.max(0, failedAttempt - 1);
  const raw = policy.baseBackoffSeconds * 2 ** exponent;
  return Math.min(Math.round(raw), policy.maxBackoffSeconds);
}
