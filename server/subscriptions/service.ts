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
import { getActiveTemporaryAccessPayment } from '../db/payments.ts';
import { getActiveStripeSubscription } from '../stripe/store.ts';
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
  const [activeSub, tempPayment, history, stripeSub] = await Promise.all([
    getActiveSubscription(profileId),
    getActiveTemporaryAccessPayment(profileId),
    listSubscriptionsForUser(profileId),
    getActiveStripeSubscription(profileId),
  ]);

  // Card subscriptions live in their own mirror because Stripe, not an
  // administrator, owns their lifecycle. Reporting them here keeps the pricing
  // page and the settings page correct without a second API call.
  if (stripeSub) {
    const plan = await getPlanByCode(stripeSub.plan_code);
    return {
      planCode: stripeSub.plan_code as SubscriptionPlanCode,
      planNameEn: plan?.nameEn ?? stripeSub.plan_code,
      planNameAr: plan?.nameAr ?? stripeSub.plan_code,
      status: 'active',
      activeSubscription: null,
      temporaryPaymentId: null,
      expiresAt: stripeSub.current_period_end,
      autoRenew: !stripeSub.cancel_at_period_end,
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

  if (tempPayment && tempPayment.temporaryAccessExpiresAt) {
    return {
      planCode: (tempPayment.planCode as SubscriptionPlanCode) || 'student',
      planNameEn: tempPayment.planNameEn,
      planNameAr: tempPayment.planNameAr,
      status: 'temporary_access',
      activeSubscription: null,
      temporaryPaymentId: tempPayment.id,
      expiresAt: tempPayment.temporaryAccessExpiresAt,
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
