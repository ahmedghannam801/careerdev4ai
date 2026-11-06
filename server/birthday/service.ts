/**
 * Birthday Reward Service (Egypt Law 151 Compliant).
 * Strictly limits personal data collection to birth month and birth day (NO birth year).
 * Stores verifiable privacy consent records and provisions promotional rewards.
 */

import { getSupabaseServer } from '../db/supabase.ts';

export interface BirthdayConsentInput {
  profileId: string;
  birthMonth: number; // 1 - 12
  birthDay: number; // 1 - 31
  ipAddress?: string;
  userAgent?: string;
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
 * Registers candidate consent and provisions an active or upcoming birthday reward.
 */
export async function saveBirthdayConsent(
  input: BirthdayConsentInput
): Promise<{ success: boolean; reward?: BirthdayRewardDTO; error?: string }> {
  const { profileId, birthMonth, birthDay, ipAddress, userAgent } = input;

  if (birthMonth < 1 || birthMonth > 12 || birthDay < 1 || birthDay > 31) {
    return { success: false, error: 'Invalid birth month or day' };
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();

  // 1. Record Law 151 Privacy Consent
  const { data: consentData, error: consentErr } = await getSupabaseServer()
    .from('user_privacy_consents')
    .insert({
      profile_id: profileId,
      consent_purpose: 'birthday_reward',
      status: 'granted',
      consented_data: {
        birth_month: birthMonth,
        birth_day: birthDay,
        // STRICT: Zero birth year collected or stored
      },
      policy_version: 'v1.0',
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
    })
    .select('id')
    .single();

  if (consentErr || !consentData) {
    console.error('Failed to record birthday privacy consent:', consentErr);
    return { success: false, error: 'Failed to record privacy consent' };
  }

  const consentId = consentData.id;

  // 2. BLK-06: Compute strictly 7-day birthday celebration window (valid for 7 days)
  // Determine if this year's birthday window is active/upcoming, or schedule for next year
  let rewardYear = currentYear;
  let validFrom = new Date(Date.UTC(rewardYear, birthMonth - 1, birthDay));
  let validUntil = new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000);

  // If already expired for this year, schedule for next year
  if (now > validUntil) {
    rewardYear = currentYear + 1;
    validFrom = new Date(Date.UTC(rewardYear, birthMonth - 1, birthDay));
    validUntil = new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  // 3. Upsert reward definition
  const { data: rewardData, error: rewardErr } = await getSupabaseServer()
    .from('birthday_rewards')
    .upsert(
      {
        profile_id: profileId,
        privacy_consent_id: consentId,
        birth_month: birthMonth,
        birth_day: birthDay,
        reward_year: rewardYear,
        discount_percentage: 30, // 30% discount
        max_discount_piasters: 10000, // 100.00 EGP cap
        valid_from: validFrom.toISOString(),
        valid_until: validUntil.toISOString(),
        is_combinable: false,
        status: 'available',
      },
      { onConflict: 'profile_id,reward_year' }
    )
    .select('*')
    .single();

  if (rewardErr || !rewardData) {
    console.error('Failed to provision birthday reward:', rewardErr);
    return { success: false, error: 'Failed to provision birthday reward' };
  }

  return {
    success: true,
    reward: {
      id: rewardData.id,
      profileId: rewardData.profile_id,
      birthMonth: rewardData.birth_month,
      birthDay: rewardData.birth_day,
      rewardYear: rewardData.reward_year,
      discountPercentage: rewardData.discount_percentage,
      maxDiscountPiasters: rewardData.max_discount_piasters,
      validFrom: rewardData.valid_from,
      validUntil: rewardData.valid_until,
      status: rewardData.status as BirthdayRewardDTO['status'],
    },
  };
}

/**
 * Revokes Law 151 consent and cancels any unredeemed birthday reward.
 */
export async function revokeBirthdayConsent(profileId: string): Promise<boolean> {
  const now = new Date().toISOString();

  // Withdraw consent
  await getSupabaseServer()
    .from('user_privacy_consents')
    .update({
      status: 'withdrawn',
      withdrawn_at: now,
      updated_at: now,
    })
    .eq('profile_id', profileId)
    .eq('consent_purpose', 'birthday_reward');

  // Cancel unredeemed rewards
  await getSupabaseServer()
    .from('birthday_rewards')
    .update({
      status: 'revoked',
    })
    .eq('profile_id', profileId)
    .eq('status', 'available');

  return true;
}

/**
 * Returns available birthday reward for user if currently active.
 */
export async function getActiveBirthdayReward(
  profileId: string
): Promise<BirthdayRewardDTO | null> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServer()
    .from('birthday_rewards')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'available')
    .lte('valid_from', now)
    .gte('valid_until', now)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    profileId: data.profile_id,
    birthMonth: data.birth_month,
    birthDay: data.birth_day,
    rewardYear: data.reward_year,
    discountPercentage: data.discount_percentage,
    maxDiscountPiasters: data.max_discount_piasters,
    validFrom: data.valid_from,
    validUntil: data.valid_until,
    status: data.status as BirthdayRewardDTO['status'],
  };
}

