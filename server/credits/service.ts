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
} from '../db/credits.ts';
import {
  type AICreditAction,
  type CreditBalanceDTO,
  type CreditLedgerDTO,
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

