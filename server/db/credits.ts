/**
 * Server persistence for the double-entry AI credit ledger.
 * All mutations execute atomically via PostgreSQL stored procedures.
 */

import { getSupabaseServer } from './supabase.ts';
import type {
  AICreditAction,
  CreditBalanceDTO,
  CreditLedgerDTO,
  CreditOperation,
  DailyCreditState,
} from '../../shared/credits.ts';
import { DAILY_CREDIT_ALLOWANCE } from '../../shared/credits.ts';
import { getActiveSubscription } from './subscriptions.ts';

interface CreditLedgerRow {
  id: string;
  profile_id: string;
  amount: number;
  running_balance: number;
  operation: string;
  source_type: string;
  source_id: string | null;
  ai_action_type: string | null;
  idempotency_key: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const LEDGER_COLUMNS =
  'id, profile_id, amount, running_balance, operation, source_type, source_id, ai_action_type, idempotency_key, description, metadata, created_at';

function toDTO(row: CreditLedgerRow): CreditLedgerDTO {
  return {
    id: row.id,
    profileId: row.profile_id,
    amount: row.amount,
    runningBalance: row.running_balance,
    operation: row.operation as CreditOperation,
    sourceType: row.source_type,
    sourceId: row.source_id,
    aiActionType: row.ai_action_type as AICreditAction | null,
    idempotencyKey: row.idempotency_key,
    description: row.description,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/**
 * Records a credit operation that did not produce a result.
 *
 * The ledger holds the balance, so a failed operation that was given back
 * leaves no trace there beyond the refund itself. An administrator looking
 * at the failures needs to know WHICH operation failed and WHY, not only that
 * some credits came back, so the attempt is written down here.
 *
 * The write is best-effort: a monitoring record must never turn a working
 * request into a failed one.
 */
export async function recordAiCreditFailure(input: {
  profileId: string;
  action?: string | null;
  creditsAttempted: number;
  refunded: boolean;
  reason: string;
  httpStatus?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await getSupabaseServer().from('ai_credit_failures').insert({
      profile_id: input.profileId,
      ai_action_type: input.action ?? null,
      credits_attempted: input.creditsAttempted,
      refunded: input.refunded,
      failure_reason: input.reason.slice(0, 500),
      http_status: input.httpStatus ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error('Failed to record the credit failure:', error);
  }
}

/**
 * Expires the daily allowance of an earlier day.
 *
 * The claim used to do this on its way to granting today's allowance. The
 * claim is now a deliberate act, so the expiry stands on its own: a balance
 * read calls this, and yesterday's unused tokens leave the running balance
 * whether or not anybody claims today.
 *
 * Without this, an account that stopped claiming would keep yesterday's tokens
 * in its ledger balance and could spend them long after they expired.
 */
export async function expireDailyCredits(
  profileId: string
): Promise<{ expired: number; balance: number | null }> {
  const { data, error } = await getSupabaseServer().rpc('expire_daily_credits', {
    p_profile_id: profileId,
  });

  if (error) {
    // The expiry is housekeeping. A failure must never stop the balance from
    // being reported; the next read tries again.
    console.error('Failed to expire the daily credit allowance:', error.message);
    return { expired: 0, balance: null };
  }

  const result = (data as { expired?: number; balance?: number } | null) ?? null;

  return {
    expired: result?.expired ?? 0,
    balance: result?.balance ?? null,
  };
}

/**
 * Claims the daily free-token allowance.
 *
 * This is the EXPLICIT claim: the candidate pressed the button, so this is
 * the only thing that hands out the daily reward. It is idempotent per
 * Africa/Cairo calendar day, so a double press, a retry after a dropped
 * response or two tabs open at once pay out exactly once.
 *
 * Yesterday's unused allowance is expired inside the same transaction, which
 * is what keeps the allowance from accumulating.
 *
 * A bucket that was created under a smaller allowance is topped up to the
 * full allowance, so an account that was under-granted is not left short
 * until tomorrow.
 *
 * The grant is a courtesy, not a ledger of its own: a failure here must never
 * stop the claim from being reported.
 */
export async function claimDailyCredits(
  profileId: string
): Promise<(DailyCreditState & { balance: number; granted: number }) | null> {
  // The allowance size is owned by the database. The application still sends
  // its own constant so that a mismatch is visible in the logs rather than
  // silent, but the database grants what it promises.
  const request = {
    p_profile_id: profileId,
    p_amount: DAILY_CREDIT_ALLOWANCE,
  };

  let data: unknown = null;
  let lastError: { message: string } | null = null;

  // One retry: a transient failure must not cost the candidate the day's
  // allowance, and the claim is idempotent, so a retry is free of charge.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const outcome = await getSupabaseServer().rpc('claim_daily_credits', request);
    if (!outcome.error) {
      data = outcome.data;
      lastError = null;
      break;
    }
    lastError = outcome.error;
    console.error(
      `Failed to claim the daily credit allowance (attempt ${attempt + 1}):`,
      outcome.error.message
    );
  }

  if (lastError) return null;

  const result = data as {
    granted?: number;
    topped_up?: number;
    daily_remaining?: number;
    daily_allowance?: number;
    expires_at?: string;
    email_verified?: boolean;
    balance?: number;
  } | null;

  if (!result) return null;

  return {
    allowance: result.daily_allowance ?? 0,
    remaining: result.daily_remaining ?? 0,
    resetAt: result.expires_at ?? new Date(Date.now() + 86_400_000).toISOString(),
    // The claim happened, so today's reward is taken. It stays taken even
    // after every claimed token has been spent.
    claimedToday: true,
    // The authoritative balance after the claim. The caller uses it, so the
    // number the candidate sees is the number the ledger holds.
    balance: result.balance ?? 0,
    granted: result.granted ?? 0,
  };
}

/**
 * Reads the daily allowance without granting it.
 */
export async function readDailyCreditState(
  profileId: string
): Promise<DailyCreditState | null> {
  const { data, error } = await getSupabaseServer().rpc('get_daily_credit_state', {
    p_profile_id: profileId,
  });

  if (error) return null;

  const result = data as {
    daily_remaining?: number;
    daily_allowance?: number;
    expires_at?: string;
    claimed_today?: boolean;
  } | null;

  if (!result) return null;

  return {
    allowance: result.daily_allowance ?? 0,
    remaining: result.daily_remaining ?? 0,
    resetAt: result.expires_at ?? new Date(Date.now() + 86_400_000).toISOString(),
    // TRUE as soon as today's bucket exists, whether or not any of it is left.
    claimedToday: result.claimed_today === true,
  };
}

/**
 * Returns the candidate's current running credit balance.
 * If candidate has never had a ledger row, grants 5 one-time trial credits.
 */
export async function getCreditBalance(profileId: string): Promise<CreditBalanceDTO> {
  const supabase = getSupabaseServer();

  // 1. Get latest ledger entry
  //
  // The tie-break on the id matters: the database reads the balance with
  // `created_at DESC, id DESC`, and a reader that ordered the rows any other
  // way could report a balance the ledger does not hold.
  const { data: latest, error: ledgerError } = await supabase
    .from('ai_credit_ledger')
    .select(LEDGER_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ledgerError) throw ledgerError;

  let balance = latest ? (latest as CreditLedgerRow).running_balance : 0;

  // 2. If no ledger entry ever, grant 5 one-time trial credits idempotently
  if (!latest) {
    const trialGrant = await grantTrialCredits(profileId);
    balance = trialGrant.balance;
  }

  // 3. Expire yesterday's daily allowance.
  //
  //    Reading the balance does NOT grant today's allowance: the daily reward
  //    is claimed, by the candidate, on purpose. What the read does have to do
  //    is expire yesterday's leftovers, so that tokens which have stopped being
  //    usable leave the running balance instead of lingering in it.
  const expiry = await expireDailyCredits(profileId);
  if (expiry.balance !== null) {
    balance = expiry.balance;
  } else {
    // The expiry failed or wrote nothing. Re-read the ledger so the balance
    // is the one the ledger holds either way.
    const { data: afterExpiry } = await supabase
      .from('ai_credit_ledger')
      .select('running_balance')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (afterExpiry) {
      balance = (afterExpiry as { running_balance: number }).running_balance;
    }
  }

  // 4. The daily allowance state, READ ONLY. Nothing is granted here.
  const daily = await readDailyCreditState(profileId);

  // 5. Get active subscription info
  const sub = await getActiveSubscription(profileId);

  // 6. Calculate credits consumed this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: consumptionRows, error: consumError } = await supabase
    .from('ai_credit_ledger')
    .select('amount')
    .eq('profile_id', profileId)
    .eq('operation', 'consume')
    .gte('created_at', startOfMonth.toISOString());

  if (consumError) throw consumError;

  const consumedThisMonth = ((consumptionRows ?? []) as { amount: number }[]).reduce(
    (sum, row) => sum + Math.abs(row.amount),
    0
  );

  const monthlyAllocation = sub
    ? sub.planCode === 'student'
      ? 25
      : sub.planCode === 'pro'
      ? 60
      : 120
    : 5;

  // BLK-08: Isolate monthly subscription credits remaining from purchased credits
  //
  // The daily allowance is neither of them: it is a third, expiring pool. It
  // is subtracted first so that it is never reported as purchased credits or
  // as part of the monthly allocation.
  const dailyRemaining = daily?.remaining ?? 0;
  const generalBalance = Math.max(0, balance - dailyRemaining);

  const monthlyCreditsRemaining =
    sub && sub.status === 'active'
      ? Math.max(0, Math.min(monthlyAllocation - consumedThisMonth, generalBalance))
      : 0;
  const purchasedCreditsRemaining = Math.max(0, generalBalance - monthlyCreditsRemaining);

  return {
    balance,
    monthlyAllocation,
    consumedThisMonth,
    tier: sub ? sub.planCode : 'free',
    expiresAt: sub ? sub.currentPeriodEndsAt : null,
    monthlyCreditsRemaining,
    purchasedCreditsRemaining,
    daily: daily ?? undefined,
  };
}

/**
 * Grants the one-time trial credits to a candidate.
 *
 * The grant is done by the database, which takes the candidate's own advisory
 * lock and adds the credits to the balance the ledger actually holds. An
 * earlier version wrote a hard-coded running balance of 5, which invented
 * credits for an account whose real balance was 0 and broke the relationship
 * between the ledger and the daily bucket.
 *
 * The idempotency key is derived from the profile id, so the grant is paid
 * once per account and a replay pays nothing.
 */
export async function grantTrialCredits(
  profileId: string,
  amount = 5
): Promise<{ granted: boolean; balance: number }> {
  const { data, error } = await getSupabaseServer().rpc('grant_trial_credits', {
    p_profile_id: profileId,
    p_amount: amount,
  });

  if (error) {
    console.error('Failed to grant the trial credits:', error.message);
    return { granted: false, balance: 0 };
  }

  const result = data as { granted?: boolean; balance?: number } | null;

  return {
    granted: result?.granted === true,
    balance: result?.balance ?? 0,
  };
}

/**
 * Atomically consumes credits for an AI operation via stored procedure.
 */
export async function deductCredits(params: {
  profileId: string;
  operation: AICreditAction;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ success: boolean; remainingBalance: number; error?: string }> {
  const { data, error } = await getSupabaseServer().rpc('consume_ai_credits', {
    p_profile_id: params.profileId,
    p_operation: params.operation,
    p_amount: params.amount,
    p_idempotency_key: params.idempotencyKey,
    p_metadata: params.metadata ?? {},
  });

  if (error) throw error;
  const result = data as {
    success: boolean;
    error?: string;
    remaining_balance?: number;
  };

  return {
    success: result.success,
    remainingBalance: result.remaining_balance ?? 0,
    error: result.error,
  };
}

/**
 * Atomically refunds credits after a failed AI generation.
 */
export async function refundCredits(params: {
  profileId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  sourceId?: string;
}): Promise<{ success: boolean; newBalance: number }> {
  const { data, error } = await getSupabaseServer().rpc('refund_ai_credits', {
    p_profile_id: params.profileId,
    p_amount: params.amount,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
    p_source_id: params.sourceId ?? null,
  });

  if (error) throw error;
  const result = data as { success: boolean; new_balance?: number };
  return {
    success: result.success,
    newBalance: result.new_balance ?? 0,
  };
}

/**
 * Lists credit transaction history for a profile, newest first.
 */
export async function listCreditHistory(
  profileId: string,
  limit = 50
): Promise<CreditLedgerDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('ai_credit_ledger')
    .select(LEDGER_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100));

  if (error) throw error;
  return ((data ?? []) as CreditLedgerRow[]).map(toDTO);
}

