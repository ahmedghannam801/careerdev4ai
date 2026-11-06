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
  'ai_mentor.session',
  'portfolio.advanced',
  'career.transition_plan',
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
    'career.transition_plan',
  ],
};

export function isPlanEntitled(planCode: SubscriptionPlanCode, feature: EntitlementFeature): boolean {
  const allowed = PLAN_FEATURE_MATRIX[planCode] ?? [];
  return allowed.includes(feature);
}

export function formatEgpPrice(piasters: number): string {
  const egp = (piasters / 100).toFixed(0);
  return `${egp} EGP`;
}

