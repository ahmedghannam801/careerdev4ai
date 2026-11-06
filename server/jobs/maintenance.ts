/**
 * Subscription & Payment Lifecycle Maintenance Sweeps.
 * Runs on scheduled intervals (Cloudflare Worker cron or local test runner).
 * Calls atomic database stored procedures to expire ended subscriptions and 24-hr provisional access.
 */

import { getSupabaseServer } from '../db/supabase.ts';

export interface MaintenanceSweepOutcome {
  expiredSubscriptions: number;
  expiredTemporaryAccess: number;
}

/**
 * Runs routine scheduled maintenance to mark lapsed subscriptions as expired,
 * revoke 24-hr temporary access whose windows have passed, and send notifications.
 */
export async function runSubscriptionMaintenanceSweeps(): Promise<MaintenanceSweepOutcome> {
  const supabase = getSupabaseServer();
  let expiredSubscriptions = 0;
  let expiredTemporaryAccess = 0;

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

  return {
    expiredSubscriptions,
    expiredTemporaryAccess,
  };
}

