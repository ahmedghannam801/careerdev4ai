/**
 * AI Credits Business Service.
 * Manages balance queries, trial credit initialization, and atomic ledger operations.
 */

import {
  getCreditBalance,
  grantTrialCredits,
  deductCredits,
  refundCredits,
  listCreditHistory,
  claimDailyCredits,
} from '../db/credits.ts';
import {
  type AICreditAction,
  type CreditBalanceDTO,
  type CreditLedgerDTO,
  type DailyCreditState,
  CREDIT_WEIGHTS,
} from '../../shared/credits.ts';

/**
 * Returns current balance and usage statistics for candidate.
 * If user is new (has 0 credits and never claimed trial), automatically provisions
 * the 5 one-time trial credits so first-time users can test AI features without friction.
 */
export async function getUserCreditsWithTrial(profileId: string): Promise<CreditBalanceDTO> {
  const current = await getCreditBalance(profileId);
  if (current.balance <= 0) {
    // Attempt one-time trial credit grant (guaranteed idempotent by unique index in DB)
    const trialGranted = await grantTrialCredits(profileId);
    if (trialGranted) {
      return getCreditBalance(profileId);
    }
  }
  return current;
}

/**
 * Checks whether user has enough credits for the requested AI action.
 */
export async function canPerformAiAction(
  profileId: string,
  action: AICreditAction
): Promise<{ allowed: boolean; required: number; balance: number }> {
  const required = CREDIT_WEIGHTS[action] ?? 1;
  const balanceDto = await getUserCreditsWithTrial(profileId);

  return {
    allowed: balanceDto.balance >= required,
    required,
    balance: balanceDto.balance,
  };
}

/**
 * Atomically deducts credits for an action.
 */
export async function chargeAiAction(params: {
  profileId: string;
  action: AICreditAction;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; remainingBalance: number; error?: string }> {
  const required = CREDIT_WEIGHTS[params.action] ?? 1;
  return deductCredits({
    profileId: params.profileId,
    operation: params.action,
    amount: required,
    idempotencyKey: params.idempotencyKey,
    metadata: params.metadata,
  });
}

/**
 * Atomically refunds credits when an AI operation fails.
 */
export async function refundAiAction(params: {
  profileId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
}): Promise<{ success: boolean; newBalance: number }> {
  return refundCredits({
    profileId: params.profileId,
    amount: params.amount,
    reason: params.reason,
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Returns user's credit ledger history.
 */
export async function getCreditLedgerHistory(
  profileId: string,
  limit = 50
): Promise<CreditLedgerDTO[]> {
  return listCreditHistory(profileId, limit);
}

/**
 * Claims the daily free-token reward.
 *
 * The reward is CLAIMED, not granted: this is the only path that hands out the
 * daily allowance, and it is called when the candidate presses the claim
 * button. It is idempotent per Africa/Cairo calendar day, so a double press
 * or a retried request pays out exactly once.
 *
 * The answer carries the new balance and the state of the allowance, so the
 * interface can move from "claim" to "claimed today" without a second
 * round trip.
 */
export async function claimDailyTokenReward(profileId: string): Promise<{
  success: boolean;
  granted: number;
  balance: number;
  daily: DailyCreditState | null;
}> {
  const claimed = await claimDailyCredits(profileId);

  if (!claimed) {
    // The claim could not be completed. The balance is still read, so the
    // interface can show the truth rather than a stale number.
    const balance = await getCreditBalance(profileId);
    return {
      success: false,
      granted: 0,
      balance: balance.balance,
      daily: balance.daily ?? null,
    };
  }

  return {
    success: true,
    granted: claimed.granted,
    balance: claimed.balance,
    daily: {
      allowance: claimed.allowance,
      remaining: claimed.remaining,
      resetAt: claimed.resetAt,
      claimedToday: claimed.claimedToday,
    },
  };
}

