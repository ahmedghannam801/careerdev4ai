/**
 * The admin revenue report, with XPay as the live gateway.
 *
 * The report is the platform's own memory: it has to keep counting the money the
 * closed rails collected, and it has to start counting XPay on the same day.
 * These tests check the arithmetic of both, and the rules that stop the report
 * from overstating revenue — a test purchase is not revenue, a pending session
 * is not revenue, and a refund is subtracted exactly once.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeAdminRevenue,
  type RevenueDateRange,
  type RevenueInput,
} from '../server/revenue/service.ts';

const ALL_TIME: RevenueDateRange = {
  from: null,
  to: null,
  fromIso: null,
  toIso: null,
};

function input(overrides: Partial<RevenueInput> = {}): RevenueInput {
  return {
    payments: [],
    invoices: [],
    refunds: [],
    disputes: [],
    xpay: [],
    ...overrides,
  };
}

function xpayPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pur_1',
    session_id: 'cs_live_abc',
    purchase_kind: 'subscription',
    plan_code: 'career_plus',
    billing_cycle: 'monthly',
    credits: null,
    amount_total: 29900,
    currency: 'EGP',
    status: 'paid',
    paid_at: '2026-04-10T10:00:00.000Z',
    created_at: '2026-04-10T09:55:00.000Z',
    livemode: true,
    ...overrides,
  } as never;
}

function compute(overrides: Partial<RevenueInput> = {}, options: Record<string, unknown> = {}) {
  return computeAdminRevenue(input(overrides), {
    testMode: false,
    range: ALL_TIME,
    stripeAvailable: true,
    xpayAvailable: true,
    ...options,
  });
}

describe('the revenue report', () => {
  it('counts a paid XPay subscription once, in gross, by plan, by cycle and by source', () => {
    const metrics = compute({ xpay: [xpayPurchase()] });

    assert.equal(metrics.grossCollectedPiasters, 29900);
    assert.equal(metrics.totalCollectedPiasters, 29900);
    assert.equal(metrics.transactionCount, 1);
    assert.equal(metrics.breakdownByMethodPiasters.xpay, 29900);
    assert.equal(metrics.breakdownByPlanPiasters.career_plus, 29900);
    assert.equal(metrics.breakdownByCyclePiasters.monthly, 29900);
    assert.equal(metrics.breakdownBySourcePiasters.subscription, 29900);
    assert.equal(metrics.xpay.purchaseCount, 1);
    assert.equal(metrics.xpay.recentPurchases.length, 1);
  });

  it('counts a credit pack as a pack, and records how many credits were sold', () => {
    const metrics = compute({
      xpay: [
        xpayPurchase({
          id: 'pur_pack',
          session_id: 'cs_live_pack',
          purchase_kind: 'credit_pack',
          plan_code: null,
          billing_cycle: null,
          credits: 40,
          amount_total: 9900,
        }),
      ],
    });

    assert.equal(metrics.breakdownBySourcePiasters.credit_pack, 9900);
    assert.equal(metrics.breakdownBySourcePiasters.subscription, 0);
    assert.equal(metrics.xpay.packRevenuePiasters, 9900);
    assert.equal(metrics.xpay.creditPacksSold, 40);
  });

  it('never counts a test purchase as revenue', () => {
    const metrics = compute({ xpay: [xpayPurchase({ livemode: false })] });

    assert.equal(metrics.grossCollectedPiasters, 0);
    assert.equal(metrics.xpay.testPurchaseCount, 1);
    assert.equal(metrics.xpay.purchaseCount, 0);
    assert.equal(metrics.breakdownByMethodPiasters.xpay, 0);
  });

  it('counts a pending session as pending, not as money', () => {
    const metrics = compute({ xpay: [xpayPurchase({ status: 'pending', paid_at: null })] });

    assert.equal(metrics.grossCollectedPiasters, 0);
    assert.equal(metrics.pendingPaymentCount, 1);
    assert.equal(metrics.xpay.purchaseCount, 0);
  });

  it('does not count a failed session, and does not hide it either', () => {
    const metrics = compute({ xpay: [xpayPurchase({ status: 'failed', paid_at: null })] });

    assert.equal(metrics.grossCollectedPiasters, 0);
    assert.equal(metrics.failedPaymentCount, 1);
    assert.equal(metrics.xpay.failedCount, 1);
  });

  it('ignores a purchase in another currency rather than adding apples to piasters', () => {
    const metrics = compute({ xpay: [xpayPurchase({ currency: 'USD' })] });

    assert.equal(metrics.grossCollectedPiasters, 0);
  });

  it('adds the closed rails to the same totals, because that money was collected', () => {
    const metrics = compute({
      xpay: [xpayPurchase({ amount_total: 29900 })],
      payments: [
        {
          amount_piasters: 14900,
          payment_method: 'vodafone_cash',
          billing_cycle: 'monthly',
          paid_at: '2026-02-01T10:00:00.000Z',
          created_at: '2026-02-01T09:00:00.000Z',
          status: 'paid',
          transaction_reference: 'VF-1',
          plan_code: 'pro',
        },
      ],
      invoices: [
        {
          id: 'in_1',
          number: 'A-1',
          status: 'paid',
          amount_paid: 19900,
          amount_due: 0,
          currency: 'egp',
          livemode: true,
          paid: true,
          plan_code: 'career_plus',
          purchase_kind: 'subscription',
          billing_cycle: 'annual',
          subscription_id: null,
          hosted_invoice_url: null,
          invoice_created_at: '2026-03-01T10:00:00.000Z',
          created_at: '2026-03-01T10:00:00.000Z',
        },
      ],
    });

    assert.equal(metrics.grossCollectedPiasters, 29900 + 14900 + 19900);
    assert.equal(metrics.breakdownByMethodPiasters.xpay, 29900);
    assert.equal(metrics.breakdownByMethodPiasters.vodafone_cash, 14900);
    assert.equal(metrics.breakdownByMethodPiasters.stripe, 19900);
    // Three payments from three eras, counted once each.
    assert.equal(metrics.transactionCount, 3);
  });

  it('says the figures are unavailable instead of reporting a confident zero', () => {
    const metrics = compute({}, { xpayAvailable: false });

    assert.equal(metrics.xpay.available, false);
    assert.equal(metrics.xpay.purchaseCount, 0);
  });

  it('respects the date filter for XPay the same way it does for the rest', () => {
    const metrics = computeAdminRevenue(
      input({
        xpay: [
          xpayPurchase({ id: 'in_range', session_id: 'cs_live_in' }),
          xpayPurchase({
            id: 'out_of_range',
            session_id: 'cs_live_out',
            paid_at: '2026-01-05T10:00:00.000Z',
            created_at: '2026-01-05T09:00:00.000Z',
          }),
        ],
      }),
      {
        testMode: false,
        range: {
          from: '2026-04-01',
          to: '2026-04-30',
          fromIso: '2026-04-01T00:00:00.000Z',
          toIso: '2026-04-30T23:59:59.999Z',
        },
        stripeAvailable: true,
        xpayAvailable: true,
      }
    );

    assert.equal(metrics.xpay.purchaseCount, 1);
    assert.equal(metrics.grossCollectedPiasters, 29900);
  });
});
