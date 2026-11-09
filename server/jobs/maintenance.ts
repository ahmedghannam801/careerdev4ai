/**
 * Subscription & Payment Lifecycle Maintenance Sweeps.
 * Runs on scheduled intervals (Cloudflare Worker cron or local test runner).
 * Calls atomic database stored procedures to expire ended subscriptions and 24-hr provisional access.
 */

import { getSupabaseServer } from '../db/supabase.ts';

export interface MaintenanceSweepOutcome {
  expiredSubscriptions: number;
  expiredTemporaryAccess: number;
  dailyCreditsGranted: number;
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
  let dailyCreditsGranted = 0;
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

  // The daily free-credit allowance.
  //
  // The balance read claims the allowance on demand, which keeps the number
  // the candidate sees current. This sweep covers the other half of the
  // promise: an account that has not opened the application still receives
  // the allowance it was given.
  //
  // It is safe to run often. The grant is idempotent per day, so a second run
  // in the same day grants nothing, and an account whose own claim is in
  // flight is skipped rather than waited for.
  try {
    const { data, error } = await supabase.rpc('grant_daily_credits_to_all');
    if (error) {
      console.error('Error in grant_daily_credits_to_all RPC:', error);
    } else if (data) {
      const outcome = data as {
        granted?: number;
        skipped?: number;
        failed?: number;
      };
      dailyCreditsGranted = Number(outcome?.granted ?? 0);
      dailyCreditsSkipped = Number(outcome?.skipped ?? 0);
      dailyCreditsFailed = Number(outcome?.failed ?? 0);
    }
  } catch (err) {
    console.error('Failed to run grant_daily_credits_to_all:', err);
  }

  return {
    expiredSubscriptions,
    expiredTemporaryAccess,
    dailyCreditsGranted,
    dailyCreditsSkipped,
    dailyCreditsFailed,
  };
}

