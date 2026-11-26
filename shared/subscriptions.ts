/**
 * Shared Subscription Domain Models and Types
 * Single source of truth for subscription plans, billing cycles, and feature entitlements.
 */

export const SUBSCRIPTION_PLAN_CODES = ['free', 'student', 'pro', 'career_plus'] as const;
export type SubscriptionPlanCode = (typeof SUBSCRIPTION_PLAN_CODES)[number];

export const BILLING_CYCLES = ['monthly', 'annual'] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'expired', 'cancelled', 'suspended'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionPlanDTO {
  id: string;
  code: SubscriptionPlanCode;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  priceMonthlyPiasters: number;
  priceAnnualPiasters: number;
  currency: 'EGP';
  monthlyAiCredits: number;
  features: Record<string, unknown>;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionDTO {
  id: string;
  profileId: string;
  planId: string;
  planCode: SubscriptionPlanCode;
  planNameEn: string;
  planNameAr: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodStartsAt: string;
  currentPeriodEndsAt: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  endedAt: string | null;
  latestPaymentId: string | null;
  autoRenew: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Feature Entitlements Taxonomy
 */
export const ENTITLEMENT_FEATURES = [
  'cv.builder',
  'cv.tailoring',
  'cv.multiple_versions',
  'cv.export_pdf',
  'ats.analysis',
  'ats.detailed_breakdown',
  'job_description.analysis',
  'cover_letter.generate',
  'roadmap.generate',
  'roadmap.full_stages',
  'interview.mock_simulation',
  'interview.deep_simulation',
  'ai_mentor.session',
  'ai.priority_processing',
  'portfolio.advanced',
  'career.reports',
  'career.transition_plan',
  'career.comparative_fit',
] as const;

export type EntitlementFeature = (typeof ENTITLEMENT_FEATURES)[number];

/**
 * Entitlement Matrix mapping plans to authorized features.
 * Used for fast server-side gate checks and client UI state.
 */
export const PLAN_FEATURE_MATRIX: Record<SubscriptionPlanCode, readonly EntitlementFeature[]> = {
  free: [
    'cv.builder',
    'job_description.analysis',
    'roadmap.generate', // Basic stages
  ],
  student: [
    'cv.builder',
    'cv.tailoring',
    'cv.export_pdf',
    'ats.analysis',
    'job_description.analysis',
    'cover_letter.generate',
    'roadmap.generate',
    'roadmap.full_stages',
  ],
  pro: [
    'cv.builder',
    'cv.tailoring',
    'cv.multiple_versions',
    'cv.export_pdf',
    'ats.analysis',
    'ats.detailed_breakdown',
    'job_description.analysis',
    'cover_letter.generate',
    'roadmap.generate',
    'roadmap.full_stages',
    'interview.mock_simulation',
    'ai_mentor.session',
    'portfolio.advanced',
    'career.reports',
  ],
  career_plus: [
    'cv.builder',
    'cv.tailoring',
    'cv.multiple_versions',
    'cv.export_pdf',
    'ats.analysis',
    'ats.detailed_breakdown',
    'job_description.analysis',
    'cover_letter.generate',
    'roadmap.generate',
    'roadmap.full_stages',
    'interview.mock_simulation',
    'ai_mentor.session',
    'portfolio.advanced',
    'career.reports',
    'career.transition_plan',
    'career.comparative_fit',
    'interview.deep_simulation',
    'ai.priority_processing',
  ],
};

export function isPlanEntitled(planCode: SubscriptionPlanCode, feature: EntitlementFeature): boolean {
  const allowed = PLAN_FEATURE_MATRIX[planCode] ?? [];
  return allowed.includes(feature);
}

/** The number of saved jobs a plan allows when its catalogue row is unreadable. */
export const FALLBACK_SAVE_JOBS_LIMIT = 5;

/**
 * Reads the saved-jobs limit from a plan's feature document.
 *
 * The catalogue is the source of truth, so a missing or malformed value is
 * treated as the free allowance rather than as no limit: an unreadable plan
 * must never become an accidental unlimited plan.
 */
export function savedJobsLimitFromFeatures(
  features: Record<string, unknown> | null | undefined
): number {
  const raw = features?.save_jobs_limit;
  const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.floor(numeric)
    : FALLBACK_SAVE_JOBS_LIMIT;
}

/**
 * The order of the paid plans, lowest first.
 *
 * The pricing page uses it to say "upgrade" or "downgrade" instead of calling
 * every purchase an upgrade, and the rank is derived from the catalogue order
 * so a new plan only has to be added in one place.
 */
export const PLAN_RANK: Record<SubscriptionPlanCode, number> = {
  free: 0,
  student: 1,
  pro: 2,
  career_plus: 3,
};

/** The number of months an annual subscription is entitled to. */
export const ANNUAL_ENTITLEMENT_MONTHS = 12;

/**
 * What an annual subscription saves against twelve monthly payments, in
 * piasters. Zero when the plan is free or the annual price is not cheaper.
 */
export function annualSavingsPiasters(plan: {
  priceMonthlyPiasters: number;
  priceAnnualPiasters: number;
}): number {
  return Math.max(0, plan.priceMonthlyPiasters * ANNUAL_ENTITLEMENT_MONTHS - plan.priceAnnualPiasters);
}

/** The same saving as a whole percentage, for a badge. */
export function annualSavingsPercent(plan: {
  priceMonthlyPiasters: number;
  priceAnnualPiasters: number;
}): number {
  const full = plan.priceMonthlyPiasters * ANNUAL_ENTITLEMENT_MONTHS;
  if (full <= 0) return 0;
  return Math.round((annualSavingsPiasters(plan) / full) * 100);
}

/**
 * The monthly token allowance of a plan, from the catalogue.
 *
 * Annual subscriptions receive this amount every month of their twelve; they
 * never receive twelve months of tokens at once.
 */
export function monthlyTokenAllowance(plan: { monthlyAiCredits: number }): number {
  return Math.max(0, plan.monthlyAiCredits);
}

export function formatEgpPrice(piasters: number): string {
  const egp = (piasters / 100).toFixed(0);
  return `${egp} EGP`;
}

