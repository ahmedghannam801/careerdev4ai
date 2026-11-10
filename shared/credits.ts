/**
 * Shared Tokens Domain Models and Types
 * Double-entry credit ledger, credit pack definitions, and action weightings.
 *
 * The ledger underneath calls a token a credit, because a credit is what the
 * ledger records. The interface calls it a token, because that is what the
 * candidate holds. The two names describe the same thing from two sides, and
 * only the interface's name reaches a candidate.
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
  'premium_template_unlock',
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
  /**
   * Unlocking a premium CV template. The weight is the price of the template:
   * the candidate sees it on the screen before anything is spent.
   *
   * Five tokens. The price is low on purpose — a template is a presentation
   * choice, not a product of value, and a candidate who cannot afford the
   * layout simply cannot see what the library can do for them. The daily claim
   * is two tokens, so a template is reachable without ever buying anything.
   */
  premium_template_unlock: 5,
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

/**
 * The daily free-token allowance.
 *
 * Every eligible account may claim a small allowance of tokens each day. The
 * allowance is a separate pool from the subscription entitlement, it resets at
 * midnight in the platform's documented timezone (Africa/Cairo), and it does
 * not accumulate: yesterday's unused allowance simply expires.
 *
 * The size is two tokens. That is the number the product promises, and it is
 * the number the database grants: `claim_daily_credits` reads the allowance
 * from `careerpilot_daily_credit_allowance()` rather than from this constant,
 * so the two can never disagree. This constant is the application side of the
 * same promise, and the two are asserted to be equal by the test suite.
 *
 * The allowance is CLAIMED, not granted automatically. Reading the balance
 * never hands out tokens; the candidate presses the claim button and the
 * tokens arrive. A day that is never claimed is a day with no free tokens,
 * which is what makes the button worth pressing.
 *
 * Two tokens buy two lightweight operations (`job_description_analysis`,
 * `ai_assist_inline`, `learning_recommendation`, `project_analysis` all cost
 * 1), or one heavier one — a CV ATS analysis costs 2, a CV generation or a
 * roadmap costs 4, a mock interview costs 5. The allowance is still far below
 * the cheapest paid plan (25 credits for 99 EGP) and it never unlocks a
 * paid-only entitlement.
 */
export const DAILY_CREDIT_ALLOWANCE = 2;

/**
 * The reward a referrer receives for a verified referral.
 *
 * It is capped at one daily allowance, so a referral can never be worth more
 * than a single day of the free allowance, and it can never be farmed into a
 * subscription.
 */
export const REFERRAL_REWARD_CREDITS = 1;

/** The state of the daily allowance for one account. */
export interface DailyCreditState {
  /** The allowance granted for the current day. */
  allowance: number;
  /** The credits still available inside today's allowance. */
  remaining: number;
  /** When today's allowance expires (the next Africa/Cairo midnight). */
  resetAt: string;
  /**
   * Whether today's reward has already been claimed.
   *
   * This is TRUE as soon as the candidate claims, even after every claimed
   * token has been spent. It is the flag the claim button reads to decide
   * between "claim 2 tokens" and "claimed today", so it must not be derived
   * from the remaining count: a candidate who claimed and then spent the
   * tokens has still claimed today.
   */
  claimedToday: boolean;
}

export interface CreditBalanceDTO {
  balance: number;
  monthlyAllocation: number;
  consumedThisMonth: number;
  tier: string;
  expiresAt: string | null;
  monthlyCreditsRemaining?: number;
  purchasedCreditsRemaining?: number;
  /** The daily free allowance, when the platform grants one. */
  daily?: DailyCreditState;
}

