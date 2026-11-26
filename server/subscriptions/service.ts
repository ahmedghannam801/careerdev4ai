/**
 * Subscription Service.
 * Business orchestration layer for user subscriptions, plan catalog, and lifecycle.
 */

import {
  listActivePlans,
  getPlanByCode,
  getActiveSubscription,
  listSubscriptionsForUser,
  cancelSubscription,
} from '../db/subscriptions.ts';
import { getActiveXPayAccess } from '../xpay/store.ts';
import type {
  BillingCycle,
  SubscriptionDTO,
  SubscriptionPlanDTO,
  SubscriptionPlanCode,
} from '../../shared/subscriptions.ts';

export interface UserSubscriptionSummary {
  planCode: SubscriptionPlanCode;
  planNameEn: string;
  planNameAr: string;
  status: 'active' | 'temporary_access' | 'free';
  activeSubscription: SubscriptionDTO | null;
  temporaryPaymentId: string | null;
  /** The day the paid period ends, so the screen can show it. */
  expiresAt: string | null;
  /** The day the paid period started. */
  startedAt: string | null;
  billingCycle: BillingCycle | null;
  autoRenew: boolean;
  history: SubscriptionDTO[];
}

/**
 * Returns comprehensive subscription status for the candidate.
 */
export async function getUserSubscriptionSummary(
  profileId: string
): Promise<UserSubscriptionSummary> {
  const [activeSub, history, xpayPurchase] = await Promise.all([
    getActiveSubscription(profileId),
    listSubscriptionsForUser(profileId),
    // A period bought through XPay behaves the same way from the candidate's
    // side: it is active until a date, and it is renewed by hand.
    getActiveXPayAccess(profileId).catch(() => null),
  ]);

  // The canonical row is the answer when it exists: it carries the plan, the
  // billing cycle and the exact period that the daily entitlement and the
  // expiry sweep also read. A confirmed XPay payment writes it, so the two
  // cannot disagree.
  if (activeSub && activeSub.status === 'active') {
    return {
      planCode: activeSub.planCode,
      planNameEn: activeSub.planNameEn,
      planNameAr: activeSub.planNameAr,
      status: 'active',
      activeSubscription: activeSub,
      temporaryPaymentId: null,
      expiresAt: activeSub.currentPeriodEndsAt,
      startedAt: activeSub.currentPeriodStartsAt,
      billingCycle: activeSub.billingCycle,
      autoRenew: activeSub.autoRenew,
      history,
    };
  }

  // A period bought before this deployment linked XPay purchases to
  // subscriptions, or a purchase whose canonical row could not be written yet.
  // The money is still real, so the screen still shows the paid period.
  if (xpayPurchase?.plan_code) {
    const plan = await getPlanByCode(xpayPurchase.plan_code);
    return {
      planCode: xpayPurchase.plan_code as SubscriptionPlanCode,
      planNameEn: plan?.nameEn ?? xpayPurchase.plan_code,
      planNameAr: plan?.nameAr ?? xpayPurchase.plan_code,
      status: 'active',
      activeSubscription: null,
      temporaryPaymentId: null,
      expiresAt: xpayPurchase.access_ends_at,
      startedAt: xpayPurchase.access_starts_at,
      billingCycle: xpayPurchase.billing_cycle,
      autoRenew: false,
      history,
    };
  }

  return {
    planCode: 'free',
    planNameEn: 'Free Explorer',
    planNameAr: 'المستكشف المجاني',
    status: 'free',
    activeSubscription: null,
    temporaryPaymentId: null,
    expiresAt: null,
    startedAt: null,
    billingCycle: null,
    autoRenew: false,
    history,
  };
}

export async function getPlanDetails(code: string): Promise<SubscriptionPlanDTO | null> {
  return getPlanByCode(code);
}

/**
 * Returns all available public plans.
 */
export async function getPublicPlans(): Promise<SubscriptionPlanDTO[]> {
  return listActivePlans();
}

/**
 * Cancels auto-renew on the candidate's active subscription.
 */
export async function cancelActiveSubscription(
  profileId: string,
  subscriptionId: string,
  reason?: string
): Promise<SubscriptionDTO | null> {
  return cancelSubscription(profileId, subscriptionId, reason);
}
