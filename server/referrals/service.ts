/**
 * Personal referral links and the referral reward.
 *
 * The attribution is server-side. A referral code travels with the sign-up
 * (the platform reads it from the signup metadata), the database validates it,
 * and the reward is only paid once the referred account has a verified email.
 *
 * Nothing here trusts a code supplied by the browser on its own:
 *
 *   * an unknown code is refused;
 *   * nobody can refer themselves;
 *   * an account can only ever be attributed once;
 *   * the attribution is written once and is never reassigned;
 *   * the reward is capped and is paid through the ordinary credit ledger, so
 *     it is idempotent and auditable.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { siteOrigin } from '../seo/config.ts';
import { REFERRAL_REWARD_CREDITS } from '../../shared/credits.ts';

export interface ReferralSummary {
  code: string;
  link: string;
  referrals: {
    successful: number;
    pending: number;
    total: number;
  };
  creditsEarned: number;
  rewardPerReferral: number;
}

export type ReferralClaimStatus =
  | 'verified'
  | 'pending_email'
  | 'already_claimed'
  | 'invalid_code'
  | 'self_referral';

export interface ReferralClaimResult {
  success: boolean;
  status: ReferralClaimStatus;
  rewardCredits: number;
}

/**
 * The shareable address for a referral code.
 */
export function referralLink(code: string): string {
  return `${siteOrigin()}/register?ref=${encodeURIComponent(code)}`;
}

/**
 * Reads (or creates) the caller's referral code and their referral counts.
 */
export async function getReferralSummary(profileId: string): Promise<ReferralSummary> {
  const supabase = getSupabaseServer();

  const { data: codeRow, error: codeError } = await supabase.rpc('ensure_referral_code', {
    p_profile_id: profileId,
  });

  if (codeError) {
    console.error('Failed to read the referral code:', codeError.message);
    throw new Error('Failed to read the referral code');
  }

  const code = typeof codeRow === 'string' ? codeRow : '';

  const { data: relations, error: relationsError } = await supabase
    .from('referral_relations')
    .select('status, reward_credits')
    .eq('referrer_profile_id', profileId);

  if (relationsError) {
    console.error('Failed to read the referral relations:', relationsError.message);
    throw new Error('Failed to read the referrals');
  }

  const rows = (relations ?? []) as { status: string; reward_credits: number }[];

  const successful = rows.filter((row) => row.status === 'verified').length;
  const pending = rows.filter((row) => row.status === 'pending').length;
  const creditsEarned = rows.reduce((sum, row) => sum + (row.reward_credits ?? 0), 0);

  return {
    code,
    link: referralLink(code),
    referrals: {
      successful,
      pending,
      total: rows.length,
    },
    creditsEarned,
    rewardPerReferral: REFERRAL_REWARD_CREDITS,
  };
}

/**
 * Attributes a referral to the caller and pays the reward when the caller's
 * email is verified.
 *
 * The code is validated against the referral table, never against anything the
 * browser asserts. A caller that is already attributed keeps their original
 * attribution: the relation row is keyed by the referred account, so a second
 * claim with a different code cannot move the reward.
 */
export async function claimReferral(
  profileId: string,
  code: string
): Promise<ReferralClaimResult> {
  const trimmed = (code ?? '').trim();
  if (!trimmed) {
    return { success: false, status: 'invalid_code', rewardCredits: 0 };
  }

  const supabase = getSupabaseServer();

  // The codes are generated in upper case. The candidate may well type or
  // paste them in any case, so both spellings are tried. The comparison is an
  // exact match rather than a pattern match, so a code can never match
  // another one by accident.
  const { data: codeRow, error: codeError } = await supabase
    .from('referral_codes')
    .select('profile_id')
    .in('code', [trimmed, trimmed.toUpperCase()])
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();

  if (codeError) {
    console.error('Failed to read the referral code:', codeError.message);
    return { success: false, status: 'invalid_code', rewardCredits: 0 };
  }

  if (!codeRow) {
    return { success: false, status: 'invalid_code', rewardCredits: 0 };
  }

  const referrerId = (codeRow as { profile_id: string }).profile_id;

  if (referrerId === profileId) {
    return { success: false, status: 'self_referral', rewardCredits: 0 };
  }

  // The relation is written once. The referred account is the key, so a
  // replay — or an attempt to change the attribution afterwards — cannot
  // create a second relation.
  const { error: insertError } = await supabase.from('referral_relations').insert({
    referrer_profile_id: referrerId,
    referred_profile_id: profileId,
    referral_code: trimmed,
    status: 'pending',
  });

  if (insertError && insertError.code !== '23505') {
    console.error('Failed to record the referral:', insertError.message);
    return { success: false, status: 'invalid_code', rewardCredits: 0 };
  }

  // The verification pays the reward only when the email is confirmed. The
  // database also runs this check from its own trigger when the confirmation
  // arrives, so a candidate who confirms later is still rewarded exactly once.
  const { data: result, error: verifyError } = await supabase.rpc('verify_referral_relation', {
    p_referred_profile_id: profileId,
    p_reward_credits: REFERRAL_REWARD_CREDITS,
  });

  if (verifyError) {
    console.error('Failed to verify the referral:', verifyError.message);
    return { success: false, status: 'pending_email', rewardCredits: 0 };
  }

  const outcome = (result ?? {}) as {
    status?: string;
    rewarded?: boolean;
    already_awarded?: boolean;
    reward_credits?: number;
  };

  if (outcome.already_awarded) {
    return {
      success: true,
      status: 'already_claimed',
      rewardCredits: outcome.reward_credits ?? REFERRAL_REWARD_CREDITS,
    };
  }

  if (outcome.status === 'verified' && outcome.rewarded) {
    return {
      success: true,
      status: 'verified',
      rewardCredits: outcome.reward_credits ?? REFERRAL_REWARD_CREDITS,
    };
  }

  return { success: false, status: 'pending_email', rewardCredits: 0 };
}
