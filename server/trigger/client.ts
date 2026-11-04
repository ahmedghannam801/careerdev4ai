// Server-side client for Trigger.dev.
//
// The task *runtime* uses the `@trigger.dev/sdk` — that is where it belongs.
// The *server* that starts those tasks does not, and deliberately so.
//
// The API in this repository is not a Node server: `worker/index.ts` bundles
// the Express application into a Cloudflare Worker (`dist/_worker.js`), and
// that is what runs in production. The Trigger.dev SDK's package graph reaches
// for `node:child_process` and `node:fs`, which the Workers runtime does not
// provide even with `nodejs_compat`; bundling it into the Worker would make
// the whole API depend on a runtime it cannot have.
//
// So the server talks to Trigger.dev over its public REST API with `fetch`.
// That has three properties this codebase needs:
//
//   * it is identical in the Cloudflare Worker, in the local Express server and
//     in the test harness — one code path, so a test proves the real thing;
//   * it needs no bundling tricks, so the Worker build stays as it is;
//   * it exposes the platform's own idempotency and concurrency controls
//     directly, which is what keeps a double submit from becoming two runs.
//
// The secret key decides the environment: a `tr_dev_sk_…` key addresses the
// Development environment and a `tr_prod_sk_…` key addresses Production. The
// same variable therefore works in both places with no extra wiring.

const DEFAULT_API_URL = 'https://api.trigger.dev';

/** The statuses Trigger.dev reports for a run. */
export type TriggerRunStatus =
  | 'PENDING_VERSION'
  | 'QUEUED'
  | 'DEQUEUED'
  | 'EXECUTING'
  | 'WAITING'
  | 'COMPLETED'
  | 'CANCELED'
  | 'FAILED'
  | 'CRASHED'
  | 'SYSTEM_FAILURE'
  | 'DELAYED'
  | 'EXPIRED'
  | 'TIMED_OUT';

export interface TriggerRun {
  id: string;
  status: TriggerRunStatus;
}

export interface TriggerTaskOptions {
  /**
   * The platform's own idempotency key. Repeating a request with the same key
   * returns the same run instead of starting a second one, for as long as the
   * platform keeps the key (24 hours by default).
   */
  idempotencyKey?: string;
  /**
   * The platform's own concurrency key. Runs that share a key do not overlap,
   * which is how one candidate's CV cannot be processed twice at the same
   * time.
   */
  concurrencyKey?: string;
  /** Free-form labels, used to find a run again later. */
  tags?: string[];
  /** How long the platform keeps the run, in seconds. */
  ttl?: number;
}

/** A failure the caller can turn into an HTTP response. */
export class TriggerApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = 'trigger_api_error') {
    super(message);
    this.name = 'TriggerApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * The API key and endpoint, read lazily.
 *
 * Lazy because this module is imported by the route file at start-up, and a
 * machine without Trigger.dev configured (a contributor running the app
 * locally without the background features) must still be able to boot the
 * whole API. The key is only demanded at the moment a task is actually
 * started.
 */
function apiConfig(): { apiUrl: string; secretKey: string } {
  const secretKey = process.env.TRIGGER_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new TriggerApiError(
      'Background jobs are not configured on this server (TRIGGER_SECRET_KEY is missing).',
      503,
      'trigger_not_configured',
    );
  }
  const apiUrl = (process.env.TRIGGER_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');
  return { apiUrl, secretKey };
}

/** True when this server is able to start background jobs at all. */
export function isTriggerConfigured(): boolean {
  return Boolean(process.env.TRIGGER_SECRET_KEY?.trim());
}

/**
 * The project reference, used only to label runs and to make the logs
 * readable. It is optional: a server that only ever reads jobs does not need
 * it.
 */
export function triggerProjectRef(): string | undefined {
  const ref = process.env.TRIGGER_PROJECT_REF?.trim();
  return ref || undefined;
}

async function triggerFetch(path: string, init: RequestInit): Promise<Response> {
  const { apiUrl, secretKey } = apiConfig();
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    // A network failure is not the platform's fault and must not look like one.
    throw new TriggerApiError(
      `Could not reach Trigger.dev: ${error instanceof Error ? error.message : 'unknown error'}`,
      502,
      'trigger_unreachable',
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new TriggerApiError(
      `Trigger.dev refused the request (${response.status}). ${body.slice(0, 400)}`.trim(),
      response.status === 401 || response.status === 403 ? 502 : response.status,
      'trigger_api_error',
    );
  }

  return response;
}

/**
 * Starts a task.
 *
 * Returns the id of the run that was created. The caller stores it against
 * the job row so the outcome can be looked up later.
 */
export async function triggerTask(
  taskId: string,
  payload: unknown,
  options: TriggerTaskOptions = {},
): Promise<{ runId: string }> {
  const body: Record<string, unknown> = { payload };
  const triggerOptions: Record<string, unknown> = {};
  if (options.idempotencyKey) triggerOptions.idempotencyKey = options.idempotencyKey;
  if (options.concurrencyKey) triggerOptions.concurrencyKey = options.concurrencyKey;
  if (options.tags?.length) triggerOptions.tags = options.tags;
  if (typeof options.ttl === 'number') triggerOptions.ttl = options.ttl;
  if (Object.keys(triggerOptions).length > 0) body.options = triggerOptions;

  const response = await triggerFetch(`/api/v1/tasks/${encodeURIComponent(taskId)}/trigger`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const parsed = (await response.json().catch(() => null)) as { id?: string } | null;
  const runId = parsed?.id;
  if (!runId) {
    throw new TriggerApiError('Trigger.dev did not return a run id.', 502, 'trigger_bad_response');
  }
  return { runId };
}

/** Reads the current state of a run. */
export async function getRun(runId: string): Promise<TriggerRun> {
  const response = await triggerFetch(`/api/v1/runs/${encodeURIComponent(runId)}`, { method: 'GET' });
  const parsed = (await response.json().catch(() => null)) as
    | { id?: string; status?: TriggerRunStatus }
    | null;
  if (!parsed?.id || !parsed.status) {
    throw new TriggerApiError('Trigger.dev did not return a readable run.', 502, 'trigger_bad_response');
  }
  return { id: parsed.id, status: parsed.status };
}

/**
 * Cancels a run that has not finished yet.
 *
 * A run that already finished is not an error: the outcome is already decided,
 * and the job row has been updated with it.
 */
export async function cancelRun(runId: string): Promise<void> {
  await triggerFetch(`/api/v1/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
}
