// Whether a background job can actually run right now.
//
// A Trigger.dev run needs something to execute it:
//
//   * in the **Production** environment that is a deployed version of the
//     tasks, which the platform runs on its own;
//   * in the **Development** environment it is a connected development worker,
//     which is a process running on somebody's machine.
//
// Those are not interchangeable, and the difference is visible to the
// candidate: a job started while no worker is connected waits for ever. So the
// API says plainly which environment is in play and whether anything can pick
// the work up, instead of accepting a job that will quietly never start.
//
// Everything here is derived from the server's own configuration and from
// read-only calls to Trigger.dev. Nothing in this module can be steered by a
// browser, and there is no path by which a request can point the server at a
// different Trigger.dev endpoint or a different worker — the API URL and the
// secret key come from the server environment and from nowhere else.

import { listRuns, productionDeploymentExists, triggerProjectRef } from './client.ts';
import { QUEUE_STALE_AFTER_MS, QUEUE_WAITING_AFTER_MS } from './jobs.ts';

/** The Trigger.dev environment the server's secret key addresses. */
export type TriggerEnvironment = 'production' | 'development' | 'unknown';

/**
 * What the background-job service can do right now.
 *
 * - `ready`       — a runner will pick the work up, and it is the platform's
 *                   own Production runtime.
 * - `degraded`    — the work will run, but only on a development worker.
 * - `unavailable` — nothing can pick the work up at the moment.
 * - `unconfigured`— this server holds no Trigger.dev credential.
 * - `unknown`     — the platform could not be asked, so nothing is claimed.
 */
export type BackgroundJobServiceStatus =
  | 'ready'
  | 'degraded'
  | 'unavailable'
  | 'unconfigured'
  | 'unknown';

/** What the interface needs to tell the candidate the truth. */
export interface BackgroundJobAvailability {
  /** Whether this server holds a Trigger.dev credential at all. */
  configured: boolean;
  /** The environment the jobs go to. */
  environment: TriggerEnvironment;
  /** The environment in a form that can be shown. */
  environmentLabel: 'Production' | 'Development' | 'Unknown';
  /** The state of the service. */
  status: BackgroundJobServiceStatus;
  /**
   * Whether something can pick a run up right now.
   *
   * `null` means "not known" — the platform could not be asked, or nothing has
   * run yet to judge by. It is never reported as `false` without evidence.
   */
  runnerAvailable: boolean | null;
  /** Whether the Production environment has a deployed version. */
  deploymentExists: boolean | null;
  /** True when the work can only run on a developer's own machine. */
  requiresDevelopmentWorker: boolean;
  /** A sentence the interface can show without inventing anything. */
  message: string;
  /** How long a job may sit queued before the candidate is told. */
  waitingAfterSeconds: number;
  /** How long a job may sit queued before it is given up on. */
  staleAfterSeconds: number;
}

/**
 * How recent a run has to be to count as evidence that a worker is alive.
 *
 * Generous on purpose. The question being answered is "is a worker connected
 * right now", and the only honest way to answer it is to look at the most
 * recent run. An idle worker produces no runs, so a long gap says nothing —
 * it must not be read as "the worker is gone".
 */
const RUNNER_ACTIVITY_WINDOW_MS = 60 * 60_000;

/**
 * The environment a secret key addresses.
 *
 * The key itself says which environment it belongs to: `tr_prod_sk_…` is a
 * Production key and `tr_dev_sk_…` is a Development key. The same variable
 * therefore works in both places with no extra wiring.
 */
export function triggerEnvironment(): TriggerEnvironment {
  const key = process.env.TRIGGER_SECRET_KEY?.trim();
  if (!key) return 'unknown';
  if (key.startsWith('tr_prod_')) return 'production';
  if (key.startsWith('tr_dev_')) return 'development';
  return 'unknown';
}

/** The label shown next to the environment name. */
function environmentLabel(environment: TriggerEnvironment): BackgroundJobAvailability['environmentLabel'] {
  if (environment === 'production') return 'Production';
  if (environment === 'development') return 'Development';
  return 'Unknown';
}

/**
 * Works out whether a runner can pick work up in the Development environment.
 *
 * The Development environment has no deployment to ask about — the runner is a
 * development worker on somebody's machine — so the evidence is the runs
 * themselves. Only the most recent run is judged, because an old run that
 * never started says nothing about the worker that is connected now.
 */
function developmentRunnerAvailable(
  runs: Awaited<ReturnType<typeof listRuns>>,
  now: number,
): boolean | null {
  const latest = [...runs]
    .filter((run) => run.createdAt || run.startedAt)
    .sort((a, b) => {
      const left = new Date(a.createdAt ?? a.startedAt ?? 0).getTime();
      const right = new Date(b.createdAt ?? b.startedAt ?? 0).getTime();
      return right - left;
    })[0];

  if (!latest) return null;

  // A run that started recently proves a worker is connected.
  if (latest.startedAt) {
    const age = now - new Date(latest.startedAt).getTime();
    if (Number.isFinite(age) && age <= RUNNER_ACTIVITY_WINDOW_MS) return true;
  }

  // The most recent run has not started and has been waiting for a long time.
  // Nothing has picked work up since it was created, so there is no worker
  // behind it.
  const stamp = latest.createdAt ?? latest.startedAt;
  if (stamp && ['QUEUED', 'PENDING_VERSION', 'DEQUEUED'].includes(latest.status)) {
    const age = now - new Date(stamp).getTime();
    if (Number.isFinite(age) && age > QUEUE_WAITING_AFTER_MS) return false;
  }

  // Nothing conclusive: the last run is old, or it is still within the window
  // in which a worker would normally have picked it up.
  return null;
}

/**
 * The availability of the background-job service.
 *
 * The answer is cached for a short while, because the interface reads it on
 * every poll and the platform should not be asked on every poll.
 */
let cached: { value: BackgroundJobAvailability; at: number } | null = null;
const CACHE_MS = 15_000;

/** Reads the availability, using the cached answer when it is still fresh. */
export async function backgroundJobAvailability(
  options: { now?: number; force?: boolean } = {},
): Promise<BackgroundJobAvailability> {
  const now = options.now ?? Date.now();
  if (!options.force && cached && now - cached.at < CACHE_MS) {
    return cached.value;
  }

  const value = await computeAvailability(now);
  cached = { value, at: now };
  return value;
}

/** Forgets the cached answer. Used by the tests. */
export function resetAvailabilityCache(): void {
  cached = null;
}

async function computeAvailability(now: number): Promise<BackgroundJobAvailability> {
  const environment = triggerEnvironment();
  const label = environmentLabel(environment);

  const base: BackgroundJobAvailability = {
    configured: environment !== 'unknown' && Boolean(process.env.TRIGGER_SECRET_KEY?.trim()),
    environment,
    environmentLabel: label,
    status: 'unconfigured',
    runnerAvailable: null,
    deploymentExists: null,
    requiresDevelopmentWorker: environment === 'development',
    message:
      environment === 'unknown'
        ? 'Background processing is not configured on this server.'
        : 'Background processing is configured.',
    waitingAfterSeconds: Math.round(QUEUE_WAITING_AFTER_MS / 1000),
    staleAfterSeconds: Math.round(QUEUE_STALE_AFTER_MS / 1000),
  };

  if (!base.configured) {
    return {
      ...base,
      status: 'unconfigured',
      message:
        'Background processing is not available: this server has no Trigger.dev key, so no background work can be started.',
    };
  }

  if (environment === 'production') {
    // A Production run needs a deployed version of the tasks. Without one it
    // waits for ever, and the honest thing is to say so.
    const deploymentExists = await productionDeploymentExists();
    if (deploymentExists === false) {
      return {
        ...base,
        status: 'unavailable',
        runnerAvailable: false,
        deploymentExists: false,
        message:
          'Background processing is not available: the Production environment has no deployed version of the tasks, so no background work can start.',
      };
    }
    if (deploymentExists === null) {
      return {
        ...base,
        status: 'unknown',
        message:
          'Background processing could not be checked just now, so the state of the Production runner is unknown.',
      };
    }
    return {
      ...base,
      status: 'ready',
      runnerAvailable: true,
      deploymentExists: true,
      message: 'Background processing is running on the Trigger.dev Production runtime.',
    };
  }

  if (environment === 'development') {
    let runs: Awaited<ReturnType<typeof listRuns>> = [];
    try {
      runs = await listRuns(10);
    } catch {
      return {
        ...base,
        status: 'unknown',
        message:
          'Background processing runs in the Trigger.dev Development environment and its state could not be checked just now.',
      };
    }

    const runnerAvailable = developmentRunnerAvailable(runs, now);
    if (runnerAvailable === false) {
      return {
        ...base,
        status: 'unavailable',
        runnerAvailable: false,
        message:
          'Background processing is not available: the tasks run in the Trigger.dev Development environment and no development worker is connected, so new work cannot start.',
      };
    }
    if (runnerAvailable === null) {
      return {
        ...base,
        status: 'degraded',
        runnerAvailable: null,
        message:
          'Background processing runs in the Trigger.dev Development environment. It needs a development worker to be connected before work can start.',
      };
    }
    return {
      ...base,
      status: 'degraded',
      runnerAvailable: true,
      message:
        'Background processing runs in the Trigger.dev Development environment, so the work is carried out by a development worker rather than the Trigger.dev Production runtime.',
    };
  }

  return {
    ...base,
    status: 'unknown',
    message:
      'Background processing could not be checked: the Trigger.dev key on this server does not identify a known environment.',
  };
}

/** The project the jobs belong to, for the logs and the support requests. */
export function availabilityProjectRef(): string | undefined {
  return triggerProjectRef();
}
