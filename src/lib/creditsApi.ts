/**
 * Credits & Promotional API Client
 * Manages user balance, ledger transactions, coupon validation,
 * and Law 151 compliant birthday reward claims.
 */

import { apiRequest } from './apiClient';
import type { CreditBalanceDTO, CreditLedgerDTO } from '../../shared/credits';

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

export async function fetchCreditBalance(): Promise<CreditBalanceDTO> {
  const res = await apiRequest<{ success: boolean } & CreditBalanceDTO>('/api/credits/balance');
  return {
    balance: res.balance,
    monthlyAllocation: res.monthlyAllocation,
    consumedThisMonth: res.consumedThisMonth,
    tier: res.tier,
    expiresAt: res.expiresAt,
  };
}

export async function fetchCreditHistory(): Promise<CreditLedgerDTO[]> {
  const res = await apiRequest<{ success: boolean; history: CreditLedgerDTO[] }>(
    '/api/credits/history'
  );
  return res.history;
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
