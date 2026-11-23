/**
 * The XPay integration, without a network.
 *
 * Three things are worth testing before any credential exists, because each of
 * them is a way to lose money or to give away a plan:
 *
 *   * the signature check, including a body that was altered after signing and
 *     a delivery replayed outside the five-minute window;
 *   * the checkout body, because the amount on the hosted page is the amount
 *     the candidate is charged;
 *   * fulfilment, because a Fawry session completes before it is paid, and a
 *     retried webhook must not grant a second period.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeXPaySignature,
  constantTimeEqualHex,
  parseSignatureHeader,
  verifyXPaySignature,
} from '../server/xpay/signature.ts';
import {
  addBillingPeriod,
  fulfillPaidSession,
  processXPayEvent,
  readVoucher,
  type XPayEvent,
  type XPayFulfillmentDeps,
} from '../server/xpay/webhooks.ts';
import {
  buildCheckoutBody,
  purchaseAmount,
  purchaseEntitlement,
  type XPaySessionResponse,
} from '../server/xpay/checkout.ts';
import { normalizeAccount } from '../server/xpay/account.ts';

const SECRET = 'whsec_test_secret_value';
const NOW = 1_760_000_000;

async function header(body: string, timestamp = NOW, secret = SECRET): Promise<string> {
  const signature = await computeXPaySignature(body, timestamp, secret);
  return `t=${timestamp},v1=${signature}`;
}

test('a signed body verifies, and the same body altered does not', async () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const signed = await header(body);

  assert.deepEqual(await verifyXPaySignature(body, signed, SECRET, NOW), { valid: true });

  // One character of the payload changed after signing.
  const tampered = body.replace('evt_1', 'evt_2');
  assert.deepEqual(await verifyXPaySignature(tampered, signed, SECRET, NOW), {
    valid: false,
    reason: 'signature_mismatch',
  });
});

test('a delivery older than five minutes is refused in both directions', async () => {
  const body = '{"id":"evt_1"}';
  const signed = await header(body);

  assert.deepEqual(await verifyXPaySignature(body, signed, SECRET, NOW + 301), {
    valid: false,
    reason: 'timestamp_out_of_tolerance',
  });
  assert.deepEqual(await verifyXPaySignature(body, signed, SECRET, NOW - 301), {
    valid: false,
    reason: 'timestamp_out_of_tolerance',
  });
  // Exactly on the boundary is still inside the window.
  assert.deepEqual(await verifyXPaySignature(body, signed, SECRET, NOW + 300), { valid: true });
});

test('a wrong secret, a missing header and a malformed header are all refusals', async () => {
  const body = '{"id":"evt_1"}';
  const signed = await header(body);

  assert.deepEqual(await verifyXPaySignature(body, signed, 'whsec_other', NOW), {
    valid: false,
    reason: 'signature_mismatch',
  });
  assert.deepEqual(await verifyXPaySignature(body, null, SECRET, NOW), {
    valid: false,
    reason: 'missing_header',
  });
  assert.deepEqual(await verifyXPaySignature(body, '', SECRET, NOW), {
    valid: false,
    reason: 'missing_header',
  });
  assert.deepEqual(await verifyXPaySignature(body, undefined, SECRET, NOW), {
    valid: false,
    reason: 'missing_header',
  });
  assert.deepEqual(await verifyXPaySignature(body, signed, null, NOW), {
    valid: false,
    reason: 'secret_missing',
  });
  for (const bad of ['v1=abc', 't=abc,v1=def', 't=1760000000', 't=1760000000,v1=zzzz']) {
    const result = await verifyXPaySignature(body, bad, SECRET, NOW);
    assert.equal(result.valid, false, `expected ${bad} to be refused`);
  }
});

test('the header parser reads both fields and rejects what it cannot verify', () => {
  const digest = 'a'.repeat(64);

  assert.deepEqual(parseSignatureHeader(`t=1730000000,v1=${digest}`), {
    timestamp: 1730000000,
    signature: digest,
  });
  // Uppercase hex is the same digest.
  assert.equal(parseSignatureHeader(`t=1730000000,v1=${'A'.repeat(64)}`)?.signature, 'a'.repeat(64));

  assert.equal(parseSignatureHeader(''), null);
  assert.equal(parseSignatureHeader('t=,v1='), null);
  // A digest that cannot be an HMAC-SHA256 hex is not a signature.
  assert.equal(parseSignatureHeader('t=1730000000,v1=a1b2c3d4'), null);
  assert.equal(parseSignatureHeader('t=notanumber,v1=' + digest), null);
});

test('the constant-time comparison refuses different lengths and different bytes', () => {
  assert.equal(constantTimeEqualHex('abcd', 'abcd'), true);
  assert.equal(constantTimeEqualHex('abcd', 'abce'), false);
  assert.equal(constantTimeEqualHex('abcd', 'abcde'), false);
});

const plan = {
  id: 'plan_1',
  code: 'career_plus' as const,
  nameEn: 'Career Plus',
  nameAr: 'كارير بلس',
  descriptionEn: null,
  descriptionAr: null,
  priceMonthlyPiasters: 29900,
  priceAnnualPiasters: 249900,
  currency: 'EGP' as const,
  monthlyAiCredits: 200,
  features: {},
  sortOrder: 1,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const pack = {
  id: 'pack_40',
  credits: 40,
  pricePiasters: 9900,
  currency: 'EGP' as const,
  nameEn: 'Booster Pack',
  nameAr: 'باقة الدعم',
};

test('an EGP price is sent as the catalogue stores it, in piasters', () => {
  const purchase = { kind: 'subscription' as const, plan, billingCycle: 'monthly' as const };
  const amount = purchaseAmount(purchase);
  assert.deepEqual(amount, { listAmount: 29900, discountAmount: 0, chargeAmount: 29900 });

  const body = buildCheckoutBody({
    purchase,
    profileId: '11111111-1111-4111-8111-111111111111',
    email: 'candidate@example.com',
    amount,
    origin: 'https://aionvia.pages.dev/',
    locale: 'ar',
  });

  assert.equal(body.lineItems[0].priceData.unitAmount, 29900);
  assert.equal(body.lineItems[0].priceData.currency, 'EGP');
  assert.equal(body.mode, 'payment');
  assert.equal(body.submitType, 'PAY');
  assert.equal(body.locale, 'ar');
  assert.deepEqual(body.metadata.plan_code, 'career_plus');
  assert.deepEqual(body.metadata.billing_cycle, 'monthly');
  assert.equal(body.metadata.profile_id, '11111111-1111-4111-8111-111111111111');
  // The candidate id is the customer key, so no mapping table is needed.
  assert.equal(body.externalCustomerId, '11111111-1111-4111-8111-111111111111');
  // XPay fills the session id into the return URL.
  assert.match(body.afterCompletion.redirect.url, /\{CHECKOUT_SESSION_ID\}$/);
  assert.match(body.cancelUrl, /xpay=cancelled$/);
});

test('a discount never exceeds the price and is recorded on the session', () => {
  const purchase = { kind: 'credit_pack' as const, pack };
  assert.deepEqual(purchaseAmount(purchase, 2500), {
    listAmount: 9900,
    discountAmount: 2500,
    chargeAmount: 7400,
  });
  // A coupon worth more than the pack cannot make it free in reverse.
  assert.deepEqual(purchaseAmount(purchase, 999_999), {
    listAmount: 9900,
    discountAmount: 9900,
    chargeAmount: 0,
  });

  const body = buildCheckoutBody({
    purchase,
    profileId: '11111111-1111-4111-8111-111111111111',
    amount: purchaseAmount(purchase, 2500),
    origin: 'https://aionvia.pages.dev',
    locale: 'en',
    couponCode: 'WELCOME25',
  });
  assert.equal(body.lineItems[0].priceData.unitAmount, 7400);
  assert.equal(body.metadata.credit_pack_id, 'pack_40');
  assert.equal(body.metadata.credits, '40');
  assert.equal(body.metadata.coupon_code, 'WELCOME25');
  assert.equal(body.metadata.discount_amount, '2500');
  assert.equal(purchaseEntitlement(purchase).credits, 40);
});

function session(overrides: Partial<XPaySessionResponse> = {}): XPaySessionResponse {
  return {
    id: 'cs_test_abc123',
    object: 'checkout.session',
    status: 'complete',
    paymentStatus: 'paid',
    url: 'https://checkout.xpay.app/c/cs_test_abc123',
    currency: 'EGP',
    amountTotal: 29900,
    livemode: false,
    externalCustomerId: '11111111-1111-4111-8111-111111111111',
    paymentIntentId: 'pi_test_1',
    metadata: {
      profile_id: '11111111-1111-4111-8111-111111111111',
      purchase_kind: 'subscription',
      plan_code: 'career_plus',
      billing_cycle: 'monthly',
      list_amount: '29900',
    },
    ...overrides,
  };
}

interface Harness {
  deps: XPayFulfillmentDeps;
  granted: Array<{ amount: number; key: string }>;
  purchases: Array<{ sessionId: string; planCode: string | null }>;
  events: Set<string>;
}

function harness(): Harness {
  const purchases: Harness['purchases'] = [];
  const granted: Harness['granted'] = [];
  const events = new Set<string>();
  let sessionRow: Record<string, unknown> | null = null;

  const deps = {
    getPlanByCode: (async () => plan) as unknown as XPayFulfillmentDeps['getPlanByCode'],
    grantCredits: (async (input: { amount: number; idempotencyKey: string }) => {
      granted.push({ amount: input.amount, key: input.idempotencyKey });
      return { granted: true } as never;
    }) as unknown as XPayFulfillmentDeps['grantCredits'],
    recordPurchase: (async (input: Record<string, unknown>) => {
      if (purchases.some((entry) => entry.sessionId === input.sessionId)) return null;
      purchases.push({
        sessionId: String(input.sessionId),
        planCode: (input.planCode as string | null) ?? null,
      });
      return { session_id: input.sessionId, ...input } as never;
    }) as unknown as XPayFulfillmentDeps['recordPurchase'],
    getPurchaseBySession: (async (sessionId: string) => {
      const found = purchases.find((entry) => entry.sessionId === sessionId);
      return found ? ({ session_id: found.sessionId, plan_code: found.planCode } as never) : null;
    }) as unknown as XPayFulfillmentDeps['getPurchaseBySession'],
    // Mirrors the shape the store returns: the database row, in snake case.
    upsertSession: (async (input: Record<string, unknown>) => {
      sessionRow = {
        id: input.id,
        profile_id: input.profileId,
        purchase_kind: input.purchaseKind,
        plan_code: input.planCode,
        billing_cycle: input.billingCycle,
        pack_id: input.packId,
        credits: input.credits,
        list_amount: input.listAmount,
        discount_amount: input.discountAmount,
        amount_total: input.amountTotal,
        currency: input.currency,
        status: input.status,
        payment_status: input.paymentStatus,
        payment_method_type: input.paymentMethodType,
        payment_intent_id: input.paymentIntentId,
        voucher_reference: input.voucherReference,
        voucher_expires_at: input.voucherExpiresAt,
        coupon_code: input.couponCode,
        livemode: input.livemode,
        metadata: input.metadata,
      };
      return sessionRow as never;
    }) as unknown as XPayFulfillmentDeps['upsertSession'],
    recordEvent: (async (event: { id: string }) => {
      if (events.has(event.id)) return 'duplicate' as const;
      events.add(event.id);
      return 'new' as const;
    }) as unknown as XPayFulfillmentDeps['recordEvent'],
    markEventProcessed: (async () => undefined) as unknown as XPayFulfillmentDeps['markEventProcessed'],
  } as XPayFulfillmentDeps;

  return { deps, granted, purchases, events };
}

function event(type: string, object: XPaySessionResponse, id = 'evt_1'): XPayEvent {
  return { id, type, livemode: false, data: { object } };
}

test('a Fawry checkout that completes unpaid grants nothing', async () => {
  const { deps, purchases } = harness();
  const fawry = session({ paymentStatus: 'unpaid', paymentIntentId: 'pi_test_fawry' });

  await processXPayEvent(event('checkout.session.completed', fawry), deps);
  assert.equal(purchases.length, 0, 'an unpaid completion must not grant a plan');

  // The customer pays at the outlet; the money is what activates the plan.
  await processXPayEvent(
    event('checkout.session.async_payment_succeeded', session({ paymentStatus: 'paid' }), 'evt_2'),
    deps
  );
  assert.deepEqual(purchases, [{ sessionId: 'cs_test_abc123', planCode: 'career_plus' }]);
});

test('a card payment that completes paid grants one period, once', async () => {
  const { deps, purchases, granted } = harness();

  await processXPayEvent(event('checkout.session.completed', session()), deps);
  assert.equal(purchases.length, 1);
  // The plan's monthly AI tokens are granted alongside the period.
  assert.deepEqual(granted, [{ amount: 200, key: 'xpay-plan:cs_test_abc123' }]);

  // The same session delivered again under a new event id: the unique purchase
  // row stops a second period, and the credit key stops a second grant.
  await processXPayEvent(
    event('checkout.session.async_payment_succeeded', session(), 'evt_retry'),
    deps
  );
  assert.equal(purchases.length, 1);
  assert.equal(granted.length, 1);
});

test('a redelivered event id is acknowledged without running again', async () => {
  const { deps, purchases } = harness();

  const first = await processXPayEvent(event('checkout.session.completed', session()), deps);
  const second = await processXPayEvent(event('checkout.session.completed', session()), deps);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.deepEqual(second.handled, []);
  assert.equal(purchases.length, 1);
});

test('an async payment that fails leaves the session unpaid and grants nothing', async () => {
  const { deps, purchases } = harness();

  await processXPayEvent(
    event('checkout.session.async_payment_failed', session({ paymentStatus: 'unpaid' })),
    deps
  );
  assert.equal(purchases.length, 0);
});

test('a credit pack is granted with the session id as its idempotency key', async () => {
  const { deps, granted, purchases } = harness();
  const packSession = session({
    amountTotal: 9900,
    metadata: {
      profile_id: '11111111-1111-4111-8111-111111111111',
      purchase_kind: 'credit_pack',
      credit_pack_id: 'pack_40',
      credits: '40',
      list_amount: '9900',
    },
  });

  await processXPayEvent(event('checkout.session.completed', packSession), deps);

  assert.equal(purchases.length, 1);
  assert.deepEqual(granted, [{ amount: 40, key: 'xpay-pack:cs_test_abc123' }]);
});

test('a paid session with no candidate on it is acknowledged, not retried forever', async () => {
  const { deps, purchases } = harness();
  const orphan = session({ metadata: {}, externalCustomerId: null });

  const result = await processXPayEvent(event('checkout.session.completed', orphan), deps);
  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'unlinked_session');
  assert.equal(purchases.length, 0);
});

test('the Fawry reference is read from the payment intent when it is there', () => {
  const fawry = session({
    paymentStatus: 'unpaid',
    paymentIntent: {
      id: 'pi_test_fawry',
      nextAction: {
        displayVoucherDetails: { reference: '738291', expiresAt: '2026-11-30T12:00:00.000Z' },
      },
    },
  });
  assert.deepEqual(readVoucher(fawry), {
    reference: '738291',
    expiresAt: '2026-11-30T12:00:00.000Z',
  });
  assert.deepEqual(readVoucher(session()), { reference: null, expiresAt: null });
});

test('a period ends on the same day next month, and February does not roll over', () => {
  assert.equal(
    addBillingPeriod(new Date('2026-01-31T10:00:00.000Z'), 'monthly').toISOString(),
    '2026-02-28T10:00:00.000Z'
  );
  assert.equal(
    addBillingPeriod(new Date('2026-03-15T10:00:00.000Z'), 'annual').toISOString(),
    '2027-03-15T10:00:00.000Z'
  );
  assert.equal(
    addBillingPeriod(new Date('2026-11-30T00:00:00.000Z'), 'monthly').toISOString(),
    '2026-12-30T00:00:00.000Z'
  );
});

test('the account reports only the methods it is provisioned for', () => {
  const account = normalizeAccount({
    id: 'acct_1',
    displayName: 'Aionvia',
    country: 'EG',
    defaultCurrency: 'EGP',
    defaultLocale: 'ar',
    livemode: false,
    supportedCurrencies: [
      { code: 'EGP', decimals: 2, paymentMethodTypes: ['card', 'fawry', 'valu', 'apple_pay'] },
      { code: 'USD', decimals: 2, paymentMethodTypes: ['card', 'not_a_method'] },
      { code: 'BAD', decimals: 'x' },
    ],
    wallets: [{ type: 'apple_pay', websiteReady: true }, { type: 'unknown' }],
  });

  assert.equal(account.id, 'acct_1');
  assert.equal(account.defaultCurrency, 'EGP');
  assert.equal(account.currencies.length, 2);
  assert.deepEqual(account.currencies[0].paymentMethodTypes, ['card', 'fawry', 'valu', 'apple_pay']);
  // An unknown method is dropped rather than displayed.
  assert.deepEqual(account.currencies[1].paymentMethodTypes, ['card']);
  assert.deepEqual(account.wallets, [{ type: 'apple_pay', websiteReady: true }]);
});

test('a paid session is only fulfilled when the money is in', async () => {
  const { deps, purchases } = harness();

  assert.equal(await fulfillPaidSession(session({ paymentStatus: 'unpaid' }), deps), null);
  assert.equal(purchases.length, 0);

  const fulfilled = await fulfillPaidSession(session(), deps);
  assert.ok(fulfilled?.created);
  assert.equal(purchases.length, 1);
});
