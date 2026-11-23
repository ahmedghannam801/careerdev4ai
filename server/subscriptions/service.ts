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
  expiresAt: string | null;
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
      autoRenew: false,
      history,
    };
  }

  if (activeSub && activeSub.status === 'active') {
    return {
      planCode: activeSub.planCode,
      planNameEn: activeSub.planNameEn,
      planNameAr: activeSub.planNameAr,
      status: 'active',
      activeSubscription: activeSub,
      temporaryPaymentId: null,
      expiresAt: activeSub.currentPeriodEndsAt,
      autoRenew: activeSub.autoRenew,
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
