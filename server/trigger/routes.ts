// The HTTP surface of the background-job feature.
//
// Four routes, all of them behind the same authentication the rest of the API
// uses:
//
//   POST   /api/background-jobs          start a job
//   GET    /api/background-jobs          list this candidate's jobs
//   GET    /api/background-jobs/:id      one job
//   POST   /api/background-jobs/:id/retry   start the job again
//   POST   /api/background-jobs/:id/cancel  stop a job that has not finished
//
// The route is deliberately thin. It checks that the caller may run this
// workflow, that the record the job is about really belongs to the caller,
// that the daily AI allowance covers the model calls the workflow will make,
// and then it hands the work to Trigger.dev. Everything else happens in the
// task.
//
// The allowance is spent HERE, when the job is admitted, rather than in the
// task. The task runs in a different process with its own memory, so an
// in-process counter would be empty there and every task would look free.
// Charging at the door keeps the accounting in the one place that is shared
// by every request.
//
// The owner of a job is always the id verified from the caller's Supabase
// session. It is never read from the request body, and a job that belongs to
// somebody else is reported as "not found" rather than "forbidden", so the
// API does not confirm that another candidate's job exists.

import type { Express, Request, Response } from 'express';
import { requireAuth } from '../auth/require-auth.ts';
import { consumeDailyAiBudget } from '../ai/quota.ts';
import { getSupabaseServer } from '../db/supabase.ts';
import {
  BACKGROUND_JOB_TASKS,
  computeIdempotencyKey,
  createJob,
  failStaleQueuedJobs,
  findJobByIdempotencyKey,
  getJobForProfile,
  isBackgroundJobKind,
  listJobsForProfile,
  prepareJobRetry,
  toPublicJob,
  type BackgroundJobKind,
} from './jobs.ts';
import { backgroundJobAvailability } from './availability.ts';
import { cancelRun, TriggerApiError, triggerTask } from './client.ts';

/** How many jobs one candidate may start per minute. */
const JOB_START_LIMIT = 10;
const JOB_START_WINDOW_MS = 60_000;

/** The longest job description the server will read, matching the CV studio. */
const MAX_JOB_DESCRIPTION_CHARS = 12_000;

/**
 * What each workflow needs and what it costs.
 *
 * `aiUnits` is how many model calls the workflow will make. It is charged when
 * the job is admitted, so a workflow that makes two calls is charged two units
 * and a workflow that makes none is free.
 */
interface KindSpec {
  taskId: string;
  aiUnits: number;
  /** The domain record the job is about. `null` when the job is not about one. */
  sourceType: 'cv' | 'roadmap' | null;
  /** Whether the source record has to be supplied. */
  sourceRequired: boolean;
  /** Whether a candidate may start this workflow at all. */
  userTriggerable: boolean;
}

const KIND_SPECS: Record<BackgroundJobKind, KindSpec> = {
  'process-cv': {
    taskId: BACKGROUND_JOB_TASKS['process-cv'],
    aiUnits: 1,
    sourceType: 'cv',
    sourceRequired: true,
    userTriggerable: true,
  },
  'generate-targeted-cv': {
    taskId: BACKGROUND_JOB_TASKS['generate-targeted-cv'],
    aiUnits: 2,
    sourceType: 'cv',
    sourceRequired: false,
    userTriggerable: true,
  },
  'match-jobs': {
    taskId: BACKGROUND_JOB_TASKS['match-jobs'],
    aiUnits: 0,
    sourceType: null,
    sourceRequired: false,
    userTriggerable: true,
  },
  'generate-career-roadmap': {
    taskId: BACKGROUND_JOB_TASKS['generate-career-roadmap'],
    aiUnits: 0,
    sourceType: null,
    sourceRequired: false,
    userTriggerable: true,
  },
  'update-roadmap-progress': {
    taskId: BACKGROUND_JOB_TASKS['update-roadmap-progress'],
    aiUnits: 0,
    sourceType: 'roadmap',
    sourceRequired: true,
    userTriggerable: true,
  },
  'process-ai-mentor-workflow': {
    taskId: BACKGROUND_JOB_TASKS['process-ai-mentor-workflow'],
    aiUnits: 1,
    sourceType: 'cv',
    sourceRequired: false,
    userTriggerable: true,
  },
  'validate-learning-resources': {
    taskId: BACKGROUND_JOB_TASKS['validate-learning-resources'],
    aiUnits: 0,
    sourceType: null,
    sourceRequired: false,
    // A scheduled maintenance job. A candidate may not start it.
    userTriggerable: false,
  },
};

/** Reads a trimmed string out of an untrusted body. */
function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Reads a UUID out of an untrusted body. */
function uuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

/** The only two languages the model is asked to write in. */
function language(value: unknown): 'en' | 'ar' {
  return value === 'ar' ? 'ar' : 'en';
}

// A small in-process limiter for job starts.
//
// It exists so one candidate cannot flood the platform with runs. It is keyed
// on the VERIFIED user id, never on anything the browser sends.
const jobStartBuckets = new Map<string, { count: number; resetAt: number }>();

function jobStartAllowed(profileId: string): boolean {
  const now = Date.now();
  const key = `job-start:${profileId}`;
  let bucket = jobStartBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + JOB_START_WINDOW_MS };
    jobStartBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > JOB_START_LIMIT) {
    for (const [otherKey, other] of jobStartBuckets) {
      if (other.resetAt <= now) jobStartBuckets.delete(otherKey);
    }
    return false;
  }
  return true;
}

/**
 * Confirms that the record the job is about belongs to this candidate.
 *
 * Returns false when the record does not exist *or* belongs to somebody else;
 * the two are not distinguished on purpose.
 */
async function sourceIsOwned(
  profileId: string,
  sourceType: 'cv' | 'roadmap' | null,
  sourceId: string | null,
): Promise<boolean> {
  if (!sourceType) return true;
  if (!sourceId) return false;
  const supabase = getSupabaseServer();
  if (sourceType === 'cv') {
    const { data, error } = await supabase
      .from('cvs')
      .select('id')
      .eq('id', sourceId)
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) throw new Error(`Could not verify the CV: ${error.message}`);
    return Boolean(data);
  }
  const { data, error } = await supabase
    .from('roadmaps')
    .select('id')
    .eq('id', sourceId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(`Could not verify the roadmap: ${error.message}`);
  return Boolean(data);
}

/**
 * The payload the task receives.
 *
 * Built field by field rather than by passing the request body through, so the
 * task only ever receives what it needs and nothing a browser invented.
 */
function buildTaskPayload(
  kind: BackgroundJobKind,
  body: Record<string, unknown>,
  profileId: string,
  sourceId: string | null,
): Record<string, unknown> {
  switch (kind) {
    case 'process-cv':
      return {
        profileId,
        cvId: sourceId,
        fileName: str(body.fileName, 200) ?? undefined,
      };
    case 'generate-targeted-cv':
      return {
        profileId,
        cvId: sourceId,
        jobDescription: str(body.jobDescription, MAX_JOB_DESCRIPTION_CHARS) ?? '',
        language: language(body.language),
        document: (body.document ?? null) as unknown,
      };
    case 'match-jobs':
      return {
        profileId,
        query: str(body.query, 200) ?? '',
        location: str(body.location, 200) ?? '',
        page: Number.isFinite(Number(body.page)) ? Math.max(1, Math.min(5, Number(body.page))) : 1,
      };
    case 'generate-career-roadmap':
      return { profileId, isEnrolled: body.isEnrolled === true };
    case 'update-roadmap-progress':
      return {
        profileId,
        roadmapId: sourceId,
        taskIds: Array.isArray(body.taskIds)
          ? body.taskIds.filter((id): id is string => typeof id === 'string').slice(0, 100)
          : [],
        status: str(body.status, 40) ?? 'completed',
      };
    case 'process-ai-mentor-workflow':
      return {
        profileId,
        cvId: sourceId,
        question: str(body.question, 2000) ?? '',
        language: language(body.language),
      };
    case 'validate-learning-resources':
      return { profileId };
  }
}

/**
 * The fingerprint of a request.
 *
 * Two identical requests must produce the same key, so the second one is
 * recognised as the same job instead of a new one. The content of the request
 * is part of the key, so two *different* job descriptions are two different
 * jobs.
 */
async function fingerprintFor(
  kind: BackgroundJobKind,
  profileId: string,
  sourceId: string | null,
  body: Record<string, unknown>,
): Promise<string> {
  const content = [kind, profileId, sourceId ?? '', JSON.stringify(body ?? {})].join('|');
  return computeIdempotencyKey([content]);
}

/**
 * Starts a task and records the run against the job.
 *
 * Returns the run id. The job row is updated before the response is sent, so
 * the interface can always find the run again.
 */
async function startTask(
  job: { id: string; kind: BackgroundJobKind; task_id: string; attempt: number; profile_id: string; source_id: string | null },
  payload: Record<string, unknown>,
): Promise<string> {
  const { runId } = await triggerTask(job.task_id, payload, {
    // The attempt is part of the key, so a deliberate retry is a new run
    // while a double submit inside one attempt is the same run.
    idempotencyKey: `${job.id}:${job.attempt}`,
    // One candidate's work on one record does not overlap itself.
    concurrencyKey: `${job.profile_id}:${job.kind}:${job.source_id ?? 'none'}`,
    tags: [job.kind],
  });

  await getSupabaseServer()
    .from('background_jobs')
    .update({ run_id: runId })
    .eq('id', job.id);

  return runId;
}

/** Registers every background-job route on the application. */
export function registerBackgroundJobRoutes(app: Express): void {
  // Starts a job.
  app.post('/api/background-jobs', requireAuth, async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const profileId = req.authUser!.id;

      const kind = body.kind;
      if (!isBackgroundJobKind(kind)) {
        return res.status(400).json({ error: 'Unknown background job.', code: 'unknown_kind' });
      }
      const spec = KIND_SPECS[kind];
      if (!spec.userTriggerable) {
        return res.status(403).json({ error: 'This job cannot be started by hand.', code: 'not_startable' });
      }

      // Do not accept work that nothing can carry out. The candidate is told
      // plainly instead of being left watching a job that will never start.
      //
      // The check is skipped unless the platform says, with evidence, that no
      // runner can pick the work up. "Cannot tell" is never treated as "no".
      const availability = await backgroundJobAvailability();
      if (availability.status === 'unavailable') {
        return res.status(503).json({
          error: availability.message,
          code: 'no_runner_available',
        });
      }

      const sourceId = uuid(body.sourceId);
      if (spec.sourceRequired && !sourceId) {
        return res.status(400).json({ error: 'This job needs the record it is about.', code: 'source_required' });
      }

      // The record has to belong to the caller. A record that belongs to
      // somebody else is reported as missing.
      //
      // A workflow whose source record is optional is checked only when one
      // was named. The CV of `generate-targeted-cv` and of the AI mentor is
      // optional: the work can be done from the candidate's own record, and a
      // request without one is a legitimate request, not a missing record.
      if (sourceId && !(await sourceIsOwned(profileId, spec.sourceType, sourceId))) {
        return res.status(404).json({ error: 'Not found', code: 'not_found' });
      }

      // The same request must not start two jobs.
      const key = await fingerprintFor(kind, profileId, sourceId, body);
      const existing = await findJobByIdempotencyKey(key);
      if (existing) {
        return res.status(200).json({
          job: toPublicJob(existing),
          deduplicated: true,
        });
      }

      if (!jobStartAllowed(profileId)) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({
          error: 'Too many background jobs were started. Please wait a moment.',
          code: 'rate_limit',
        });
      }

      // The allowance is spent here, where the request enters the system.
      if (spec.aiUnits > 0 && process.env.GEMINI_API_KEY) {
        const budget = consumeDailyAiBudget(profileId, { count: spec.aiUnits });
        if (!budget.allowed) {
          res.setHeader('Retry-After', String(budget.retryAfterSeconds));
          return res.status(429).json({
            error:
              "The AI assistant has reached today's usage limit. Your job was not started; please try again later.",
            code: 'ai_daily_budget',
            scope: budget.scope,
            retryAfterSeconds: budget.retryAfterSeconds,
          });
        }
      }

      const taskPayload = {
        jobId: '',
        ...buildTaskPayload(kind, body, profileId, sourceId),
      };

      const { job } = await createJob({
        profileId,
        kind,
        taskId: spec.taskId,
        idempotencyKey: key,
        sourceType: spec.sourceType,
        sourceId,
        stage: 'queued',
        // The sanitised request, so a retry replays exactly this.
        request: taskPayload,
      });

      try {
        await startTask(job, { ...taskPayload, jobId: job.id });
      } catch (error) {
        // The platform refused the job. It never ran, so the row must not stay
        // 'queued' for ever.
        await getSupabaseServer()
          .from('background_jobs')
          .update({
            status: 'failed',
            error_code: error instanceof TriggerApiError ? error.code : 'trigger_failed',
            error_message:
              error instanceof Error ? error.message.slice(0, 500) : 'The job could not be started.',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        if (error instanceof TriggerApiError) {
          return res.status(error.status).json({ error: error.message, code: error.code });
        }
        throw error;
      }

      const refreshed = await getJobForProfile(profileId, job.id);
      return res.status(202).json({
        job: toPublicJob(refreshed ?? job),
        deduplicated: false,
      });
    } catch (error) {
      console.error('Background job error:', error);
      return res.status(500).json({ error: 'The background job could not be started' });
    }
  });

  // Whether the background-job service can run work right now.
  //
  // Registered before the `/:id` route so that "availability" is read as a
  // path of its own rather than as a job id.
  app.get('/api/background-jobs/availability', requireAuth, async (_req: Request, res: Response) => {
    try {
      const availability = await backgroundJobAvailability();
      return res.json({ availability });
    } catch (error) {
      console.error('Background job availability error:', error);
      return res.status(500).json({ error: 'The background job service could not be checked' });
    }
  });

  // Every job of this candidate.
  app.get('/api/background-jobs', requireAuth, async (req: Request, res: Response) => {
    try {
      // Give up on the jobs that are never going to start, so none of them sits
      // queued for ever with no explanation.
      await failStaleQueuedJobs();
      const jobs = await listJobsForProfile(req.authUser!.id, 25);
      const availability = await backgroundJobAvailability();
      return res.json({ jobs: jobs.map(toPublicJob), availability });
    } catch (error) {
      console.error('Background job list error:', error);
      return res.status(500).json({ error: 'The background jobs could not be read' });
    }
  });

  // One job of this candidate.
  app.get('/api/background-jobs/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const jobId = uuid(req.params.id);
      if (!jobId) return res.status(400).json({ error: 'Invalid job id' });
      await failStaleQueuedJobs();
      const job = await getJobForProfile(req.authUser!.id, jobId);
      if (!job) return res.status(404).json({ error: 'Not found' });
      return res.json({ job: toPublicJob(job) });
    } catch (error) {
      console.error('Background job read error:', error);
      return res.status(500).json({ error: 'The background job could not be read' });
    }
  });

  // Starts the job again.
  app.post('/api/background-jobs/:id/retry', requireAuth, async (req: Request, res: Response) => {
    try {
      const profileId = req.authUser!.id;
      const jobId = uuid(req.params.id);
      if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

      const job = await getJobForProfile(profileId, jobId);
      if (!job) return res.status(404).json({ error: 'Not found' });

      // The same check as when the job is started: a retry that nothing can
      // carry out would only leave another job waiting for ever.
      const availability = await backgroundJobAvailability();
      if (availability.status === 'unavailable') {
        return res.status(503).json({
          error: availability.message,
          code: 'no_runner_available',
        });
      }

      // Only a job that has actually stopped can be started again. A job that
      // is still running must not be started a second time.
      if (job.status === 'queued' || job.status === 'processing') {
        return res.status(409).json({
          error: 'This job is still running.',
          code: 'job_running',
          job: toPublicJob(job),
        });
      }

      const spec = KIND_SPECS[job.kind];
      if (spec.aiUnits > 0 && process.env.GEMINI_API_KEY) {
        const budget = consumeDailyAiBudget(profileId, { count: spec.aiUnits });
        if (!budget.allowed) {
          res.setHeader('Retry-After', String(budget.retryAfterSeconds));
          return res.status(429).json({
            error:
              "The AI assistant has reached today's usage limit. Your job was not started; please try again later.",
            code: 'ai_daily_budget',
            scope: budget.scope,
            retryAfterSeconds: budget.retryAfterSeconds,
          });
        }
      }

      await prepareJobRetry(job.id);
      const refreshed = (await getJobForProfile(profileId, job.id))!;

      // The original request is replayed, so the retry does exactly what the
      // first attempt did.
      const stored = (refreshed.request ?? {}) as Record<string, unknown>;
      try {
        await startTask(refreshed, { ...stored, jobId: refreshed.id });
      } catch (error) {
        // The attempt never started. The row records why, so the candidate
        // sees a failed job with a reason rather than one that spins for ever.
        await getSupabaseServer()
          .from('background_jobs')
          .update({
            status: 'failed',
            error_code: error instanceof TriggerApiError ? error.code : 'trigger_failed',
            error_message:
              error instanceof Error ? error.message.slice(0, 500) : 'The job could not be started.',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        if (error instanceof TriggerApiError) {
          return res.status(error.status).json({ error: error.message, code: error.code });
        }
        throw error;
      }

      const updated = await getJobForProfile(profileId, job.id);
      return res.status(202).json({ job: toPublicJob(updated ?? refreshed) });
    } catch (error) {
      console.error('Background job retry error:', error);
      if (error instanceof TriggerApiError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      return res.status(500).json({ error: 'The background job could not be restarted' });
    }
  });

  // Stops a job that has not finished.
  app.post('/api/background-jobs/:id/cancel', requireAuth, async (req: Request, res: Response) => {
    try {
      const profileId = req.authUser!.id;
      const jobId = uuid(req.params.id);
      if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

      const job = await getJobForProfile(profileId, jobId);
      if (!job) return res.status(404).json({ error: 'Not found' });

      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        // It has already stopped. The outcome is decided and the row records it.
        return res.status(200).json({ job: toPublicJob(job) });
      }

      if (job.run_id) {
        try {
          await cancelRun(job.run_id);
        } catch (error) {
          // A run that already finished cannot be cancelled, and that is not a
          // failure the candidate needs to hear about.
          if (!(error instanceof TriggerApiError)) throw error;
        }
      }

      await getSupabaseServer()
        .from('background_jobs')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', job.id);

      const updated = await getJobForProfile(profileId, job.id);
      return res.status(200).json({ job: toPublicJob(updated ?? job) });
    } catch (error) {
      console.error('Background job cancel error:', error);
      return res.status(500).json({ error: 'The background job could not be cancelled' });
    }
  });
}
