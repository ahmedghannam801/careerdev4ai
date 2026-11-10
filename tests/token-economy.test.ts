/**
 * The token economy's public contract.
 * ---------------------------------------------------------------------------
 * These are the numbers the interface shows and the server charges. They live
 * in the shared domain model so that both sides read the same source, and this
 * file is the guard that says they still agree.
 *
 * WHY THIS FILE EXISTS
 * The premium CV template's price was written out in three places: the
 * product constant, the comment beside it, and the test that checked it. They
 * drifted apart — the constant said five, the test said ten — and the result
 * was a platform that quoted one price and charged another. The test below
 * fails the moment the two sources disagree, which is the only thing that
 * actually prevents the drift.
 *
 * It is pure: no database, no API, no key.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CREDIT_PACKS,
  CREDIT_WEIGHTS,
  DAILY_CREDIT_ALLOWANCE,
  REFERRAL_REWARD_CREDITS,
} from '../shared/credits.ts';
import { CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS } from '../shared/cvTemplates.ts';

test.describe('the token economy', () => {
  test('the daily allowance is two tokens', () => {
    assert.equal(
      DAILY_CREDIT_ALLOWANCE,
      2,
      'the free daily allowance the product promises is two tokens'
    );
  });

  test('a premium CV template costs five tokens', () => {
    assert.equal(
      CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS,
      5,
      'the price of a premium CV template is five tokens'
    );
  });

  test('the price the interface shows is the price the server charges', () => {
    // The card, the unlock dialog and the token hub all read the product
    // constant; the server charges the action weight. If these two ever
    // disagree, the candidate is quoted one number and charged another.
    assert.equal(
      CREDIT_WEIGHTS.premium_template_unlock,
      CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS,
      'the server must charge exactly the price the interface quotes'
    );
  });

  test('a referral reward is never worth more than the daily allowance', () => {
    assert.ok(
      REFERRAL_REWARD_CREDITS <= DAILY_CREDIT_ALLOWANCE,
      'a referral cannot be worth more than a single day of the free allowance'
    );
  });

  test('the token packs are priced, named and described in both languages', () => {
    assert.equal(CREDIT_PACKS.length, 3, 'there are three token packs');

    for (const pack of CREDIT_PACKS) {
      assert.ok(pack.credits > 0, `${pack.id} grants tokens`);
      assert.ok(pack.pricePiasters > 0, `${pack.id} has a price`);
      assert.ok(pack.nameEn.length > 0, `${pack.id} has an English name`);
      assert.ok(pack.nameAr.length > 0, `${pack.id} has an Arabic name`);
    }

    // The packs are sold by size, and they are sold in order.
    const credits = CREDIT_PACKS.map((pack) => pack.credits);
    assert.deepEqual(
      [...credits].sort((a, b) => a - b),
      credits,
      'the packs are ordered from the smallest to the largest'
    );
  });
});
