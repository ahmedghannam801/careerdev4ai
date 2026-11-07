/**
 * Database access for the Stripe subsystem.
 *
 * Stripe is the source of truth for card payments and subscriptions; these
 * tables are a local mirror that the application reads without calling Stripe
 * on every request. They are written only by the webhook handler and the
 * checkout flow, both of which run with the service-role client, and no client
 * role has INSERT or UPDATE on them.
 */

import { getSupabaseServer } from '../db/supabase.ts';
import { isTestMode } from './config.ts';
import type {
  StripeCustomer,
  StripeCustomerRow,
  StripeDispute,
  StripeInvoice,
  StripeInvoiceRow,
  StripeRefund,
  StripeSubscription,
  StripeSubscriptionRow,
} from './types.ts';

function isoFromUnix(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function eventIso(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * True when an event is older than the newest one already applied to the row.
 *
 * Stripe delivers at least once and not necessarily in order. Without this
 * check, a delayed `invoice.payment_failed` could overwrite the paid state of
 * an invoice, or a delayed `customer.subscription.updated` could reactivate a
 * subscription that was cancelled a second later.
 */
function isOlderThanApplied(
  lastEventAt: string | null | undefined,
  eventCreated: number | null | undefined
): boolean {
  if (!eventCreated || !lastEventAt) return false;
  return new Date(lastEventAt).getTime() > new Date(eventCreated * 1000).getTime();
}

export async function getStripeCustomerRow(
  profileId: string
): Promise<StripeCustomerRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('stripe_customers')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read stripe_customers: ${error.message}`);
  return (data as StripeCustomerRow | null) ?? null;
}

export async function getStripeCustomerByStripeId(
  customerId: string
): Promise<StripeCustomerRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('stripe_customers')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read stripe_customers: ${error.message}`);
  return (data as StripeCustomerRow | null) ?? null;
}

export async function saveStripeCustomer(
  profileId: string,
  customer: StripeCustomer
): Promise<StripeCustomerRow> {
  const { data, error } = await getSupabaseServer()
    .from('stripe_customers')
    .upsert(
      {
        profile_id: profileId,
        stripe_customer_id: customer.id,
        email: customer.email,
        livemode: customer.livemode,
        deleted: Boolean(customer.deleted),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' }
    )
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save stripe_customers: ${error.message}`);
  return data as StripeCustomerRow;
}

/** Mirrors `customer.updated` / `customer.deleted` without changing ownership. */
export async function updateStripeCustomerEmail(
  customerId: string,
  email: string | null,
  deleted = false
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('stripe_customers')
    .update({
      email,
      deleted,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_customer_id', customerId);

  if (error) throw new Error(`Failed to update stripe_customers: ${error.message}`);
}

export interface SubscriptionUpsert {
  profileId: string;
  subscription: StripeSubscription;
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  /** The event's `created` timestamp, used to ignore a delayed older event. */
  eventCreated?: number | null;
}

export async function upsertStripeSubscription(
  input: SubscriptionUpsert
): Promise<StripeSubscriptionRow> {
  const { profileId, subscription, planCode, billingCycle, eventCreated } = input;
  const price = subscription.items?.data?.[0]?.price ?? null;

  const existing = await getStripeSubscriptionRow(subscription.id);
  if (existing && isOlderThanApplied(existing.last_event_at, eventCreated)) {
    return existing;
  }

  const { data, error } = await getSupabaseServer()
    .from('stripe_subscriptions')
    .upsert(
      {
        id: subscription.id,
        profile_id: profileId,
        customer_id: String(subscription.customer),
        plan_code: planCode,
        billing_cycle: billingCycle,
        status: subscription.status,
        price_id: price?.id ?? null,
        current_period_start: isoFromUnix(subscription.current_period_start),
        current_period_end: isoFromUnix(subscription.current_period_end),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: isoFromUnix(subscription.canceled_at),
        ended_at: isoFromUnix(subscription.ended_at),
        trial_end: isoFromUnix(subscription.trial_end),
        livemode: subscription.livemode,
        metadata: subscription.metadata ?? {},
        last_event_at: eventIso(eventCreated) ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single();

  if (error) throw new Error(`Failed to save stripe_subscriptions: ${error.message}`);
  return data as StripeSubscriptionRow;
}

export async function getStripeSubscriptionRow(
  subscriptionId: string
): Promise<StripeSubscriptionRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('stripe_subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read stripe_subscriptions: ${error.message}`);
  return (data as StripeSubscriptionRow | null) ?? null;
}

/**
 * The subscription that currently grants a plan, if any.
 *
 * A `past_due` subscription keeps access until Stripe gives up (it moves to
 * `canceled` or `unpaid`), which mirrors how Stripe's own dunning works. The
 * period end is checked as well so a missed webhook cannot grant access for
 * ever.
 *
 * The row's `livemode` must match the key the server is using. Test data lives
 * in the same database as production data, and a forgotten test subscription
 * must never hand out a paid plan once live keys are deployed.
 */
export async function getActiveStripeSubscription(
  profileId: string
): Promise<StripeSubscriptionRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseServer()
    .from('stripe_subscriptions')
    .select('*')
    .eq('profile_id', profileId)
    .eq('livemode', !isTestMode())
    .in('status', ['active', 'trialing', 'past_due'])
    .gt('current_period_end', now)
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read stripe_subscriptions: ${error.message}`);
  return (data as StripeSubscriptionRow | null) ?? null;
}

/**
 * The most recent subscription in the active mode, whatever its status.
 *
 * The Pricing page uses this to explain a `past_due`, `unpaid`, `incomplete`
 * or `canceled` subscription. Entitlements still come from
 * `getActiveStripeSubscription`: a candidate can see why they lost access
 * without the UI implying they still have it.
 */
export async function getLatestStripeSubscription(
  profileId: string
): Promise<StripeSubscriptionRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('stripe_subscriptions')
    .select('*')
    .eq('profile_id', profileId)
    .eq('livemode', !isTestMode())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to read stripe_subscriptions: ${error.message}`);
  return (data as StripeSubscriptionRow | null) ?? null;
}

/**
 * What the webhook handler should do with an event it has seen before.
 *
 * `new`      — the event was recorded for the first time; process it.
 * `retry`    — a previous attempt failed transiently and left the event
 *              unprocessed; process it again.
 * `duplicate`— the event was already processed, or another delivery is
 *              handling it right now; acknowledge it without side effects.
 */
export type StripeEventRecordStatus = 'new' | 'retry' | 'duplicate';

/**
 * Records an event id and reports what the handler should do with it.
 *
 * Stripe delivers at least once and may retry for days. The primary key on the
 * event id makes the handler idempotent: a retry inserts nothing and is
 * acknowledged without running the side effects twice.
 *
 * A retry is NOT always a duplicate. When a previous attempt failed
 * transiently, the row was left with `processed_at` null and the reason in
 * `error`. Stripe then redelivers the event, and treating that redelivery as
 * a duplicate would swallow it: the customer would have paid and never
 * received the entitlement, and Stripe would stop retrying once it was
 * acknowledged. Such a row is therefore reported as `retry`, so the event is
 * processed again.
 */
export async function recordStripeEvent(event: {
  id: string;
  type: string;
  api_version: string | null;
  livemode: boolean;
  payload: unknown;
}): Promise<StripeEventRecordStatus> {
  const { error } = await getSupabaseServer()
    .from('stripe_webhook_events')
    .insert({
      id: event.id,
      type: event.type,
      api_version: event.api_version,
      livemode: event.livemode,
      payload: event.payload as Record<string, unknown>,
    });

  if (!error) return 'new';
  if (error.code !== '23505') {
    throw new Error(`Failed to record stripe webhook event: ${error.message}`);
  }

  // The event is already known. Was the earlier attempt finished?
  const { data: existing } = await getSupabaseServer()
    .from('stripe_webhook_events')
    .select('processed_at, error')
    .eq('id', event.id)
    .maybeSingle();

  const row = existing as { processed_at: string | null; error: string | null } | null;

  // Unprocessed with a recorded reason: the earlier attempt failed
  // transiently and the side effects never completed. Process it again.
  if (row && row.processed_at === null && row.error) return 'retry';

  return 'duplicate';
}

export async function markStripeEventProcessed(
  eventId: string,
  failure: string | null,
  acknowledged = false
): Promise<void> {
  await getSupabaseServer()
    .from('stripe_webhook_events')
    .update({
      // A transient failure leaves `processed_at` null so the failed row is
      // visible to the operator. An acknowledged-but-unappliable event is
      // closed: Stripe will not retry it and the reason is stored in `error`.
      processed_at: failure && !acknowledged ? null : new Date().toISOString(),
      error: failure,
    })
    .eq('id', eventId);
}

export interface InvoiceUpsertOptions {
  /** The event's `created` timestamp, used to ignore a delayed older event. */
  eventCreated?: number | null;
  planCode?: string | null;
  billingCycle?: 'monthly' | 'annual' | null;
  purchaseKind?: 'subscription' | 'credit_pack' | null;
}

export async function upsertStripeInvoice(
  invoice: StripeInvoice,
  profileId: string | null,
  options: InvoiceUpsertOptions = {}
): Promise<void> {
  const existing = await getStripeInvoiceRow(invoice.id);
  if (existing && isOlderThanApplied(existing.last_event_at, options.eventCreated)) {
    return;
  }

  const metadata = invoice.metadata ?? {};
  const purchaseKind =
    options.purchaseKind ??
    (invoice.subscription || metadata.plan_code
      ? 'subscription'
      : metadata.credit_pack_id
        ? 'credit_pack'
        : null);

  const { error } = await getSupabaseServer()
    .from('stripe_invoices')
    .upsert(
      {
        id: invoice.id,
        profile_id: profileId ?? existing?.profile_id ?? null,
        customer_id: invoice.customer,
        subscription_id: invoice.subscription,
        payment_intent: invoice.payment_intent,
        status: invoice.status,
        billing_reason: invoice.billing_reason,
        number: invoice.number,
        currency: invoice.currency,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        amount_remaining: invoice.amount_remaining ?? 0,
        paid: invoice.paid,
        plan_code: options.planCode ?? metadata.plan_code ?? existing?.plan_code ?? null,
        billing_cycle:
          options.billingCycle ??
          (metadata.billing_cycle as 'monthly' | 'annual' | undefined) ??
          existing?.billing_cycle ??
          null,
        purchase_kind: purchaseKind,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
        period_start: isoFromUnix(invoice.period_start),
        period_end: isoFromUnix(invoice.period_end),
        invoice_created_at: isoFromUnix(invoice.created),
        livemode: invoice.livemode,
        last_event_at: eventIso(options.eventCreated) ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) throw new Error(`Failed to save stripe_invoices: ${error.message}`);
}

export async function getStripeInvoiceRow(invoiceId: string): Promise<StripeInvoiceRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('stripe_invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read stripe_invoices: ${error.message}`);
  return (data as StripeInvoiceRow | null) ?? null;
}

export async function getStripeInvoiceByPaymentIntent(
  paymentIntentId: string
): Promise<StripeInvoiceRow | null> {
  const { data, error } = await getSupabaseServer()
    .from('stripe_invoices')
    .select('*')
    .eq('payment_intent', paymentIntentId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read stripe_invoices: ${error.message}`);
  return (data as StripeInvoiceRow | null) ?? null;
}

export interface RefundUpsert {
  profileId: string | null;
  refund: StripeRefund;
  customerId?: string | null;
  invoiceId?: string | null;
  eventCreated?: number | null;
}

export async function upsertStripeRefund(input: RefundUpsert): Promise<void> {
  const { profileId, refund, customerId, invoiceId, eventCreated } = input;

  const { data: existing, error: readError } = await getSupabaseServer()
    .from('stripe_refunds')
    .select('last_event_at')
    .eq('id', refund.id)
    .maybeSingle();

  if (readError) throw new Error(`Failed to read stripe_refunds: ${readError.message}`);
  if (isOlderThanApplied(existing?.last_event_at, eventCreated)) return;

  const { error } = await getSupabaseServer()
    .from('stripe_refunds')
    .upsert(
      {
        id: refund.id,
        profile_id: profileId,
        customer_id: customerId ?? null,
        invoice_id: invoiceId ?? null,
        charge_id: refund.charge,
        payment_intent: refund.payment_intent,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason,
        livemode: refund.livemode,
        refund_created_at: isoFromUnix(refund.created),
        last_event_at: eventIso(eventCreated) ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) throw new Error(`Failed to save stripe_refunds: ${error.message}`);
}

export interface DisputeUpsert {
  profileId: string | null;
  dispute: StripeDispute;
  customerId?: string | null;
  eventCreated?: number | null;
}

export async function upsertStripeDispute(input: DisputeUpsert): Promise<void> {
  const { profileId, dispute, customerId, eventCreated } = input;

  const { data: existing, error: readError } = await getSupabaseServer()
    .from('stripe_disputes')
    .select('last_event_at')
    .eq('id', dispute.id)
    .maybeSingle();

  if (readError) throw new Error(`Failed to read stripe_disputes: ${readError.message}`);
  if (isOlderThanApplied(existing?.last_event_at, eventCreated)) return;

  const { error } = await getSupabaseServer()
    .from('stripe_disputes')
    .upsert(
      {
        id: dispute.id,
        profile_id: profileId,
        customer_id: customerId ?? null,
        charge_id: dispute.charge,
        payment_intent: dispute.payment_intent,
        amount: dispute.amount,
        currency: dispute.currency,
        status: dispute.status,
        reason: dispute.reason,
        livemode: dispute.livemode,
        dispute_created_at: isoFromUnix(dispute.created),
        last_event_at: eventIso(eventCreated) ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) throw new Error(`Failed to save stripe_disputes: ${error.message}`);
}

export interface GrantCreditsResult {
  granted: boolean;
  balance: number;
}

/** Grants credits through the ledger's atomic, idempotent SQL function. */
export async function grantAiCredits(input: {
  profileId: string;
  amount: number;
  idempotencyKey: string;
  sourceType: 'payment' | 'subscription';
  sourceId: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<GrantCreditsResult> {
  const { data, error } = await getSupabaseServer().rpc('grant_ai_credits', {
    p_profile_id: input.profileId,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_description: input.description,
    p_metadata: input.metadata ?? {},
  });

  if (error) throw new Error(`Failed to grant AI credits: ${error.message}`);

  const result = data as { granted?: boolean; balance?: number } | null;
  return {
    granted: Boolean(result?.granted),
    balance: Number(result?.balance ?? 0),
  };
}
