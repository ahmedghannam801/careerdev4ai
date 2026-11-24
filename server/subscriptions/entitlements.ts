/**
 * Server-side Subscription Feature Entitlements Engine.
 * Verifies that the authenticated candidate's active plan (or verified provisional temporary access)
 * grants authorization to access gated features.
 */

import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from '../auth/require-auth.ts';
import { getActiveSubscription } from '../db/subscriptions.ts';
import { getActiveXPayAccess } from '../xpay/store.ts';
import {
  type EntitlementFeature,
  type SubscriptionPlanCode,
  isPlanEntitled,
} from '../../shared/subscriptions.ts';

export interface EffectivePlanState {
  planCode: SubscriptionPlanCode;
  isTemporary: boolean;
  expiresAt?: string;
}

export interface EntitlementCheckResult {
  allowed: boolean;
  currentPlan: SubscriptionPlanCode;
  isTemporary: boolean;
  reason?: string;
}

/**
 * High-cost operations that are deferred during 24-hr provisional access until
 * full admin verification to prevent abuse.
 */
const HIGH_RISK_TEMPORARY_RESTRICTIONS = new Set<EntitlementFeature>([
  'interview.mock_simulation',
  'career.transition_plan',
  'cv.tailoring',
  'roadmap.full_stages',
]);

/**
 * Resolves the candidate's effective plan code, considering active subscriptions
 * first, then 24-hour provisional access, falling back to 'free'.
 */
export async function getUserEffectivePlan(profileId: string): Promise<EffectivePlanState> {
  try {
    // A plan period bought through XPay is the strongest signal: the money has
    // arrived and the period end is the whole entitlement. It is checked first
    // so a candidate who pays by card unlocks the plan the moment the verified
    // webhook lands.
    //
    // ITS FAILURE IS NOT EVERYONE'S FAILURE
    // This read is isolated on purpose. The gateway's tables are the newest on
    // the platform, and a deployment that has not applied that migration — or a
    // moment when PostgREST cannot reach it — must not take a subscription the
    // candidate already paid for down with it. Before this guard, one failed
    // lookup sent the whole function to its catch block, which answers `free`:
    // a paying candidate was silently downgraded by a missing table.
    let xpayPurchase: Awaited<ReturnType<typeof getActiveXPayAccess>> = null;
    try {
      xpayPurchase = await getActiveXPayAccess(profileId);
    } catch (error) {
      console.error(
        'XPay access lookup failed; continuing with the subscription record:',
        profileId,
        error
      );
    }
    if (xpayPurchase?.plan_code && xpayPurchase.access_ends_at) {
      return {
        planCode: xpayPurchase.plan_code as SubscriptionPlanCode,
        isTemporary: false,
        expiresAt: xpayPurchase.access_ends_at,
      };
    }

    const activeSub = await getActiveSubscription(profileId);
    if (activeSub && activeSub.status === 'active') {
      return {
        planCode: activeSub.planCode,
        isTemporary: false,
        expiresAt: activeSub.currentPeriodEndsAt,
      };
    }

    return {
      planCode: 'free',
      isTemporary: false,
    };
  } catch (error) {
    console.error('Failed to resolve effective plan for user:', profileId, error);
    return {
      planCode: 'free',
      isTemporary: false,
    };
  }
}

/**
 * Verifies if a user is entitled to use a specific feature.
 */
export async function checkUserEntitlement(
  profileId: string,
  feature: EntitlementFeature
): Promise<EntitlementCheckResult> {
  const effective = await getUserEffectivePlan(profileId);

  // Check if the plan grants the feature
  const entitled = isPlanEntitled(effective.planCode, feature);
  if (!entitled) {
    return {
      allowed: false,
      currentPlan: effective.planCode,
      isTemporary: effective.isTemporary,
      reason: `Feature '${feature}' is not included in the ${effective.planCode} plan. Upgrade to unlock.`,
    };
  }

  // If in temporary provisional access, block high-cost abuse targets
  if (effective.isTemporary && HIGH_RISK_TEMPORARY_RESTRICTIONS.has(feature)) {
    return {
      allowed: false,
      currentPlan: effective.planCode,
      isTemporary: true,
      reason: `This feature is temporarily pending admin verification of your payment. It will unlock shortly.`,
    };
  }

  return {
    allowed: true,
    currentPlan: effective.planCode,
    isTemporary: effective.isTemporary,
  };
}

/**
 * Express middleware enforcing entitlement on a protected route.
 * Assumes `requireAuth` was called earlier in the middleware pipeline.
 */
export function requireEntitlement(feature: EntitlementFeature) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const result = await checkUserEntitlement(userId, feature);
      if (!result.allowed) {
        return res.status(403).json({
          error: result.reason ?? 'Upgrade required to access this feature',
          code: 'UPGRADE_REQUIRED',
          feature,
          currentPlan: result.currentPlan,
          isTemporary: result.isTemporary,
        });
      }

      return next();
    } catch (error) {
      console.error(`Entitlement check error for feature ${feature}:`, error);
      return res.status(500).json({ error: 'Failed to verify subscription entitlements' });
    }
  };
}

