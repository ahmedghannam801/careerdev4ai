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
import { accessPlanCode, isMonetizationEnabled } from '../../shared/platformAccess.ts';

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
 *
 * WHILE THE PLATFORM IS FREE
 * --------------------------
 * The answer is 'free', and it is answered without reading anything. The
 * gateway tables and the subscription table are payment records: consulting
 * them to decide an allowance would mean the free platform still depends on
 * the payment system it no longer has. The records themselves are untouched and
 * remain readable in the administration screens.
 */
export async function getUserEffectivePlan(profileId: string): Promise<EffectivePlanState> {
  if (!isMonetizationEnabled()) {
    return {
      planCode: 'free',
      isTemporary: false,
    };
  }

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
 * The plan code an ALLOWANCE must be read against.
 *
 * This is the plan that decides how much of something an account may do: how
 * many CV Studio edits, how many saved jobs, how large a daily allowance.
 *
 * While the platform is free it is always the free tier, so every account
 * gets the same allowance and no account can get a larger one because it
 * still holds an old subscription. While monetization is on it is the account's
 * own plan.
 *
 * The distinction matters, so it is made in exactly one place: an allowance
 * must never be read from a plan that cannot be bought.
 */
export async function getAccessPlanCode(profileId: string): Promise<string> {
  const effective = await getUserEffectivePlan(profileId);
  return accessPlanCode(effective.planCode);
}

/**
 * Verifies if a user is entitled to use a specific feature.
 *
 * WHILE THE PLATFORM IS FREE
 * --------------------------
 * Every account may use every feature, so the answer is always yes and the
 * matrix is not consulted. The matrix stays in the repository, unchanged, so
 * that turning monetization back on is a one-line change to
 * `shared/platformAccess.ts` rather than a reconstruction of this module.
 */
export async function checkUserEntitlement(
  profileId: string,
  feature: EntitlementFeature
): Promise<EntitlementCheckResult> {
  if (!isMonetizationEnabled()) {
    // The account's own plan is still resolved, so the administration screens
    // and the audit trail keep reading the history correctly. It simply no
    // longer decides anything.
    const effective = await getUserEffectivePlan(profileId);
    return {
      allowed: true,
      currentPlan: effective.planCode,
      isTemporary: effective.isTemporary,
    };
  }

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
 *
 * While the platform is free the middleware lets every request through: there
 * is no plan that can be bought, and therefore no plan that can be missing.
 */
export function requireEntitlement(feature: EntitlementFeature) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    const userId = req.authUser?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isMonetizationEnabled()) {
      return next();
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

