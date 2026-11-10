/**
 * Subscription & Payment Lifecycle Maintenance Sweeps.
 * Runs on scheduled intervals (Cloudflare Worker cron or local test runner).
 * Calls atomic database stored procedures to expire ended subscriptions and 24-hr provisional access.
 */

import { getSupabaseServer } from '../db/supabase.ts';

export interface MaintenanceSweepOutcome {
  expiredSubscriptions: number;
  expiredTemporaryAccess: number;
  /** How many expired daily tokens were taken out of the running balances. */
  dailyCreditsExpired: number;
  dailyCreditsSkipped: number;
  dailyCreditsFailed: number;
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

  // The daily free-token allowance.
  //
  // The allowance is CLAIMED by the candidate, so a sweep must not grant it:
  // a reward that arrives on its own is not the reward the claim button
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

  return {
    expiredSubscriptions,
    expiredTemporaryAccess,
    dailyCreditsExpired,
    dailyCreditsSkipped,
    dailyCreditsFailed,
  };
}

