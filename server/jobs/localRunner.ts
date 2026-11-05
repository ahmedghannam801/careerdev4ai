// The local runner.
//
// The development server has no Cloudflare queue behind it, so it runs one of
// its own: an in-process queue, a runner that drains it, and the same
// consumer the Cloudflare Worker uses. A developer therefore sees the same
// behaviour — a job is written, a message is published, a worker claims it,
// the work happens and the row records the outcome — without needing a
// Cloudflare account.
//
// The test suite uses the same pieces. That is the point of keeping the
// transport separate from the consumer: what the tests prove is the code the
// platform runs, not a copy of it.

import { LocalJobQueue, setJobQueueProducer, type JobQueueMessage } from './queue.ts';
import { handleJobDelivery, type WorkerContext } from './consumer.ts';
import { writeConsumerHeartbeat } from './heartbeat.ts';

/** How often the runner looks for work. */
const POLL_INTERVAL_MS = 500;

/** How often the runner says that it is alive. */
const HEARTBEAT_INTERVAL_MS = 60_000;

/** The id this runner reports itself under. */
export const LOCAL_CONSUMER_ID = 'local-development-runner';

/**
 * Installs the in-process queue and returns it.
 *
 * The queue is also registered as the producer for this process, so that
 * anything that publishes a job — the API, a test — reaches this runner.
 */
export function installLocalJobQueue(): LocalJobQueue {
  const queue = new LocalJobQueue();
  setJobQueueProducer(queue);
  return queue;
}

/**
 * Starts draining the queue.
 *
 * The runner writes a heartbeat as it goes, so that the availability the API
 * reports is the same kind of evidence it is in production.
 */
export function startLocalJobRunner(queue: LocalJobQueue): () => void {
  const worker: WorkerContext = {
    consumerId: LOCAL_CONSUMER_ID,
    leaseSeconds: 600,
    publish: async (message: JobQueueMessage, options?: { delaySeconds?: number }) => {
      await queue.send(message, options);
      return message.id;
    },
  };

  let running = false;

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      const due = queue.takeDue();
      for (const body of due) {
        await handleJobDelivery(
          {
            body,
            ack: async () => {},
            retry: async () => {
              // A message that could not be handled is put back, so it is
              // tried again rather than lost.
              await queue.send(body, { delaySeconds: 5 });
            },
          },
          worker,
        );
      }
    } catch (error) {
      console.error('The local background job runner hit an error:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void drain();
  }, POLL_INTERVAL_MS);

  if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
    (timer as unknown as { unref: () => void }).unref();
  }

  // The runner says that it is alive, exactly as the deployed worker does. The
  // API reads that to decide whether background work can be started, so a
  // local server that never says so would report itself as unable to do
  // anything — which would be a lie.
  const sayAlive = async () => {
    try {
      await writeConsumerHeartbeat(LOCAL_CONSUMER_ID, 'local', { kind: 'in-process' });
    } catch {
      // A heartbeat that cannot be written is not worth stopping the runner
      // for.
    }
  };

  void sayAlive();
  const heartbeatTimer = setInterval(() => {
    void sayAlive();
  }, HEARTBEAT_INTERVAL_MS);

  if (typeof (heartbeatTimer as unknown as { unref?: () => void }).unref === 'function') {
    (heartbeatTimer as unknown as { unref: () => void }).unref();
  }

  return () => {
    clearInterval(timer);
    clearInterval(heartbeatTimer);
  };
}
