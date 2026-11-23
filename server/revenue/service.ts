/**
 * Revenue aggregation for the Admin Center.
 *
 * Pure: the route loads the mirror rows and this module turns them into the
 * figures the panel renders. Keeping the arithmetic here is what makes it
 * testable — especially the rules that prevent double counting:
 *
 *   * a refunded offline payment is counted in gross and then subtracted once;
 *   * a card invoice is counted once, by its `amount_paid`, never by both the
 *     invoice and the charge;
 *   * a refund is counted only when Stripe reports `status = succeeded`;
 *   * test-mode invoices are listed but never added to revenue.
 */

export interface RevenueDateRange {
  from: string | null;
  to: string | null;
  fromIso: string | null;
  toIso: string | null;
}

export interface OfflinePaymentRow {
  amount_piasters: number | null;
  payment_method: string | null;
  billing_cycle: string | null;
  paid_at: string | null;
  created_at: string | null;
  status: string;
  transaction_reference: string | null;
  plan_code: string | null;
}

export interface StripeInvoiceRevenueRow {
  id: string;
  number: string | null;
  status: string | null;
  amount_paid: number | null;
  amount_due: number | null;
  currency: string | null;
  livemode: boolean;
  paid: boolean;
  plan_code: string | null;
  purchase_kind: string | null;
  billing_cycle: string | null;
  subscription_id: string | null;
  hosted_invoice_url: string | null;
  invoice_created_at: string | null;
  created_at: string | null;
}

export interface StripeRefundRevenueRow {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  livemode: boolean;
  reason: string | null;
  invoice_id: string | null;
  payment_intent: string | null;
  refund_created_at: string | null;
  created_at: string | null;
}

export interface StripeDisputeRevenueRow {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  livemode: boolean;
  reason: string | null;
  dispute_created_at: string | null;
  created_at: string | null;
}

export interface RevenueInput {
  payments: OfflinePaymentRow[];
  invoices: StripeInvoiceRevenueRow[];
  refunds: StripeRefundRevenueRow[];
  disputes: StripeDisputeRevenueRow[];
}

export interface AdminStripeInvoiceView {
  id: string;
  number: string | null;
  status: string | null;
  amountPaidPiasters: number;
  amountDuePiasters: number;
  currency: string;
  livemode: boolean;
  paid: boolean;
  planCode: string | null;
  purchaseKind: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
}

export interface AdminStripeRefundView {
  id: string;
  amountPiasters: number;
  currency: string;
  status: string | null;
  reason: string | null;
  livemode: boolean;
  createdAt: string | null;
  invoiceId: string | null;
}

export interface AdminOfflineTransactionView {
  reference: string | null;
  method: string;
  amountPiasters: number;
  status: string;
  paidAt: string | null;
  createdAt: string | null;
}

export interface AdminRevenueResult {
  dateRange: { from: string | null; to: string | null };
  totalCollectedPiasters: number;
  grossCollectedPiasters: number;
  refundedPiasters: number;
  totalCollectedEgp: number;
  transactionCount: number;
  breakdownByMethodPiasters: Record<string, number>;
  breakdownByPlanPiasters: Record<string, number>;
  breakdownByCyclePiasters: Record<string, number>;
  breakdownBySourcePiasters: Record<string, number>;
  pendingPaymentCount: number;
  failedPaymentCount: number;
  refundCount: number;
  stripe: {
    available: boolean;
    testMode: boolean;
    paidInvoiceCount: number;
    paidGrossPiasters: number;
    refundedPiasters: number;
    testInvoiceCount: number;
    pendingInvoiceCount: number;
    failedInvoiceCount: number;
    subscriptionRevenuePiasters: number;
    packRevenuePiasters: number;
    recentInvoices: AdminStripeInvoiceView[];
    recentRefunds: AdminStripeRefundView[];
    disputeCount: number;
    disputedPiasters: number;
  };
  offline: {
    refundedPiasters: number;
    refundCount: number;
    pendingCount: number;
    failedCount: number;
    recentTransactions: AdminOfflineTransactionView[];
  };
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject a rolled-over date such as 2026-02-31.
  if (date.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}

/**
 * Parses `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Returns an error string for an
 * invalid value instead of silently ignoring it: an admin filtering a quarter
 * must not be shown all-time totals.
 */
export function parseRevenueDateRange(
  fromRaw: unknown,
  toRaw: unknown
): { range: RevenueDateRange } | { error: string } {
  const fromInput = typeof fromRaw === 'string' ? fromRaw : null;
  const toInput = typeof toRaw === 'string' ? toRaw : null;

  const from = fromInput ? parseDate(fromInput) : null;
  const to = toInput ? parseDate(toInput) : null;

  if (fromInput && !from) return { error: 'from must be a valid YYYY-MM-DD date' };
  if (toInput && !to) return { error: 'to must be a valid YYYY-MM-DD date' };
  if (from && to && from > to) return { error: 'from must be on or before to' };

  return {
    range: {
      from,
      to,
      fromIso: from ? `${from}T00:00:00.000Z` : null,
      toIso: to ? `${to}T23:59:59.999Z` : null,
    },
  };
}

function inRange(
  value: string | null | undefined,
  range: RevenueDateRange
): boolean {
  if (!range.fromIso && !range.toIso) return true;
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  if (range.fromIso && time < new Date(range.fromIso).getTime()) return false;
  if (range.toIso && time > new Date(range.toIso).getTime()) return false;
  return true;
}

const STRIPE_PENDING_STATUSES = new Set(['open', 'draft']);
const STRIPE_FAILED_STATUSES = new Set(['uncollectible', 'void']);

export function computeAdminRevenue(
  input: RevenueInput,
  options: {
    testMode: boolean;
    range: RevenueDateRange;
    stripeAvailable?: boolean;
  }
): AdminRevenueResult {
  const { range, testMode } = options;
  const byMethod: Record<string, number> = { vodafone_cash: 0, instapay: 0, stripe: 0 };
  const byPlan: Record<string, number> = {};
  const byCycle: Record<string, number> = { monthly: 0, annual: 0 };
  const bySource: Record<string, number> = { subscription: 0, credit_pack: 0 };

  let offlineGross = 0;
  let offlineRefunded = 0;
  let offlineRefundCount = 0;
  let offlineTransactionCount = 0;
  let offlinePendingCount = 0;
  let offlineFailedCount = 0;
  const recentOffline: AdminOfflineTransactionView[] = [];

  for (const payment of input.payments) {
    const amount = Number(payment.amount_piasters ?? 0);
    const method = payment.payment_method || 'other';
    const plan = payment.plan_code || 'unknown';
    const cycle = payment.billing_cycle || 'monthly';

    if (payment.status === 'pending' || payment.status === 'under_review' || payment.status === 'temporary_access') {
      if (inRange(payment.created_at, range)) offlinePendingCount += 1;
      continue;
    }
    if (payment.status === 'rejected' || payment.status === 'expired') {
      if (inRange(payment.created_at, range)) offlineFailedCount += 1;
      continue;
    }

    const isRefunded = payment.status === 'refunded';
    if (payment.status !== 'paid' && !isRefunded) continue;

    const revenueAt = payment.paid_at ?? payment.created_at;
    if (!inRange(revenueAt, range)) continue;

    // Gross includes a refunded payment, then the refund is subtracted once.
    // Excluding it from gross and subtracting again would understate revenue.
    offlineGross += amount;
    offlineTransactionCount += 1;

    if (isRefunded) {
      offlineRefunded += amount;
      offlineRefundCount += 1;
    } else {
      // A refunded payment contributes nothing to the net plan/cycle
      // breakdown. Partial offline refunds are not a supported state.
      byPlan[plan] = (byPlan[plan] ?? 0) + amount;
      byCycle[cycle] = (byCycle[cycle] ?? 0) + amount;
    }

    if (recentOffline.length < 8) {
      recentOffline.push({
        reference: payment.transaction_reference,
        method,
        amountPiasters: amount,
        status: payment.status,
        paidAt: payment.paid_at,
        createdAt: payment.created_at,
      });
    }
  }

  let stripeGross = 0;
  let stripeRefunded = 0;
  let stripeSubscription = 0;
  let stripePack = 0;
  let paidInvoiceCount = 0;
  let testInvoiceCount = 0;
  let pendingInvoiceCount = 0;
  let failedInvoiceCount = 0;
  const recentInvoices: AdminStripeInvoiceView[] = [];

  for (const invoice of input.invoices) {
    const createdAt = invoice.invoice_created_at ?? invoice.created_at;
    if (!inRange(createdAt, range)) continue;

    const amountPaid = Number(invoice.amount_paid ?? 0);
    const amountDue = Number(invoice.amount_due ?? 0);

    if (!invoice.livemode) {
      testInvoiceCount += 1;
    } else if (invoice.paid && amountPaid > 0 && invoice.currency?.toLowerCase() === 'egp') {
      stripeGross += amountPaid;
      paidInvoiceCount += 1;

      if (invoice.purchase_kind === 'credit_pack') {
        stripePack += amountPaid;
        bySource.credit_pack += amountPaid;
      } else {
        stripeSubscription += amountPaid;
        bySource.subscription += amountPaid;
      }

      byPlan[invoice.plan_code || (invoice.purchase_kind === 'credit_pack' ? 'credit_pack' : 'subscription')] =
        (byPlan[invoice.plan_code || (invoice.purchase_kind === 'credit_pack' ? 'credit_pack' : 'subscription')] ?? 0) +
        amountPaid;

      const cycle = invoice.billing_cycle === 'annual' ? 'annual' : 'monthly';
      byCycle[cycle] = (byCycle[cycle] ?? 0) + amountPaid;
    } else if (invoice.livemode && STRIPE_PENDING_STATUSES.has(invoice.status ?? '')) {
      pendingInvoiceCount += 1;
    } else if (invoice.livemode && STRIPE_FAILED_STATUSES.has(invoice.status ?? '')) {
      failedInvoiceCount += 1;
    }

    if (recentInvoices.length < 10) {
      recentInvoices.push({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amountPaidPiasters: amountPaid,
        amountDuePiasters: amountDue,
        currency: invoice.currency ?? 'egp',
        livemode: invoice.livemode,
        paid: invoice.paid,
        planCode: invoice.plan_code,
        purchaseKind: invoice.purchase_kind,
        paidAt: createdAt,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
      });
    }
  }

  let stripeRefundCount = 0;
  const recentRefunds: AdminStripeRefundView[] = [];
  for (const refund of input.refunds) {
    if (!refund.livemode) continue;
    const createdAt = refund.refund_created_at ?? refund.created_at;
    if (!inRange(createdAt, range)) continue;

    if (recentRefunds.length < 8) {
      recentRefunds.push({
        id: refund.id,
        amountPiasters: Number(refund.amount ?? 0),
        currency: refund.currency ?? 'egp',
        status: refund.status,
        reason: refund.reason,
        livemode: refund.livemode,
        createdAt,
        invoiceId: refund.invoice_id,
      });
    }

    if (refund.status !== 'succeeded' || refund.currency?.toLowerCase() !== 'egp') continue;
    stripeRefunded += Number(refund.amount ?? 0);
    stripeRefundCount += 1;
  }

  let disputeCount = 0;
  let disputedPiasters = 0;
  for (const dispute of input.disputes) {
    if (!dispute.livemode) continue;
    const createdAt = dispute.dispute_created_at ?? dispute.created_at;
    if (!inRange(createdAt, range)) continue;
    disputeCount += 1;
    disputedPiasters += Number(dispute.amount ?? 0);
  }

  byMethod.vodafone_cash = 0;
  byMethod.instapay = 0;
  // The method breakdown is net of refunds. A refunded offline payment is
  // attributed back to the method that collected it.
  for (const payment of input.payments) {
    if (payment.status !== 'paid' && payment.status !== 'refunded') continue;
    const revenueAt = payment.paid_at ?? payment.created_at;
    if (!inRange(revenueAt, range)) continue;
    const amount = Number(payment.amount_piasters ?? 0);
    if (payment.status === 'refunded') continue;
    const method = payment.payment_method || 'other';
    byMethod[method] = (byMethod[method] ?? 0) + amount;
  }
  // A fully refunded offline payment is excluded above; its net contribution
  // is zero, so no second subtraction is applied here.

  bySource.subscription += offlineGross - offlineRefunded;
  byMethod.stripe = stripeGross - stripeRefunded;

  const gross = offlineGross + stripeGross;
  const refunded = offlineRefunded + stripeRefunded;
  const net = gross - refunded;

  return {
    dateRange: { from: range.from, to: range.to },
    totalCollectedPiasters: net,
    grossCollectedPiasters: gross,
    refundedPiasters: refunded,
    totalCollectedEgp: Math.round(net / 100),
    transactionCount: offlineTransactionCount + paidInvoiceCount,
    breakdownByMethodPiasters: byMethod,
    breakdownByPlanPiasters: byPlan,
    breakdownByCyclePiasters: byCycle,
    breakdownBySourcePiasters: bySource,
    pendingPaymentCount: offlinePendingCount + pendingInvoiceCount,
    failedPaymentCount: offlineFailedCount + failedInvoiceCount,
    refundCount: offlineRefundCount + stripeRefundCount,
    stripe: {
      available: options.stripeAvailable !== false,
      testMode,
      paidInvoiceCount,
      paidGrossPiasters: stripeGross,
      refundedPiasters: stripeRefunded,
      testInvoiceCount,
      pendingInvoiceCount,
      failedInvoiceCount,
      subscriptionRevenuePiasters: stripeSubscription,
      packRevenuePiasters: stripePack,
      recentInvoices,
      recentRefunds,
      disputeCount,
      disputedPiasters,
    },
    offline: {
      refundedPiasters: offlineRefunded,
      refundCount: offlineRefundCount,
      pendingCount: offlinePendingCount,
      failedCount: offlineFailedCount,
      recentTransactions: recentOffline,
    },
  };
}
