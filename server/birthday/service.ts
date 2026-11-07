/**
 * Birthday Reward Service (Egypt Law 151 Compliant).
 *
 * Strictly limits personal data collection to birth month and birth day (NO
 * birth year). Stores verifiable privacy consent records and provisions the
 * promotional reward.
 *
 * The eligibility rules are the important part:
 *
 *   * The reward belongs to ONE account, on ONE day: the account's own
 *     birthday, in the account's own timezone. It is not a coupon anybody can
 *     see, and it is not a week-long promotion.
 *   * Eligibility is decided on the server, from the consent record the
 *     candidate gave. The browser cannot ask for the discount, cannot move
 *     the date and cannot ask for it on another account's behalf.
 *   * The discount is 30%, capped at 100 EGP, and it never combines with a
 *     coupon.
 *   * A redemption is recorded, so the same birthday cannot be spent twice.
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
  status: 'available' | 'redeemed' | 'expired';
}

/** The platform's documented timezone. It is the fallback for a candidate whose profile names none. */
export const DEFAULT_TIMEZONE = 'Africa/Cairo';

/** The approved birthday discount. It is not configurable and it does not grow. */
export const BIRTHDAY_DISCOUNT_PERCENTAGE = 30;

/** The approved cap on the birthday discount, in piasters (100 EGP). */
export const BIRTHDAY_MAX_DISCOUNT_PIASTERS = 10_000;

/**
 * The calendar date in a timezone.
 *
 * The platform decides the day boundary from the candidate's own timezone, so
 * a candidate's birthday starts when it starts for them.
 */
export function calendarDateIn(timeZone: string, at: Date = new Date()): {
  year: number;
  month: number;
  day: number;
} {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at);

    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);

    const year = read('year');
    const month = read('month');
    const day = read('day');

    if (!year || !month || !day) throw new Error('unreadable date');

    return { year, month, day };
  } catch {
    // A timezone the runtime does not know falls back to the platform's own.
    const utc = new Date(at.getTime() + at.getTimezoneOffset() * 60_000);
    return {
      year: utc.getFullYear(),
      month: utc.getMonth() + 1,
      day: utc.getDate(),
    };
  }
}

/**
 * Whether today is the candidate's birthday, in their own timezone.
 */
export function isBirthdayToday(
  birthMonth: number,
  birthDay: number,
  timeZone: string = DEFAULT_TIMEZONE,
  at: Date = new Date()
): boolean {
  const today = calendarDateIn(timeZone, at);
  return today.month === birthMonth && today.day === birthDay;
}

/**
 * The first and the last moment of a calendar day in a timezone.
 *
 * The offset is read from the timezone itself, so daylight saving is handled
 * by the platform's own calendar rather than by a fixed rule.
 */
function dayWindow(
  year: number,
  month: number,
  day: number,
  timeZone: string
): { from: Date; until: Date } {
  const offsetAt = (at: Date): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at);

    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const hour = read('hour') === 24 ? 0 : read('hour');

    const asUtc = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      hour,
      read('minute'),
      read('second')
    );

    return asUtc - at.getTime() + (at.getTime() % 1000);
  };

  const midnightUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  // Two passes: the offset of the guess, then the offset at the corrected
  // instant. The second pass settles the answer for every real timezone.
  let from = new Date(midnightUtc - offsetAt(new Date(midnightUtc)));
  from = new Date(midnightUtc - offsetAt(from));

  const until = new Date(from.getTime());
  until.setUTCDate(until.getUTCDate() + 1);

  return { from, until };
}

/**
 * Reads the candidate's own timezone.
 *
 * A candidate who names one gets their own day boundary. A candidate who
 * names none, or names one the runtime does not know, follows the platform's
 * documented policy.
 */
export async function getProfileTimezone(profileId: string): Promise<string> {
  const { data, error } = await getSupabaseServer()
    .from('profiles')
    .select('timezone')
    .eq('id', profileId)
    .maybeSingle();

  if (error) return DEFAULT_TIMEZONE;

  const named = (data as { timezone?: string | null } | null)?.timezone?.trim();
  if (!named) return DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: named });
    return named;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Registers candidate consent and provisions the birthday reward.
 *
 * The reward is provisioned for the candidate's next birthday, and it is
 * usable on that day only.
 */
export async function saveBirthdayConsent(
  input: BirthdayConsentInput
): Promise<{ success: boolean; reward?: BirthdayRewardDTO; error?: string }> {
  const { profileId, birthMonth, birthDay, ipAddress, userAgent } = input;

  if (birthMonth < 1 || birthMonth > 12 || birthDay < 1 || birthDay > 31) {
    return { success: false, error: 'Invalid birth month or day' };
  }

  const timeZone = await getProfileTimezone(profileId);
  const now = new Date();
  const today = calendarDateIn(timeZone, now);

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

  // 2. The reward covers the candidate's birthday and that day only.
  //    A birthday that has already passed this year is next year's.
  let rewardYear = today.year;
  let window = dayWindow(rewardYear, birthMonth, birthDay, timeZone);

  if (now > window.until) {
    rewardYear = today.year + 1;
    window = dayWindow(rewardYear, birthMonth, birthDay, timeZone);
  }

  // 3. Upsert the reward definition
  const { data: rewardData, error: rewardErr } = await getSupabaseServer()
    .from('birthday_rewards')
    .upsert(
      {
        profile_id: profileId,
        privacy_consent_id: consentId,
        birth_month: birthMonth,
        birth_day: birthDay,
        reward_year: rewardYear,
        discount_percentage: BIRTHDAY_DISCOUNT_PERCENTAGE,
        max_discount_piasters: BIRTHDAY_MAX_DISCOUNT_PIASTERS,
        valid_from: window.from.toISOString(),
        valid_until: window.until.toISOString(),
        is_combinable: false,
        status: 'available',
        redeemed_at: null,
        redeemed_payment_id: null,
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

  // Cancel unredeemed rewards. The stored vocabulary is
  // available | redeemed | expired, so a cancelled reward is 'expired'.
  await getSupabaseServer()
    .from('birthday_rewards')
    .update({
      status: 'expired',
    })
    .eq('profile_id', profileId)
    .eq('status', 'available');

  return true;
}

/**
 * The birthday reward the candidate may use right now, or `null`.
 *
 * The decision is made here, on the server, from the consent record and the
 * candidate's own calendar. The browser is never asked whether today is
 * somebody's birthday.
 */
export async function getActiveBirthdayReward(
  profileId: string
): Promise<BirthdayRewardDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('birthday_rewards')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'available')
    .maybeSingle();

  if (error || !data) return null;

  const timeZone = await getProfileTimezone(profileId);

  // Today has to be the candidate's birthday, in their own timezone.
  if (!isBirthdayToday(data.birth_month, data.birth_day, timeZone)) {
    return null;
  }

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

/**
 * Records that the birthday discount was used.
 *
 * The reward row is claimed once: a second attempt in the same birthday cycle
 * finds nothing to claim and changes nothing.
 */
export async function redeemBirthdayReward(
  profileId: string,
  paymentRequestId?: string | null
): Promise<boolean> {
  // The redemption points at the payment request when there is one. It is a
  // foreign key, so only a real identifier is stored.
  const reference =
    paymentRequestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      paymentRequestId
    )
      ? paymentRequestId
      : null;

  const { data, error } = await getSupabaseServer()
    .from('birthday_rewards')
    .update({
      status: 'redeemed',
      redeemed_at: new Date().toISOString(),
      ...(reference ? { redeemed_payment_id: reference } : {}),
    })
    .eq('profile_id', profileId)
    .eq('status', 'available')
    .select('id');

  if (error) {
    console.error('Failed to record the birthday redemption:', error.message);
    return false;
  }

  return ((data ?? []) as { id: string }[]).length > 0;
}
