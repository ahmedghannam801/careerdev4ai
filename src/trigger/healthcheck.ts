// A check that the deployment is alive.
//
// This task does one thing: it returns. It is the cheapest possible proof
// that a deployment reached the platform, that the platform can start a run,
// and that the run comes back. It is what a deploy is verified with.
//
// It is also the task the dashboard's "test" button is pointed at, because a
// test that takes five seconds to prove nothing is worse than no test at all.

import { logger, task } from "@trigger.dev/sdk";

export const healthCheckTask = task({
  id: "health-check",
  maxDuration: 60,
  // Nothing here can fail in a way a retry would fix.
  retry: { maxAttempts: 1 },
  run: async (payload: { ping?: string }) => {
    logger.info("Health check ran.", { ping: payload?.ping ?? null });
    return {
      ok: true,
      ping: payload?.ping ?? null,
      at: new Date().toISOString(),
    };
  },
});
