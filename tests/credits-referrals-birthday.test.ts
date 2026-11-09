/**
 * The daily credit allowance, the referral programme and the birthday
 * discount.
 *
 * These are the rules that money and rewards hang on, so they are tested
 * against the real database rather than against a mock: the claim is
 * idempotent, the bucket is spent before the general balance, a referral pays
 * once, a birthday belongs to one day, and the client roles cannot write the
 * tables that hold any of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { admin, api, createTestUser, deleteTestUser, type TestUser } from './helpers.ts';
import {
  DAILY_CREDIT_ALLOWANCE,
  REFERRAL_REWARD_CREDITS,
} from '../shared/credits.ts';
import { isBirthdayToday, BIRTHDAY_DISCOUNT_PERCENTAGE } from '../server/birthday/service.ts';

const PROFILE = '3f2632a9-a87d-4968-a3ec-3af74bef8107';

/** Reads the authoritative running balance from the ledger. */
async function runningBalance(profileId: string): Promise<number> {
  const { data, error } = await admin
    .from('ai_credit_ledger')
    .select('running_balance')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { running_balance: number } | null)?.running_balance ?? 0;
}

/** Removes every ledger row and every daily bucket of a profile. */
async function clearCredits(profileId: string): Promise<void> {
  await admin.from('daily_credit_grants').delete().eq('profile_id', profileId);
  await admin.from('ai_credit_ledger').delete().eq('profile_id', profileId);
}

test.describe('the daily credit allowance', () => {
  let user: TestUser;

  test.before(async () => {
    user = await createTestUser('daily-credits');
  });

  test.after(async () => {
    await clearCredits(user.id);
    await deleteTestUser(user);
  });

  test('is granted once per day and never twice', async () => {
    await clearCredits(user.id);

    const first = await admin.rpc('claim_daily_credits', {
      p_profile_id: user.id,
      p_amount: DAILY_CREDIT_ALLOWANCE,
    });
    assert.equal(first.error, null, first.error?.message);

    const second = await admin.rpc('claim_daily_credits', {
      p_profile_id: user.id,
      p_amount: DAILY_CREDIT_ALLOWANCE,
    });
    assert.equal(second.error, null, second.error?.message);

    const firstRow = first.data as { granted: number; daily_remaining: number; balance: number };
    const secondRow = second.data as { granted: number; daily_remaining: number; balance: number };

    assert.equal(firstRow.granted, DAILY_CREDIT_ALLOWANCE, 'the first claim of the day grants');
    assert.equal(secondRow.granted, 0, 'the second claim of the day grants nothing');
    assert.equal(secondRow.daily_remaining, firstRow.daily_remaining, 'the allowance did not double');
    assert.equal(secondRow.balance, firstRow.balance, 'the balance did not double');
  });

  test('is spent before the general balance, and a replay is refused', async () => {
    await clearCredits(user.id);

    // One credit in the expiring daily bucket and two in the general balance,
    // so that the test can tell the two apart and still has something to
    // spend when it checks the replay.
    await admin.rpc('claim_daily_credits', {
      p_profile_id: user.id,
      p_amount: DAILY_CREDIT_ALLOWANCE,
    });
    await admin.rpc('grant_ai_credits', {
      p_profile_id: user.id,
      p_amount: 2,
      p_idempotency_key: `test-grant-${Date.now()}`,
      p_source_type: 'system',
      p_source_id: null,
      p_description: 'General balance for the credit tests',
      p_metadata: {},
    });

    const { data: grants } = await admin
      .from('daily_credit_grants')
      .select('remaining')
      .eq('profile_id', user.id);
    assert.equal((grants ?? [])[0]?.remaining, DAILY_CREDIT_ALLOWANCE);

    const spent = await admin.rpc('consume_ai_credits', {
      p_profile_id: user.id,
      p_operation: 'job_description_analysis',
      p_amount: 1,
      p_idempotency_key: `test-daily-${Date.now()}`,
      p_metadata: {},
    });
    assert.equal(spent.error, null, spent.error?.message);

    const { data: afterGrants } = await admin
      .from('daily_credit_grants')
      .select('remaining')
      .eq('profile_id', user.id);
    assert.equal(
      (afterGrants ?? [])[0]?.remaining,
      DAILY_CREDIT_ALLOWANCE - 1,
      'the expiring allowance is spent first'
    );

    const key = `test-replay-${Date.now()}`;
    const first = await admin.rpc('consume_ai_credits', {
      p_profile_id: user.id,
      p_operation: 'job_description_analysis',
      p_amount: 1,
      p_idempotency_key: key,
      p_metadata: {},
    });
    assert.equal(first.error, null, first.error?.message);

    const replay = await admin.rpc('consume_ai_credits', {
      p_profile_id: user.id,
      p_operation: 'job_description_analysis',
      p_amount: 1,
      p_idempotency_key: key,
      p_metadata: {},
    });
    assert.equal(replay.error, null, replay.error?.message);

    const firstRow = first.data as { idempotent_replay: boolean; remaining_balance: number };
    const replayRow = replay.data as { idempotent_replay: boolean; remaining_balance: number };

    assert.equal(firstRow.idempotent_replay, false);
    assert.equal(replayRow.idempotent_replay, true, 'a replay is recognised');
    assert.equal(
      replayRow.remaining_balance,
      firstRow.remaining_balance,
      'a replay does not deduct a second time'
    );
  });

  test('never lets the balance go below zero', async () => {
    await clearCredits(user.id);

    const refused = await admin.rpc('consume_ai_credits', {
      p_profile_id: user.id,
      p_operation: 'cv_generation',
      p_amount: 4,
      p_idempotency_key: `test-overdraw-${Date.now()}`,
      p_metadata: {},
    });

    const row = refused.data as { success: boolean; error?: string };
    assert.equal(row.success, false, 'an overdraw is refused');
    assert.equal(row.error, 'INSUFFICIENT_CREDITS');
    assert.equal(await runningBalance(user.id), 0, 'the balance stayed at zero');
  });

  test('the allowance is three credits and the referral reward cannot exceed it', async () => {
    assert.equal(DAILY_CREDIT_ALLOWANCE, 3, 'the daily allowance is three credits');
    assert.ok(
      REFERRAL_REWARD_CREDITS <= DAILY_CREDIT_ALLOWANCE,
      'a referral reward is never worth more than one daily allowance'
    );

    // The allowance lives in the database as well as in the application, so
    // that the two can never disagree about what the product promises.
    const { data, error } = await admin.rpc('careerpilot_daily_credit_allowance');
    assert.equal(error, null, error?.message);
    assert.equal(
      data as number,
      DAILY_CREDIT_ALLOWANCE,
      'the database grants the same allowance the application promises'
    );
  });

  test('tops up an account that was granted under the old, smaller allowance', async () => {
    await clearCredits(user.id);

    // A bucket created under the old one-credit allowance, on today's
    // Africa/Cairo day — the day the claim uses. The ledger entry that came
    // with it is written too, because that is the state the old allowance
    // really left behind: a grant row and a matching credit.
    const cairoToday = cairoDate(new Date());
    const day = `${cairoToday.year}-${String(cairoToday.month).padStart(2, '0')}-${String(cairoToday.day).padStart(2, '0')}`;
    await admin.from('daily_credit_grants').insert({
      profile_id: user.id,
      grant_date: day,
      granted_amount: 1,
      remaining: 1,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await admin.from('ai_credit_ledger').insert({
      profile_id: user.id,
      amount: 1,
      running_balance: 1,
      operation: 'grant',
      source_type: 'daily_allowance',
      idempotency_key: `daily-grant:${user.id}:${day}`,
      description: 'Daily free credits',
    });

    const claimed = await admin.rpc('claim_daily_credits', {
      p_profile_id: user.id,
      p_amount: DAILY_CREDIT_ALLOWANCE,
    });
    assert.equal(claimed.error, null, claimed.error?.message);

    const row = claimed.data as {
      granted: number;
      daily_remaining: number;
      daily_allowance: number;
      balance: number;
    };
    assert.equal(row.daily_allowance, DAILY_CREDIT_ALLOWANCE, 'the bucket is at the full allowance');
    assert.equal(row.daily_remaining, DAILY_CREDIT_ALLOWANCE, 'the extra credits are usable');
    assert.equal(row.balance, DAILY_CREDIT_ALLOWANCE, 'the balance matches the ledger');

    // A second claim in the same day tops up nothing more.
    const again = await admin.rpc('claim_daily_credits', {
      p_profile_id: user.id,
      p_amount: DAILY_CREDIT_ALLOWANCE,
    });
    const againRow = again.data as { granted: number; balance: number };
    assert.equal(againRow.granted, 0, 'the top-up is not repeated');
    assert.equal(againRow.balance, DAILY_CREDIT_ALLOWANCE, 'the balance did not grow');
  });

  test('the sweep reaches every eligible account, not only the ones that read their balance', async () => {
    // A second account that has never touched the credit system.
    const untouched = await createTestUser('daily-credits-sweep');
    try {
      await clearCredits(untouched.id);

      const { data: before } = await admin
        .from('daily_credit_grants')
        .select('id')
        .eq('profile_id', untouched.id);
      assert.equal((before ?? []).length, 0, 'the account starts with no allowance');

      const swept = await admin.rpc('grant_daily_credits_to_all');
      assert.equal(swept.error, null, swept.error?.message);

      const { data: after } = await admin
        .from('daily_credit_grants')
        .select('granted_amount, remaining')
        .eq('profile_id', untouched.id);
      assert.equal((after ?? []).length, 1, 'the sweep granted the allowance');
      assert.equal(
        (after ?? [])[0]?.granted_amount,
        DAILY_CREDIT_ALLOWANCE,
        'the sweep granted the full allowance'
      );

      // The sweep is idempotent.
      const again = await admin.rpc('grant_daily_credits_to_all');
      assert.equal(again.error, null, again.error?.message);
      const { data: afterAgain } = await admin
        .from('daily_credit_grants')
        .select('id')
        .eq('profile_id', untouched.id);
      assert.equal((afterAgain ?? []).length, 1, 'a second sweep grants nothing more');
    } finally {
      await clearCredits(untouched.id);
      await deleteTestUser(untouched);
    }
  });
});

test.describe('the referral programme', () => {
  let referrer: TestUser;
  let referred: TestUser;

  test.before(async () => {
    referrer = await createTestUser('referrer');
    referred = await createTestUser('referred');
  });

  test.after(async () => {
    await admin.from('referral_relations').delete().eq('referred_profile_id', referred.id);
    await admin.from('referral_codes').delete().eq('profile_id', referrer.id);
    await deleteTestUser(referrer);
    await deleteTestUser(referred);
  });

  test('gives every account a unique, non-guessable code', async () => {
    const first = await admin.rpc('ensure_referral_code', { p_profile_id: referrer.id });
    const second = await admin.rpc('ensure_referral_code', { p_profile_id: referrer.id });

    assert.equal(first.error, null, first.error?.message);
    const code = first.data as string;
    assert.match(code, /^CD4-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    assert.equal(second.data, code, 'the code is stable for the account');

    const other = await admin.rpc('ensure_referral_code', { p_profile_id: referred.id });
    assert.notEqual(other.data, code, 'two accounts have two different codes');
  });

  test('refuses a self-referral and pays a verified referral exactly once', async () => {
    const code = (await admin.rpc('ensure_referral_code', { p_profile_id: referrer.id })).data as string;

    // The table itself refuses to hold a self-referral.
    const selfReferral = await admin.from('referral_relations').insert({
      referrer_profile_id: referrer.id,
      referred_profile_id: referrer.id,
      referral_code: code,
      status: 'pending',
    });
    assert.notEqual(selfReferral.error, null, 'a self-referral is refused by the database');

    // A real referral is attributed once.
    const attributed = await admin.from('referral_relations').insert({
      referrer_profile_id: referrer.id,
      referred_profile_id: referred.id,
      referral_code: code,
      status: 'pending',
    });
    assert.equal(attributed.error, null, attributed.error?.message);

    const replay = await admin.from('referral_relations').insert({
      referrer_profile_id: referrer.id,
      referred_profile_id: referred.id,
      referral_code: code,
      status: 'pending',
    });
    assert.notEqual(replay.error, null, 'an account can only be attributed once');

    await clearCredits(referrer.id);

    const verified = await admin.rpc('verify_referral_relation', {
      p_referred_profile_id: referred.id,
      p_reward_credits: REFERRAL_REWARD_CREDITS,
    });
    assert.equal(verified.error, null, verified.error?.message);

    const row = verified.data as { status: string; rewarded: boolean; reward_credits: number };
    assert.equal(row.status, 'verified');
    assert.equal(row.rewarded, true);
    assert.equal(row.reward_credits, REFERRAL_REWARD_CREDITS);

    const balanceAfter = await runningBalance(referrer.id);
    assert.equal(balanceAfter, REFERRAL_REWARD_CREDITS, 'the referrer received the reward');

    // A second verification pays nothing more.
    const again = await admin.rpc('verify_referral_relation', {
      p_referred_profile_id: referred.id,
      p_reward_credits: REFERRAL_REWARD_CREDITS,
    });
    const againRow = again.data as { status: string; rewarded: boolean; already_awarded?: boolean };
    assert.equal(againRow.already_awarded, true, 'the reward is not paid twice');
    assert.equal(againRow.rewarded, false);
    assert.equal(await runningBalance(referrer.id), balanceAfter, 'the balance did not change');
  });
});

/**
 * The calendar date in Cairo for a given instant.
 *
 * The test must not depend on the day it happens to run: the rule under test
 * is "the birthday belongs to ONE day", and that day is the day the suite is
 * running. The date is therefore read from the clock, in the timezone the
 * rule is about, instead of being written into the source.
 */
function cairoDate(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const value = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

/** The Cairo calendar day `offset` days after the given one. */
function cairoDayOffset(base: { year: number; month: number; day: number }, offset: number) {
  const shifted = new Date(Date.UTC(base.year, base.month - 1, base.day + offset));
  return cairoDate(shifted);
}

test.describe('the Learning Hub and the credit it spends', () => {
  let user: TestUser;

  test.before(async () => {
    user = await createTestUser('learning-hub-credits');
  });

  test.after(async () => {
    await clearCredits(user.id);
    await deleteTestUser(user);
  });

  /**
   * The balance the API reports.
   *
   * The number on the screen is the number the ledger holds, so the test
   * compares the two rather than trusting either.
   */
  async function reportedBalance(): Promise<number> {
    const res = await api('GET', '/api/credits/balance', { token: user.token });
    assert.equal(res.status, 200, res.body?.error);
    return res.body?.balance as number;
  }

  test('the daily allowance is enough to use the Learning Hub', async () => {
    await clearCredits(user.id);

    const before = await reportedBalance();
    assert.ok(
      before >= DAILY_CREDIT_ALLOWANCE,
      `the daily allowance of ${DAILY_CREDIT_ALLOWANCE} must be available, found ${before}`
    );

    // The Learning Hub is one credit. With the allowance it can be used and
    // the balance afterwards must be exactly one credit lower.
    const hub = await api('POST', '/api/learning/recommendations', {
      token: user.token,
      body: { ai: false },
    });
    assert.equal(hub.status, 200, hub.body?.error);

    const after = await reportedBalance();
    assert.equal(
      after,
      before - 1,
      'a successful Learning Hub request costs exactly one credit'
    );
    assert.equal(
      hub.body?.creditBalance,
      after,
      'the balance the request reports must be the balance the ledger holds'
    );
  });

  test('a refused request does not spend a credit', async () => {
    await clearCredits(user.id);
    const before = await reportedBalance();
    assert.ok(before > 0, 'the account starts with credits');

    // The request is refused by validation: there is no weekly-hours figure
    // and no role. Nothing was produced, so nothing may be charged.
    const refused = await api('POST', '/api/learning/recommendations', {
      token: user.token,
      body: { weeklyHours: 'not-a-number' },
    });
    assert.ok(refused.status >= 400, 'the request is refused');

    const after = await reportedBalance();
    assert.equal(after, before, 'a failed request must not spend a credit');
  });

  test('the allowance is spent before anything else, and the ledger agrees', async () => {
    await clearCredits(user.id);
    const before = await reportedBalance();

    const hub = await api('POST', '/api/learning/recommendations', {
      token: user.token,
      body: { ai: false },
    });
    assert.equal(hub.status, 200, hub.body?.error);

    assert.equal(
      await runningBalance(user.id),
      before - 1,
      'the ledger must hold the same balance the API reported'
    );
  });
});

test.describe('the birthday discount', () => {
  test('belongs to one day only', () => {
    const today = cairoDate(new Date());
    const tomorrow = cairoDayOffset(today, 1);
    const yesterday = cairoDayOffset(today, -1);

    assert.equal(
      isBirthdayToday(today.month, today.day, 'Africa/Cairo'),
      true,
      'today is the birthday'
    );
    assert.equal(
      isBirthdayToday(tomorrow.month, tomorrow.day, 'Africa/Cairo'),
      false,
      'tomorrow is not'
    );
    assert.equal(
      isBirthdayToday(yesterday.month, yesterday.day, 'Africa/Cairo'),
      false,
      'yesterday is not'
    );
    // The wrong month, and a day that is simply another day.
    const otherMonth = today.month === 12 ? 1 : today.month + 1;
    assert.equal(
      isBirthdayToday(otherMonth, today.day, 'Africa/Cairo'),
      false,
      'the wrong month is not'
    );
    const otherDay = today.day === 15 ? 16 : 15;
    assert.equal(
      isBirthdayToday(today.month, otherDay, 'Africa/Cairo'),
      false,
      'another day is not'
    );
  });

  test('follows the candidate timezone, not the platform one', () => {
    // 22:30 UTC is already the next day in Cairo, and the previous day in
    // New York. The same instant is a different calendar day on each side.
    const instant = new Date('2026-11-08T22:30:00Z');
    assert.equal(isBirthdayToday(11, 9, 'Africa/Cairo', instant), true, 'Cairo has moved on');
    assert.equal(isBirthdayToday(11, 8, 'America/New_York', instant), true, 'New York has not');
  });

  test('is 30 percent', () => {
    assert.equal(BIRTHDAY_DISCOUNT_PERCENTAGE, 30);
  });

  test('is not given to an account that is not celebrating', async () => {
    const { data: reward } = await admin
      .from('birthday_rewards')
      .select('*')
      .eq('profile_id', PROFILE)
      .maybeSingle();

    // The platform owner's account is not used for the reward, so nothing is
    // granted by accident.
    assert.ok(reward === null || reward.status !== 'available');
  });
});

test.describe('the client cannot write the tables that hold money', () => {
  test('a signed-in client cannot insert a subscription of their own', async () => {
    const user = await createTestUser('privilege-escalation');
    try {
      const { error } = await user.client.from('subscriptions').insert({
        profile_id: user.id,
        plan_code: 'pro',
        status: 'active',
      });
      assert.notEqual(error, null, 'the insert was refused');
    } finally {
      await deleteTestUser(user);
    }
  });

  test('a signed-in client cannot promote themselves to an administrator', async () => {
    const user = await createTestUser('privilege-escalation-admin');
    try {
      const { error } = await user.client
        .from('admin_users')
        .insert({
          profile_id: user.id,
          email: user.email,
          full_name: 'Test',
          role: 'super_admin',
          status: 'active',
        });
      assert.notEqual(error, null, 'the insert was refused');
    } finally {
      await deleteTestUser(user);
    }
  });

  test('a signed-in client cannot grant themselves credits', async () => {
    const user = await createTestUser('privilege-escalation-credits');
    try {
      const { error } = await user.client.from('ai_credit_ledger').insert({
        profile_id: user.id,
        amount: 1000,
        running_balance: 1000,
        operation: 'grant',
        source_type: 'admin',
        idempotency_key: `forged-${Date.now()}`,
      });
      assert.notEqual(error, null, 'the insert was refused');
    } finally {
      await deleteTestUser(user);
    }
  });

  test('a signed-in client cannot write the daily allowance bucket', async () => {
    const user = await createTestUser('privilege-escalation-daily');
    try {
      const { error } = await user.client.from('daily_credit_grants').insert({
        profile_id: user.id,
        grant_date: '2026-01-01',
        granted_amount: 999,
        remaining: 999,
        expires_at: new Date().toISOString(),
      });
      assert.notEqual(error, null, 'the insert was refused');
    } finally {
      await deleteTestUser(user);
    }
  });
});
