/**
 * Database access for XPay.
 *
 * XPay is the source of truth for a card payment; these tables are the
 * platform's own record of it, written only by the webhook handler and the
 * checkout flow with the service-role client. A signed-in candidate may read
 * their own rows and nothing else.
 *
 * The three questions this file answers:
 *
 *   * has this event already been handled? (`recordXPayEvent`)
 *   * what was this session, and has it been paid? (`upsertXPaySession`)
 *   * what does this candidate's money grant, until when? (`getActiveXPayAccess`)
 */

import { getSupabaseServer } from '../db/supabase.ts';
import type { BillingCycle } from '../../shared/subscriptions.ts';

export type XPayEventRecordStatus = 'new' | 'duplicate' | 'retry';

export interface XPayEventRow {
  id: string;
  type: string;
  status: 'received' | 'processed' | 'failed';
  error: string | null;
  attempts: number;
  received_at: string;
  processed_at: string | null;
}

/**
 * Records one delivery.
 *
 * `new` runs the side effects, `duplicate` skips them, and `retry` runs them
 * again because the earlier attempt failed before finishing — a redelivery of
 * a failed event is useful, a redelivery of a finished one is not.
 */
export async function recordXPayEvent(event: {
  id: string;
  type: string;
  livemode: boolean;
  payload: unknown;
}): Promise<XPayEventRecordStatus> {
  const { error } = await getSupabaseServer().from('xpay_webhook_events').insert({
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    payload: event.payload as Record<string, unknown>,
  });

  if (!error) return 'new';
  if (error.code !== '23505') {
    throw new Error(`Failed to record XPay event: ${error.message}`);
  }

  const { data } = await getSupabaseServer()
    .from('xpay_webhook_events')
    .select('processed_at, error, attempts')
    .eq('id', event.id)
    .maybeSingle();

  const row = data as { processed_at: string | null; error: string | null; attempts: number } | null;
  if (!row) return 'duplicate';
  if (row.processed_at && !row.error) return 'duplicate';

  await getSupabaseServer()
    .from('xpay_webhook_events')
    .update({ attempts: (row.attempts ?? 1) + 1 })
    .eq('id', event.id);

  return 'retry';
}

export async function markXPayEventProcessed(eventId: string, error: string | null): Promise<void> {
  await getSupabaseServer()
    .from('xpay_webhook_events')
    .update({
      status: error ? 'failed' : 'processed',
      error,
      processed_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

export interface XPayCheckoutSessionRow {
  id: string;
  profile_id: string;
  purchase_kind: 'subscription' | 'credit_pack';
  plan_code: string | null;
  billing_cycle: BillingCycle | null;
  pack_id: string | null;
  credits: number;
  list_amount: number;
  discount_amount: number;
  amount_total: number;
  currency: string;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  payment_method_type: string | null;
  payment_intent_id: string | null;
  voucher_reference: string | null;
  voucher_expires_at: string | null;
  coupon_code: string | null;
  livemode: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UpsertXPaySessionInput {
  id: string;
  profileId: string;
  purchaseKind: 'subscription' | 'credit_pack';
  planCode: string | null;
  billingCycle: BillingCycle | null;
  packId: string | null;
  credits: number;
  listAmount: number;
  discountAmount: number;
  amountTotal: number;
  currency: string;
  status: 'open' | 'complete' | 'expired';
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  paymentMethodType: string | null;
  paymentIntentId: string | null;
  voucherReference: string | null;
  voucherExpiresAt: string | null;
  couponCode: string | null;
  livemode: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Writes the session as this platform understands it.
 *
 * `payment_status` is only ever moved by something that saw the payment: the
 * checkout creation writes `unpaid`, and a verified webhook or a reconciled
 * session writes `paid`. A session that is already paid is never moved back to
 * unpaid by a late delivery, which is why `paid` wins in the merge below.
 */
export async function upsertXPaySession(input: UpsertXPaySessionInput): Promise<XPayCheckoutSessionRow> {
  const now = new Date().toISOString();
  const { data: existing } = await getSupabaseServer()
    .from('xpay_checkout_sessions')
    .select('payment_status, status')
    .eq('id', input.id)
    .maybeSingle();

  const existingRow = existing as { payment_status: string; status: string } | null;
  const alreadyPaid = existingRow?.payment_status === 'paid';
  const paymentStatus = alreadyPaid ? 'paid' : input.paymentStatus;
  const status = existingRow?.status === 'complete' ? 'complete' : input.status;

  const { data, error } = await getSupabaseServer()
    .from('xpay_checkout_sessions')
    .upsert(
      {
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
        status,
        payment_status: paymentStatus,
        payment_method_type: input.paymentMethodType,
        payment_intent_id: input.paymentIntentId,
        voucher_reference: input.voucherReference,
        voucher_expires_at: input.voucherExpiresAt,
        coupon_code: input.couponCode,
        livemode: input.livemode,
        metadata: input.metadata,
        updated_at: now,
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save xpay_checkout_sessions: ${error.message}`);
  return data as XPayCheckoutSessionRow;
}

export async function getXPaySessionRow(sessionId: string): Promise<XPayCheckoutSessionRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('xpay_checkout_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read xpay_checkout_sessions: ${error.message}`);
  return (data as XPayCheckoutSessionRow | null) ?? null;
}

export interface XPayPurchaseRow {
  id: string;
  profile_id: string;
  session_id: string;
  purchase_kind: 'subscription' | 'credit_pack';
  plan_code: string | null;
  billing_cycle: BillingCycle | null;
  pack_id: string | null;
  credits: number;
  amount_total: number;
  currency: string;
  payment_method_type: string | null;
  livemode: boolean;
  access_starts_at: string;
  access_ends_at: string | null;
  status: 'active' | 'refunded' | 'revoked';
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Records the purchase that a paid session bought.
 *
 * This is the row that makes fulfilment idempotent without relying on the event
 * table: `session_id` is unique, so a second fulfilment of the same session
 * cannot create a second plan period. It returns null in that case, and the
 * caller reads the existing row.
 */
export async function recordXPayPurchase(input: {
  profileId: string;
  sessionId: string;
  purchaseKind: 'subscription' | 'credit_pack';
  planCode: string | null;
  billingCycle: BillingCycle | null;
  packId: string | null;
  credits: number;
  amountTotal: number;
  currency: string;
  paymentMethodType: string | null;
  livemode: boolean;
  accessStartsAt: string;
  accessEndsAt: string | null;
  metadata: Record<string, unknown>;
}): Promise<XPayPurchaseRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('xpay_purchases')
    .insert({
      profile_id: input.profileId,
      session_id: input.sessionId,
      purchase_kind: input.purchaseKind,
      plan_code: input.planCode,
      billing_cycle: input.billingCycle,
      pack_id: input.packId,
      credits: input.credits,
      amount_total: input.amountTotal,
      currency: input.currency,
      payment_method_type: input.paymentMethodType,
      livemode: input.livemode,
      access_starts_at: input.accessStartsAt,
      access_ends_at: input.accessEndsAt,
      metadata: input.metadata,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') return null;
    throw new Error(`Failed to record xpay_purchases: ${error.message}`);
  }
  return data as XPayPurchaseRow;
}

export async function getXPayPurchaseBySession(sessionId: string): Promise<XPayPurchaseRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('xpay_purchases')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read xpay_purchases: ${error.message}`);
  return (data as XPayPurchaseRow | null) ?? null;
}

/**
 * The plan period this candidate's card payments currently grant.
 *
 * Only the payment mode in which the deployment runs is honoured: test data and
 * live data share a database, and a leftover test purchase must not hand out a
 * paid plan once live keys are deployed.
 */
export async function getActiveXPayAccess(profileId: string): Promise<XPayPurchaseRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('xpay_purchases')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .eq('livemode', !isXPayTestDeployment())
    .not('access_ends_at', 'is', null)
    .gt('access_ends_at', new Date().toISOString())
    .order('access_ends_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read xpay_purchases: ${error.message}`);
  return (data as XPayPurchaseRow | null) ?? null;
}

export async function listXPaySessionsForProfile(profileId: string): Promise<XPayCheckoutSessionRow[]> {
  const { data, error } = await getSupabaseServer()
    .from('xpay_checkout_sessions')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(`Failed to read xpay_checkout_sessions: ${error.message}`);
  return (data as XPayCheckoutSessionRow[]) ?? [];
}

/**
 * True while this deployment uses a test key.
 *
 * Declared here rather than imported from config to keep the store free of the
 * client, and kept deliberately simple: only a live key means live rows.
 */
function isXPayTestDeployment(): boolean {
  const key = (process.env.XPAY_SECRET_KEY ?? '').trim();
  return !(key.startsWith('sk_live_') || key.startsWith('rk_live_'));
}
