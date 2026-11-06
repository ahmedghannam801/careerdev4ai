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

export interface CurrentSubscriptionResponse {
  success: boolean;
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

