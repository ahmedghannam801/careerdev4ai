// The career roadmap, and the progress recorded against it.
//
// Building a roadmap reads the candidate's whole record — profile, skills,
// learning items, projects — and lays it out as phases, milestones and
// steps. That is slow enough to be worth doing in the background, and a
// candidate who asked for a roadmap while offline should find it waiting.
//
// The second task records progress. The roadmap screen lets a candidate mark
// a step as done; doing that one request at a time against the API is the
// same work, and it is the same ownership rules — `updateTaskStatus` refuses
// a task that does not belong to the candidate.

import { task } from "@trigger.dev/sdk";
import { JobError, reportStage, runJob, type JobPayload } from "../../server/trigger/runtime.ts";
import { generateAndPersistRoadmap } from "../../server/roadmap/service.ts";
import { updateTaskStatus } from "../../server/db/roadmap.ts";
import { ROADMAP_TASK_STATUSES } from "../../server/db/roadmap.ts";

interface RoadmapPayload extends JobPayload {
  isEnrolled?: boolean;
}

interface RoadmapProgressPayload extends JobPayload {
  roadmapId?: string | null;
  taskIds?: string[];
  status?: string;
}

export const generateCareerRoadmapTask = task({
  id: "generate-career-roadmap",
  maxDuration: 600,
  // One roadmap per candidate at a time.
  concurrency: { perKey: 1 },
  retry: {
    // The plan is built from the candidate's own record, so a failure is a
    // failure of that read. One retry is enough.
    maxAttempts: 2,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
  },
  run: async (payload: RoadmapPayload) =>
    runJob(payload, 'building your roadmap', async (job) => {
      await reportStage(job.id, 'building your roadmap');

      const result = await generateAndPersistRoadmap(payload.profileId, {
        isEnrolled: payload.isEnrolled === true,
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
    }),
});

export const updateRoadmapProgressTask = task({
  id: "update-roadmap-progress",
  maxDuration: 300,
  // One progress update per candidate at a time.
  concurrency: { perKey: 1 },
  // There is nothing transient about a step being marked done. Retrying would
  // only repeat a write that already succeeded.
  retry: { maxAttempts: 1 },
  run: async (payload: RoadmapProgressPayload) =>
    runJob(payload, 'recording your progress', async (job) => {
      const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds : [];
      if (taskIds.length === 0) {
        throw new JobError('no_tasks', 'No roadmap steps were given to update.');
      }

      const status = payload.status ?? 'completed';
      if (!(ROADMAP_TASK_STATUSES as readonly string[]).includes(status)) {
        throw new JobError('bad_status', `"${status}" is not a roadmap step state.`);
      }

      await reportStage(job.id, 'recording your progress');

      const updated: string[] = [];
      for (const taskId of taskIds) {
        // The update refuses a task that is not the candidate's, so a step of
        // somebody else's is simply not recorded.
        const ok = await updateTaskStatus(payload.profileId, taskId, status as never);
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
    }),
});
