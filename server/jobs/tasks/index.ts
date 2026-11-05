// The registry of background work.
//
// Every workflow the platform can carry out is listed here once, with the
// task that does it. The worker looks the task up by the kind on the job row.
//
// There is no second list to keep in step — a workflow that is not in this
// file cannot be started. The retry policies live next door in `policies.ts`,
// so that the API can read them without pulling this file — and the model SDK
// with it — into its own bundle.

import type { BackgroundJobKind } from '../jobs.ts';
import type { JobTask } from '../runtime.ts';
import { processCvTask } from './processCv.ts';
import { generateTargetedCvTask } from './generateTargetedCv.ts';
import { matchJobsTask } from './matchJobs.ts';
import { generateCareerRoadmapTask, updateRoadmapProgressTask } from './roadmap.ts';
import { processAiMentorWorkflowTask } from './aiMentor.ts';
import { validateLearningResourcesTask } from './validateLearningResources.ts';
import { healthCheckTask } from './healthCheck.ts';

export type { JobPolicy } from './policies.ts';
export { JOB_POLICIES, getJobPolicy, backoffSeconds } from './policies.ts';

/** The task that carries out each workflow. */
export const JOB_TASKS: Record<BackgroundJobKind, JobTask> = {
  'process-cv': processCvTask,
  'generate-targeted-cv': generateTargetedCvTask,
  'match-jobs': matchJobsTask,
  'generate-career-roadmap': generateCareerRoadmapTask,
  'update-roadmap-progress': updateRoadmapProgressTask,
  'process-ai-mentor-workflow': processAiMentorWorkflowTask,
  'validate-learning-resources': validateLearningResourcesTask,
};

/**
 * The liveness check.
 *
 * It is not a candidate workflow and has no job kind of its own: the worker
 * publishes it to prove that the queue path works end to end.
 */
export const HEALTH_CHECK_TASK = healthCheckTask;

/** The task for a kind, or `null` when the kind is not one we know. */
export function getJobTask(kind: string): JobTask | null {
  if (kind === 'health-check') return HEALTH_CHECK_TASK;
  return (JOB_TASKS as Record<string, JobTask | undefined>)[kind] ?? null;
}
