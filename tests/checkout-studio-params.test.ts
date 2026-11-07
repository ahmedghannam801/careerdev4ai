// The Checkout Studio parameters.
//
// The hosted Checkout Session is created by one function with one parameter
// set. These tests hold that set to what was agreed, and hold the two rules
// that Stripe enforces around it:
//
//   * `submit_type` only exists on a one-time payment, and
//     `payment_method_collection` only exists on a subscription. Sending
//     either in the wrong mode is rejected by Stripe.
//
// The `ui_mode` rules are tested as well, because Stripe renamed the hosted
// checkout's mode and rejects the name that does not match the account's API
// version. The choice is made from the version Stripe itself reports, so the
// version parsing is part of the contract.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHECKOUT_INTEGRATION_IDENTIFIER,
  CHECKOUT_ORIGIN_CONTEXT,
  HOSTED_PAGE_UI_MODE_MIN_VERSION,
  alternateCheckoutUiMode,
  buildCheckoutStudioParams,
  isCheckoutUiModeRejection,
  parseStripeApiVersionDate,
  resolveCheckoutUiMode,
  supportsHostedPageUiMode,
} from '../server/stripe/checkoutParams.ts';

describe('the Checkout Studio parameter set', () => {
  test('a one-time payment carries the agreed parameters', () => {
    const params = buildCheckoutStudioParams({ mode: 'payment' });

    assert.equal(params.ui_mode, resolveCheckoutUiMode());
    assert.equal(params.billing_address_collection, 'auto');
    assert.deepEqual(params.phone_number_collection, { enabled: false });
    assert.deepEqual(params.automatic_tax, { enabled: false });
    assert.equal(params.allow_promotion_codes, false);
    assert.equal(params.origin_context, CHECKOUT_ORIGIN_CONTEXT);
    assert.equal(params.origin_context, 'web');
    assert.equal(params.integration_identifier, CHECKOUT_INTEGRATION_IDENTIFIER);
    assert.equal(params.integration_identifier, 'hosted_web_0002');
    assert.equal(params.submit_type, 'auto');
  });

  test('a subscription carries the agreed parameters', () => {
    const params = buildCheckoutStudioParams({ mode: 'subscription' });

    assert.equal(params.ui_mode, resolveCheckoutUiMode());
    assert.equal(params.billing_address_collection, 'auto');
    assert.deepEqual(params.phone_number_collection, { enabled: false });
    assert.deepEqual(params.automatic_tax, { enabled: false });
    assert.equal(params.allow_promotion_codes, false);
    assert.equal(params.origin_context, 'web');
    assert.equal(params.integration_identifier, 'hosted_web_0002');
    assert.equal(params.payment_method_collection, 'always');
  });

  test('a mode never carries the other mode\'s parameter', () => {
    // Stripe rejects `submit_type` on a subscription and
    // `payment_method_collection` in `payment` mode.
    const payment = buildCheckoutStudioParams({ mode: 'payment' });
    const subscription = buildCheckoutStudioParams({ mode: 'subscription' });

    assert.equal(payment.submit_type, 'auto');
    assert.equal(payment.payment_method_collection, undefined);

    assert.equal(subscription.payment_method_collection, 'always');
    assert.equal(subscription.submit_type, undefined);
  });

  test('the parameter set never carries the product type itself', () => {
    // `mode`, the URLs and the line items carry real values that only the
    // caller knows, so they must not be defaulted here.
    for (const mode of ['payment', 'subscription'] as const) {
      const params = buildCheckoutStudioParams({ mode });
      assert.equal(params.mode, undefined);
      assert.equal(params.success_url, undefined);
      assert.equal(params.cancel_url, undefined);
      assert.equal(params.line_items, undefined);
      assert.equal(params.customer, undefined);
    }
  });

  test('tax ID collection is off unless it is switched on, and then it works', () => {
    // Stripe refuses a session that asks for a tax ID from a customer whose
    // name and address it may not update, so the two always travel together.
    const previous = process.env.STRIPE_TAX_ID_COLLECTION;
    try {
      delete process.env.STRIPE_TAX_ID_COLLECTION;
      const off = buildCheckoutStudioParams({ mode: 'payment' });
      assert.equal(off.tax_id_collection, undefined);
      assert.equal(off.customer_update, undefined);

      process.env.STRIPE_TAX_ID_COLLECTION = 'true';
      const on = buildCheckoutStudioParams({ mode: 'payment' });
      assert.deepEqual(on.tax_id_collection, { enabled: true });
      assert.deepEqual(on.customer_update, { name: 'auto', address: 'auto' });
    } finally {
      if (previous === undefined) delete process.env.STRIPE_TAX_ID_COLLECTION;
      else process.env.STRIPE_TAX_ID_COLLECTION = previous;
    }
  });

  test('automatic tax follows the operator switch', () => {
    const previous = process.env.STRIPE_AUTOMATIC_TAX;
    try {
      delete process.env.STRIPE_AUTOMATIC_TAX;
      assert.deepEqual(buildCheckoutStudioParams({ mode: 'payment' }).automatic_tax, {
        enabled: false,
      });
      process.env.STRIPE_AUTOMATIC_TAX = 'true';
      assert.deepEqual(buildCheckoutStudioParams({ mode: 'payment' }).automatic_tax, {
        enabled: true,
      });
    } finally {
      if (previous === undefined) delete process.env.STRIPE_AUTOMATIC_TAX;
      else process.env.STRIPE_AUTOMATIC_TAX = previous;
    }
  });
});

describe('the user-interface mode follows the account version', () => {
  test('the API version date is read out of the version name', () => {
    assert.equal(parseStripeApiVersionDate('2026-10-28.endive'), '2026-10-28');
    assert.equal(parseStripeApiVersionDate('2026-03-25.dahlia'), '2026-03-25');
    assert.equal(parseStripeApiVersionDate('2026-03-25'), '2026-03-25');
    assert.equal(parseStripeApiVersionDate(null), null);
    assert.equal(parseStripeApiVersionDate(''), null);
    assert.equal(parseStripeApiVersionDate('not-a-version'), null);
  });

  test('a version from the renaming onwards knows the modern name', () => {
    assert.equal(supportsHostedPageUiMode('2026-03-25.dahlia'), true);
    assert.equal(supportsHostedPageUiMode('2026-10-28.endive'), true);
    assert.equal(supportsHostedPageUiMode('2027-01-01.anything'), true);
  });

  test('an older version only knows the older name', () => {
    assert.equal(supportsHostedPageUiMode('2025-09-30.clover'), false);
    assert.equal(supportsHostedPageUiMode('2025-12-01.basil'), false);
    assert.equal(supportsHostedPageUiMode('2026-03-24.dahlia'), false);
  });

  test('an unknown version is not claimed to know the modern name', () => {
    assert.equal(supportsHostedPageUiMode(null), false);
    assert.equal(supportsHostedPageUiMode(undefined), false);
  });

  test('the renaming version is the boundary', () => {
    assert.equal(HOSTED_PAGE_UI_MODE_MIN_VERSION, '2026-03-25');
  });

  test('an operator can pin the mode', () => {
    const previous = process.env.STRIPE_CHECKOUT_UI_MODE;
    try {
      process.env.STRIPE_CHECKOUT_UI_MODE = 'hosted';
      assert.equal(resolveCheckoutUiMode(), 'hosted');
      process.env.STRIPE_CHECKOUT_UI_MODE = 'hosted_page';
      assert.equal(resolveCheckoutUiMode(), 'hosted_page');
    } finally {
      if (previous === undefined) delete process.env.STRIPE_CHECKOUT_UI_MODE;
      else process.env.STRIPE_CHECKOUT_UI_MODE = previous;
    }
  });

  test('the two names are each other\'s alternative', () => {
    assert.equal(alternateCheckoutUiMode('hosted_page'), 'hosted');
    assert.equal(alternateCheckoutUiMode('hosted'), 'hosted_page');
  });
});

describe('a refusal of the mode is recognised, and only that', () => {
  test('a rejection that names ui_mode is recognised', () => {
    assert.equal(
      isCheckoutUiModeRejection({
        status: 400,
        type: 'invalid_request_error',
        message: 'The ui_mode value `hosted` is no longer supported. Use `hosted_page` instead.',
      }),
      true
    );
  });

  test('a rejection that names something else is not', () => {
    assert.equal(
      isCheckoutUiModeRejection({
        status: 400,
        type: 'invalid_request_error',
        message: 'No such price: price_missing',
      }),
      false
    );
  });

  test('another kind of failure is not retried', () => {
    assert.equal(
      isCheckoutUiModeRejection({ status: 401, type: 'invalid_request_error', message: 'ui_mode' }),
      false
    );
    assert.equal(
      isCheckoutUiModeRejection({
        status: 400,
        type: 'api_error',
        message: 'ui_mode is invalid',
      }),
      false
    );
    assert.equal(isCheckoutUiModeRejection(new Error('boom')), false);
    assert.equal(isCheckoutUiModeRejection(null), false);
  });
});
