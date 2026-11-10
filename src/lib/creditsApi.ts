/**
 * Credits & Promotional API Client
 * Manages user balance, ledger transactions, coupon validation,
 * and Law 151 compliant birthday reward claims.
 */

import { apiRequest } from './apiClient';
import type {
  CreditBalanceDTO,
  CreditLedgerDTO,
  DailyCreditState,
} from '../../shared/credits';

/**
 * The state of the daily free-token allowance.
 *
 * The allowance is a separate pool from the subscription entitlement: it is
 * claimed once a day, it resets at midnight in the platform's timezone, and it
 * does not accumulate. The interface shows it next to the balance so a
 * candidate knows that tokens are coming back tomorrow.
 *
 * The shape is the shared domain model, re-exported here so the client has
 * one name for it.
 */
export type { DailyCreditState } from '../../shared/credits';

export interface DailyTokenClaimResponse {
  success: boolean;
  /** How many tokens the press actually paid out. Zero when it was already claimed. */
  granted: number;
  /** The balance after the claim. */
  balance: number;
  /** The state of the allowance after the claim. */
  daily: DailyCreditState | null;
}

export interface CouponValidationResponse {
  success: boolean;
  valid: boolean;
  couponId?: string;
  code?: string;
  discountAmountPiasters: number;
  reason?: string;
}

export interface BirthdayRewardDTO {
  id: string;
  profileId: string;
  birthMonth: number;
  birthDay: number;
  rewardYear: number;
  discountPercentage: number;
  maxDiscountPiasters: number;
  validFrom: string;
  validUntil: string;
  status: 'available' | 'redeemed' | 'expired' | 'revoked';
}

/**
 * Reads the caller's credit balance.
 *
 * The response carries the subscription entitlement and — when the platform
 * grants one — the daily free allowance. Both are passed on as they came:
 * nothing is defaulted, so the interface can tell the difference between "no
 * daily allowance" and "no daily allowance reported".
 */
export async function fetchCreditBalance(): Promise<CreditBalanceDTO> {
  const res = await apiRequest<{ success: boolean } & CreditBalanceDTO>('/api/credits/balance');
  return {
    balance: res.balance,
    monthlyAllocation: res.monthlyAllocation,
    consumedThisMonth: res.consumedThisMonth,
    tier: res.tier,
    expiresAt: res.expiresAt,
    ...(res.daily ? { daily: res.daily } : {}),
  };
}

export async function fetchCreditHistory(): Promise<CreditLedgerDTO[]> {
  const res = await apiRequest<{ success: boolean; history: CreditLedgerDTO[] }>(
    '/api/credits/history'
  );
  return res.history;
}

/**
 * Claims the daily free-token reward.
 *
 * The reward is claimed, not granted: this is the only call that hands out the
 * daily allowance, and it is the one behind the "Claim 2 tokens" button. The
 * server treats it as idempotent per day, so a double press or a retried
 * request pays out exactly once and reports `granted: 0` the second time.
 */
export async function claimDailyTokens(): Promise<DailyTokenClaimResponse> {
  return apiRequest<DailyTokenClaimResponse>('/api/credits/daily/claim', {
    method: 'POST',
  });
}

export async function validateCoupon(
  code: string,
  planCode: string,
  amountPiasters: number
): Promise<CouponValidationResponse> {
  return apiRequest<CouponValidationResponse>('/api/coupons/validate', {
    method: 'POST',
    body: JSON.stringify({ code, planCode, amountPiasters }),
  });
}

export async function saveBirthdayConsent(
  birthMonth: number,
  birthDay: number
): Promise<{ success: boolean; reward?: BirthdayRewardDTO }> {
  return apiRequest<{ success: boolean; reward?: BirthdayRewardDTO }>('/api/birthday/consent', {
    method: 'POST',
    body: JSON.stringify({ birthMonth, birthDay }),
  });
}

export async function revokeBirthdayConsent(): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>('/api/birthday/consent', {
    method: 'DELETE',
  });
}

export async function fetchBirthdayReward(): Promise<BirthdayRewardDTO | null> {
  const res = await apiRequest<{ success: boolean; reward: BirthdayRewardDTO | null }>(
    '/api/birthday/reward'
  );
  return res.reward;
}
