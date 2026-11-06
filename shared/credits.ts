/**
 * Shared AI Credits Domain Models and Types
 * Double-entry credit ledger, credit pack definitions, and action weightings.
 */

export const CREDIT_OPERATIONS = ['grant', 'consume', 'refund', 'expire', 'bonus'] as const;
export type CreditOperation = (typeof CREDIT_OPERATIONS)[number];

export const AI_CREDIT_ACTIONS = [
  'job_description_analysis',
  'cv_ats_analysis',
  'cover_letter_generation',
  'cv_generation',
  'cv_tailoring',
  'roadmap_generation',
  'interview_mock_session',
  'career_consultation_chat',
  'ai_assist_inline',
  'learning_recommendation',
  'project_analysis',
] as const;
export type AICreditAction = (typeof AI_CREDIT_ACTIONS)[number];

/**
 * Standard Operation Credit Weights (EGP equivalent value)
 */
export const CREDIT_WEIGHTS: Record<AICreditAction, number> = {
  job_description_analysis: 1,
  cv_ats_analysis: 2,
  cover_letter_generation: 2,
  cv_generation: 4,
  cv_tailoring: 4,
  roadmap_generation: 4,
  interview_mock_session: 5,
  career_consultation_chat: 2,
  ai_assist_inline: 1,
  learning_recommendation: 1,
  project_analysis: 1,
};

export interface CreditPack {
  id: string;
  credits: number;
  pricePiasters: number;
  currency: 'EGP';
  nameEn: string;
  nameAr: string;
  badgeEn?: string;
  badgeAr?: string;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  {
    id: 'pack_15',
    credits: 15,
    pricePiasters: 4900, // 49 EGP
    currency: 'EGP',
    nameEn: 'Starter Pack',
    nameAr: 'باقة البداية',
  },
  {
    id: 'pack_40',
    credits: 40,
    pricePiasters: 9900, // 99 EGP
    currency: 'EGP',
    nameEn: 'Booster Pack',
    nameAr: 'باقة الدعم',
    badgeEn: 'Popular',
    badgeAr: 'الأكثر طلباً',
  },
  {
    id: 'pack_100',
    credits: 100,
    pricePiasters: 19900, // 199 EGP
    currency: 'EGP',
    nameEn: 'Power Pack',
    nameAr: 'باقة القوة',
    badgeEn: 'Best Value',
    badgeAr: 'أفضل قيمة',
  },
] as const;

export interface CreditLedgerDTO {
  id: string;
  profileId: string;
  amount: number;
  runningBalance: number;
  operation: CreditOperation;
  sourceType: string;
  sourceId: string | null;
  aiActionType: AICreditAction | null;
  idempotencyKey: string;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreditBalanceDTO {
  balance: number;
  monthlyAllocation: number;
  consumedThisMonth: number;
  tier: string;
  expiresAt: string | null;
  monthlyCreditsRemaining?: number;
  purchasedCreditsRemaining?: number;
}

