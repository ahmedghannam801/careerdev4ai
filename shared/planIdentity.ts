/**
 * The visual identity of each subscription tier.
 *
 * Four tiers, four identities:
 *
 *   Free   a neutral silver, so the free experience looks like the free
 *          experience and not like a lesser version of a paid one;
 *   Plus   orange, the first paid step;
 *   Pro    royal blue, the working tier;
 *   Ultra  black with gold, the top of the ladder.
 *
 * Two rules shape this module.
 *
 * **The plan is never chosen by the browser.** The tier is derived from the
 * plan code the server sends with the account, and that code comes from the
 * subscription itself — the row in the database, reconciled with Stripe. A
 * browser that asks for a different plan is ignored, and the interface draws
 * the identity the server sent.
 *
 * **The colours live in the stylesheet.** The code knows the tier and the
 * name of the custom property; it never hard-codes a colour. That keeps the
 * palette in one place, where it can be adjusted for the dark theme or for
 * contrast, without touching a component.
 */

import type { SubscriptionPlanCode } from './subscriptions.ts';

/** The four tiers the platform recognises. */
export type PlanIdentityTier = 'free' | 'plus' | 'pro' | 'ultra';

/** How one tier looks and what it is called. */
export interface PlanIdentity {
  tier: PlanIdentityTier;
  /** The name shown in the interface, in English. */
  label: string;
  /** The name shown in the interface, in Arabic. */
  labelAr: string;
  /** The order of the tier, lowest first. Used by the upgrade prompts. */
  order: number;
  /** True for the tier that costs nothing. */
  isFree: boolean;
  /** The custom property that carries the tier's colour. */
  accentVar: string;
  /** The custom property that carries the tier's surface colour. */
  surfaceVar: string;
}

const IDENTITIES: Record<PlanIdentityTier, PlanIdentity> = {
  free: {
    tier: 'free',
    label: 'Free',
    labelAr: 'مجاني',
    order: 0,
    isFree: true,
    accentVar: '--plan-free-accent',
    surfaceVar: '--plan-free-surface',
  },
  plus: {
    tier: 'plus',
    label: 'Plus',
    labelAr: 'بلس',
    order: 1,
    isFree: false,
    accentVar: '--plan-plus-accent',
    surfaceVar: '--plan-plus-surface',
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    labelAr: 'برو',
    order: 2,
    isFree: false,
    accentVar: '--plan-pro-accent',
    surfaceVar: '--plan-pro-surface',
  },
  ultra: {
    tier: 'ultra',
    label: 'Ultra',
    labelAr: 'ألتترا',
    order: 3,
    isFree: false,
    accentVar: '--plan-ultra-accent',
    surfaceVar: '--plan-ultra-surface',
  },
};

/**
 * The plan code each tier is known by.
 *
 * The catalogue has carried more than one code for the same tier over its
 * life, and it may carry more in future, so a tier accepts every code that
 * means it. The table is the only place that knows which codes mean which
 * tier: changing the catalogue's vocabulary is a change here, and nowhere
 * else.
 */
const TIER_BY_PLAN_CODE: Record<string, PlanIdentityTier> = {
  free: 'free',
  student: 'plus',
  plus: 'plus',
  pro: 'pro',
  career_plus: 'ultra',
  ultra: 'ultra',
};

/** The tiers, lowest first. */
export const PLAN_IDENTITY_TIERS: PlanIdentityTier[] = ['free', 'plus', 'pro', 'ultra'];

/**
 * The tier a plan code means.
 *
 * An unknown code is the free tier. That is the safe answer in both
 * directions: a candidate who has paid is never shown a lesser identity,
 * because a paid plan code is always known here, and a candidate whose plan
 * cannot be read is never shown a paid identity they do not hold.
 */
export function resolvePlanIdentityTier(
  planCode: string | null | undefined,
): PlanIdentityTier {
  if (!planCode) return 'free';
  return TIER_BY_PLAN_CODE[planCode.trim().toLowerCase()] ?? 'free';
}

/** The identity of a plan code. */
export function planIdentityFor(
  planCode: string | null | undefined,
): PlanIdentity {
  return IDENTITIES[resolvePlanIdentityTier(planCode)];
}

/** The identity of a tier. */
export function planIdentityForTier(tier: PlanIdentityTier): PlanIdentity {
  return IDENTITIES[tier];
}

/**
 * The tier of a plan code, typed against the catalogue's own vocabulary.
 */
export function planIdentityTierFor(
  planCode: SubscriptionPlanCode | null | undefined,
): PlanIdentityTier {
  return resolvePlanIdentityTier(planCode);
}

/**
 * Whether one tier is a step up from another.
 *
 * The upgrade prompts use it so they only ever offer a step up, never a step
 * down and never the tier the candidate already has.
 */
export function isUpgrade(from: PlanIdentityTier, to: PlanIdentityTier): boolean {
  return IDENTITIES[to].order > IDENTITIES[from].order;
}

/** The next tier up, or null when the candidate is already at the top. */
export function nextTier(tier: PlanIdentityTier): PlanIdentityTier | null {
  const order = IDENTITIES[tier].order;
  if (order >= PLAN_IDENTITY_TIERS.length - 1) return null;
  return PLAN_IDENTITY_TIERS[order + 1];
}
