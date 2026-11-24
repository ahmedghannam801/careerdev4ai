/**
 * Granting AI credits from a confirmed payment.
 *
 * The ledger's SQL function is the thing that actually grants, and it is
 * idempotent on the key it is given: a repeated call with the same key returns
 * the first result instead of adding the amount again. That property is what
 * lets a webhook be retried safely, so every caller passes a key derived from
 * the payment — never a random one.
 *
 * This lived in the old card provider's store, because that was the only rail
 * that granted credits. That rail is gone; the grant is not, and it does not
 * depend on any provider.
 */

import { getSupabaseServer } from '../db/supabase.ts';

export interface GrantCreditsResult {
  granted: boolean;
  balance: number;
}

export async function grantAiCredits(input: {
  profileId: string;
  amount: number;
  idempotencyKey: string;
  sourceType: 'payment' | 'subscription';
  sourceId: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<GrantCreditsResult> {
  const { data, error } = await getSupabaseServer().rpc('grant_ai_credits', {
    p_profile_id: input.profileId,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_description: input.description,
    p_metadata: input.metadata ?? {},
  });

  if (error) throw new Error(`Failed to grant AI credits: ${error.message}`);

  const result = data as { granted?: boolean; balance?: number } | null;
  return {
    granted: Boolean(result?.granted),
    balance: Number(result?.balance ?? 0),
  };
}
