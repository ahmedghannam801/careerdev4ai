/**
 * The daily allowance of a paying account.
 * ---------------------------------------------------------------------------
 * The daily free-token allowance is claimed by the candidate, on purpose,
 * from a button. The daily allowance of a PAID account is an entitlement:
 * it is promised by the plan, and it arrives.
 *
 * This file holds the rules of that entitlement, tested against a real
 * Postgres (see `tests/pglite-credits.ts`): the same migration files, the
 * same functions and the same constraints that the platform runs. Nothing
 * here is a mock of the database — the rules are the ones in the SQL.
 *
 * What is checked:
 *
 *   * the entitlement arrives on its own, without a claim and without the
 *     candidate opening the application;
 *   * it arrives once per day, however many times it is asked for;
 *   * the database itself refuses a second grant, so a race between two
 *     requests cannot pay out twice;
 *   * it is the allowance the plan promises, and it follows the plan when the
 *     plan changes;
 *   * an expired subscription stops receiving it;
 *   * a day that the schedule missed is picked up by the next one;
 *   * yesterday's allowance expires instead of accumulating;
 *   * the balance the interface reads is the balance the ledger holds;
 *   * the free reward is still claimed by hand, and the sweep still grants
 *     nothing behind the button's back;
 *   * a signed-in candidate cannot grant themselves a credit or change their
 *     own plan.
 */

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createCreditDatabase, profileId, type CreditDatabase } from './pglite-credits.ts';
import { DAILY_CREDIT_ALLOWANCE } from '../shared/credits.ts';

/* -------------------------------------------------------------------------- */
/* The fixtures                                                                 */
/* -------------------------------------------------------------------------- */

/** The Egypt-local calendar day, which is the day the allowance belongs to. */
function cairoDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

/** The Egypt-local day before today. */
function cairoDayBefore(): string {
  const yesterday = new Date(Date.now() - 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(yesterday);
}

interface Account {
  id: string;
  /** The plan the account is entitled under, or null when it has none. */
  plan: string | null;
}

/**
 * An account: a user, a profile and — when there is one — a subscription.
 *
 * The subscription is what the entitlement is decided by, so it is written
 * the way the platform writes it: a plan, a status, a period.
 */
async function createAccount(
  database: CreditDatabase,
  seed: string,
  options: {
    plan?: string | null;
    status?: string;
    periodEndsInDays?: number;
    confirmed?: boolean;
  } = {}
): Promise<Account> {
  const id = profileId(seed);
  const plan = options.plan === undefined ? 'pro' : options.plan;
  const confirmed = options.confirmed !== false;
  const status = options.status ?? 'active';
  const periodEndsInDays = options.periodEndsInDays ?? 30;

  await database.exec(
    `INSERT INTO auth.users (id, email, email_confirmed_at)
     VALUES ('${id}', '${seed}@example.com', ${
       confirmed ? 'now()' : 'NULL'
     });`
  );
  // The profile is created by the platform's own trigger on the user table,
  // exactly as it is when a candidate signs up.

  if (plan) {
    const rows = await database.query<{ id: string }>(
      `SELECT id FROM public.subscription_plans WHERE code = '${plan}'`
    );
    const planId = rows[0]?.id;
    if (!planId) throw new Error(`The plan ${plan} does not exist.`);
    // The period *starts* a month ago, not now. Production carries the check
    // constraint `current_period_ends_at > current_period_starts_at`, so a
    // period that already ended has to have started earlier as well — the
    // fixture has to respect the same rule the database does.
    await database.exec(
      `INSERT INTO public.subscriptions (
         profile_id, plan_id, billing_cycle, status,
         current_period_starts_at, current_period_ends_at, auto_renew, metadata
       ) VALUES (
         '${id}', '${planId}', 'monthly', '${status}',
         now() - interval '30 days', now() + interval '${periodEndsInDays} days', false, '{}'::jsonb
       );`
    );
  }

  return { id, plan };
}

/** The bucket of an account for a day. */
async function bucket(
  database: CreditDatabase,
  account: string,
  day = cairoDay()
): Promise<{ granted_amount: number; remaining: number } | null> {
  const rows = await database.query<{ granted_amount: number; remaining: number }>(
    `SELECT granted_amount, remaining FROM public.daily_credit_grants
      WHERE profile_id = '${account}' AND grant_date = '${day}'`
  );
  return rows[0] ?? null;
}

/** The balance the ledger holds. */
async function balance(database: CreditDatabase, account: string): Promise<number> {
  const rows = await database.query<{ running_balance: number }>(
    `SELECT running_balance FROM public.ai_credit_ledger
      WHERE profile_id = '${account}'
      ORDER BY created_at DESC, id DESC LIMIT 1`
  );
  return rows[0]?.running_balance ?? 0;
}

/** The number of ledger rows of a kind. */
async function ledgerCount(
  database: CreditDatabase,
  account: string,
  operation: string
): Promise<number> {
  const rows = await database.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM public.ai_credit_ledger
      WHERE profile_id = '${account}' AND operation = '${operation}'`
  );
  return rows[0]?.count ?? 0;
}

/**
 * Calls a function that answers with one JSON object, and returns that object.
 *
 * The credit functions answer with a JSON document, which the driver hands
 * back as the one column of the one row. This reads that column whatever it
 * is called, so the tests do not have to know the name the function was
 * given.
 */
async function callJson<T>(database: CreditDatabase, sql: string): Promise<T> {
  const rows = await database.query<Record<string, T>>(sql);
  const first = rows[0] ?? ({} as Record<string, T>);
  const values = Object.values(first);
  return values[0] as T;
}

/** What the entitlement reports. */
interface EntitlementOutcome {
  granted: number;
  topped_up?: number;
  entitled: boolean;
  skipped?: boolean;
  plan_code: string | null;
  daily_allowance: number;
  daily_remaining?: number;
  balance?: number;
}

/** What the sweep reports. */
interface SweepOutcome {
  eligible?: number;
  granted: number;
  topped_up?: number;
  skipped?: number;
  failed?: number;
  manual_claim?: boolean;
}

/* -------------------------------------------------------------------------- */
/* The tests                                                                    */
/* -------------------------------------------------------------------------- */

describe('the daily entitlement of a paying account', () => {
  let database: CreditDatabase;

  before(async () => {
    database = await createCreditDatabase();
  });

  after(async () => {
    await database.close();
  });

  beforeEach(async () => {
    // Every test starts from a database with nothing in it.
    await database.exec(`
      DELETE FROM public.daily_credit_grants;
      DELETE FROM public.ai_credit_ledger;
      DELETE FROM public.subscriptions;
      DELETE FROM public.profiles;
      DELETE FROM auth.users;
      UPDATE public.subscription_plans SET daily_ai_credits = ${DAILY_CREDIT_ALLOWANCE};
    `);
  });

  /* --- The grant ---------------------------------------------------------- */

  test('arrives on its own, without a claim', async () => {
    const account = await createAccount(database, 'entitlement-arrives');

    const outcome = await callJson<EntitlementOutcome>(
      database,
      `SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`
    );

    assert.equal(outcome.entitled, true, 'the account is entitled');
    assert.equal(outcome.plan_code, 'pro', 'the entitlement is the plan own');
    assert.equal(outcome.granted, DAILY_CREDIT_ALLOWANCE, 'the allowance was granted');

    const today = await bucket(database, account.id);
    assert.ok(today, 'the bucket for today exists');
    assert.equal(today.granted_amount, DAILY_CREDIT_ALLOWANCE);
    assert.equal(today.remaining, DAILY_CREDIT_ALLOWANCE);
    assert.equal(await balance(database, account.id), DAILY_CREDIT_ALLOWANCE, 'the balance moved');
    assert.equal(await ledgerCount(database, account.id, 'grant'), 1, 'one ledger row');
  });

  test('does not arrive on its own for an account with no plan', async () => {
    const account = await createAccount(database, 'entitlement-free', { plan: null });

    const outcome = await callJson<EntitlementOutcome>(
      database,
      `SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`
    );

    assert.equal(outcome.entitled, false, 'the account is not entitled');
    assert.equal(outcome.granted, 0, 'nothing was granted');
    assert.equal(await bucket(database, account.id), null, 'there is no bucket');
    assert.equal(await balance(database, account.id), 0, 'the balance did not move');
  });

  test('does not arrive for an account whose email is not confirmed', async () => {
    const account = await createAccount(database, 'entitlement-unconfirmed', { confirmed: false });

    const outcome = await callJson<EntitlementOutcome>(
      database,
      `SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`
    );

    assert.equal(outcome.granted, 0, 'nothing was granted');
    assert.equal(await bucket(database, account.id), null, 'there is no bucket');
  });

  /* --- Idempotency ------------------------------------------------------- */

  test('arrives once per day, however many times it is asked for', async () => {
    const account = await createAccount(database, 'entitlement-once');

    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);
    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);
    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);
    // The claim button pressed as well.
    await database.query(
      `SELECT * FROM public.claim_daily_credits('${account.id}', ${DAILY_CREDIT_ALLOWANCE})`
    );

    assert.equal(await balance(database, account.id), DAILY_CREDIT_ALLOWANCE, 'the balance held');
    assert.equal(await ledgerCount(database, account.id, 'grant'), 1, 'one ledger row only');

    const buckets = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM public.daily_credit_grants
        WHERE profile_id = '${account.id}' AND grant_date = '${cairoDay()}'
        AND granted_amount <> ${DAILY_CREDIT_ALLOWANCE}`
    );
    assert.equal(buckets[0]?.count, 0, 'the bucket was never doubled');
  });

  test('the database refuses a second grant, so a race cannot pay out twice', async () => {
    const account = await createAccount(database, 'entitlement-race');

    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);

    // Two requests racing for the same account would both try to write the
    // bucket. The unique constraint is what stops the second one: the grant
    // is not safe because the code is careful, it is safe because the
    // database will not hold two buckets for one day.
    let refused = false;
    try {
      await database.exec(
        `INSERT INTO public.daily_credit_grants (profile_id, grant_date, granted_amount, remaining, expires_at)
         VALUES ('${account.id}', '${cairoDay()}', 99, 99, now() + interval '1 day')`
      );
    } catch {
      refused = true;
    }
    assert.equal(refused, true, 'a second bucket for the same day is refused');

    // The ledger is guarded the same way.
    const ledger = await database.query<{ idempotency_key: string }>(
      `SELECT idempotency_key FROM public.ai_credit_ledger WHERE profile_id = '${account.id}'`
    );
    const key = ledger[0]?.idempotency_key ?? '';
    let ledgerRefused = false;
    try {
      await database.exec(
        `INSERT INTO public.ai_credit_ledger (
           profile_id, amount, running_balance, operation, source_type,
           idempotency_key, description, metadata
         ) VALUES ('${account.id}', 99, 99, 'grant', 'daily_allowance', '${key}', 'again', '{}'::jsonb)`
      );
    } catch {
      ledgerRefused = true;
    }
    assert.equal(ledgerRefused, true, 'the same idempotency key is refused');
  });

  /* --- The plan ----------------------------------------------------------- */

  test('is the allowance the plan promises', async () => {
    const account = await createAccount(database, 'entitlement-plan');

    await database.exec(
      `UPDATE public.subscription_plans SET daily_ai_credits = 7 WHERE code = 'pro'`
    );

    const rows = await database.query<{ daily_allowance: number }>(
      `SELECT public.careerpilot_daily_credit_allowance('${account.id}')::int AS daily_allowance`
    );
    assert.equal(rows[0]?.daily_allowance, 7, 'the allowance is the plan own');

    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);
    const today = await bucket(database, account.id);
    assert.equal(today?.granted_amount, 7, 'the bucket holds the plan allowance');
    assert.equal(await balance(database, account.id), 7);
  });

  test('never falls below the free allowance', async () => {
    const account = await createAccount(database, 'entitlement-floor');

    // A plan may raise the allowance. It may not take the free one away:
    // the free allowance is a benefit that already exists.
    await database.exec(
      `UPDATE public.subscription_plans SET daily_ai_credits = 0 WHERE code = 'pro'`
    );

    const rows = await database.query<{ daily_allowance: number }>(
      `SELECT public.careerpilot_daily_credit_allowance('${account.id}')::int AS daily_allowance`
    );
    assert.equal(rows[0]?.daily_allowance, DAILY_CREDIT_ALLOWANCE, 'the free allowance stands');
  });

  test('follows the plan when the candidate upgrades', async () => {
    const account = await createAccount(database, 'entitlement-upgrade', { plan: 'free' });

    const before = await database.query<{ daily_allowance: number }>(
      `SELECT public.careerpilot_daily_credit_allowance('${account.id}')::int AS daily_allowance`
    );
    assert.equal(before[0]?.daily_allowance, DAILY_CREDIT_ALLOWANCE, 'the free allowance first');

    // The candidate buys Pro.
    await database.exec(
      `DELETE FROM public.subscriptions WHERE profile_id = '${account.id}'`
    );
    const plan = await database.query<{ id: string }>(
      `SELECT id FROM public.subscription_plans WHERE code = 'pro'`
    );
    await database.exec(
      `INSERT INTO public.subscriptions (
         profile_id, plan_id, billing_cycle, status,
         current_period_starts_at, current_period_ends_at, auto_renew, metadata
       ) VALUES (
         '${account.id}', '${plan[0]?.id}', 'monthly', 'active',
         now(), now() + interval '30 days', false, '{}'::jsonb
       );`
    );

    const after = await database.query<{ daily_allowance: number }>(
      `SELECT public.careerpilot_daily_credit_allowance('${account.id}')::int AS daily_allowance`
    );
    assert.equal(after[0]?.daily_allowance, DAILY_CREDIT_ALLOWANCE, 'the new plan is read');
  });

  test('follows the plan when the candidate downgrades', async () => {
    const account = await createAccount(database, 'entitlement-downgrade');

    await database.exec(
      `UPDATE public.subscription_plans SET daily_ai_credits = 9 WHERE code = 'pro'`
    );
    const plan = await database.query<{ id: string }>(
      `SELECT id FROM public.subscription_plans WHERE code = 'free'`
    );
    await database.exec(
      `UPDATE public.subscriptions SET plan_id = '${plan[0]?.id}' WHERE profile_id = '${account.id}'`
    );

    const rows = await database.query<{ daily_allowance: number; plan_code: string }>(
      `SELECT public.careerpilot_daily_credit_allowance('${account.id}')::int AS daily_allowance,
              public.careerpilot_active_plan_code('${account.id}') AS plan_code`
    );
    assert.equal(rows[0]?.plan_code, 'free', 'the account is under the new plan');
    assert.equal(rows[0]?.daily_allowance, DAILY_CREDIT_ALLOWANCE, 'the new plan is read');
  });

  test('stops when the subscription has expired', async () => {
    const account = await createAccount(database, 'entitlement-expired');

    // The period ran out. The sweep marks the subscription expired; the
    // entitlement must not depend on the sweep having run.
    await database.exec(
      `UPDATE public.subscriptions
          SET status = 'expired',
              current_period_starts_at = now() - interval '30 days',
              current_period_ends_at = now() - interval '1 day',
              ended_at = now() - interval '1 day'
        WHERE profile_id = '${account.id}'`
    );

    const outcome = await callJson<EntitlementOutcome>(
      database,
      `SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`
    );

    assert.equal(outcome.entitled, false, 'an expired subscription is not an entitlement');
    assert.equal(outcome.granted, 0, 'nothing was granted');
    assert.equal(await bucket(database, account.id), null, 'there is no bucket');
  });

  test('stops when the period has run out but the status has not been swept yet', async () => {
    const account = await createAccount(database, 'entitlement-period-over', { periodEndsInDays: -1 });

    const outcome = await callJson<EntitlementOutcome>(
      database,
      `SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`
    );

    assert.equal(outcome.entitled, false, 'the period is over, so the entitlement is over');
  });

  /* --- The sweep ---------------------------------------------------------- */

  test('the sweep grants the entitlement to every subscriber', async () => {
    const subscriber = await createAccount(database, 'sweep-subscriber');
    const free = await createAccount(database, 'sweep-free', { plan: null });

    const outcome = await callJson<SweepOutcome>(
      database,
      `SELECT * FROM public.grant_daily_entitlements_to_all()`
    );

    assert.equal(outcome.eligible, 1, 'one account is entitled');
    assert.equal(outcome.granted, DAILY_CREDIT_ALLOWANCE, 'the entitlement was granted');

    assert.ok(await bucket(database, subscriber.id), 'the subscriber has the bucket');
    assert.equal(await bucket(database, free.id), null, 'the free account has none');
  });

  test('the sweep grants nothing to the free reward, which is still claimed', async () => {
    await createAccount(database, 'sweep-free-reward', { plan: null });

    const outcome = await callJson<SweepOutcome>(
      database,
      `SELECT * FROM public.grant_daily_credits_to_all()`
    );

    assert.equal(outcome.manual_claim, true, 'the sweep says the reward is claimed');
    assert.equal(outcome.granted, 0, 'and grants nothing');
  });

  test('a run that failed is picked up by the next one', async () => {
    const account = await createAccount(database, 'sweep-recovery');

    // The first run reached the account and the transaction rolled back: the
    // bucket is gone and the ledger row with it.
    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);
    await database.exec(
      `DELETE FROM public.daily_credit_grants WHERE profile_id = '${account.id}';
       DELETE FROM public.ai_credit_ledger WHERE profile_id = '${account.id}';`
    );
    assert.equal(await bucket(database, account.id), null, 'the day was missed');

    // The next run finds the account and grants it. A failed run is not a lost
    // day.
    await database.query(`SELECT * FROM public.grant_daily_entitlements_to_all()`);

    assert.ok(await bucket(database, account.id), 'the next run granted it');
    assert.equal(await balance(database, account.id), DAILY_CREDIT_ALLOWANCE);
  });

  test('the sweep may run as often as the scheduler likes', async () => {
    const account = await createAccount(database, 'sweep-repeated');

    await database.query(`SELECT * FROM public.grant_daily_entitlements_to_all()`);
    await database.query(`SELECT * FROM public.grant_daily_entitlements_to_all()`);
    await database.query(`SELECT * FROM public.grant_daily_entitlements_to_all()`);

    assert.equal(await balance(database, account.id), DAILY_CREDIT_ALLOWANCE, 'the balance held');
    assert.equal(await ledgerCount(database, account.id, 'grant'), 1, 'one ledger row only');
  });

  /* --- The day ------------------------------------------------------------ */

  test('arrives again the next day, and yesterday expires instead of adding up', async () => {
    const account = await createAccount(database, 'entitlement-next-day');

    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);
    assert.equal(await balance(database, account.id), DAILY_CREDIT_ALLOWANCE);

    // The day rolls over: yesterday's bucket is still there, with what was
    // left of it, and today has nothing yet.
    await database.exec(
      `UPDATE public.daily_credit_grants SET grant_date = '${cairoDayBefore()}'
        WHERE profile_id = '${account.id}'`
    );
    await database.exec(
      `UPDATE public.ai_credit_ledger SET idempotency_key = idempotency_key || ':yesterday'
        WHERE profile_id = '${account.id}'`
    );

    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);

    const yesterday = await bucket(database, account.id, cairoDayBefore());
    const today = await bucket(database, account.id, cairoDay());
    assert.equal(yesterday?.remaining, 0, 'yesterday is empty');
    assert.ok(today, 'today has a bucket');
    assert.equal(today?.granted_amount, DAILY_CREDIT_ALLOWANCE);
    assert.equal(
      await balance(database, account.id),
      DAILY_CREDIT_ALLOWANCE,
      "the balance is today's allowance, not yesterday's as well"
    );
    assert.equal(await ledgerCount(database, account.id, 'expire'), 1, 'the expiry was recorded');
  });

  test('the day is the Egypt-local one', async () => {
    // Half past eleven at night in Cairo is still the same day, whatever
    // UTC says.
    const rows = await database.query<{ day: string }>(
      `SELECT public.careerpilot_egypt_date('2026-03-01T23:30:00+02:00')::text AS day`
    );
    assert.equal(rows[0]?.day, '2026-03-01');

    const next = await database.query<{ day: string }>(
      `SELECT public.careerpilot_egypt_date('2026-03-01T22:30:00Z')::text AS day`
    );
    assert.equal(next[0]?.day, '2026-03-02', 'the same moment is the next day in Cairo');
  });

  /* --- Spending ----------------------------------------------------------- */

  test('is spent before the general balance', async () => {
    const account = await createAccount(database, 'entitlement-spent');

    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);
    await database.query(
      `SELECT * FROM public.grant_ai_credits(
         '${account.id}', 3, 'test-general-${Date.now()}', 'system', NULL, 'general', '{}'::jsonb
       )`
    );

    const outcome = await callJson<{ success: boolean; remaining_balance: number }>(
      database,
      `SELECT * FROM public.consume_ai_credits(
         '${account.id}', 'cv_ats_analysis', 1, 'test-spend-${Date.now()}', '{}'::jsonb
       )`
    );

    assert.equal(outcome.success, true, 'the spend went through');
    assert.equal(outcome.remaining_balance, DAILY_CREDIT_ALLOWANCE + 3 - 1);

    const today = await bucket(database, account.id);
    assert.equal(today?.remaining, DAILY_CREDIT_ALLOWANCE - 1, 'the expiring bucket paid first');
  });

  test('the balance the interface reads is the balance the ledger holds', async () => {
    const account = await createAccount(database, 'entitlement-balance');

    await database.query(`SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`);

    const state = await callJson<{
      daily_remaining: number;
      daily_allowance: number;
      claimed_today: boolean;
      plan_code: string;
      entitled: boolean;
    }>(database, `SELECT * FROM public.get_daily_credit_state('${account.id}')`);

    assert.equal(state.daily_remaining, DAILY_CREDIT_ALLOWANCE, 'the remaining count is the truth');
    assert.equal(state.daily_allowance, DAILY_CREDIT_ALLOWANCE, 'the allowance is the plan own');
    assert.equal(state.claimed_today, true, "today's allowance is already in the balance");
    assert.equal(state.plan_code, 'pro', 'the plan is named');
    assert.equal(state.entitled, true, 'the account is entitled');
    assert.equal(state.daily_remaining, await balance(database, account.id), 'the two agree');
  });

  test('the balance is the balance, even when one transaction writes two ledger rows', async () => {
    // The claim that expires yesterday's leftovers AND grants today's
    // allowance writes TWO ledger rows in ONE transaction: the expiry row
    // and the grant row.
    //
    // Those two rows used to share a timestamp — `created_at` was `now()`,
    // the START of the transaction — and the tie-break was `id DESC` on a
    // RANDOM uuid. The reader therefore picked between "the balance before
    // the grant" and "the balance after the grant" at random, and the
    // candidate saw their daily tokens disappear half of the time.
    //
    // Twelve accounts are used because a coin toss that lands right twelve
    // times in a row is not something a test should be trusted to catch:
    // with the old behaviour this test fails with a probability of
    // 1 - 2^-12.
    const wrong: string[] = [];

    for (let index = 0; index < 12; index += 1) {
      const account = await createAccount(database, `entitlement-ordering-${index}`);

      // Yesterday's allowance, still holding its tokens.
      await database.query(
        `SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`
      );
      await database.exec(
        `UPDATE public.daily_credit_grants SET grant_date = '${cairoDayBefore()}'
          WHERE profile_id = '${account.id}'`
      );
      await database.exec(
        `UPDATE public.ai_credit_ledger SET idempotency_key = idempotency_key || ':yesterday'
          WHERE profile_id = '${account.id}'`
      );

      // The claim that expires and grants, in one transaction.
      await database.query(
        `SELECT * FROM public.ensure_daily_credit_entitlement('${account.id}')`
      );

      const rows = await database.query<{ running_balance: number }>(
        `SELECT running_balance FROM public.ai_credit_ledger
          WHERE profile_id = '${account.id}'
          ORDER BY created_at DESC, id DESC LIMIT 1`
      );
      const reported = rows[0]?.running_balance ?? 0;
      const today = await bucket(database, account.id);

      if (reported !== DAILY_CREDIT_ALLOWANCE) {
        wrong.push(`${account.id}: ${reported} instead of ${DAILY_CREDIT_ALLOWANCE}`);
      }
      assert.equal(today?.remaining, DAILY_CREDIT_ALLOWANCE, 'the tokens are in the bucket');
    }

    assert.deepEqual(wrong, [], 'the balance that is read back includes the grant');
  });

  /* --- The free reward ---------------------------------------------------- */

  test('the free reward is still claimed by hand, and only once', async () => {
    const account = await createAccount(database, 'free-claim', { plan: null });

    const first = await callJson<{ granted: number }>(
      database,
      `SELECT * FROM public.claim_daily_credits('${account.id}', ${DAILY_CREDIT_ALLOWANCE})`
    );
    const second = await callJson<{ granted: number }>(
      database,
      `SELECT * FROM public.claim_daily_credits('${account.id}', ${DAILY_CREDIT_ALLOWANCE})`
    );

    assert.equal(first.granted, DAILY_CREDIT_ALLOWANCE, 'the first claim grants');
    assert.equal(second.granted, 0, 'the second claim grants nothing');
    assert.equal(await balance(database, account.id), DAILY_CREDIT_ALLOWANCE);
  });

  /* --- The boundary ------------------------------------------------------- */

  test('a candidate cannot grant themselves a credit', async () => {
    // The privileged functions are the server's, not the client's.
    const rows = await database.query<{ name: string; can_run: boolean }>(
      `SELECT name, has_function_privilege('authenticated', signature, 'EXECUTE') AS can_run
         FROM (
           SELECT 'ensure_daily_credit_entitlement' AS name,
                  'public.ensure_daily_credit_entitlement(uuid)' AS signature
           UNION ALL SELECT 'grant_daily_entitlements_to_all',
                  'public.grant_daily_entitlements_to_all()'
           UNION ALL SELECT 'claim_daily_credits',
                  'public.claim_daily_credits(uuid, integer)'
           UNION ALL SELECT 'grant_ai_credits',
                  'public.grant_ai_credits(uuid, integer, text, text, uuid, text, jsonb)'
         ) AS functions`
    );

    for (const row of rows) {
      assert.equal(row.can_run, false, `${row.name} is not the candidate's to call`);
    }

    // And the tables that hold the money cannot be written by a client at
    // all: the daily bucket has no policy, so a signed-in candidate can
    // neither read it nor write it.
    const policies = await database.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'daily_credit_grants'`
    );
    assert.equal(policies[0]?.count, 0, 'the daily bucket has no client policy');

    const ledgerPolicies = await database.query<{ cmd: string }>(
      `SELECT cmd FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'ai_credit_ledger'`
    );
    for (const policy of ledgerPolicies) {
      assert.equal(policy.cmd, 'SELECT', 'the ledger can only be read by a client');
    }
  });

  test('a candidate cannot change their own plan', async () => {
    // The only policy that writes a subscription is the administrator's, and
    // it asks for a super administrator.
    const policies = await database.query<{ policyname: string; cmd: string; qual: string }>(
      `SELECT policyname, cmd, qual AS qual FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'subscriptions' AND cmd IN ('INSERT', 'UPDATE', 'ALL')`
    );

    assert.ok(policies.length > 0, 'the write policy exists');
    for (const policy of policies) {
      assert.match(
        policy.qual,
        /admin_users/,
        `${policy.policyname} asks for an administrator`
      );
      assert.match(policy.qual, /super_admin/, `${policy.policyname} asks for a super administrator`);
    }

    // The plan table is the same: an administrator manages it, everybody else
    // may only read the plans that are on sale.
    const planPolicies = await database.query<{ policyname: string; cmd: string; qual: string }>(
      `SELECT policyname, cmd, qual AS qual FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'subscription_plans' AND cmd = 'ALL'`
    );
    for (const policy of planPolicies) {
      assert.match(policy.qual, /admin_users/, `${policy.policyname} asks for an administrator`);
    }
  });
});
