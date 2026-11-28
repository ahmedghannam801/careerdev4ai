/**
 * Whether the platform sells anything, and what an access decision looks like
 * when it does not.
 *
 * WHY THIS IS ONE SWITCH
 * ----------------------
 * Aionvia is a free platform at the moment. That single fact has to answer
 * every question the product asks about money:
 *
 *   - "may this account use this feature?" — yes, for every account;
 *   - "which allowance does this account get?" — the same one for every
 *     account, and never a larger one because something was paid for;
 *   - "may this account buy something?" — no.
 *
 * When those answers live in a dozen places, they drift: one screen still shows
 * a price, one route still returns 402, one badge still wears the paid colour.
 * So the answers live here, once, and every place that used to ask about a
 * plan asks this module instead.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not delete anything. The subscription rows, the payment records, the
 * credit ledger and the plan catalogue all stay exactly as they are — they are
 * the platform's history, and an administrator must still be able to read them.
 * This module only decides what the *running product* is allowed to offer and
 * who it may offer it to.
 *
 * HOW TO TURN MONETIZATION BACK ON
 * --------------------------------
 * Flip `MONETIZATION_ENABLED` to `true` and redeploy. The entitlement matrix,
 * the credit ledger, the plan catalogue and the checkout code are all still in
 * the repository, untouched, precisely so that this reversal is a one-line
 * change rather than a rebuild. Nothing here is destructive.
 *
 * THE LIMITS THAT REMAIN
 * ----------------------
 * Free does not mean unlimited. The per-minute limiter, the daily AI budget
 * (per account and per project) and the CV Studio edit allowance are GLOBAL
 * rate limits: they apply to every account, they are not connected to any
 * purchase, and they are what keeps a free platform from being drained by one
 * person. They are described where they live:
 *
 *   - `server/ai/quota.ts`        the daily AI budget;
 *   - `server/cv/aiEditQuota.ts`  the CV Studio edit allowance;
 *   - `app.ts` (`aiRateLimit`)    the per-minute limiter.
 */

/**
 * Whether the platform currently sells anything.
 *
 * While this is `false`:
 *
 *   - no payment method is offered anywhere in the product;
 *   - no subscription plan is sold, quoted or displayed;
 *   - no feature is locked behind a purchase, a plan code or a credit balance;
 *   - every account receives the same access, and the same global limits.
 *
 * While it is `true`, the original paid behaviour applies unchanged.
 */
export const MONETIZATION_ENABLED = false;

/**
 * The plan code every access decision is made against while the platform is
 * free.
 *
 * `free` is not a lesser plan here. It is the name of the one tier that
 * everybody is on, and it is what the free allowance is read from: the saved
 * jobs limit, the CV Studio edit allowance and the daily allowance all come
 * from the catalogue's `free` row, which is why every account gets the same
 * answer.
 */
export const FREE_ACCESS_PLAN_CODE = 'free';

/**
 * Whether the platform sells anything right now.
 *
 * A function rather than only a constant, so that a caller reads the current
 * state instead of capturing it at import time, and so that a test can be
 * written against one name.
 */
export function isMonetizationEnabled(): boolean {
  return MONETIZATION_ENABLED;
}

/**
 * The plan code an access decision must be made against.
 *
 * While monetization is on, this is the account's own plan — the plan the
 * server resolved from its subscription. While monetization is off, it is
 * always the free tier, so that no account can reach a larger allowance
 * because it happens to hold an old subscription.
 *
 * The historical plan is still readable — the account's own subscription is
 * still shown in the administration screens and still exists in the database.
 * It simply no longer decides anything.
 */
export function accessPlanCode(
  resolvedPlanCode: string | null | undefined
): string {
  if (!MONETIZATION_ENABLED) return FREE_ACCESS_PLAN_CODE;
  return resolvedPlanCode?.trim() || FREE_ACCESS_PLAN_CODE;
}

/**
 * The one sentence the product says instead of a price.
 *
 * It replaces every "upgrade to unlock", "renew your plan" and "buy tokens"
 * message in the interface. It is deliberately short and it does not promise
 * a date: the platform is free until it is not, and nothing else is true.
 */
export const FREE_ACCESS_MESSAGE =
  'Aionvia is completely free right now — every feature is open to you, and no payment is needed.';

/** The same sentence in Arabic, for the interface's second language. */
export const FREE_ACCESS_MESSAGE_AR =
  'منصة Aionvia مجانية بالكامل في الوقت الحالي — كل الميزات متاحة لك، ولا حاجة إلى أي عملية دفع.';
