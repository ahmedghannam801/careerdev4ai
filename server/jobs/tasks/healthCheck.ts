// A check that the whole background pipeline is alive.
//
// This task does one thing: it says that it ran. It is the cheapest possible
// proof that a message went onto the queue, that a worker picked it up, and
// that the answer came back. It is what a deployment is verified with.
//
// It is also what the queue worker's own health endpoint points at, because a
// test that takes five seconds to prove nothing is worse than no test at all.

import type { JobContext, JobPayload } from '../runtime.ts';

export interface HealthCheckResult {
  ok: true;
  ping: string | null;
  at: string;
}

export async function healthCheckTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  const ping = typeof payload.ping === 'string' ? payload.ping : null;
  await context.reportStage('checking that the worker is alive');
  return {
    ok: true,
    ping,
    at: new Date().toISOString(),
  } satisfies HealthCheckResult;
}
