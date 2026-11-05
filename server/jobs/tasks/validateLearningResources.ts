// Checking that the learning catalogue still points at things that exist.
//
// The work: for every course in the catalogue, ask the provider whether the
// link still answers, and record what was found.
//
// A link that cannot be checked is not a broken link. A timeout, a DNS
// failure, a certificate error or a provider that blocks the request leaves the
// course exactly as it was, because "we could not check" is not "this is
// broken".
//
// This sweep is a scheduled one rather than something a candidate starts, but
// it is also a job kind: the same code carries out both, so the catalogue is
// never checked two different ways.

import { runJob, type JobContext, type JobPayload } from '../runtime.ts';
import { listCoursesForAdmin } from '../../db/learning.ts';
import { getSupabaseServer } from '../../db/supabase.ts';

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

/**
 * The sweep itself.
 *
 * It is a plain function so that both callers — the scheduled run and the
 * queued job — carry out exactly the same work.
 */
export async function runLearningResourceSweep(): Promise<Record<string, unknown>> {
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
}

export async function validateLearningResourcesTask(
  payload: JobPayload,
  context: JobContext,
): Promise<Record<string, unknown>> {
  return runJob(payload, context, 'checking the learning catalogue', async () => {
    await context.reportStage('checking the learning catalogue');
    return runLearningResourceSweep();
  });
}
