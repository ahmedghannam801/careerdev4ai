// What the background-job service can actually do right now.
//
// The interface tells the candidate whether their work is going to run. That
// sentence has to be true, so it is built from evidence rather than from the
// fact that a queue is configured:
//
//   * A queue that is configured but has no worker behind it cannot do
//     anything. Reporting it as ready would send a candidate away and leave
//     their job waiting for ever.
//   * A worker writes a heartbeat when it runs its scheduled sweep. A
//     heartbeat that has gone quiet is evidence, not a guess.
//   * "Not known" is a real answer and is reported as such. It is never
//     rounded down to "not available" or up to "available".
//
// The five states the interface understands:
//   `ready`        a worker has checked in recently and is picking work up.
//   `degraded`     a worker has checked in, but not recently enough to say it
//                  is running right now. Work may wait a little.
//   `unavailable`  no worker has checked in for over an hour. Nothing is
//                  picking work up.
//   `unconfigured` there is no queue on this server at all.
//   `unknown`      the state could not be read just now.

import { getSupabaseServer } from '../db/supabase.ts';
import { isJobQueueConfigured } from './queue.ts';
import { QUEUE_STALE_AFTER_MS, QUEUE_WAITING_AFTER_MS } from './jobs.ts';

export type BackgroundJobEnvironment = 'production' | 'development' | 'unknown';

export type BackgroundJobServiceStatus =
  | 'ready'
  | 'degraded'
  | 'unavailable'
  | 'unconfigured'
  | 'unknown';

export interface BackgroundJobAvailability {
  /** True when this server can hand a job to a queue. */
  configured: boolean;
  environment: BackgroundJobEnvironment;
  environmentLabel: 'Production' | 'Development' | 'Unknown';
  status: BackgroundJobServiceStatus;
  /** `null` means "not known" — never reported as `false` without evidence. */
  runnerAvailable: boolean | null;
  /** When the worker last checked in. `null` when it never has. */
  consumerLastSeenAt: string | null;
  /** How many jobs are waiting for a worker right now. */
  waitingJobs: number | null;
  message: string;
  waitingAfterSeconds: number;
  staleAfterSeconds: number;
}

/**
 * How long a heartbeat stays "fresh".
 *
 * The worker checks in every five minutes, so ten minutes is two missed
 * checks — enough that a slow or briefly missed sweep is not reported as a
 * problem, and short enough that a candidate is not told the service is fine
 * when it is not.
 */
export const CONSUMER_FRESH_AFTER_MS = 10 * 60_000;

/**
 * How long a heartbeat may be missing before the service is called
 * unavailable.
 *
 * An hour without a single check-in is not a slow sweep; it is a worker that
 * is not running.
 */
export const CONSUMER_STALE_AFTER_MS = 60 * 60_000;

/**
 * The environment the background jobs run in.
 *
 * A Pages deployment knows its own environment. A local server is a
 * development environment by definition. When neither can be established, the
 * answer is `unknown` — the interface says "Unknown" rather than guessing.
 */
export function queueEnvironment(): BackgroundJobEnvironment {
  // A deployment knows its own environment. Pages provides the name of the
  // environment directly; the branch it was deployed from says the same thing
  // when the name is not there.
  const name = (
    process.env.JOB_ENVIRONMENT?.trim() ||
    process.env.CF_ENVIRONMENT_NAME?.trim() ||
    ''
  ).toLowerCase();
  if (name === 'production') return 'production';
  if (name === 'preview' || name === 'development') return 'development';

  // The production branch of the Pages project is `main`. Every other branch
  // is a preview.
  const branch = (process.env.CF_PAGES_BRANCH ?? '').trim().toLowerCase();
  if (branch === 'main') return 'production';
  if (branch) return 'development';

  // `navigator.userAgent` is how a Cloudflare runtime identifies itself. A
  // Node process is not one.
  const runtime = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? '';
  if (!runtime.includes('Cloudflare-Workers')) return 'development';

  return 'unknown';
}

function environmentLabel(environment: BackgroundJobEnvironment): 'Production' | 'Development' | 'Unknown' {
  if (environment === 'production') return 'Production';
  if (environment === 'development') return 'Development';
  return 'Unknown';
}

/** The most recent heartbeat of any worker, and how many jobs are waiting. */
async function readServiceState(): Promise<{
  lastSeenAt: string | null;
  waitingJobs: number | null;
  readable: boolean;
}> {
  try {
    const supabase = getSupabaseServer();

    const { data: consumers, error: consumerError } = await supabase
      .from('background_job_consumers')
      .select('last_seen_at')
      .order('last_seen_at', { ascending: false })
      .limit(1);

    if (consumerError) {
      return { lastSeenAt: null, waitingJobs: null, readable: false };
    }

    const { count, error: countError } = await supabase
      .from('background_jobs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'queued']);

    if (countError) {
      return {
        lastSeenAt: (consumers?.[0] as { last_seen_at?: string } | undefined)?.last_seen_at ?? null,
        waitingJobs: null,
        readable: false,
      };
    }

    return {
      lastSeenAt: (consumers?.[0] as { last_seen_at?: string } | undefined)?.last_seen_at ?? null,
      waitingJobs: typeof count === 'number' ? count : null,
      readable: true,
    };
  } catch {
    return { lastSeenAt: null, waitingJobs: null, readable: false };
  }
}

/**
 * What the background-job service can do right now.
 *
 * The function never throws: it is read on every page that shows the panel,
 * and a failure to read the state must not take the page down with it.
 */
export async function backgroundJobAvailability(): Promise<BackgroundJobAvailability> {
  const environment = queueEnvironment();
  const configured = isJobQueueConfigured();

  const state = await readServiceState();

  if (!configured) {
    return {
      configured: false,
      environment,
      environmentLabel: environmentLabel(environment),
      status: 'unconfigured',
      runnerAvailable: false,
      consumerLastSeenAt: state.lastSeenAt,
      waitingJobs: state.waitingJobs,
      message:
        'Background processing is not set up on this server, so no background work can be started.',
      waitingAfterSeconds: Math.round(QUEUE_WAITING_AFTER_MS / 1000),
      staleAfterSeconds: Math.round(QUEUE_STALE_AFTER_MS / 1000),
    };
  }

  if (!state.readable) {
    return {
      configured: true,
      environment,
      environmentLabel: environmentLabel(environment),
      status: 'unknown',
      runnerAvailable: null,
      consumerLastSeenAt: null,
      waitingJobs: null,
      message: 'The state of background processing could not be checked just now.',
      waitingAfterSeconds: Math.round(QUEUE_WAITING_AFTER_MS / 1000),
      staleAfterSeconds: Math.round(QUEUE_STALE_AFTER_MS / 1000),
    };
  }

  const lastSeen = state.lastSeenAt ? new Date(state.lastSeenAt).getTime() : NaN;
  const age = Number.isFinite(lastSeen) ? Date.now() - lastSeen : Infinity;

  if (age < CONSUMER_FRESH_AFTER_MS) {
    return {
      configured: true,
      environment,
      environmentLabel: environmentLabel(environment),
      status: 'ready',
      runnerAvailable: true,
      consumerLastSeenAt: state.lastSeenAt,
      waitingJobs: state.waitingJobs,
      message: 'Background processing is running and picking work up.',
      waitingAfterSeconds: Math.round(QUEUE_WAITING_AFTER_MS / 1000),
      staleAfterSeconds: Math.round(QUEUE_STALE_AFTER_MS / 1000),
    };
  }

  if (age < CONSUMER_STALE_AFTER_MS) {
    return {
      configured: true,
      environment,
      environmentLabel: environmentLabel(environment),
      status: 'degraded',
      runnerAvailable: null,
      consumerLastSeenAt: state.lastSeenAt,
      waitingJobs: state.waitingJobs,
      message:
        'Background processing has not checked in for a while, so a new job may wait before it starts.',
      waitingAfterSeconds: Math.round(QUEUE_WAITING_AFTER_MS / 1000),
      staleAfterSeconds: Math.round(QUEUE_STALE_AFTER_MS / 1000),
    };
  }

  return {
    configured: true,
    environment,
    environmentLabel: environmentLabel(environment),
    status: 'unavailable',
    runnerAvailable: false,
    consumerLastSeenAt: state.lastSeenAt,
    waitingJobs: state.waitingJobs,
    message:
      'Background processing is not available right now, so no new background work can start. A job that is already running is unaffected.',
    waitingAfterSeconds: Math.round(QUEUE_WAITING_AFTER_MS / 1000),
    staleAfterSeconds: Math.round(QUEUE_STALE_AFTER_MS / 1000),
  };
}
