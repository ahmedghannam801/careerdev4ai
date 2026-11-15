/**
 * The CV Studio AI edit quota.
 *
 * WHAT THIS IS
 * ------------
 * A free account may make three AI-powered edits in the CV Studio in any
 * twenty-four hour window. A paid account may make as many as it likes.
 *
 * The rule lives here, in one place, so the server that enforces it and the
 * interface that displays it cannot disagree about how many edits are left or
 * when the allowance comes back.
 *
 * WHAT COUNTS AS AN EDIT
 * -----------------------
 * An edit is an AI request that WRITES: the inline assistant that drafts a
 * summary or a bullet list, and the tailoring that produces a CV aimed at one
 * advertisement. A measurement — the ATS audit — is not an edit: it reads the
 * document and reports on it, and it is already accounted for by the credit
 * system. Typing by hand is never an edit, and is never limited.
 *
 * THE WINDOW
 * ----------
 * The window is anchored to the FIRST edit of the window. The first edit
 * starts a twenty-four hour clock; the third edit inside that clock is the
 * last one; the clock runs out and the allowance is whole again. The window
 * is therefore not "since midnight" and not "the last twenty-four hours" —
 * it is the twenty-four hours that began when the candidate first used the
 * assistant.
 *
 * THE PLAN
 * --------
 * Every plan in the product other than `free` is a paid plan and is not
 * limited. `isCvAiUnlimitedPlan()` is the only place that decides.
 */

/** How many AI edits a limited account may make in one window. */
export const CV_AI_EDIT_LIMIT = 3;

/** How long one window lasts: twenty-four hours, in milliseconds. */
export const CV_AI_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The plan code of the account with no paid subscription. */
export const CV_AI_FREE_PLAN = 'free';

/**
 * Whether a plan may edit without limit.
 *
 * The product's paid plans are `student`, `pro` and `career_plus`. They are
 * listed explicitly so a future or malformed plan code can never widen the
 * allowance by accident.
 */
export function isCvAiUnlimitedPlan(planCode: string | null | undefined): boolean {
  return planCode === 'student' || planCode === 'pro' || planCode === 'career_plus';
}

/** The stored row behind the quota: how many edits were used, and until when. */
export interface CvAiQuotaRecord {
  /** How many edits have been used in the current window. */
  used: number;
  /** When the window ends, as an ISO timestamp. */
  resetAt: string | null;
}

/** The quota as the interface sees it. */
export interface CvAiQuotaState {
  /** The allowance. `null` when the plan is unlimited. */
  limit: number | null;
  /** How many edits have been used in the current window. */
  used: number;
  /** How many edits are left. `null` when the plan is unlimited. */
  remaining: number | null;
  /** True when the allowance is spent and the window has not run out. */
  locked: boolean;
  /** True when the plan may edit without limit. */
  unlimited: boolean;
  /** When the window ends, as an ISO timestamp. `null` when unlimited. */
  resetAt: string | null;
  /** The plan the quota was resolved against. */
  planCode: string;
}

/**
 * A record whose window has already run out reads as an unused allowance.
 *
 * The counter is not reset here: the row is only rewritten when the next edit
 * is made. A quota read must never have a side effect, and the state it
 * reports has to match what the next write will do.
 */
export function normaliseCvAiQuotaRecord(
  record: CvAiQuotaRecord | null | undefined,
  now: number = Date.now()
): CvAiQuotaRecord {
  if (!record) return { used: 0, resetAt: null };
  const used = Math.max(0, Math.floor(Number(record.used) || 0));
  const resetAt = record.resetAt ?? null;
  if (!resetAt) return { used: 0, resetAt: null };
  const end = Date.parse(resetAt);
  if (!Number.isFinite(end)) return { used: 0, resetAt: null };
  if (end <= now) return { used: 0, resetAt: null };
  return { used, resetAt };
}

/**
 * The quota for a plan, at a moment in time.
 *
 * A paid plan is always unlimited and never carries a reset time: there is
 * nothing to reset. A limited plan reports its allowance, what is left of it,
 * and whether it is locked.
 */
export function resolveCvAiQuotaState(
  record: CvAiQuotaRecord | null | undefined,
  planCode: string,
  now: number = Date.now()
): CvAiQuotaState {
  if (isCvAiUnlimitedPlan(planCode)) {
    return {
      limit: null,
      used: 0,
      remaining: null,
      locked: false,
      unlimited: true,
      resetAt: null,
      planCode,
    };
  }
  const current = normaliseCvAiQuotaRecord(record, now);
  const limit = CV_AI_EDIT_LIMIT;
  const remaining = Math.max(0, limit - current.used);
  return {
    limit,
    used: current.used,
    remaining,
    locked: current.used >= limit,
    unlimited: false,
    resetAt: current.resetAt,
    planCode,
  };
}

/**
 * Whether an edit may be started right now.
 *
 * A paid plan may always edit. A limited plan may edit while its allowance
 * lasts.
 */
export function isCvAiEditAllowed(state: CvAiQuotaState): boolean {
  if (state.unlimited) return true;
  return !state.locked;
}

/**
 * The countdown shown while the allowance is spent.
 *
 * Written as `HH:MM:SS`, with the hours allowed to grow past a day so a
 * window that is nearly over does not read as `00:00:03` when there are
 * really eleven hours left.
 */
export function formatCvAiResetCountdown(millisecondsRemaining: number): string {
  const total = Math.max(0, Math.floor(millisecondsRemaining / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * How long the window has left, in milliseconds.
 *
 * Zero when there is no window, so a reader never has to check for a null
 * timestamp first.
 */
export function cvAiResetMillisecondsRemaining(
  state: CvAiQuotaState,
  now: number = Date.now()
): number {
  if (!state.resetAt) return 0;
  const end = Date.parse(state.resetAt);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - now);
}
