/**
 * The visual identity of each subscription tier.
 *
 * Four tiers, four identities:
 *
 *   Free   neutral gray, so the free experience looks like the free
 *          experience and not like a lesser version of a paid one;
 *   Basic  soft blue, the first paid step;
 *   Pro    gold, the working tier;
 *   Ultra  purple, the top of the ladder.
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

/**
 * The state of the subscription behind the identity.
 *
 * The tier says which plan was bought; the state says whether it still
 * applies. A subscription that has expired is not the plan it used to be, so
 * the badge must not keep wearing the paid colour after access has ended.
 */
export type PlanIdentityState =
  | 'free'
  | 'active'
  | 'temporary'
  | 'expired'
  | 'inactive';

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
    label: 'Basic',
    labelAr: 'أساسي',
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
    labelAr: 'ألترا',
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
  basic: 'plus',
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
 * The neutral identity a subscription wears when it no longer grants access.
 *
 * Expired and suspended subscriptions keep their tier for the data attribute
 * — a caller may still want to know which plan ended — but they must not keep
 * the paid colour, or the interface would say the candidate still has it.
 */
const INACTIVE_ACCENT_VAR = '--plan-inactive-accent';
const INACTIVE_SURFACE_VAR = '--plan-inactive-surface';

/** The subscription fields the presentation reads. */
export interface PlanIdentitySubject {
  planCode?: string | null;
  /** The status the subscription service reported. */
  status?: string | null;
  /** The end of the current period, when the service reported one. */
  expiresAt?: string | null;
}

/** Everything the badge needs to draw one subscription. */
export interface PlanIdentityPresentation {
  tier: PlanIdentityTier;
  state: PlanIdentityState;
  label: string;
  labelAr: string;
  accentVar: string;
  surfaceVar: string;
  isExpired: boolean;
  isInactive: boolean;
  isTemporary: boolean;
}

const INACTIVE_STATUSES = new Set(['suspended', 'inactive', 'paused']);

/**
 * The state of the subscription, from the fields the server sent.
 *
 * The plan code alone is not enough. A row can still say `career_plus` while
 * its period has ended, and an administrator can suspend a plan without
 * changing its code. The status and the period end are therefore read
 * together, and the safe answer is the one that grants nothing.
 */
export function resolvePlanIdentityState(
  subject: PlanIdentitySubject,
  now: Date = new Date(),
): PlanIdentityState {
  const code = subject.planCode?.trim().toLowerCase();
  const status = subject.status?.trim().toLowerCase();

  if (!code || code === 'free' || status === 'free') return 'free';
  if (status === 'expired') return 'expired';

  let hasValidEnd = false;
  let ended = false;
  if (subject.expiresAt) {
    const endsAt = new Date(subject.expiresAt);
    hasValidEnd = !Number.isNaN(endsAt.getTime());
    ended = hasValidEnd && endsAt.getTime() <= now.getTime();
  }

  if (ended) return 'expired';

  // A cancelled subscription remains paid until the period it paid for ends.
  // When no usable period end was sent, there is nothing left to grant.
  if (status === 'cancelled' || status === 'canceled') {
    return hasValidEnd ? 'active' : 'expired';
  }

  if (status && INACTIVE_STATUSES.has(status)) return 'inactive';
  if (status === 'temporary_access') return 'temporary';
  return 'active';
}

/**
 * The identity a badge should draw for one subscription.
 *
 * This is the single resolution both badge locations use, so the header and
 * the profile cannot disagree about a plan, and an expired plan cannot keep
 * a paid colour in one place while the other has already let it go.
 */
export function planPresentationFor(
  subject: PlanIdentitySubject,
  now: Date = new Date(),
): PlanIdentityPresentation {
  const tier = resolvePlanIdentityTier(subject.planCode);
  const state = resolvePlanIdentityState(subject, now);

  if (state === 'expired' || state === 'inactive') {
    return {
      tier,
      state,
      label: state === 'expired' ? 'Expired' : 'Inactive',
      labelAr: state === 'expired' ? 'منتهي' : 'غير مفعّل',
      accentVar: INACTIVE_ACCENT_VAR,
      surfaceVar: INACTIVE_SURFACE_VAR,
      isExpired: state === 'expired',
      isInactive: state === 'inactive',
      isTemporary: false,
    };
  }

  const identity = IDENTITIES[tier];
  return {
    tier,
    state,
    label: identity.label,
    labelAr: identity.labelAr,
    accentVar: identity.accentVar,
    surfaceVar: identity.surfaceVar,
    isExpired: false,
    isInactive: false,
    isTemporary: state === 'temporary',
  };
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
