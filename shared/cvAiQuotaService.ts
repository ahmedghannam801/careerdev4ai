import {
  CV_AI_EDIT_LIMIT,
  isCvAiUnlimitedPlan,
  resolveCvAiQuotaState,
  type CvAiQuotaState,
} from './cvAiQuota.ts';

/** The fields needed from the atomic quota-store response. */
export interface CvAiQuotaStorageRow {
  used: number;
  resetAt: string | null;
  /** Present on consume responses: whether this request reserved an edit. */
  allowed?: boolean;
}

/** The full response from the quota RPC, validated before the app trusts it. */
export interface CvAiQuotaRpcRow extends CvAiQuotaStorageRow {
  limit: number;
  remaining: number;
  locked: boolean;
}

/** Parses a database response, rejecting missing or inconsistent quota state. */
export function parseCvAiQuotaRow(
  payload: unknown,
  options: { requireAllowed?: boolean } = {}
): CvAiQuotaRpcRow {
  if (!payload || typeof payload !== 'object') {
    throw new Error('The CV AI edit quota response was empty.');
  }

  const row = payload as Record<string, unknown>;
  const limit = Number(row.limit);
  const used = Number(row.used);
  const remaining = Number(row.remaining);
  const resetAt = row.reset_at ?? null;
  const allowed = row.allowed;

  if (
    limit !== CV_AI_EDIT_LIMIT ||
    !Number.isInteger(used) ||
    used < 0 ||
    used > limit ||
    !Number.isInteger(remaining) ||
    remaining !== Math.max(limit - used, 0) ||
    typeof row.locked !== 'boolean' ||
    row.locked !== (used >= limit) ||
    (allowed !== undefined && typeof allowed !== 'boolean') ||
    (options.requireAllowed && typeof allowed !== 'boolean') ||
    (allowed === false && used < limit) ||
    (allowed === true && used === 0) ||
    (resetAt !== null && (typeof resetAt !== 'string' || !Number.isFinite(Date.parse(resetAt)))) ||
    (used > 0 && resetAt === null)
  ) {
    throw new Error('The CV AI edit quota response was invalid.');
  }

  return {
    limit,
    used,
    remaining,
    locked: row.locked,
    resetAt: resetAt as string | null,
    ...(typeof allowed === 'boolean' ? { allowed } : {}),
  };
}

/** The outcome of asking for one AI edit. */
export interface CvAiEditClaim {
  /** True when the edit may go ahead. */
  allowed: boolean;
  /** The allowance, after the decision. */
  state: CvAiQuotaState;
  /** Paid plans are allowed but never reserve a free allowance slot. */
  reserved: boolean;
}

/** A quota store failure must stop AI writes rather than bypass the limit. */
export class CvAiQuotaUnavailableError extends Error {
  constructor() {
    super('The CV AI edit allowance could not be verified.');
    this.name = 'CvAiQuotaUnavailableError';
  }
}

/** Resolves a stored quota for a plan, with database failures kept fail-closed. */
export async function getCvAiQuotaStateForPlan(
  planCode: string,
  readQuota: () => Promise<CvAiQuotaStorageRow>
): Promise<CvAiQuotaState> {
  if (isCvAiUnlimitedPlan(planCode)) return resolveCvAiQuotaState(null, planCode);

  try {
    const row = await readQuota();
    return resolveCvAiQuotaState({ used: row.used, resetAt: row.resetAt }, planCode);
  } catch {
    throw new CvAiQuotaUnavailableError();
  }
}

/** Reserves one allowance slot for the supplied plan. */
export async function claimCvAiEditForPlan(
  planCode: string,
  consumeQuota: () => Promise<CvAiQuotaStorageRow>
): Promise<CvAiEditClaim> {
  if (isCvAiUnlimitedPlan(planCode)) {
    return {
      allowed: true,
      state: resolveCvAiQuotaState(null, planCode),
      reserved: false,
    };
  }

  let row: CvAiQuotaStorageRow;
  try {
    row = await consumeQuota();
  } catch {
    throw new CvAiQuotaUnavailableError();
  }

  const state = resolveCvAiQuotaState(
    { used: row.used, resetAt: row.resetAt },
    planCode
  );
  const allowed = row.allowed ?? !state.locked;
  if (!allowed && !state.locked) throw new CvAiQuotaUnavailableError();
  return { allowed, state, reserved: allowed };
}
