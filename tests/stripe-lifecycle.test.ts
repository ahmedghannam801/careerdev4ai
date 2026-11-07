// Stripe lifecycle — pure tests with injected dependencies.
//
// These exercise the exact rules that decide whether money becomes an
// entitlement or revenue:
//
//   * a browser redirect never grants anything; only a verified event does
//   * an unpaid asynchronous payment grants nothing until Stripe confirms it
//   * a duplicate event id is acknowledged without side effects
//   * a different event id for the same purchase still grants exactly once
//   * a failed invoice never grants the monthly allowance
//   * refunds reduce revenue once; test invoices never do
//   * a permanent metadata error is acknowledged instead of retried forever
//
// No Stripe key and no database are needed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  creditPackFromMetadata,
  packIdempotencyKey,
  PermanentStripeEventError,
  processStripeEvent,
  type StripeWebhookDeps,
} from '../server/stripe/webhooks.ts';
import { describeStripeConfig } from '../server/stripe/config.ts';
import { buildCatalog, validatePriceAgainstCatalog } from '../server/stripe/catalog.ts';
import { computeAdminRevenue, parseRevenueDateRange } from '../server/stripe/revenue.ts';
import type {
  StripeCharge,
  StripeEvent,
  StripeInvoice,
  StripeRefund,
  StripeSubscription,
} from '../server/stripe/types.ts';

const PROFILE_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = 'cus_test_1';

function plan(code: string) {
  return {
    id: `plan-${code}`,
    code,
    nameEn: code === 'pro' ? 'Pro' : 'Student',
    nameAr: code === 'pro' ? 'برو' : 'طالب',
    descriptionEn: null,
    descriptionAr: null,
    priceMonthlyPiasters: code === 'pro' ? 17900 : 9900,
    priceAnnualPiasters: code === 'pro' ? 179000 : 99900,
    currency: 'EGP' as const,
    monthlyAiCredits: code === 'pro' ? 60 : 30,
    features: {},
    sortOrder: 1,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeDeps() {
  // The state of every event the handler has seen. A recorded event that
  // failed is not the same as a processed one: Stripe redelivers a failed
  // event, and the redelivery has to be processed again.
  const events = new Map<string, 'recorded' | 'failed' | 'processed'>();
  const subscriptions = new Map<string, any>();
  const invoices = new Map<string, any>();
  const refunds = new Map<string, any>();
  const disputes = new Map<string, any>();
  const creditKeys = new Set<string>();
  const credits: Array<{ profileId: string; amount: number; key: string }> = [];
  const processed: Array<{ id: string; failure: string | null; acknowledged: boolean }> = [];
  const customerUpdates: Array<{ id: string; email: string | null; deleted: boolean }> = [];

  const subscription: StripeSubscription = {
    id: 'sub_test_1',
    customer: CUSTOMER_ID,
    status: 'active',
    current_period_start: 1760000000,
    current_period_end: 1790000000,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    trial_end: null,
    latest_invoice: 'in_test_1',
    livemode: false,
    metadata: { profile_id: PROFILE_ID, plan_code: 'pro', billing_cycle: 'monthly', monthly_credits: '60' },
    items: {
      data: [
        {
          id: 'si_1',
          quantity: 1,
          price: {
            id: 'price_pro_monthly',
            product: 'prod_pro',
            currency: 'egp',
            unit_amount: 17900,
            lookup_key: 'careerdev4ai_pro_monthly',
            active: true,
            livemode: false,
            recurring: { interval: 'month', interval_count: 1 },
            metadata: {},
          },
        },
      ],
    },
  };

  const invoice: StripeInvoice = {
    id: 'in_test_1',
    object: 'invoice',
    customer: CUSTOMER_ID,
    subscription: 'sub_test_1',
    payment_intent: 'pi_sub_1',
    status: 'paid',
    billing_reason: 'subscription_create',
    number: 'INV-1',
    currency: 'egp',
    amount_due: 17900,
    amount_paid: 17900,
    amount_remaining: 0,
    hosted_invoice_url: 'https://example.test/invoice',
    invoice_pdf: null,
    period_start: 1760000000,
    period_end: 1790000000,
    paid: true,
    livemode: false,
    created: 1760000000,
    metadata: { profile_id: PROFILE_ID, plan_code: 'pro', billing_cycle: 'monthly' },
  };

  const deps: StripeWebhookDeps = {
    recordEvent: async (event) => {
      const state = events.get(event.id);
      if (!state) {
        events.set(event.id, 'recorded');
        return 'new';
      }
      // A previous attempt failed transiently: the side effects never
      // completed, so this redelivery must be processed again.
      if (state === 'failed') return 'retry';
      return 'duplicate';
    },
    markEventProcessed: async (eventId, failure, acknowledged = false) => {
      processed.push({ id: eventId, failure, acknowledged: Boolean(acknowledged) });
      if (failure && !acknowledged) {
        events.set(eventId, 'failed');
      } else {
        events.set(eventId, 'processed');
      }
    },
    getCustomerByStripeId: async (customerId) =>
      customerId === CUSTOMER_ID
        ? {
            profile_id: PROFILE_ID,
            stripe_customer_id: CUSTOMER_ID,
            email: null,
            livemode: false,
            deleted: false,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          }
        : null,
    getPlanByCode: async (code) => (code === 'pro' || code === 'student' ? (plan(code) as any) : null),
    upsertSubscription: async (input) => {
      subscriptions.set(input.subscription.id, input);
      return input.subscription as any;
    },
    upsertInvoice: async (row, profileId, options = {}) => {
      invoices.set(row.id, { invoice: row, profileId, options });
    },
    grantCredits: async (input) => {
      if (creditKeys.has(input.idempotencyKey)) {
        return { granted: false, balance: 0 };
      }
      creditKeys.add(input.idempotencyKey);
      credits.push({
        profileId: input.profileId,
        amount: input.amount,
        key: input.idempotencyKey,
      });
      return { granted: true, balance: input.amount };
    },
    upsertRefund: async (input) => {
      refunds.set(input.refund.id, input);
    },
    upsertDispute: async (input) => {
      disputes.set(input.dispute.id, input);
    },
    updateCustomerEmail: async (id, email, deleted) => {
      customerUpdates.push({ id, email, deleted });
    },
    getInvoiceByPaymentIntent: async (paymentIntentId) =>
      paymentIntentId === 'pi_sub_1' ? ({ id: 'in_test_1' } as any) : null,
    fetchSubscription: async (id) => (id === 'sub_test_1' ? subscription : Promise.reject(new Error('missing'))),
    fetchCharge: async (id) =>
      ({
        id,
        object: 'charge',
        customer: CUSTOMER_ID,
        invoice: 'in_test_1',
        payment_intent: 'pi_sub_1',
        amount: 17900,
        amount_refunded: 17900,
        currency: 'egp',
        refunded: true,
        status: 'succeeded',
        livemode: false,
        metadata: { profile_id: PROFILE_ID },
      }) as StripeCharge,
    fetchRefundsForCharge: async () => [
      {
        id: 're_test_1',
        object: 'refund',
        amount: 17900,
        currency: 'egp',
        charge: 'ch_test_1',
        payment_intent: 'pi_sub_1',
        status: 'succeeded',
        reason: 'requested_by_customer',
        metadata: {},
        livemode: false,
        created: 1760000100,
      } satisfies StripeRefund,
    ],
  };

  return {
    deps,
    events,
    subscriptions,
    invoices,
    refunds,
    disputes,
    credits,
    processed,
    customerUpdates,
    subscription,
    invoice,
  };
}

function event<T>(id: string, type: string, object: T, created = 1760000000): StripeEvent<T> {
  return {
    id,
    object: 'event',
    type,
    api_version: '2026-01-01',
    livemode: false,
    created,
    data: { object },
  };
}

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_1',
    object: 'checkout.session' as const,
    mode: 'payment' as const,
    customer: CUSTOMER_ID,
    subscription: null,
    payment_intent: 'pi_pack_1',
    payment_status: 'paid' as const,
    client_reference_id: PROFILE_ID,
    metadata: {
      profile_id: PROFILE_ID,
      credit_pack_id: 'pack_40',
      credits: '40',
    },
    url: null,
    livemode: false,
    ...overrides,
  };
}

describe('Stripe checkout lifecycle', () => {
  test('a paid pack session grants exactly once, even across duplicate event ids', async () => {
    const { deps, credits } = makeDeps();

    const first = await processStripeEvent(
      event('evt_pack_1', 'checkout.session.completed', checkoutSession()),
      deps
    );
    assert.equal(first.duplicate, false);
    assert.equal(credits.length, 1);
    assert.equal(credits[0].amount, 40);
    assert.equal(credits[0].key, 'stripe_pack_pi_pi_pack_1');

    // Same event id: Stripe retry.
    const retry = await processStripeEvent(
      event('evt_pack_1', 'checkout.session.completed', checkoutSession()),
      deps
    );
    assert.equal(retry.duplicate, true);
    assert.equal(credits.length, 1);

    // Different event id, same purchase: the PaymentIntent key holds.
    const invoicePaid = await processStripeEvent(
      event('evt_pack_2', 'invoice.paid', {
        ...makeDeps().invoice,
        id: 'in_pack_1',
        subscription: null,
        payment_intent: 'pi_pack_1',
        billing_reason: 'manual',
        metadata: { profile_id: PROFILE_ID, credit_pack_id: 'pack_40', credits: '40' },
      }),
      deps
    );
    assert.equal(invoicePaid.duplicate, false);
    assert.equal(credits.length, 1);
  });

  test('a redelivery after a transient failure is processed again, not swallowed', async () => {
    // Stripe delivers at least once. When an attempt fails transiently the
    // customer has paid but the side effects never ran, so the redelivery
    // has to be processed again. Treating it as a duplicate would leave a
    // paying customer without their entitlement, and Stripe stops retrying
    // once the redelivery is acknowledged.
    const { deps, credits } = makeDeps();

    let attempts = 0;
    const flakyDeps: StripeWebhookDeps = {
      ...deps,
      grantCredits: async (input) => {
        attempts += 1;
        if (attempts === 1) throw new Error('database timeout');
        return deps.grantCredits(input);
      },
    };

    await assert.rejects(
      () =>
        processStripeEvent(
          event('evt_pack_retry', 'checkout.session.completed', checkoutSession()),
          flakyDeps
        ),
      /database timeout/
    );
    assert.equal(credits.length, 0, 'a failed event grants nothing');

    // Stripe redelivers the very same event id.
    const redelivery = await processStripeEvent(
      event('evt_pack_retry', 'checkout.session.completed', checkoutSession()),
      flakyDeps
    );

    assert.equal(redelivery.duplicate, false, 'a redelivery of a failed event is not a duplicate');
    assert.equal(redelivery.retried, true);
    assert.equal(credits.length, 1, 'the redelivery grants the entitlement the failure lost');
    assert.equal(credits[0].amount, 40);
  });

  test('an unpaid asynchronous session grants nothing until Stripe confirms', async () => {    const { deps, credits } = makeDeps();
    const pending = checkoutSession({ payment_status: 'unpaid' });

    await processStripeEvent(event('evt_async_1', 'checkout.session.completed', pending), deps);
    assert.equal(credits.length, 0);

    await processStripeEvent(
      event('evt_async_2', 'checkout.session.async_payment_succeeded', {
        ...pending,
        payment_status: 'paid',
      }),
      deps
    );
    assert.equal(credits.length, 1);
  });

  test('an asynchronous failure grants nothing', async () => {
    const { deps, credits } = makeDeps();
    await processStripeEvent(
      event('evt_async_fail', 'checkout.session.async_payment_failed', {
        ...checkoutSession(),
        payment_status: 'unpaid',
      }),
      deps
    );
    assert.equal(credits.length, 0);
  });

  test('metadata cannot be used to grant more credits than the pack contains', () => {
    assert.throws(
      () => creditPackFromMetadata({ credit_pack_id: 'pack_40', credits: '400' }),
      (error: unknown) =>
        error instanceof PermanentStripeEventError && error.code === 'credit_pack_mismatch'
    );
    assert.throws(
      () => creditPackFromMetadata({ credit_pack_id: 'pack_unknown' }),
      (error: unknown) =>
        error instanceof PermanentStripeEventError && error.code === 'unknown_credit_pack'
    );
  });

  test('an unknown customer is acknowledged instead of retried forever', async () => {
    const { deps, processed } = makeDeps();
    const result = await processStripeEvent(
      event(
        'evt_unknown',
        'checkout.session.completed',
        checkoutSession({ customer: 'cus_other', client_reference_id: null, metadata: {} })
      ),
      deps
    );

    assert.equal(result.ignored, true);
    assert.equal(result.reason, 'unknown_customer');
    assert.equal(processed.at(-1)?.acknowledged, true);
  });
});

describe('Stripe subscription lifecycle', () => {
  test('invoice.paid mirrors the subscription and grants the monthly allowance once', async () => {
    const { deps, subscriptions, invoices, credits } = makeDeps();

    await processStripeEvent(event('evt_inv_1', 'invoice.paid', makeDeps().invoice), deps);

    assert.equal(subscriptions.size, 1);
    assert.equal(invoices.size, 1);
    assert.equal(credits.length, 1);
    assert.equal(credits[0].amount, 60);
    assert.equal(credits[0].key, 'stripe_invoice_in_test_1');

    // The same invoice through the other event name must not grant twice.
    await processStripeEvent(
      event('evt_inv_2', 'invoice.payment_succeeded', makeDeps().invoice),
      deps
    );
    assert.equal(credits.length, 1);
  });

  test('a failed invoice is mirrored and grants nothing', async () => {
    const { deps, invoices, credits } = makeDeps();
    const failed = {
      ...makeDeps().invoice,
      status: 'open' as const,
      paid: false,
      amount_paid: 0,
      amount_remaining: 17900,
    };

    await processStripeEvent(event('evt_inv_fail', 'invoice.payment_failed', failed), deps);

    assert.equal(invoices.size, 1);
    assert.equal(credits.length, 0);
  });

  test('a proration invoice does not grant a second allowance', async () => {
    const { deps, credits } = makeDeps();
    const proration = {
      ...makeDeps().invoice,
      id: 'in_proration',
      billing_reason: 'subscription_update' as const,
      amount_paid: 5000,
    };

    await processStripeEvent(event('evt_proration', 'invoice.paid', proration), deps);
    assert.equal(credits.length, 0);
  });

  test('cancellation is mirrored without affecting the credit ledger', async () => {
    const { deps, subscriptions } = makeDeps();
    const cancelled: StripeSubscription = {
      ...makeDeps().subscription,
      status: 'canceled',
      cancel_at_period_end: false,
      canceled_at: 1760000200,
      ended_at: 1760000200,
    };

    await processStripeEvent(
      event('evt_cancel', 'customer.subscription.deleted', cancelled),
      deps
    );

    assert.equal(subscriptions.get('sub_test_1')?.subscription.status, 'canceled');
  });
});

describe('Stripe refunds and disputes', () => {
  test('a refund is attributed to the profile and invoice', async () => {
    const { deps, refunds } = makeDeps();
    await processStripeEvent(
      event('evt_refund', 'refund.created', {
        id: 're_test_1',
        object: 'refund',
        amount: 17900,
        currency: 'egp',
        charge: 'ch_test_1',
        payment_intent: 'pi_sub_1',
        status: 'succeeded',
        reason: 'requested_by_customer',
        metadata: {},
        livemode: false,
        created: 1760000100,
      }),
      deps
    );

    const stored = refunds.get('re_test_1');
    assert.equal(stored?.profileId, PROFILE_ID);
    assert.equal(stored?.invoiceId, 'in_test_1');
  });

  test('a dispute is recorded without touching the credit ledger', async () => {
    const { deps, disputes, credits } = makeDeps();
    await processStripeEvent(
      event('evt_dispute', 'charge.dispute.created', {
        id: 'dp_test_1',
        object: 'dispute',
        charge: 'ch_test_1',
        payment_intent: 'pi_sub_1',
        amount: 17900,
        currency: 'egp',
        status: 'needs_response',
        reason: 'fraudulent',
        livemode: false,
        created: 1760000200,
      }),
      deps
    );

    assert.equal(disputes.get('dp_test_1')?.profileId, PROFILE_ID);
    assert.equal(credits.length, 0);
  });
});

describe('Stripe configuration validation', () => {
  test('missing secret key disables checkout with an actionable error', () => {
    const status = describeStripeConfig({} as NodeJS.ProcessEnv);
    assert.equal(status.mode, 'disabled');
    assert.equal(status.checkoutReady, false);
    assert.ok(status.errors.some((issue) => issue.variable === 'STRIPE_SECRET_KEY'));
  });

  test('a live key without STRIPE_ALLOW_LIVE is refused', () => {
    const status = describeStripeConfig({
      STRIPE_SECRET_KEY: 'sk_live_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
    } as NodeJS.ProcessEnv);
    assert.equal(status.mode, 'live');
    assert.equal(status.checkoutReady, false);
    assert.ok(status.errors.some((issue) => issue.variable === 'STRIPE_ALLOW_LIVE'));
  });

  test('a test key without a webhook secret cannot take a payment', () => {
    const status = describeStripeConfig({
      STRIPE_SECRET_KEY: 'sk_test_example',
    } as NodeJS.ProcessEnv);
    assert.equal(status.mode, 'test');
    assert.equal(status.checkoutReady, false);
    assert.ok(status.errors.some((issue) => issue.variable === 'STRIPE_WEBHOOK_SECRET'));
  });

  test('a complete test configuration is ready and never silently live', () => {
    const status = describeStripeConfig({
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
      SITE_ORIGIN: 'https://careerdev4ai.pages.dev',
    } as NodeJS.ProcessEnv);
    assert.equal(status.mode, 'test');
    assert.equal(status.checkoutReady, true);
    assert.equal(status.errors.length, 0);
  });
});

describe('Stripe price validation', () => {
  const catalog = buildCatalog([
    plan('pro') as any,
  ]);
  const pro = catalog.find((entry) => entry.lookupKey === 'careerdev4ai_pro_monthly');
  assert.ok(pro);

  const price = {
    id: 'price_pro_monthly',
    product: 'prod_pro',
    currency: 'egp',
    unit_amount: 17900,
    lookup_key: 'careerdev4ai_pro_monthly',
    active: true,
    livemode: false,
    recurring: { interval: 'month' as const, interval_count: 1 },
    metadata: {},
  };

  test('accepts a matching test-mode price', () => {
    assert.deepEqual(validatePriceAgainstCatalog(price, pro!, true), []);
  });

  test('rejects a wrong amount, currency, interval or livemode', () => {
    assert.ok(validatePriceAgainstCatalog({ ...price, unit_amount: 1 }, pro!, true).length > 0);
    assert.ok(validatePriceAgainstCatalog({ ...price, currency: 'usd' }, pro!, true).length > 0);
    assert.ok(
      validatePriceAgainstCatalog(
        { ...price, recurring: { interval: 'year', interval_count: 1 } },
        pro!,
        true
      ).length > 0
    );
    assert.ok(validatePriceAgainstCatalog({ ...price, livemode: true }, pro!, true).length > 0);
  });

  test('rejects a lookalike lookup key with no matching price', () => {
    assert.ok(validatePriceAgainstCatalog(null, pro!, true).length > 0);
  });
});

describe('Admin revenue aggregation', () => {
  const range = parseRevenueDateRange(null, null);
  assert.ok('range' in range);

  const baseInvoice = {
    id: 'in_1',
    number: 'INV-1',
    status: 'paid',
    amount_paid: 17900,
    amount_due: 17900,
    currency: 'egp',
    livemode: true,
    paid: true,
    plan_code: 'pro',
    purchase_kind: 'subscription',
    billing_cycle: 'monthly',
    subscription_id: 'sub_1',
    hosted_invoice_url: null,
    invoice_created_at: '2026-01-10T10:00:00.000Z',
    created_at: '2026-01-10T10:00:00.000Z',
  };

  test('test invoices are listed but never counted as revenue', () => {
    const result = computeAdminRevenue(
      {
        payments: [],
        invoices: [
          baseInvoice,
          { ...baseInvoice, id: 'in_test', livemode: false, amount_paid: 99900 },
        ],
        refunds: [],
        disputes: [],
      },
      { testMode: false, range: range.range }
    );

    assert.equal(result.stripe.paidGrossPiasters, 17900);
    assert.equal(result.stripe.testInvoiceCount, 1);
    assert.equal(result.totalCollectedPiasters, 17900);
  });

  test('a succeeded refund reduces revenue once; a pending refund does not', () => {
    const result = computeAdminRevenue(
      {
        payments: [],
        invoices: [baseInvoice],
        refunds: [
          {
            id: 're_1',
            amount: 5000,
            currency: 'egp',
            status: 'succeeded',
            livemode: true,
            reason: null,
            invoice_id: 'in_1',
            payment_intent: 'pi_1',
            refund_created_at: '2026-01-11T10:00:00.000Z',
            created_at: '2026-01-11T10:00:00.000Z',
          },
          {
            id: 're_2',
            amount: 9999,
            currency: 'egp',
            status: 'pending',
            livemode: true,
            reason: null,
            invoice_id: 'in_1',
            payment_intent: 'pi_1',
            refund_created_at: '2026-01-12T10:00:00.000Z',
            created_at: '2026-01-12T10:00:00.000Z',
          },
        ],
        disputes: [],
      },
      { testMode: false, range: range.range }
    );

    assert.equal(result.grossCollectedPiasters, 17900);
    assert.equal(result.refundedPiasters, 5000);
    assert.equal(result.totalCollectedPiasters, 12900);
    assert.equal(result.refundCount, 1);
  });

  test('a refunded offline payment is counted in gross and subtracted once', () => {
    const result = computeAdminRevenue(
      {
        payments: [
          {
            amount_piasters: 9900,
            payment_method: 'instapay',
            billing_cycle: 'monthly',
            paid_at: '2026-01-05T10:00:00.000Z',
            created_at: '2026-01-05T09:00:00.000Z',
            status: 'refunded',
            transaction_reference: 'REF-1',
            plan_code: 'student',
          },
        ],
        invoices: [],
        refunds: [],
        disputes: [],
      },
      { testMode: true, range: range.range }
    );

    assert.equal(result.grossCollectedPiasters, 9900);
    assert.equal(result.refundedPiasters, 9900);
    assert.equal(result.totalCollectedPiasters, 0);
    assert.equal(result.breakdownByMethodPiasters.instapay, 0);
    assert.equal(result.offline.recentTransactions[0].reference, 'REF-1');
  });

  test('card pack and subscription revenue are reported separately', () => {
    const result = computeAdminRevenue(
      {
        payments: [],
        invoices: [
          baseInvoice,
          {
            ...baseInvoice,
            id: 'in_pack',
            subscription_id: null,
            purchase_kind: 'credit_pack',
            plan_code: null,
            amount_paid: 9900,
          },
        ],
        refunds: [],
        disputes: [],
      },
      { testMode: false, range: range.range }
    );

    assert.equal(result.stripe.subscriptionRevenuePiasters, 17900);
    assert.equal(result.stripe.packRevenuePiasters, 9900);
    assert.equal(result.breakdownBySourcePiasters.subscription, 17900);
    assert.equal(result.breakdownBySourcePiasters.credit_pack, 9900);
  });

  test('date filtering is exact and invalid dates are rejected', () => {
    assert.ok('error' in parseRevenueDateRange('2026-02-31', null));
    assert.ok('error' in parseRevenueDateRange('2026-02-10', '2026-02-01'));

    const filtered = parseRevenueDateRange('2026-01-10', '2026-01-10');
    assert.ok('range' in filtered);

    const result = computeAdminRevenue(
      {
        payments: [],
        invoices: [
          baseInvoice,
          {
            ...baseInvoice,
            id: 'in_old',
            invoice_created_at: '2025-12-01T10:00:00.000Z',
            created_at: '2025-12-01T10:00:00.000Z',
          },
        ],
        refunds: [],
        disputes: [],
      },
      { testMode: false, range: filtered.range }
    );

    assert.equal(result.stripe.paidInvoiceCount, 1);
    assert.equal(result.totalCollectedPiasters, 17900);
  });
});
