/**
 * Annual subscriptions, paid monthly in tokens.
 *
 * An annual plan is one payment for twelve months of access, but its token
 * allowance is a monthly allowance: 15, 40 or 85 tokens each month, not twelve
 * times that on day one. The first month is granted by the webhook when the
 * money is confirmed; this module grants months 2 to 12 as each month falls
 * due, through the same idempotent ledger the rest of the platform uses.
 *
 * Two rules make the sweep safe to run as often as the scheduler likes:
 *
 *   * Each grant has a key derived from the session and the month, so a second
 *     run returns the first result instead of adding the allowance twice.
 *   * A month is only granted while the paid period is still running, so a
 *     refunded or expired period cannot keep producing tokens.
 *
 * Nothing here grants tokens for a monthly plan: its allowance is the one
 * payment the webhook already fulfils.
 */

import { ANNUAL_ENTITLEMENT_MONTHS } from '../../shared/subscriptions.ts';
import { grantAiCredits } from '../credits/grant.ts';
import { getPlanByCode } from '../db/subscriptions.ts';
import {
  isCurrentXPaySubscription,
  listActiveAnnualSubscriptionPurchases,
  type XPayPurchaseRow,
} from './store.ts';

/**
 * Adds whole months to an instant without drifting on short months.
 *
 * 31 January plus one month is 28 February in a non-leap year, and plus two
 * months is 31 March — the same day-of-month the candidate paid on, clamped to
 * the length of the target month.
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** The months (2..12) whose allowance falls inside a paid annual period. */
export function annualInstallmentMonths(startsAt: Date, endsAt: Date): number[] {
  const months: number[] = [];
  for (let month = 1; month < ANNUAL_ENTITLEMENT_MONTHS; month += 1) {
    const due = addMonths(startsAt, month);
    if (due.getTime() >= endsAt.getTime()) break;
    months.push(month + 1);
  }
  return months;
}

/** The months whose allowance is due at `now`, oldest first. */
export function dueAnnualInstallmentMonths(startsAt: Date, endsAt: Date, now: Date): number[] {
  return annualInstallmentMonths(startsAt, endsAt).filter((month) => {
    const due = addMonths(startsAt, month - 1);
    return due.getTime() <= now.getTime();
  });
}

/** The ledger key for one month of one annual period. */
export function annualInstallmentKey(sessionId: string, month: number): string {
  return month === 1 ? `xpay-plan:${sessionId}` : `xpay-plan:${sessionId}:m${month}`;
}

export interface AnnualInstallmentOutcome {
  /** Annual periods that still have at least one due month. */
  periods: number;
  granted: number;
  skipped: number;
  failed: number;
}

export interface AnnualInstallmentDeps {
  listPurchases: () => Promise<XPayPurchaseRow[]>;
  getPlanByCode: typeof getPlanByCode;
  grantCredits: typeof grantAiCredits;
  /** Whether the purchase still belongs to the account's current plan. */
  isCurrentPurchase: (profileId: string, sessionId: string) => Promise<boolean>;
}

export const annualInstallmentDeps: AnnualInstallmentDeps = {
  listPurchases: listActiveAnnualSubscriptionPurchases,
  getPlanByCode,
  grantCredits: grantAiCredits,
  isCurrentPurchase: isCurrentXPaySubscription,
};

/**
 * Grants every annual allowance that has fallen due and not been granted yet.
 *
 * A failed period does not stop the sweep: the next run retries it with the
 * same key, so a partial failure can never double-grant an earlier month.
 */
export async function grantDueAnnualTokenInstallments(
  now: Date = new Date(),
  deps: AnnualInstallmentDeps = annualInstallmentDeps
): Promise<AnnualInstallmentOutcome> {
  const outcome: AnnualInstallmentOutcome = { periods: 0, granted: 0, skipped: 0, failed: 0 };

  const purchases = await deps.listPurchases();
  const currentByPurchase = new Map<string, boolean>();
  for (const purchase of purchases) {
    if (!purchase.plan_code || !purchase.access_ends_at) continue;

    // An upgrade leaves the superseded annual purchase active until its own
    // end date. It is no longer the account's plan, so it must not pay tokens.
    const purchaseKey = `${purchase.profile_id}:${purchase.session_id}`;
    let current = currentByPurchase.get(purchaseKey);
    if (current === undefined) {
      current = await deps.isCurrentPurchase(purchase.profile_id, purchase.session_id);
      currentByPurchase.set(purchaseKey, current);
    }
    if (!current) continue;

    const plan = await deps.getPlanByCode(purchase.plan_code);
    const amount = plan?.monthlyAiCredits ?? 0;
    if (amount <= 0) continue;

    const startsAt = new Date(purchase.access_starts_at);
    const endsAt = new Date(purchase.access_ends_at);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;

    const months = dueAnnualInstallmentMonths(startsAt, endsAt, now);
    if (months.length === 0) continue;
    outcome.periods += 1;

    for (const month of months) {
      try {
        const result = await deps.grantCredits({
          profileId: purchase.profile_id,
          amount,
          idempotencyKey: annualInstallmentKey(purchase.session_id, month),
          sourceType: 'subscription',
          sourceId: purchase.id,
          description:
            `AI tokens for month ${month} of ${ANNUAL_ENTITLEMENT_MONTHS} (${purchase.plan_code}, XPay annual)`,
          metadata: {
            plan_code: purchase.plan_code,
            billing_cycle: 'annual',
            xpay_session: purchase.session_id,
            installment_month: month,
          },
        });
        if (result.granted) outcome.granted += 1;
        else outcome.skipped += 1;
      } catch (error) {
        outcome.failed += 1;
        console.error(
          `Annual token installment ${month} for XPay session ${purchase.session_id} failed:`,
          error
        );
      }
    }
  }

  return outcome;
}
