// Matching a candidate against real vacancies.
//
// The provider call is the slow part — it reaches out to a public job board
// and waits for the answer — and it is the same call the jobs screen makes
// today. Running it in the background means the screen can be left and
// returned to, and the result of one search is one record rather than a
// response that is lost the moment the tab closes.
//
// The matching is the same one the screen uses: a vacancy is compared with
// the candidate's own verified skills, and a vacancy whose posting names no
// comparable skill gets no score at all rather than a flattering default.

import { task } from "@trigger.dev/sdk";
import { reportStage, runJob, type JobPayload } from "../../server/trigger/runtime.ts";
import { searchJobs } from "../../server/jsearch/client.ts";
import { getUserSkills } from "../../server/db/userSkills.ts";
import { matchJobToSkills } from "../../shared/jobs.ts";
import { CATALOG_SKILL_NAMES } from "../../shared/careerRoles.ts";

interface MatchJobsPayload extends JobPayload {
  query?: string;
  location?: string;
  page?: number;
}

/** The candidate's own skill names, used to explain a match. */
async function candidateSkillNames(profileId: string): Promise<string[]> {
  try {
    const rows = await getUserSkills(profileId);
    return rows
      .map((row) => row.skill?.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  } catch {
    // A failure to read the skills must not fail the search: the vacancies are
    // still real, only the explanation is missing.
    return [];
  }
}

export const matchJobsTask = task({
  id: "match-jobs",
  maxDuration: 300,
  // One search per candidate at a time.
  concurrency: { perKey: 1 },
  retry: {
    // The provider is a third party that sometimes rate-limits. A second
    // attempt after a pause is reasonable; more than that is not.
    maxAttempts: 2,
    minTimeoutInMs: 15_000,
    maxTimeoutInMs: 60_000,
    factor: 2,
  },
  run: async (payload: MatchJobsPayload) =>
    runJob(payload, "looking for vacancies", async (job) => {
      await reportStage(job.id, 'looking for vacancies');

      const result = await searchJobs({
        query: payload.query ?? '',
        location: payload.location ?? '',
        page: payload.page ?? 1,
      });

      await reportStage(job.id, 'comparing the vacancies with your skills');
      const skills = await candidateSkillNames(payload.profileId);
      const jobs = result.jobs.map((jobEntry) => ({
        job: jobEntry,
        match: matchJobToSkills(jobEntry, skills, CATALOG_SKILL_NAMES),
      }));

      return {
        query: payload.query ?? '',
        location: payload.location ?? '',
        jobCount: jobs.length,
        jobs,
        quota: result.quota ?? null,
      };
    }),
});
