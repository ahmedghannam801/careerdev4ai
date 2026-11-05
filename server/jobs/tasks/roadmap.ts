// The career roadmap.
//
// The first task builds the plan from the candidate's own record. The second
// records progress. The roadmap screen lets a candidate mark a step as done;
// doing that one request at a time against the API is the same work, and it is
// the same ownership rules — `updateTaskStatus` refuses a task that does not
// belong to the candidate.

import { JobError, runJob, type JobContext, type JobPayload } from '../runtime.ts';
import { generateAndPersistRoadmap } from '../../roadmap/service.ts';
import { updateTaskStatus } from '../../db/roadmap.ts';
import { ROADMAP_TASK_STATUSES } from '../../db/roadmap.ts';

interface RoadmapPayload extends JobPayload {
  isEnrolled?: boolean;
}

interface RoadmapProgressPayload extends JobPayload {
  roadmapId?: string | null;
  taskIds?: string[];
  status?: string;
}

export async function generateCareerRoadmapTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  const typed = payload as RoadmapPayload;
  return runJob(typed, context, 'building your roadmap', async () => {
    await context.reportStage('building your roadmap');

    const result = await generateAndPersistRoadmap(typed.profileId, {
      isEnrolled: typed.isEnrolled === true,
    });

    const roadmap = result?.roadmap ?? null;
    if (!roadmap) {
      throw new JobError(
        'roadmap_not_created',
        'The roadmap could not be built. Check that your profile has a target role.',
      );
    }

    return {
      roadmapId: roadmap.id,
      title: roadmap.title,
      phaseCount: result?.plan?.phases?.length ?? null,
      taskCount: result?.plan?.summary?.totalTasks ?? null,
      readiness: result?.plan?.summary?.readinessPct ?? null,
      regenerated: result?.regenerated ?? false,
    };
  });
}

export async function updateRoadmapProgressTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  const typed = payload as RoadmapProgressPayload;
  return runJob(typed, context, 'recording your progress', async () => {
    const taskIds = Array.isArray(typed.taskIds) ? typed.taskIds : [];
    if (taskIds.length === 0) {
      throw new JobError('no_tasks', 'No roadmap steps were given to update.');
    }

    const status = typed.status ?? 'completed';
    if (!(ROADMAP_TASK_STATUSES as readonly string[]).includes(status)) {
      throw new JobError('bad_status', `"${status}" is not a roadmap step state.`);
    }

    await context.reportStage('recording your progress');

    const updated: string[] = [];
    for (const taskId of taskIds) {
      // The update refuses a task that is not the candidate's, so a step of
      // somebody else's is simply not recorded.
      const ok = await updateTaskStatus(typed.profileId, taskId, status as never);
      if (ok) updated.push(taskId);
    }

    if (updated.length === 0) {
      throw new JobError('not_found', 'None of those roadmap steps belong to you.');
    }

    return {
      updated: updated.length,
      skipped: taskIds.length - updated.length,
      status,
    };
  });
}
