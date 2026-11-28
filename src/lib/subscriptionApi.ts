/**
 * Subscription API Client
 *
 * Reads the candidate's own subscription record.
 *
 * The platform is free at the moment, so there is no plan to fetch and no
 * renewal to cancel: those endpoints are gone. What is left is a read of the
 * account's history, which the administration screens use.
 */

import { apiRequest } from './apiClient';
import type {
  SubscriptionDTO,
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

export async function fetchCurrentSubscription(): Promise<CurrentSubscriptionResponse> {
  return apiRequest<CurrentSubscriptionResponse>('/api/subscription/current');
}

