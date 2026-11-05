// Searching for vacancies that fit the candidate.
//
// The work: search the provider, then compare every vacancy that came back
// with the candidate's own verified skills.
//
// The matching is the same one the screen uses: a vacancy is compared with
// the candidate's own verified skills, and a vacancy whose posting names no
// comparable skill gets no score at all rather than a flattering default.

import { runJob, type JobContext, type JobPayload } from '../runtime.ts';
import { searchJobs } from '../../jsearch/client.ts';
import { getUserSkills } from '../../db/userSkills.ts';
import { matchJobToSkills } from '../../../shared/jobs.ts';
import { CATALOG_SKILL_NAMES } from '../../../shared/careerRoles.ts';

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

export async function matchJobsTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  const typed = payload as MatchJobsPayload;
  return runJob(typed, context, 'looking for vacancies', async () => {
    await context.reportStage('looking for vacancies');

    const result = await searchJobs({
      query: typed.query ?? '',
      location: typed.location ?? '',
      page: typed.page ?? 1,
    });

    await context.reportStage('comparing the vacancies with your skills');
    const skills = await candidateSkillNames(typed.profileId);
    const jobs = result.jobs.map((jobEntry) => ({
      job: jobEntry,
      match: matchJobToSkills(jobEntry, skills, CATALOG_SKILL_NAMES),
    }));

    return {
      query: typed.query ?? '',
      location: typed.location ?? '',
      jobCount: jobs.length,
      jobs,
      quota: result.quota ?? null,
    };
  });
}
