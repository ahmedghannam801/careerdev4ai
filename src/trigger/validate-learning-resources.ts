// Checking that the learning catalogue still points at real resources.
//
// The catalogue is a list of courses with links. Links rot: a course moves,
// a provider changes a URL, a page is taken down. A candidate who follows a
// dead link has lost time and trust, so the catalogue is checked on a schedule
// and the result is recorded on the course itself.
//
// Two rules keep this honest:
//
//   * the check is a HEAD request with a short timeout and a GET fallback,
//     and it is bounded — the catalogue is finite and the task gives up
//     rather than retrying forever;
//   * a resource that could not be checked is NOT marked broken. Only a
//     definite answer (a 404, a 410) changes the record. A timeout, a
//     certificate error or a provider that blocks the request leaves the
//     course exactly as it was, because "we could not check" is not "this is
//     broken".
//
// The task is scheduled rather than started by a candidate.

import { task } from "@trigger.dev/sdk";
import { listCoursesForAdmin } from "../../server/db/learning.ts";
import { getSupabaseServer } from "../../server/db/supabase.ts";

/** How long one link is given to answer. */
const CHECK_TIMEOUT_MS = 10_000;

/** How many courses are checked in one run. */
const MAX_COURSES = 250;

interface LearningCourse {
  id: string;
  url?: string | null;
  isVerified?: boolean | null;
  verifiedAt?: string | null;
}

/**
 * Checks one link.
 *
 * Returns 'reachable', 'broken' or 'unknown'. Only a definite "this is gone"
 * answer is 'broken'.
 */
async function checkLink(url: string): Promise<'reachable' | 'broken' | 'unknown'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'CareerDev4AI catalogue check' },
    });

    // Some servers answer HEAD with a method error. A GET is the fallback.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'CareerDev4AI catalogue check' },
      });
    }

    if (response.status === 404 || response.status === 410) return 'broken';
    if (response.status >= 200 && response.status < 400) return 'reachable';
    return 'unknown';
  } catch {
    // A timeout, a DNS failure, a blocked request or a certificate problem:
    // none of them say the resource is gone.
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

export const validateLearningResourcesTask = task({
  id: "validate-learning-resources",
  maxDuration: 900,
  // Only one catalogue sweep at a time.
  concurrency: { total: 1 },
  // A schedule should not stack up attempts. One pass, and the next run picks
  // up whatever was left.
  retry: { maxAttempts: 1 },
  run: async (payload: { jobId?: string; profileId?: string }) => {
    // The scheduled task has no job row of its own, so it runs the work
    // directly and reports through the log.
    const startedAt = new Date().toISOString();
    const courses = (await listCoursesForAdmin()) as LearningCourse[];
    const withLinks = courses.filter((course) => Boolean(course.url)).slice(0, MAX_COURSES);

    let checked = 0;
    let broken = 0;
    let restored = 0;
    let unknown = 0;

    for (const course of withLinks) {
      const state = await checkLink(course.url as string);
      checked += 1;

      if (state === 'unknown') {
        unknown += 1;
        continue;
      }

      const isVerified = state === 'reachable';
      const verifiedAt = new Date().toISOString();
      const wasVerified = course.isVerified !== false;

      const { error } = await getSupabaseServer()
        .from('courses')
        .update({ is_verified: isVerified, verified_at: verifiedAt })
        .eq('id', course.id);
      if (error) {
        throw new Error(`Could not update the course ${course.id}: ${error.message}`);
      }

      if (!isVerified) broken += 1;
      else if (!wasVerified) restored += 1;
    }

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      courses: courses.length,
      checked,
      broken,
      restored,
      unknown,
    };
  },
});
