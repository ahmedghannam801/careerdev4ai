/**
 * The CV Studio AI edit counter.
 *
 * The database owns the counter. Every function here is a thin call to a
 * security-definer function that takes the caller's advisory lock before it
 * reads and before it writes, so two concurrent requests can never both take
 * the same last edit.
 *
 * The schema lives in
 * `supabase/migrations/20261121000001_cv_ai_edit_quota.sql`.
 */

import { parseCvAiQuotaRow, type CvAiQuotaRpcRow } from '../../shared/cvAiQuotaService.ts';
import { getSupabaseServer } from './supabase';

/** The counter as the database reports it. */
export type CvAiEditQuotaRow = CvAiQuotaRpcRow;

export const readCvAiEditQuotaRow = parseCvAiQuotaRow;

/**
 * Reads the allowance without touching it.
 *
 * A read has no side effects: it never resets the counter and never starts a
 * window. An account that has never edited anything reads an allowance of
 * three, which is what the interface promises before the first edit.
 */
export async function readCvAiEditQuota(profileId: string): Promise<CvAiEditQuotaRow> {
  const { data, error } = await getSupabaseServer().rpc('get_cv_ai_edit_state', {
    p_profile_id: profileId,
  });
  if (error) {
    console.error('Failed to read the CV AI edit quota:', error.message);
    throw new Error('CV AI edit quota read failed.');
  }
  return readCvAiEditQuotaRow(data);
}

/**
 * Takes one edit out of the allowance.
 *
 * The database decides: it either increments the counter inside the current
 * window, or refuses and reports when the window ends. The caller is not told
 * to trust its own arithmetic.
 */
export async function consumeCvAiEditQuota(profileId: string): Promise<CvAiEditQuotaRow> {
  const { data, error } = await getSupabaseServer().rpc('consume_cv_ai_edit', {
    p_profile_id: profileId,
  });
  if (error) {
    console.error('Failed to consume the CV AI edit quota:', error.message);
    throw new Error('CV AI edit quota reservation failed.');
  }
  return readCvAiEditQuotaRow(data, { requireAllowed: true });
}

/**
 * Gives one edit back.
 *
 * Used when an edit was taken out of the allowance and then never happened:
 * the model was unreachable, the response was unusable, the request was
 * cancelled. The candidate does not pay for a call that produced nothing.
 */
export async function releaseCvAiEditQuota(profileId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer().rpc('release_cv_ai_edit', {
    p_profile_id: profileId,
  });
  if (error) {
    console.error('Failed to release the CV AI edit quota:', error.message);
    return false;
  }
  const payload = data as { refunded?: boolean | null } | null;
  return Boolean(payload?.refunded);
}
