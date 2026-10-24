// Quota handling for the Gemini-backed routes.
//
// The provider enforces a hard daily quota per project and per model (20
// generate-content requests a day on the free tier). Two things follow:
//
//  1. A provider 429 must NOT be flattened into a generic 503. "Come back in
//     15 hours" and "try again in 30 seconds" are different problems, and the
//     client and any monitoring need to be able to tell them apart.
//  2. The application needs its own daily budget that mirrors the provider's
//     cap, so a single user cannot spend the whole project's allowance and
//     lock everybody else out for the rest of the day.
//
// The budget therefore has TWO tiers:
//
//   * a per-USER allowance, so one person cannot drain the project;
//   * a per-PROJECT allowance, so the application fails fast with its own
//     clear message before the provider starts rejecting requests.
//
// The per-user allowance is deliberately smaller than the per-project one, so
// a second user always has headroom left when the first one has spent theirs.
//
// The budget is in-process, like the existing per-minute limiter. It is a
// best-effort guard, not a distributed counter: a multi-instance deployment
// multiplies the effective allowance by the instance count. The provider's own
// quota remains the hard ceiling.

/** Matches the provider's daily-request quota error. */
export function isQuotaError(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error ?? '');
  return (
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('429') ||
    message.includes('quota exceeded') ||
    message.includes('Quota exceeded')
  );
}

/**
 * Extracts the provider's retry delay, in seconds.
 *
 * The provider reports it as "Please retry in 14h49m36s" in the error
 * message, so that is the primary source. Falls back to the full day.
 */
export function quotaRetryAfterSeconds(error: unknown, fallbackSeconds = 3600): number {
  const message = String((error as { message?: unknown })?.message ?? error ?? '');
  const match = /retry in (\d+)h(?:(\d+)m)?(?:(\d+)s)?/i.exec(message);
  if (match) {
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2] ?? 0);
    const seconds = Number(match[3] ?? 0);
    const total = hours * 3600 + minutes * 60 + seconds;
    if (total > 0) return total;
  }
  return fallbackSeconds;
}

/**
 * The provider's free-tier daily cap is 20 requests per model.
 *
 * The project allowance is set to that cap so the application stops cleanly
 * before the provider starts refusing requests, and the per-user allowance is
 * three lower so one user cannot take the whole project allowance.
 */
export const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 15);
export const AI_PROJECT_DAILY_LIMIT = Number(process.env.AI_PROJECT_DAILY_LIMIT ?? 20);

const DAY_MS = 24 * 60 * 60 * 1000;

interface DailyBucket {
  count: number;
  resetAt: number;
}

const dailyBuckets = new Map<string, DailyBucket>();

function bucketFor(key: string, now: number): DailyBucket {
  let bucket = dailyBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + DAY_MS };
    dailyBuckets.set(key, bucket);
  }
  return bucket;
}

/** Which allowance rejected the request. */
export type AiBudgetScope = 'user' | 'project';

export interface AiBudgetDecision {
  allowed: boolean;
  /** Seconds until the allowance resets. Only meaningful when blocked. */
  retryAfterSeconds: number;
  /** The allowance that rejected the request. */
  scope: AiBudgetScope;
  /** The limit that applied. */
  limit: number;
  /** How much of that allowance was already spent. */
  used: number;
}

export interface AiBudgetOptions {
  /** Per-user allowance. Defaults to AI_DAILY_LIMIT. */
  userLimit?: number;
  /** Per-project allowance. Defaults to AI_PROJECT_DAILY_LIMIT. */
  projectLimit?: number;
}

/**
 * Consumes one unit of the daily AI budget.
 *
 * Both allowances are checked before either is incremented, so a request that
 * is rejected does not count against the allowance that rejected it.
 *
 * @param userId The verified caller. When absent, only the project allowance
 *               applies.
 */
export function consumeDailyAiBudget(
  userId?: string | null,
  options: AiBudgetOptions = {}
): AiBudgetDecision {
  const userLimit = Number(options.userLimit ?? AI_DAILY_LIMIT);
  const projectLimit = Number(options.projectLimit ?? AI_PROJECT_DAILY_LIMIT);
  const now = Date.now();

  const userKey = userId ? `user:${userId}` : null;
  const userBucket = userKey ? bucketFor(userKey, now) : null;
  const projectBucket = bucketFor('project', now);

  if (userBucket && userLimit > 0 && userBucket.count + 1 > userLimit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((userBucket.resetAt - now) / 1000)),
      scope: 'user',
      limit: userLimit,
      used: userBucket.count,
    };
  }

  if (projectLimit > 0 && projectBucket.count + 1 > projectLimit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((projectBucket.resetAt - now) / 1000)),
      scope: 'project',
      limit: projectLimit,
      used: projectBucket.count,
    };
  }

  if (userBucket) userBucket.count += 1;
  projectBucket.count += 1;

  return {
    allowed: true,
    retryAfterSeconds: 0,
    scope: 'project',
    limit: projectLimit,
    used: projectBucket.count,
  };
}

/**
 * Gives one unit back to the daily budget.
 *
 * Used when the provider rejected the call with a quota error: the provider
 * did not serve that request, so it must not count against the application's
 * allowance either. Otherwise an exhausted provider would drain the app's
 * budget as well, and the app would keep saying "try again tomorrow" for a
 * reason that has nothing to do with the app's own limit.
 */
export function refundDailyAiBudget(userId?: string | null): void {
  const projectBucket = dailyBuckets.get('project');
  if (projectBucket && projectBucket.count > 0) projectBucket.count -= 1;
  if (userId) {
    const userBucket = dailyBuckets.get(`user:${userId}`);
    if (userBucket && userBucket.count > 0) userBucket.count -= 1;
  }
}

/** Current usage of the daily budget, for diagnostics. */
export function dailyAiBudgetUsage(
  scope: string
): { used: number; limit: number; resetAt: number } {
  const now = Date.now();
  const bucket = bucketFor(scope, now);
  const limit = scope === 'project' ? AI_PROJECT_DAILY_LIMIT : AI_DAILY_LIMIT;
  return { used: bucket.count, limit, resetAt: bucket.resetAt };
}
