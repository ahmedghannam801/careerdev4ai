/**
 * Subscription, Credits, and Revenue API Routes.
 *
 * Card payment lives in `server/xpay/routes.ts`: this file owns the plans, the
 * candidate's entitlement, credits, coupons, birthdays, and the administrator's
 * view of subscriptions and revenue.
 * All candidate endpoints require verified session authentication.
 * All administration endpoints require verified administrator status and RBAC permission checks.
 */

import type { Express, Response } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/require-auth.ts';
import { resolvePlanIdentityTier } from '../../shared/planIdentity.ts';
import { requireAdmin, requirePermission, type AdminRequest } from '../admin/permissions.ts';
import { getSupabaseServer } from '../db/supabase.ts';
import {
  getUserSubscriptionSummary,
  cancelActiveSubscription,
} from './service.ts';
import {
  getUserCreditsWithTrial,
  getCreditLedgerHistory,
  claimDailyTokenReward,
} from '../credits/service.ts';
import {
  saveBirthdayConsent,
  revokeBirthdayConsent,
  getActiveBirthdayReward,
} from '../birthday/service.ts';
import {
  isMonetizationEnabled,
  FREE_ACCESS_MESSAGE,
} from '../../shared/platformAccess.ts';
import {
  computeAdminRevenue,
  parseRevenueDateRange,
  type OfflinePaymentRow,
  type LegacyCardDisputeRow,
  type LegacyCardInvoiceRow,
  type LegacyCardRefundRow,
  type XPayPurchaseRow,
} from '../revenue/service.ts';

export function registerSubscriptionRoutes(app: Express): void {
  /* -------------------------------------------------------------------------- */
  /* Candidate Subscription & Catalog Routes                                    */
  /* -------------------------------------------------------------------------- */

  // Candidate: Get active subscription, provisional access, and billing status
  //
  // The plan catalogue is not published any more: there is no plan to sell,
  // so there is nothing for a public endpoint to list. The catalogue itself
  // stays in the database — it is the record of what was sold — and the
  // administration screens still read it.
  app.get('/api/subscription/current', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const summary = await getUserSubscriptionSummary(req.authUser!.id);
      // The tier is resolved here, on the server, from the plan the
      // subscription actually resolves to. The browser draws the tier it is
      // given: it never works out which plan the candidate is on.
      return res.json({
        success: true,
        ...summary,
        planTier: resolvePlanIdentityTier(summary.planCode),
      });
    } catch (error) {
      console.error('Failed to fetch current user subscription:', error);
      return res.status(500).json({ error: 'Failed to retrieve current subscription status' });
    }
  });

  // Candidate: Cancel auto-renew on active subscription
  //
  // While the platform is free nothing renews, so there is nothing to cancel.
  // The endpoint says so plainly instead of pretending to change something.
  app.post('/api/subscription/cancel', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!isMonetizationEnabled()) {
      return res.status(410).json({
        error: FREE_ACCESS_MESSAGE,
        code: 'PLATFORM_IS_FREE',
      });
    }
    try {
      const subscriptionId = String(req.body?.subscriptionId ?? '').trim();
      const reason = req.body?.reason ? String(req.body.reason).slice(0, 500) : undefined;

      if (!subscriptionId) {
        return res.status(400).json({ error: 'subscriptionId is required' });
      }

      const updated = await cancelActiveSubscription(req.authUser!.id, subscriptionId, reason);
      if (!updated) {
        return res.status(404).json({ error: 'Active subscription not found' });
      }

      return res.json({ success: true, subscription: updated });
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      return res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Token balance                                                              */
  /* -------------------------------------------------------------------------- */

  app.get('/api/credits/balance', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const balance = await getUserCreditsWithTrial(req.authUser!.id);
      return res.json({ success: true, ...balance });
    } catch (error) {
      console.error('Failed to fetch credit balance:', error);
      return res.status(500).json({ error: 'Failed to retrieve credit balance' });
    }
  });

  // Candidate: Get credit ledger transaction history
  app.get('/api/credits/history', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const history = await getCreditLedgerHistory(req.authUser!.id);
      return res.json({ success: true, history });
    } catch (error) {
      console.error('Failed to fetch credit history:', error);
      return res.status(500).json({ error: 'Failed to retrieve credit history' });
    }
  });

  // Candidate: Claim the daily free-token reward.
  //
  // This is the ONLY route that hands out the daily allowance. The balance
  // read deliberately does not: the reward is something the candidate claims,
  // and a reward that arrives because somebody read a number is not a reward
  // anybody can press a button for.
  //
  // The claim is idempotent per Africa/Cairo calendar day, so a double press,
  // a retried request or two tabs open at once pay out exactly once. The
  // answer says how much was actually granted, so a press that changed nothing
  // is reported as having changed nothing.
  app.post('/api/credits/daily/claim', requireAuth, async (req: AuthedRequest, res: Response) => {
    if (!isMonetizationEnabled()) {
      return res.status(410).json({
        success: false,
        code: 'PLATFORM_IS_FREE',
        error: FREE_ACCESS_MESSAGE,
      });
    }
    try {
      const result = await claimDailyTokenReward(req.authUser!.id);

      if (!result.success) {
        return res.status(503).json({
          success: false,
          code: 'CLAIM_UNAVAILABLE',
          error:
            'The daily tokens could not be claimed right now. Nothing was taken — please try again in a moment.',
        });
      }

      return res.json({
        success: true,
        granted: result.granted,
        balance: result.balance,
        daily: result.daily,
      });
    } catch (error) {
      console.error('Failed to claim the daily tokens:', error);
      return res.status(500).json({
        success: false,
        code: 'CLAIM_FAILED',
        error: 'The daily tokens could not be claimed. Nothing was taken — please try again.',
      });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Coupons & Birthday Promotions (Egypt Law 151)                             */
  /* -------------------------------------------------------------------------- */

  // Candidate: Save Law 151 birthday consent and provision 30% discount
  //
  // The consent itself is a privacy record and is kept: it says what the
  // candidate agreed to. The discount it provisions cannot be redeemed while
  // there is no checkout, so the route says so rather than granting a reward
  // that nothing can use.
  app.post('/api/birthday/consent', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const birthMonth = Number(req.body?.birthMonth);
      const birthDay = Number(req.body?.birthDay);

      if (!birthMonth || !birthDay) {
        return res.status(400).json({ error: 'birthMonth and birthDay are required' });
      }

      const outcome = await saveBirthdayConsent({
        profileId: req.authUser!.id,
        birthMonth,
        birthDay,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      if (!outcome.success) {
        return res.status(400).json({ error: outcome.error || 'Failed to save birthday consent' });
      }

      return res.json({ success: true, reward: outcome.reward });
    } catch (error) {
      console.error('Birthday consent error:', error);
      return res.status(500).json({ error: 'Failed to process birthday consent' });
    }
  });

  // Candidate: Withdraw Law 151 birthday consent
  app.delete('/api/birthday/consent', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      await revokeBirthdayConsent(req.authUser!.id);
      return res.json({ success: true, message: 'Birthday consent successfully withdrawn' });
    } catch (error) {
      console.error('Birthday revocation error:', error);
      return res.status(500).json({ error: 'Failed to withdraw birthday consent' });
    }
  });

  // Candidate: Check for available birthday reward
  app.get('/api/birthday/reward', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const reward = await getActiveBirthdayReward(req.authUser!.id);
      return res.json({ success: true, reward });
    } catch (error) {
      console.error('Failed to get birthday reward:', error);
      return res.status(500).json({ error: 'Failed to check birthday reward' });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Super Admin Control Center Endpoints                                       */
  /* -------------------------------------------------------------------------- */

  // Admin: View all subscriptions across the platform
  app.get(
    '/api/admin/subscriptions',
    requireAuth,
    requireAdmin,
    requirePermission('subscriptions.read'),
    async (_req: AdminRequest, res: Response) => {
      try {
        const { data, error } = await getSupabaseServer()
          .from('subscriptions')
          .select(`
            id, profile_id, plan_id, billing_cycle, status,
            current_period_starts_at, current_period_ends_at,
            cancelled_at, cancellation_reason, ended_at,
            created_at, updated_at,
            subscription_plans(code, name_en, name_ar, price_monthly_piasters, price_annual_piasters),
            profiles:profile_id(full_name, username)
          `)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        return res.json({ success: true, subscriptions: data ?? [] });
      } catch (error) {
        console.error('Admin subscriptions query failed:', error);
        return res.status(500).json({ error: 'Failed to load subscriptions' });
      }
    }
  );

  // Admin: View payment requests awaiting review or history
  app.get(
    '/api/admin/revenue',
    requireAuth,
    requireAdmin,
    requirePermission('revenue.read'),
    async (req: AdminRequest, res: Response) => {
      // An invalid filter is a client error, not a silent all-time total.
      const parsedRange = parseRevenueDateRange(req.query.from, req.query.to);
      if ('error' in parsedRange) {
        return res.status(400).json({ error: parsedRange.error, code: 'INVALID_DATE_RANGE' });
      }

      try {
        // The query is intentionally unbounded: the totals have to be exact,
        // and Supabase has no aggregate helper without an RPC. At real volume
        // this becomes a `sum(...)` RPC plus a limited list query; capping the
        // rows here would silently understate revenue. The arithmetic lives in
        // `server/revenue/service.ts` so the refund and double-counting rules
        // are testable.
        const { data: paymentRows, error: paymentError } = await getSupabaseServer()
          .from('payment_requests')
          .select(`
            amount_piasters, payment_method, billing_cycle, paid_at, created_at,
            status, transaction_reference, subscription_plans(code)
          `)
          .order('created_at', { ascending: false });

        if (paymentError) throw paymentError;

        const payments: OfflinePaymentRow[] = (paymentRows ?? []).map((row: any) => {
          const relation = row.subscription_plans as { code?: string } | { code?: string }[] | null;
          const planCode = (Array.isArray(relation) ? relation[0]?.code : relation?.code) || null;
          return {
            amount_piasters: row.amount_piasters,
            payment_method: row.payment_method,
            billing_cycle: row.billing_cycle,
            paid_at: row.paid_at,
            created_at: row.created_at,
            status: String(row.status ?? ''),
            transaction_reference: row.transaction_reference ?? null,
            plan_code: planCode,
          };
        });

        // The card invoices the previous gateway mirrored. Nothing writes to
        // these tables any more, and the rows are money that was collected, so
        // they are read and counted. The table names are kept: renaming a table
        // of historical financial records to tidy a report is not a trade worth
        // making.
        const { data: stripeInvoiceRows, error: stripeInvoiceError } = await getSupabaseServer()
          .from('stripe_invoices')
          .select(`
            id, number, status, amount_paid, amount_due, currency, livemode, paid,
            plan_code, billing_cycle, purchase_kind, subscription_id,
            hosted_invoice_url, invoice_created_at, created_at
          `)
          .order('created_at', { ascending: false });

        if (stripeInvoiceError) {
          console.error('Admin revenue: legacy card invoice query failed:', stripeInvoiceError);
        }
        const invoices: LegacyCardInvoiceRow[] = stripeInvoiceError
          ? []
          : (stripeInvoiceRows ?? []).map((row: any) => ({
              id: String(row.id),
              number: row.number ?? null,
              status: row.status ?? null,
              amount_paid: row.amount_paid,
              amount_due: row.amount_due,
              currency: row.currency ?? 'egp',
              livemode: row.livemode === true,
              paid: row.paid === true,
              plan_code: row.plan_code ?? null,
              purchase_kind: row.purchase_kind ?? null,
              billing_cycle: row.billing_cycle ?? null,
              subscription_id: row.subscription_id ?? null,
              hosted_invoice_url: row.hosted_invoice_url ?? null,
              invoice_created_at: row.invoice_created_at ?? null,
              created_at: row.created_at ?? null,
            }));

        const { data: refundRows, error: refundError } = await getSupabaseServer()
          .from('stripe_refunds')
          .select(`
            id, amount, currency, status, livemode, reason, invoice_id,
            payment_intent, refund_created_at, created_at
          `)
          .order('created_at', { ascending: false });

        if (refundError) {
          console.error('Admin revenue: legacy card refund query failed:', refundError);
        }
        const refunds: LegacyCardRefundRow[] = refundError
          ? []
          : (refundRows ?? []).map((row: any) => ({
              id: String(row.id),
              amount: row.amount,
              currency: row.currency ?? 'egp',
              status: row.status ?? null,
              livemode: row.livemode === true,
              reason: row.reason ?? null,
              invoice_id: row.invoice_id ?? null,
              payment_intent: row.payment_intent ?? null,
              refund_created_at: row.refund_created_at ?? null,
              created_at: row.created_at ?? null,
            }));

        const { data: disputeRows, error: disputeError } = await getSupabaseServer()
          .from('stripe_disputes')
          .select('id, amount, currency, status, livemode, reason, dispute_created_at, created_at')
          .order('created_at', { ascending: false });

        if (disputeError) {
          console.error('Admin revenue: legacy card dispute query failed:', disputeError);
        }
        const disputes: LegacyCardDisputeRow[] = disputeError
          ? []
          : (disputeRows ?? []).map((row: any) => ({
              id: String(row.id),
              amount: row.amount,
              currency: row.currency ?? 'egp',
              status: row.status ?? null,
              livemode: row.livemode === true,
              reason: row.reason ?? null,
              dispute_created_at: row.dispute_created_at ?? null,
              created_at: row.created_at ?? null,
            }));

        // The live gateway. A deployment that has not applied the XPay
        // migration must still render this page, so a failure here is reported
        // rather than thrown — and the panel says the figures are unavailable
        // instead of showing a confident zero.
        const { data: xpayRows, error: xpayError } = await getSupabaseServer()
          .from('xpay_purchases')
          .select(
            'id, session_id, purchase_kind, plan_code, billing_cycle, credits, amount_total, currency, status, paid_at, created_at, livemode'
          )
          .order('created_at', { ascending: false });

        if (xpayError) {
          console.error('Admin revenue: XPay purchase query failed:', xpayError);
        }
        const xpay: XPayPurchaseRow[] = xpayError
          ? []
          : (xpayRows ?? []).map((row: any) => ({
              id: String(row.id),
              session_id: row.session_id ?? null,
              purchase_kind: row.purchase_kind ?? null,
              plan_code: row.plan_code ?? null,
              billing_cycle: row.billing_cycle ?? null,
              credits: row.credits ?? null,
              amount_total: row.amount_total,
              currency: row.currency ?? 'EGP',
              status: String(row.status ?? ''),
              paid_at: row.paid_at ?? null,
              created_at: row.created_at ?? null,
              livemode: row.livemode === true,
            }));

        const metrics = computeAdminRevenue(
          { payments, invoices, refunds, disputes, xpay },
          {
            // The card rail that wrote these invoice rows is gone; the rows are
            // history and stay countable. There is no live mode to compare them
            // against, so nothing is excluded here.
            testMode: false,
            range: parsedRange.range,
            stripeAvailable: !stripeInvoiceError,
            xpayAvailable: !xpayError,
          }
        );

        return res.json({ success: true, metrics });
      } catch (error) {
        console.error('Admin revenue query failed:', error);
        return res.status(500).json({ error: 'Failed to compute revenue metrics' });
      }
    }
  );

  // Admin: Manual AI Credit Grants
  //
  // A grant is the platform's own money operation: it is how a candidate is
  // given tokens. While the platform is free there is no token economy — no
  // balance is read and no balance gates anything — so the operation is
  // withdrawn rather than left half-working. The ledger's history is untouched
  // and stays readable in the credit monitor.
  app.post(
    '/api/admin/credits/grant',
    requireAuth,
    requireAdmin,
    requirePermission('credits.grant'),
    async (req: AdminRequest, res: Response) => {
      if (!isMonetizationEnabled()) {
        return res.status(410).json({
          success: false,
          code: 'PLATFORM_IS_FREE',
          error: FREE_ACCESS_MESSAGE,
        });
      }
      try {
        const profileId = String(req.body?.profileId ?? '').trim();
        const amount = Math.floor(Number(req.body?.amount ?? 0));
        const reason = String(req.body?.reason ?? 'Administrative grant').slice(0, 200);

        if (!profileId) {
          return res.status(400).json({ error: 'profileId is required' });
        }
        if (amount <= 0 || amount > 1000) {
          return res.status(400).json({ error: 'Amount must be between 1 and 1000 credits' });
        }

        // BLK-03: Atomic server-side stored procedure with advisory lock and correct constraint
        const idempotencyKey = String(
          req.body?.idempotencyKey || `admin_grant_${req.admin!.id}_${profileId}_${Date.now()}`
        );
        const { data: rpcData, error: rpcErr } = await getSupabaseServer().rpc(
          'admin_grant_ai_credits',
          {
            p_profile_id: profileId,
            p_admin_id: req.admin!.id,
            p_amount: amount,
            p_reason: reason,
            p_idempotency_key: idempotencyKey,
          }
        );

        if (rpcErr) {
          console.error('Failed to grant credits via RPC:', rpcErr);
          return res.status(500).json({ error: rpcErr.message || 'Failed to record credit grant' });
        }

        const grantResult = rpcData as {
          success: boolean;
          granted_credits: number;
          balance: number;
          idempotent_replay?: boolean;
        };

        return res.json({
          success: true,
          grantedCredits: grantResult.granted_credits,
          balance: grantResult.balance,
          idempotentReplay: Boolean(grantResult.idempotent_replay),
        });
      } catch (error) {
        console.error('Admin credit grant error:', error);
        return res.status(500).json({ error: 'Failed to grant credits' });
      }
    }
  );
}

