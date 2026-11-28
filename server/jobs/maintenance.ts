/**
 * Subscription & Payment Lifecycle Maintenance Sweeps.
 * Runs on scheduled intervals (Cloudflare Worker cron or local test runner).
 * Calls atomic database stored procedures to expire ended subscriptions and 24-hr provisional access.
 *
 * WHILE THE PLATFORM IS FREE
 * --------------------------
 * Two of the sweeps are withdrawn, because they exist to serve a sale:
 *
 *   - the daily ENTITLEMENT sweep grants a paid plan's daily allowance, and
 *     there is no paid plan while the platform is free;
 *   - the annual INSTALMENT sweep grants the monthly allowance of an annual
 *     period that was bought through the payment gateway, and there is no
 *     gateway any more.
 *
 * The expiry sweeps are KEPT. They do not grant anything: they mark a lapsed
 * subscription as expired, which keeps the historical record truthful — a
 * subscription whose period has ended must say so, whether or not the platform
 * still sells periods. Stopping them would leave paid history claiming to be
 * active, which is a worse lie than the one they prevent.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { grantDueAnnualTokenInstallments } from '../xpay/installments.ts';
import { isMonetizationEnabled } from '../../shared/platformAccess.ts';

export interface MaintenanceSweepOutcome {
  expiredSubscriptions: number;
  expiredTemporaryAccess: number;
  /** How many expired daily tokens were taken out of the running balances. */
  dailyCreditsExpired: number;
  dailyCreditsSkipped: number;
  dailyCreditsFailed: number;
  /**
   * How many accounts the daily ENTITLEMENT reached.
   *
   * The entitlement is what a PAID plan promises, so it is granted by the
   * sweep and not by the candidate. The free reward is a different thing and
   * is still claimed by hand — see the note on the expiry sweep below.
   */
  dailyEntitlementsGranted: number;
  /** How many accounts were entitled to the day's allowance. */
  dailyEntitlementsEligible: number;
  /** How many accounts the sweep could not reach this time. */
  dailyEntitlementsFailed: number;
  /** Annual periods that still have a monthly token allowance due. */
  annualTokenPeriods: number;
  /** Monthly allowances granted to annual plans by this sweep. */
  annualTokensGranted: number;
  /** Allowances that were already granted for their month. */
  annualTokensSkipped: number;
  /** Allowances the sweep failed to grant; the next run retries them. */
  annualTokensFailed: number;
}

/**
 * Runs routine scheduled maintenance to mark lapsed subscriptions as expired,
 * revoke 24-hr temporary access whose windows have passed, and send notifications.
 */
export async function runSubscriptionMaintenanceSweeps(): Promise<MaintenanceSweepOutcome> {
  const supabase = getSupabaseServer();
  let expiredSubscriptions = 0;
  let expiredTemporaryAccess = 0;
  let dailyCreditsExpired = 0;
  let dailyCreditsSkipped = 0;
  let dailyCreditsFailed = 0;
  let dailyEntitlementsGranted = 0;
  let dailyEntitlementsEligible = 0;
  let dailyEntitlementsFailed = 0;
  let annualTokenPeriods = 0;
  let annualTokensGranted = 0;
  let annualTokensSkipped = 0;
  let annualTokensFailed = 0;

  try {
    const { data, error } = await supabase.rpc('expire_subscriptions');
    if (error) {
      console.error('Error in expire_subscriptions RPC:', error);
    } else if (data) {
      expiredSubscriptions = Number((data as { expired_count?: number }).expired_count ?? 0);
    }
  } catch (err) {
    console.error('Failed to run expire_subscriptions:', err);
  }

  try {
    const { data, error } = await supabase.rpc('expire_temporary_access');
    if (error) {
      console.error('Error in expire_temporary_access RPC:', error);
    } else if (data) {
      expiredTemporaryAccess = Number((data as { expired_count?: number }).expired_count ?? 0);
    }
  } catch (err) {
    console.error('Failed to run expire_temporary_access:', err);
  }

  // The daily ENTITLEMENT of a paid plan.
  //
  // A plan promises its account a daily allowance, and a promise that only
  // arrives when the account happens to open the application is not a
  // promise. The sweep grants it, for every account that has an active
  // subscription, on the same day, without anybody asking.
  //
  // The grant is idempotent — one bucket per account per Africa/Cairo day —
  // so the sweep may run as often as the scheduler likes, and an account
  // that was missed by one run is picked up by the next one.
  //
  // While the platform is free there is no paid plan to promise anything to,
  // so the sweep is skipped.
  if (isMonetizationEnabled()) {
    try {
      const { data, error } = await supabase.rpc('grant_daily_entitlements_to_all');
      if (error) {
        console.error('Error in grant_daily_entitlements_to_all RPC:', error);
      } else if (data) {
        const outcome = data as {
          granted?: number;
          eligible?: number;
          failed?: number;
        };
        dailyEntitlementsGranted = Number(outcome?.granted ?? 0);
        dailyEntitlementsEligible = Number(outcome?.eligible ?? 0);
        dailyEntitlementsFailed = Number(outcome?.failed ?? 0);
      }
    } catch (err) {
      console.error('Failed to run grant_daily_entitlements_to_all:', err);
    }
  }

  // The daily free-token allowance.
  //
  // The FREE reward is CLAIMED by the candidate, so a sweep must not grant
  // it: a reward that arrives on its own is not the reward the claim button
  // promises. `grant_daily_credits_to_all` therefore grants nothing and
  // reports that it is a manual claim.
  //
  // What the sweep still owns is the EXPIRY: yesterday's unused tokens have
  // to leave the running balance whether or not anybody claims today, and the
  // balance read cannot be the only thing that does it.
  try {
    const { data, error } = await supabase.rpc('expire_all_daily_credits');
    if (error) {
      console.error('Error in expire_all_daily_credits RPC:', error);
    } else if (data) {
      const outcome = data as {
        expired?: number;
        skipped?: number;
        failed?: number;
      };
      dailyCreditsExpired = Number(outcome?.expired ?? 0);
      dailyCreditsSkipped = Number(outcome?.skipped ?? 0);
      dailyCreditsFailed = Number(outcome?.failed ?? 0);
    }
  } catch (err) {
    console.error('Failed to run expire_all_daily_credits:', err);
  }

  // Annual plans, paid monthly in tokens.
  //
  // An annual subscription is one payment for twelve months of access, and the
  // allowance is monthly: the webhook grants month one, and this sweep grants
  // each later month as it falls due. Each grant is keyed by the session and
  // the month, so the sweep may run every few minutes without ever doubling an
  // allowance, and a failure is retried by the next run.
  //
  // While the platform is free there is no gateway to have bought an annual
  // period from, so there is nothing to instal.
  if (isMonetizationEnabled()) {
    try {
      const outcome = await grantDueAnnualTokenInstallments();
      annualTokenPeriods = outcome.periods;
      annualTokensGranted = outcome.granted;
      annualTokensSkipped = outcome.skipped;
      annualTokensFailed = outcome.failed;
    } catch (err) {
      console.error('Failed to grant due annual token installments:', err);
    }
  }

  return {
    expiredSubscriptions,
    expiredTemporaryAccess,
    dailyCreditsExpired,
    dailyCreditsSkipped,
    dailyCreditsFailed,
    dailyEntitlementsGranted,
    dailyEntitlementsEligible,
    dailyEntitlementsFailed,
    annualTokenPeriods,
    annualTokensGranted,
    annualTokensSkipped,
    annualTokensFailed,
  };
}

