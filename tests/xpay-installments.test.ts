/**
 * Annual subscriptions grant their token allowance month by month.
 *
 * The failure this file exists to prevent is the easy one: treating a year's
 * payment as a year's tokens and dropping 1,020 credits on the candidate on day
 * one. The second failure is the quieter one: a sweep that runs twice and pays
 * month two twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonths,
  annualInstallmentKey,
  annualInstallmentMonths,
  dueAnnualInstallmentMonths,
  grantDueAnnualTokenInstallments,
  type AnnualInstallmentDeps,
} from '../server/xpay/installments.ts';
import type { XPayPurchaseRow } from '../server/xpay/store.ts';

const START = new Date('2026-01-15T09:00:00.000Z');
const END = new Date('2027-01-15T09:00:00.000Z');

test('whole months clamp to the last day instead of rolling into the next month', () => {
  assert.equal(
    addMonths(new Date('2026-01-31T10:00:00.000Z'), 1).toISOString(),
    '2026-02-28T10:00:00.000Z'
  );
  // A leap year keeps the 29th, which is the day that exists.
  assert.equal(
    addMonths(new Date('2028-01-31T10:00:00.000Z'), 1).toISOString(),
    '2028-02-29T10:00:00.000Z'
  );
  assert.equal(
    addMonths(new Date('2026-01-31T10:00:00.000Z'), 2).toISOString(),
    '2026-03-31T10:00:00.000Z'
  );
});

test('a twelve-month period has eleven later allowances, never twelve', () => {
  assert.deepEqual(annualInstallmentMonths(START, END), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('only the months that have arrived are due', () => {
  assert.deepEqual(dueAnnualInstallmentMonths(START, END, START), []);
  assert.deepEqual(
    dueAnnualInstallmentMonths(START, END, new Date('2026-02-15T09:00:00.000Z')),
    [2]
  );
  assert.deepEqual(
    dueAnnualInstallmentMonths(START, END, new Date('2026-03-20T09:00:00.000Z')),
    [2, 3]
  );
  // One second before the second month's anniversary, only month one is spent.
  assert.deepEqual(
    dueAnnualInstallmentMonths(START, END, new Date('2026-02-15T08:59:59.000Z')),
    []
  );
});

test('month one and every later month have distinct ledger keys', () => {
  assert.equal(annualInstallmentKey('cs_1', 1), 'xpay-plan:cs_1');
  assert.equal(annualInstallmentKey('cs_1', 2), 'xpay-plan:cs_1:m2');
  assert.equal(annualInstallmentKey('cs_1', 12), 'xpay-plan:cs_1:m12');
});

function purchase(overrides: Partial<XPayPurchaseRow> = {}): XPayPurchaseRow {
  return {
    id: 'purchase_1',
    profile_id: '11111111-1111-4111-8111-111111111111',
    session_id: 'cs_annual_1',
    purchase_kind: 'subscription',
    plan_code: 'career_plus',
    billing_cycle: 'annual',
    pack_id: null,
    credits: 85,
    amount_total: 179000,
    currency: 'EGP',
    payment_method_type: 'card',
    livemode: false,
    access_starts_at: START.toISOString(),
    access_ends_at: END.toISOString(),
    status: 'active',
    metadata: {},
    created_at: START.toISOString(),
    ...overrides,
  };
}

function harness(rows: XPayPurchaseRow[], monthlyCredits = 85, current = true) {
  const keys: string[] = [];
  const dontGrant = new Set<string>();
  const deps: AnnualInstallmentDeps = {
    listPurchases: async () => rows,
    isCurrentPurchase: async () => current,
    getPlanByCode: (async () => ({ monthlyAiCredits: monthlyCredits })) as unknown as
      AnnualInstallmentDeps['getPlanByCode'],
    grantCredits: (async (input: { idempotencyKey: string; amount: number }) => {
      if (dontGrant.has(input.idempotencyKey)) throw new Error('ledger unavailable');
      if (keys.includes(input.idempotencyKey)) return { granted: false } as never;
      keys.push(input.idempotencyKey);
      return { granted: true } as never;
    }) as unknown as AnnualInstallmentDeps['grantCredits'],
  };
  return { deps, keys, dontGrant };
}

test('a sweep grants each due month once, then only the new month', async () => {
  const { deps, keys } = harness([purchase()]);

  const first = await grantDueAnnualTokenInstallments(
    new Date('2026-03-15T09:00:00.000Z'),
    deps
  );
  assert.deepEqual(first, { periods: 1, granted: 2, skipped: 0, failed: 0 });
  assert.deepEqual(keys, ['xpay-plan:cs_annual_1:m2', 'xpay-plan:cs_annual_1:m3']);

  // The scheduler runs again an hour later: nothing new is due.
  const second = await grantDueAnnualTokenInstallments(
    new Date('2026-03-15T10:00:00.000Z'),
    deps
  );
  // The period is examined again, but both keys are already spent.
  assert.deepEqual(second, { periods: 1, granted: 0, skipped: 2, failed: 0 });
  assert.equal(keys.length, 2, 'a repeated sweep must not pay a month twice');

  // A month later, exactly one new key is written.
  const third = await grantDueAnnualTokenInstallments(
    new Date('2026-04-15T09:00:00.000Z'),
    deps
  );
  assert.deepEqual(third, { periods: 1, granted: 1, skipped: 2, failed: 0 });
  assert.equal(keys[2], 'xpay-plan:cs_annual_1:m4');
});

test('the full year never exceeds eleven later grants plus the webhook month', async () => {
  const { deps, keys } = harness([purchase()]);
  await grantDueAnnualTokenInstallments(new Date('2027-02-01T00:00:00.000Z'), deps);

  // Months 2..12: eleven monthly allowances, and month one came from the paid
  // webhook, so the year totals twelve grants of 85 — not 1,020 at once.
  assert.equal(keys.length, 11);
  assert.equal(keys.at(-1), 'xpay-plan:cs_annual_1:m12');
});

test('an expired period grants nothing, whatever the schedule says', async () => {
  const { deps, keys } = harness([
    purchase({ access_ends_at: '2026-02-01T00:00:00.000Z' }),
  ]);
  const outcome = await grantDueAnnualTokenInstallments(
    new Date('2026-06-01T00:00:00.000Z'),
    deps
  );
  assert.deepEqual(outcome, { periods: 0, granted: 0, skipped: 0, failed: 0 });
  assert.equal(keys.length, 0);
});

test('a failed month is retried with the same key and cannot double-pay an earlier one', async () => {
  const { deps, keys, dontGrant } = harness([purchase()]);
  dontGrant.add('xpay-plan:cs_annual_1:m2');

  const first = await grantDueAnnualTokenInstallments(
    new Date('2026-03-15T09:00:00.000Z'),
    deps
  );
  assert.deepEqual(first, { periods: 1, granted: 1, skipped: 0, failed: 1 });

  dontGrant.clear();
  const second = await grantDueAnnualTokenInstallments(
    new Date('2026-03-15T10:00:00.000Z'),
    deps
  );
  assert.deepEqual(second, { periods: 1, granted: 1, skipped: 1, failed: 0 });
  assert.deepEqual(keys, ['xpay-plan:cs_annual_1:m3', 'xpay-plan:cs_annual_1:m2']);
});

test('a superseded annual purchase stops paying tokens', async () => {
  // An upgrade leaves the old row active until its original end date, but the
  // account is on the new session now. Only that session may pay an allowance.
  const { deps, keys } = harness([purchase()], 85, false);
  const outcome = await grantDueAnnualTokenInstallments(
    new Date('2026-06-01T00:00:00.000Z'),
    deps
  );
  assert.deepEqual(outcome, { periods: 0, granted: 0, skipped: 0, failed: 0 });
  assert.equal(keys.length, 0);
});

test('a plan without a monthly allowance is skipped rather than granted zero', async () => {
  const { deps, keys } = harness([purchase()], 0);
  const outcome = await grantDueAnnualTokenInstallments(
    new Date('2026-06-01T00:00:00.000Z'),
    deps
  );
  assert.deepEqual(outcome, { periods: 0, granted: 0, skipped: 0, failed: 0 });
  assert.equal(keys.length, 0);
});
