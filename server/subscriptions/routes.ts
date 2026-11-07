/**
 * Subscription, Payments, Credits, and Revenue API Routes.
 * All candidate endpoints require verified session authentication.
 * All administration endpoints require verified administrator status and RBAC permission checks.
 */

import type { Express, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, type AuthedRequest } from '../auth/require-auth.ts';
import { requireAdmin, requirePermission, type AdminRequest } from '../admin/permissions.ts';
import { logAdminAction } from '../db/admin.ts';
import { getSupabaseServer } from '../db/supabase.ts';
import {
  getUserSubscriptionSummary,
  getPublicPlans,
  cancelActiveSubscription,
} from './service.ts';
import {
  createCheckout,
  submitEvidence,
  confirmPaymentByAdmin,
  rejectPaymentByAdmin,
  restorePaymentByAdmin,
} from '../payments/service.ts';
import {
  listPaymentRequestsForUser,
  getPaymentRequestById,
  listVerifications,
} from '../db/payments.ts';
import {
  getUserCreditsWithTrial,
  getCreditLedgerHistory,
} from '../credits/service.ts';
import { validateCoupon } from '../coupons/service.ts';
import {
  saveBirthdayConsent,
  revokeBirthdayConsent,
  getActiveBirthdayReward,
} from '../birthday/service.ts';
import type { PaymentMethod } from '../../shared/payments.ts';
import { isTestMode } from '../stripe/config.ts';
import {
  computeAdminRevenue,
  parseRevenueDateRange,
  type OfflinePaymentRow,
  type StripeDisputeRevenueRow,
  type StripeInvoiceRevenueRow,
  type StripeRefundRevenueRow,
} from '../stripe/revenue.ts';

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

export function registerSubscriptionRoutes(app: Express): void {
  /* -------------------------------------------------------------------------- */
  /* Candidate Subscription & Catalog Routes                                    */
  /* -------------------------------------------------------------------------- */

  // Public: List available subscription tiers with official EGP pricing
  app.get('/api/subscription/plans', async (_req: Request, res: Response) => {
    try {
      const plans = await getPublicPlans();
      return res.json({ success: true, plans });
    } catch (error) {
      console.error('Failed to list public plans:', error);
      return res.status(500).json({ error: 'Failed to retrieve subscription plans' });
    }
  });

  // Candidate: Get active subscription, provisional access, and billing status
  app.get('/api/subscription/current', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const summary = await getUserSubscriptionSummary(req.authUser!.id);
      return res.json({ success: true, ...summary });
    } catch (error) {
      console.error('Failed to fetch current user subscription:', error);
      return res.status(500).json({ error: 'Failed to retrieve current subscription status' });
    }
  });

  // Candidate: Cancel auto-renew on active subscription
  app.post('/api/subscription/cancel', requireAuth, async (req: AuthedRequest, res: Response) => {
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
  /* Payments & Checkout Routes (Vodafone Cash & InstaPay)                      */
  /* -------------------------------------------------------------------------- */

  // Candidate: Create payment checkout intent
  app.post('/api/payments/checkout', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const planCode = String(req.body?.planCode ?? '').trim();
      const billingCycle = req.body?.billingCycle === 'annual' ? 'annual' : 'monthly';
      const paymentMethod = req.body?.paymentMethod as PaymentMethod;
      const couponCode = req.body?.couponCode ? String(req.body.couponCode).trim() : undefined;
      const applyBirthdayReward = Boolean(req.body?.applyBirthdayReward);

      if (!planCode) {
        return res.status(400).json({ error: 'planCode is required' });
      }
      if (paymentMethod !== 'vodafone_cash' && paymentMethod !== 'instapay') {
        return res.status(400).json({ error: 'Valid paymentMethod (vodafone_cash | instapay) is required' });
      }

      const result = await createCheckout({
        profileId: req.authUser!.id,
        planCode,
        billingCycle,
        paymentMethod,
        couponCode,
        applyBirthdayReward,
      });

      return res.json({
        success: true,
        paymentRequest: result.paymentRequest,
        instructions: result.instructions,
      });
    } catch (error: any) {
      console.error('Checkout creation error:', error);
      return res.status(400).json({ error: error.message || 'Failed to create checkout' });
    }
  });

  // Candidate: Submit payment proof (reference, sender handle, receipt image)
  app.post(
    '/api/payments/evidence',
    requireAuth,
    receiptUpload.single('receipt'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const paymentRequestId = String(req.body?.paymentRequestId ?? '').trim();
        const transactionReference = String(req.body?.transactionReference ?? '').trim();
        const senderPhoneOrHandle = String(req.body?.senderPhoneOrHandle ?? '').trim();

        if (!paymentRequestId) {
          return res.status(400).json({ error: 'paymentRequestId is required' });
        }
        if (!transactionReference || transactionReference.length < 4) {
          return res.status(400).json({ error: 'Valid transaction reference is required' });
        }
        if (!senderPhoneOrHandle) {
          return res.status(400).json({ error: 'Sender phone or handle is required' });
        }
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: 'Payment receipt image file is required' });
        }

        const updated = await submitEvidence({
          profileId: req.authUser!.id,
          paymentRequestId,
          transactionReference,
          senderPhoneOrHandle,
          receiptBuffer: req.file.buffer,
          filename: req.file.originalname || 'receipt.png',
          contentType: req.file.mimetype || 'image/png',
          sizeBytes: req.file.size,
        });

        return res.json({
          success: true,
          paymentRequest: updated,
          provisionalAccessGranted: updated.status === 'temporary_access',
        });
      } catch (error: any) {
        console.error('Evidence submission error:', error);
        return res.status(400).json({ error: error.message || 'Failed to submit payment evidence' });
      }
    }
  );

  // Candidate: View own payment requests
  app.get('/api/payments/my-requests', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const requests = await listPaymentRequestsForUser(req.authUser!.id);
      return res.json({ success: true, requests });
    } catch (error) {
      console.error('Failed to list user payment requests:', error);
      return res.status(500).json({ error: 'Failed to retrieve payment history' });
    }
  });

  // Candidate: Get details and verifications of a specific payment request
  app.get('/api/payments/requests/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const requestId = req.params.id;
      const request = await getPaymentRequestById(requestId, req.authUser!.id);
      if (!request) {
        return res.status(404).json({ error: 'Payment request not found' });
      }

      const verifications = await listVerifications(requestId);
      return res.json({ success: true, request, verifications });
    } catch (error) {
      console.error('Failed to get payment request:', error);
      return res.status(500).json({ error: 'Failed to retrieve payment details' });
    }
  });

  /* -------------------------------------------------------------------------- */
  /* AI Credits & Ledger Routes                                                 */
  /* -------------------------------------------------------------------------- */

  // Candidate: Get current credit balance and monthly allocation
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

  /* -------------------------------------------------------------------------- */
  /* Coupons & Birthday Promotions (Egypt Law 151)                             */
  /* -------------------------------------------------------------------------- */

  // Candidate: Validate promotional discount code
  app.post('/api/coupons/validate', requireAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const code = String(req.body?.code ?? '').trim();
      const planCode = String(req.body?.planCode ?? 'student').trim();
      const amountPiasters = Number(req.body?.amountPiasters ?? 0);

      const result = await validateCoupon(code, planCode, amountPiasters);
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error('Coupon validation error:', error);
      return res.status(500).json({ error: 'Failed to validate coupon' });
    }
  });

  // Candidate: Save Law 151 birthday consent and provision 30% discount
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
    '/api/admin/payments',
    requireAuth,
    requireAdmin,
    requirePermission('payments.read'),
    async (req: AdminRequest, res: Response) => {
      try {
        const statusFilter = req.query.status ? String(req.query.status) : undefined;
        let query = getSupabaseServer()
          .from('payment_requests')
          .select(`
            id, profile_id, plan_id, billing_cycle,
            original_amount_piasters, discount_amount_piasters, amount_piasters,
            currency, payment_method, status, transaction_reference,
            sender_phone_or_handle, receipt_storage_path, receipt_filename,
            risk_score, risk_flags, temporary_access_granted_at,
            temporary_access_expires_at, review_notes, rejection_reason,
            reviewed_by, reviewed_at, paid_at, expires_at, created_at,
            subscription_plans(code, name_en, name_ar),
            profiles:profile_id(full_name, username)
          `)
          .order('created_at', { ascending: false })
          .limit(100);

        if (statusFilter) {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        return res.json({ success: true, payments: data ?? [] });
      } catch (error) {
        console.error('Admin payments query failed:', error);
        return res.status(500).json({ error: 'Failed to load payments' });
      }
    }
  );

  // Admin: Confirm payment and activate candidate subscription
  app.post(
    '/api/admin/payments/:id/confirm',
    requireAuth,
    requireAdmin,
    requirePermission('payments.confirm'),
    async (req: AdminRequest, res: Response) => {
      try {
        const paymentId = req.params.id;
        const notes = req.body?.notes ? String(req.body.notes).slice(0, 500) : undefined;

        const outcome = await confirmPaymentByAdmin(req.admin!.id, paymentId, notes);
        if (!outcome.success) {
          return res.status(400).json({ error: outcome.error || 'Failed to confirm payment' });
        }

        await logAdminAction(req.admin!, {
          action: 'payments.confirmed',
          entityType: 'payment_request',
          entityId: paymentId,
          metadata: {
            subscriptionId: outcome.subscriptionId,
            creditsGranted: outcome.creditsGranted,
            notes,
          },
        });

        return res.json({
          success: true,
          subscriptionId: outcome.subscriptionId,
          creditsGranted: outcome.creditsGranted,
        });
      } catch (error) {
        console.error('Admin confirm payment error:', error);
        return res.status(500).json({ error: 'Failed to confirm payment' });
      }
    }
  );

  // Admin: Reject payment request with reason
  app.post(
    '/api/admin/payments/:id/reject',
    requireAuth,
    requireAdmin,
    requirePermission('payments.confirm'),
    async (req: AdminRequest, res: Response) => {
      try {
        const paymentId = req.params.id;
        const reason = String(req.body?.reason ?? 'Payment verification failed').slice(0, 500);
        const notes = req.body?.notes ? String(req.body.notes).slice(0, 500) : undefined;

        const outcome = await rejectPaymentByAdmin(req.admin!.id, paymentId, reason, notes);
        if (!outcome.success) {
          return res.status(400).json({ error: outcome.error || 'Failed to reject payment' });
        }

        await logAdminAction(req.admin!, {
          action: 'payments.rejected',
          entityType: 'payment_request',
          entityId: paymentId,
          metadata: { reason, notes },
        });

        return res.json({ success: true });
      } catch (error) {
        console.error('Admin reject payment error:', error);
        return res.status(500).json({ error: 'Failed to reject payment' });
      }
    }
  );

  // Admin: Restore late payment
  app.post(
    '/api/admin/payments/:id/restore',
    requireAuth,
    requireAdmin,
    requirePermission('payments.confirm'),
    async (req: AdminRequest, res: Response) => {
      try {
        const paymentId = req.params.id;
        const notes = req.body?.notes ? String(req.body.notes).slice(0, 500) : undefined;

        const outcome = await restorePaymentByAdmin(req.admin!.id, paymentId, notes);
        if (!outcome.success) {
          return res.status(400).json({ error: outcome.error || 'Failed to restore payment' });
        }

        await logAdminAction(req.admin!, {
          action: 'payments.restored',
          entityType: 'payment_request',
          entityId: paymentId,
          metadata: { subscriptionId: outcome.subscriptionId, notes },
        });

        return res.json({ success: true, subscriptionId: outcome.subscriptionId });
      } catch (error) {
        console.error('Admin restore payment error:', error);
        return res.status(500).json({ error: 'Failed to restore payment' });
      }
    }
  );

  // Admin: Financial & Revenue Metrics
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
        // `server/stripe/revenue.ts` so the refund and double-counting rules
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

        // Stripe invoices are a mirror written by the signed webhook. The
        // mirror is optional: a deployment that has not applied the Stripe
        // migration must still render this page, so a failure is logged and
        // reported rather than thrown.
        const { data: stripeInvoiceRows, error: stripeInvoiceError } = await getSupabaseServer()
          .from('stripe_invoices')
          .select(`
            id, number, status, amount_paid, amount_due, currency, livemode, paid,
            plan_code, billing_cycle, purchase_kind, subscription_id,
            hosted_invoice_url, invoice_created_at, created_at
          `)
          .order('created_at', { ascending: false });

        if (stripeInvoiceError) {
          console.error('Admin revenue: Stripe invoice query failed:', stripeInvoiceError);
        }
        const invoices: StripeInvoiceRevenueRow[] = stripeInvoiceError
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
          console.error('Admin revenue: Stripe refund query failed:', refundError);
        }
        const refunds: StripeRefundRevenueRow[] = refundError
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
          console.error('Admin revenue: Stripe dispute query failed:', disputeError);
        }
        const disputes: StripeDisputeRevenueRow[] = disputeError
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

        const metrics = computeAdminRevenue(
          { payments, invoices, refunds, disputes },
          {
            testMode: isTestMode(),
            range: parsedRange.range,
            stripeAvailable: !stripeInvoiceError,
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
  app.post(
    '/api/admin/credits/grant',
    requireAuth,
    requireAdmin,
    requirePermission('credits.grant'),
    async (req: AdminRequest, res: Response) => {
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

