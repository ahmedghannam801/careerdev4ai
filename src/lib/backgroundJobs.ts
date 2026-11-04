// The client for the background-job API.
//
// The state of a background job lives on the server, not in the browser, so
// this module is a thin wrapper around four calls. Everything the interface
// needs to show — queued, processing, completed, failed, and what was
// produced — is read back from the server.
//
// That is what makes a result survive a refresh: the browser holds no state
// of its own to lose.
import { apiRequest } from './apiClient';

export type BackgroundJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export type BackgroundJobKind =
  | 'process-cv'
  | 'generate-targeted-cv'
  | 'match-jobs'
  | 'generate-career-roadmap'
  | 'update-roadmap-progress'
  | 'process-ai-mentor-workflow'
  | 'validate-learning-resources';

export interface BackgroundJob {
  id: string;
  kind: BackgroundJobKind;
  status: BackgroundJobStatus;
  /** The last thing the job actually reported doing. */
  stage: string | null;
  sourceType: string | null;
  sourceId: string | null;
  attempt: number;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** True when the job is queued and no runner has picked it up yet. */
  waitingForRunner: boolean;
}

/** The Trigger.dev environment the background jobs go to. */
export type TriggerEnvironment = 'production' | 'development' | 'unknown';

/**
 * What the background-job service can do right now.
 *
 * `ready` means the work runs on Trigger.dev's own Production runtime.
 * `degraded` means it runs, but on a development worker rather than the
 * platform — which the interface has to say out loud rather than let the
 * candidate believe otherwise. `unavailable` means nothing can pick the work
 * up at the moment.
 */
export type BackgroundJobServiceStatus =
  | 'ready'
  | 'degraded'
  | 'unavailable'
  | 'unconfigured'
  | 'unknown';

export interface BackgroundJobAvailability {
  configured: boolean;
  environment: TriggerEnvironment;
  environmentLabel: 'Production' | 'Development' | 'Unknown';
  status: BackgroundJobServiceStatus;
  /** `null` means "not known" — never reported as `false` without evidence. */
  runnerAvailable: boolean | null;
  deploymentExists: boolean | null;
  /** True when the work can only run on a developer's own machine. */
  requiresDevelopmentWorker: boolean;
  message: string;
  waitingAfterSeconds: number;
  staleAfterSeconds: number;
}

/** What is needed to start a job. */
export interface StartJobInput {
  kind: BackgroundJobKind;
  sourceId?: string | null;
  jobDescription?: string;
  language?: string;
  document?: unknown;
  query?: string;
  location?: string;
  page?: number;
  question?: string;
  taskIds?: string[];
  status?: string;
  isEnrolled?: boolean;
}

/** Starts a job. The same request twice returns the same job. */
export async function startBackgroundJob(input: StartJobInput): Promise<BackgroundJob> {
  const response = await apiRequest<{ job: BackgroundJob; deduplicated: boolean }>(
    '/api/background-jobs',
    { method: 'POST', body: JSON.stringify(input) },
  );
  return response.job;
}

/**
 * Every job of the signed-in candidate, newest first, and the state of the
 * service that carries them out.
 */
export async function listBackgroundJobs(): Promise<{
  jobs: BackgroundJob[];
  availability: BackgroundJobAvailability | null;
}> {
  const response = await apiRequest<{
    jobs: BackgroundJob[];
    availability?: BackgroundJobAvailability;
  }>('/api/background-jobs');
  return { jobs: response.jobs ?? [], availability: response.availability ?? null };
}

/**
 * Asks whether the background jobs can run right now.
 *
 * Read on its own so a screen can check the service without reading the whole
 * list.
 */
export async function fetchBackgroundJobAvailability(): Promise<BackgroundJobAvailability | null> {
  const response = await apiRequest<{ availability?: BackgroundJobAvailability }>(
    '/api/background-jobs/availability',
  );
  return response.availability ?? null;
}

/** One job of the signed-in candidate. */
export async function getBackgroundJob(jobId: string): Promise<BackgroundJob> {
  const response = await apiRequest<{ job: BackgroundJob }>(
    `/api/background-jobs/${encodeURIComponent(jobId)}`,
  );
  return response.job;
}

/**
 * Starts a job again.
 *
 * The retry replays the original request, so the second attempt does exactly
 * what the first one did.
 */
export async function retryBackgroundJob(jobId: string): Promise<BackgroundJob> {
  const response = await apiRequest<{ job: BackgroundJob }>(
    `/api/background-jobs/${encodeURIComponent(jobId)}/retry`,
    { method: 'POST' },
  );
  return response.job;
}

/** Stops a job that has not finished. */
export async function cancelBackgroundJob(jobId: string): Promise<BackgroundJob> {
  const response = await apiRequest<{ job: BackgroundJob }>(
    `/api/background-jobs/${encodeURIComponent(jobId)}/cancel`,
    { method: 'POST' },
  );
  return response.job;
}

/** True when the job is still doing something. */
export function isJobActive(job: BackgroundJob): boolean {
  return job.status === 'queued' || job.status === 'processing';
}

/** A short, readable name for a workflow. */
export const JOB_KIND_LABELS: Record<BackgroundJobKind, string> = {
  'process-cv': 'CV processing',
  'generate-targeted-cv': 'CV for a job',
  'match-jobs': 'Job search',
  'generate-career-roadmap': 'Career roadmap',
  'update-roadmap-progress': 'Roadmap progress',
  'process-ai-mentor-workflow': 'AI mentor',
  'validate-learning-resources': 'Learning catalogue check',
};
