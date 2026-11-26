/**
 * Subscription API Client
 * Facilitates client-side interaction with subscription plans, current plan status,
 * and cancellation requests.
 */

import { apiRequest } from './apiClient';
import type {
  SubscriptionDTO,
  SubscriptionPlanDTO,
  SubscriptionPlanCode,
} from '../../shared/subscriptions';
import type { PlanIdentityTier } from '../../shared/planIdentity';

export interface CurrentSubscriptionResponse {
  success: boolean;
  planCode: SubscriptionPlanCode;
  /**
   * The tier the plan means, resolved on the server.
   *
   * The interface draws the tier it is given. It never decides which plan the
   * candidate is on: that comes from the subscription the server read.
   */
  planTier?: PlanIdentityTier;
  planNameEn: string;
  planNameAr: string;
  status: 'active' | 'temporary_access' | 'free';
  activeSubscription: SubscriptionDTO | null;
  temporaryPaymentId: string | null;
  expiresAt: string | null;
  startedAt?: string | null;
  billingCycle?: 'monthly' | 'annual' | null;
  autoRenew: boolean;
  history: SubscriptionDTO[];
}

export async function fetchPublicPlans(): Promise<SubscriptionPlanDTO[]> {
  const res = await apiRequest<{ success: boolean; plans: SubscriptionPlanDTO[] }>(
    '/api/subscription/plans'
  );
  return res.plans;
}

export async function fetchCurrentSubscription(): Promise<CurrentSubscriptionResponse> {
  return apiRequest<CurrentSubscriptionResponse>('/api/subscription/current');
}

export async function cancelSubscriptionAutoRenew(
  subscriptionId: string,
  reason?: string
): Promise<{ success: boolean; subscription: SubscriptionDTO }> {
  return apiRequest<{ success: boolean; subscription: SubscriptionDTO }>(
    '/api/subscription/cancel',
    {
      method: 'POST',
      body: JSON.stringify({ subscriptionId, reason }),
    }
  );
}

