/**
 * When may a candidate be offered a payment?
 *
 * XPay is the only gateway, and it is not configured yet. The rule that matters
 * most in this file is the negative one: there is no state — no missing key, no
 * empty method list, no failed status request — in which the pricing page or the
 * checkout dialog may open a checkout. Anything else would be a payment button
 * that cannot be honoured.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolvePaymentAvailability } from '../src/lib/paymentAvailability.ts';
import type { XPayStatus } from '../src/lib/xpayApi.ts';

function status(overrides: Partial<XPayStatus> = {}): XPayStatus {
  return {
    configured: true,
    mode: 'test',
    testMode: true,
    checkoutReady: true,
    config: {
      mode: 'test',
      configured: true,
      checkoutReady: true,
      errors: [],
      warnings: [],
    },
    paymentMethods: {
      methods: ['card', 'fawry'],
      methodsForEgp: ['card', 'fawry'],
      egpSupported: true,
      applePayWebsiteReady: false,
      currency: 'EGP',
      livemode: false,
      note: '',
    },
    activePurchase: null,
    sessions: [],
    ...overrides,
  } as XPayStatus;
}

describe('payment availability', () => {
  it('is the only answer that lets a checkout start', () => {
    const ready = resolvePaymentAvailability(status(), false);

    assert.equal(ready.state, 'ready');
    assert.equal(ready.canStartCheckout, true);
    assert.deepEqual(ready.methods, ['card', 'fawry']);
  });

  it('pauses while the server has not answered yet', () => {
    const checking = resolvePaymentAvailability(null, true);

    assert.equal(checking.state, 'checking');
    assert.equal(checking.canStartCheckout, false);
    assert.equal(checking.reason, 'checking');
  });

  it('pauses when the status request failed outright', () => {
    const unreachable = resolvePaymentAvailability(null, false);

    assert.equal(unreachable.state, 'unavailable');
    assert.equal(unreachable.reason, 'unreachable');
    assert.equal(unreachable.canStartCheckout, false);
    // And it says nothing was charged, which is the only question a candidate
    // with a card in hand is asking.
    assert.match(unreachable.messageKey, /Nothing was charged/);
  });

  it('treats a missing key, a missing secret and a live switch as paused', () => {
    for (const override of [
      { configured: false },
      { checkoutReady: false },
      { checkoutReady: false, configured: false },
    ]) {
      const paused = resolvePaymentAvailability(status(override), false);
      assert.equal(paused.canStartCheckout, false, JSON.stringify(override));
      assert.equal(paused.reason, 'not_configured');
    }
  });

  it('pauses when the account cannot take Egyptian pounds', () => {
    const paused = resolvePaymentAvailability(
      status({
        paymentMethods: {
          methods: ['card'],
          methodsForEgp: [],
          egpSupported: false,
          applePayWebsiteReady: false,
          currency: 'USD',
          livemode: false,
          note: '',
        },
      }),
      false
    );

    assert.equal(paused.reason, 'egp_not_supported');
    assert.equal(paused.canStartCheckout, false);
  });

  it('pauses when the account has no method enabled, and never invents one', () => {
    const paused = resolvePaymentAvailability(
      status({
        paymentMethods: {
          methods: [],
          methodsForEgp: [],
          egpSupported: true,
          applePayWebsiteReady: false,
          currency: 'EGP',
          livemode: false,
          note: '',
        },
      }),
      false
    );

    assert.equal(paused.reason, 'no_methods');
    assert.equal(paused.canStartCheckout, false);
    assert.deepEqual(paused.methods, []);
  });

  it('does not claim a method the account did not return', () => {
    const onlyFawry = resolvePaymentAvailability(
      status({
        paymentMethods: {
          methods: ['fawry'],
          methodsForEgp: ['fawry'],
          egpSupported: true,
          applePayWebsiteReady: false,
          currency: 'EGP',
          livemode: false,
          note: '',
        },
      }),
      false
    );

    assert.deepEqual(onlyFawry.methods, ['fawry']);
    assert.equal(onlyFawry.methods.includes('card'), false);
  });

  it('every paused state carries a heading and a sentence, in both languages', async () => {
    const pausedStates = [
      resolvePaymentAvailability(null, true),
      resolvePaymentAvailability(null, false),
      resolvePaymentAvailability(status({ configured: false }), false),
      resolvePaymentAvailability(status({ checkoutReady: false }), false),
    ];

    const { subscriptionsAr } = await import('../src/translations/parts/subscriptions.ts');

    for (const paused of pausedStates) {
      assert.ok(paused.titleKey, 'a paused state needs a heading');
      assert.ok(paused.messageKey, 'a paused state needs a sentence');
      assert.ok(paused.actionLabelKey, 'a paused state needs a button label');
      // The Arabic dictionary is the proof that the copy is bilingual.
      const dictionary = subscriptionsAr as Record<string, string>;
      assert.ok(dictionary[paused.titleKey], `${paused.titleKey} has no Arabic entry`);
      assert.ok(dictionary[paused.messageKey], `${paused.messageKey} has no Arabic entry`);
      assert.ok(dictionary[paused.actionLabelKey], `${paused.actionLabelKey} has no Arabic entry`);
    }
  });
});
