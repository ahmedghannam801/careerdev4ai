/**
 * The background-job worker.
 *
 * This is the Cloudflare Worker that carries out the background work. It has
 * three faces:
 *
 *   1. `queue`   — a message arrives, the job it names is claimed, the work is
 *                  done and the outcome is recorded. This is the hot path.
 *   2. `scheduled` — the cron trigger. It writes the heartbeat the API reads,
 *                  publishes the jobs that still need publishing, hands back the
 *                  jobs a worker was interrupted while holding, and gives up on
 *                  the jobs that are never going to start.
 *   3. `fetch`   — a health endpoint, so that the worker itself can be checked
 *                  and its state read without going through the API.
 *
 * The worker does not hold the state of a job. Supabase does. This worker is
 * replaceable, restartable and can run in more than one instance: the claim in
 * the database is what stops two of them from doing the same job.
 *
 * The bundle is produced by `scripts/build-jobs-worker.mjs`, which builds this
 * file with esbuild and leaves `node:*` / `cloudflare:*` external so the
 * runtime's own implementations are used.
 */

import { handleJobDelivery, type WorkerContext } from '../../server/jobs/consumer.ts';
import {
  CloudflareQueueProducer,
  setJobQueueProducer,
  type JobQueueMessage,
} from '../../server/jobs/queue.ts';
import {
  failStaleQueuedJobs,
  listJobsNeedingDispatch,
  listJobsWithExpiredLease,
  recoverInterruptedJob,
  recordDispatch,
} from '../../server/jobs/jobs.ts';
import { getSupabaseServer } from '../../server/db/supabase.ts';
import { writeConsumerHeartbeat } from '../../server/jobs/heartbeat.ts';

interface QueueBinding {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<void>;
}

/**
 * One message of a batch.
 *
 * The shape is written out rather than imported so that the Worker does not
 * have to depend on the Workers type definitions — the same module runs in the
 * Pages Worker and in Node.
 */
interface QueueMessage<T = unknown> {
  body: T;
  ack(): void;
  retry(): void;
}

/** A batch of messages handed to the consumer at once. */
interface QueueBatch<T = unknown> {
  messages: Array<QueueMessage<T>>;
}

/** The scheduled event the cron trigger produces. */
interface CronEvent {
  cron: string;
}

interface Env {
  /** The queue this worker consumes, and publishes retries to. */
  JOB_QUEUE?: QueueBinding;
  /** The name this worker reports itself under. */
  CONSUMER_ID?: string;
  /** The environment this worker runs in: `production` or `development`. */
  JOB_ENVIRONMENT?: string;
  [key: string]: unknown;
}

/** The default id of this worker. */
const DEFAULT_CONSUMER_ID = 'careerdev4ai-jobs';

/**
 * Copies the Worker's bindings into `process.env`.
 *
 * The shared server modules read their configuration from `process.env`, which
 * is what they read in Node as well. Only string bindings are copied: the
 * queue binding is an object and is handled separately.
 */
function applyEnv(env: Env): void {
  if (!env || typeof env !== 'object') return;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string' && process.env[key] !== value) {
      process.env[key] = value;
    }
  }
}

/** The worker this process is. */
function consumerId(env: Env): string {
  const configured = env.CONSUMER_ID?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_CONSUMER_ID;
}

/**
 * Records that this worker is alive.
 *
 * The API reads this to decide whether background work can be started. It is
 * written on every scheduled sweep, so a worker that is running says so even
 * when there is nothing to do.
 */
async function writeHeartbeat(env: Env, sweep: Record<string, unknown>): Promise<void> {
  await writeConsumerHeartbeat(
    consumerId(env),
    env.JOB_QUEUE ? 'careerdev4ai-jobs' : null,
    sweep,
  );
}

/**
 * Publishes the jobs that still have to be handed to the queue.
 *
 * A job is in this state when it was never published, or when the message
 * that carried it could not be published. Publishing it here is what makes a
 * failed publication recoverable rather than a job that is stranded for ever.
 */
async function dispatchDueJobs(env: Env): Promise<number> {
  const producer = new CloudflareQueueProducer(env.JOB_QUEUE as QueueBinding);
  let published = 0;

  const due = await listJobsNeedingDispatch(50);
  for (const job of due) {
    try {
      const message: JobQueueMessage = {
        id: globalThis.crypto.randomUUID(),
        jobId: job.id,
        attempt: job.attempt,
      };
      await producer.send(message);
      await recordDispatch(job.id, message.id);
      published += 1;
    } catch (error) {
      // The job stays marked as needing a dispatch, so the next sweep tries
      // again. Nothing is lost.
      console.error(
        'Could not publish a background job:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  return published;
}

/**
 * Hands back the jobs a worker was interrupted while holding.
 *
 * A worker that dies mid-job leaves the row `processing` with nobody working
 * on it. Its lease runs out, and then the job goes back to the queue.
 */
async function recoverInterruptedJobs(): Promise<number> {
  const expired = await listJobsWithExpiredLease();
  let recovered = 0;

  for (const job of expired) {
    try {
      const ok = await recoverInterruptedJob(job.id);
      if (ok) recovered += 1;
    } catch (error) {
      console.error(
        'Could not recover an interrupted background job:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  return recovered;
}

export default {
  /**
   * The hot path: a message arrived.
   *
   * The batch is handled one message at a time. Each message is claimed,
   * worked on and acknowledged on its own, so one job that fails cannot hold
   * up the others in the batch.
   */
  async queue(batch: QueueBatch<unknown>, env: Env): Promise<void> {
    applyEnv(env);

    const producer = env.JOB_QUEUE ? new CloudflareQueueProducer(env.JOB_QUEUE) : null;
    setJobQueueProducer(producer);

    const worker: WorkerContext = {
      consumerId: consumerId(env),
      leaseSeconds: 600,
      publish: async (message: JobQueueMessage, options?: { delaySeconds?: number }) => {
        if (!producer) throw new Error('This worker has no queue to publish to.');
        await producer.send(message, options);
        return message.id;
      },
    };

    for (const message of batch.messages) {
      try {
        await handleJobDelivery(
          {
            body: message.body,
            ack: async () => message.ack(),
            retry: async () => message.retry(),
          },
          worker,
        );
      } catch (error) {
        // The handler has already dealt with the job it was given. Anything
        // that reaches here is a failure of the handler itself, and the
        // message must not be acknowledged: it has to come back.
        console.error('The background job handler failed:', error);
        try {
          message.retry();
        } catch {
          // Nothing more can be done for this message.
        }
      }
    }
  },

  /**
   * The scheduled sweep.
   *
   * It runs every few minutes. Its job is to make sure nothing is stranded:
   * jobs that still need publishing get published, jobs whose worker died get
   * handed back, jobs that are never going to start are given an outcome, and
   * the heartbeat is refreshed so the API can tell the candidate the truth.
   */
  async scheduled(event: CronEvent, env: Env): Promise<void> {
    applyEnv(env);
    setJobQueueProducer(env.JOB_QUEUE ? new CloudflareQueueProducer(env.JOB_QUEUE) : null);

    const sweep: Record<string, unknown> = {
      at: new Date().toISOString(),
      cron: event.cron,
    };

    // The sweep says that it ran. A scheduled job that fails silently is
    // indistinguishable from one that is not running at all, and the heartbeat
    // it writes is what the API reads — so the log and the heartbeat have to
    // agree.
    console.log('The background job sweep is running.', event.cron);

    try {
      sweep.published = await dispatchDueJobs(env);
    } catch (error) {
      sweep.published = 0;
      console.error('The background job dispatch sweep failed:', error);
    }

    try {
      sweep.recovered = await recoverInterruptedJobs();
    } catch (error) {
      sweep.recovered = 0;
      console.error('The background job recovery sweep failed:', error);
    }

    try {
      sweep.failed = await failStaleQueuedJobs();
    } catch (error) {
      sweep.failed = 0;
      console.error('The background job stale sweep failed:', error);
    }

    await writeHeartbeat(env, sweep);
  },

  /**
   * The worker's own health endpoint.
   *
   * It answers what this worker knows: that it is running, and when it last
   * swept. It is deliberately not the API's health endpoint — that one knows
   * about the queue and the consumer together.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    applyEnv(env);

    const url = new URL(request.url);

    if (url.pathname !== '/' && url.pathname !== '/health') {
      return new Response('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    const id = consumerId(env);
    const { data } = await getSupabaseServer()
      .from('background_job_consumers')
      .select('last_seen_at, started_at, jobs_processed')
      .eq('consumer_id', id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        status: 'ok',
        consumer: id,
        environment: env.JOB_ENVIRONMENT ?? 'unknown',
        queue: Boolean(env.JOB_QUEUE),
        lastSeenAt: (data as { last_seen_at?: string } | null)?.last_seen_at ?? null,
        startedAt: (data as { started_at?: string } | null)?.started_at ?? null,
        at: new Date().toISOString(),
      }),
      {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      },
    );
  },
};
