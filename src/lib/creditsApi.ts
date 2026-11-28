/**
 * Credits API Client
 *
 * Reads the caller's balance and claims the daily allowance.
 *
 * The promotional half of this client — coupon validation and the birthday
 * reward — is gone: a discount is a price, and the platform does not sell
 * anything at the moment.
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
