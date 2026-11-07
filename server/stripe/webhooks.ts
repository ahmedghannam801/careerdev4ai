/**
 * Stripe webhook dispatch.
 *
 * Every event is recorded before it is handled, and the handler's side effects
 * are idempotent in their own right (upsert by id, ledger grant by unique
 * idempotency key, and a `last_event_at` guard for out-of-order delivery). That
 * combination is what makes Stripe's at-least-once delivery safe: a retry
 * either does nothing or re-applies the same state.
 *
 * The dispatcher takes its database and Stripe calls as an injected dependency
 * object. Production uses `stripeWebhookDeps`; the lifecycle tests use fakes,
 * so the exact duplication, ordering and payment-status rules are exercised
 * without a key or a database.
 */

import { CREDIT_PACKS } from '../../shared/credits.ts';
import { getPlanByCode } from '../db/subscriptions.ts';
import { redeemBirthdayReward } from '../birthday/service.ts';
import { stripeGet } from './client.ts';
import {
  getStripeCustomerByStripeId,
  getStripeInvoiceByPaymentIntent,
  grantAiCredits,
  markStripeEventProcessed,
  recordStripeEvent,
  updateStripeCustomerEmail,
  upsertStripeDispute,
  upsertStripeInvoice,
  upsertStripeRefund,
  upsertStripeSubscription,
} from './store.ts';
import type {
  StripeCharge,
  StripeCheckoutSession,
  StripeCustomer,
  StripeDispute,
  StripeEvent,
  StripeInvoice,
  StripeRefund,
  StripeSubscription,
} from './types.ts';

/**
 * A failure that retrying cannot fix: the event is missing the metadata the
 * application needs, names a product it does not sell, or belongs to no known
 * profile. The event is acknowledged and recorded rather than retried for
 * three days.
 */
export class PermanentStripeEventError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PermanentStripeEventError';
    this.code = code;
  }
}

export interface StripeWebhookDeps {
  recordEvent: typeof recordStripeEvent;
  markEventProcessed: typeof markStripeEventProcessed;
  getCustomerByStripeId: typeof getStripeCustomerByStripeId;
  getPlanByCode: typeof getPlanByCode;
  upsertSubscription: typeof upsertStripeSubscription;
  upsertInvoice: typeof upsertStripeInvoice;
  grantCredits: typeof grantAiCredits;
  upsertRefund: typeof upsertStripeRefund;
  upsertDispute: typeof upsertStripeDispute;
  updateCustomerEmail: typeof updateStripeCustomerEmail;
  getInvoiceByPaymentIntent: typeof getStripeInvoiceByPaymentIntent;
  fetchSubscription: (subscriptionId: string) => Promise<StripeSubscription>;
  fetchCharge: (chargeId: string) => Promise<StripeCharge>;
  fetchRefundsForCharge: (chargeId: string) => Promise<StripeRefund[]>;
}

export const stripeWebhookDeps: StripeWebhookDeps = {
  recordEvent: recordStripeEvent,
  markEventProcessed: markStripeEventProcessed,
  getCustomerByStripeId: getStripeCustomerByStripeId,
  getPlanByCode,
  upsertSubscription: upsertStripeSubscription,
  upsertInvoice: upsertStripeInvoice,
  grantCredits: grantAiCredits,
  upsertRefund: upsertStripeRefund,
  upsertDispute: upsertStripeDispute,
  updateCustomerEmail: updateStripeCustomerEmail,
  getInvoiceByPaymentIntent: getStripeInvoiceByPaymentIntent,
  fetchSubscription: (subscriptionId) =>
    stripeGet<StripeSubscription>(`/v1/subscriptions/${subscriptionId}`),
  fetchCharge: (chargeId) => stripeGet<StripeCharge>(`/v1/charges/${chargeId}`),
  fetchRefundsForCharge: async (chargeId) => {
    const response = await stripeGet<{ data: StripeRefund[] }>('/v1/refunds', {
      charge: chargeId,
      limit: 100,
    });
    return response.data;
  },
};

export interface ProcessResult {
  received: true;
  duplicate: boolean;
  handled: string[];
  /** True when the event was acknowledged but could not be applied. */
  ignored?: boolean;
  reason?: string;
  /**
   * True when this delivery was a redelivery of an event whose earlier
   * attempt failed. The side effects ran again, because the earlier attempt
   * never completed them.
   */
  retried?: boolean;
}

/**
 * Parses a subscription Price lookup key such as
 * `careerdev4ai_career_plus_monthly` back into the plan and cycle.
 */
export function parseSubscriptionLookupKey(
  lookupKey: string | null | undefined
): { planCode: string; billingCycle: 'monthly' | 'annual' } | null {
  if (!lookupKey) return null;
  const match = /^careerdev4ai_(.+)_(monthly|annual)$/.exec(lookupKey);
  if (!match) return null;
  return {
    planCode: match[1],
    billingCycle: match[2] as 'monthly' | 'annual',
  };
}

/** The credit pack named in metadata, or null when this is not a pack purchase. */
export function creditPackFromMetadata(metadata: Record<string, string | undefined>): {
  packId: string;
  credits: number;
} | null {
  const packId = metadata.credit_pack_id;
  if (!packId) return null;

  const pack = CREDIT_PACKS.find((candidate) => candidate.id === packId);
  if (!pack) {
    throw new PermanentStripeEventError(
      'unknown_credit_pack',
      `Unknown credit pack "${packId}" in Stripe metadata.`
    );
  }

  const declared = Number.parseInt(metadata.credits ?? '', 10);
  if (Number.isFinite(declared) && declared !== pack.credits) {
    throw new PermanentStripeEventError(
      'credit_pack_mismatch',
      `Stripe metadata says ${declared} credits for pack "${packId}", but the catalogue says ${pack.credits}.`
    );
  }

  return { packId: pack.id, credits: pack.credits };
}

async function resolveProfileId(
  deps: StripeWebhookDeps,
  customerId: string | null,
  candidateIds: Array<string | null | undefined>
): Promise<string | null> {
  for (const candidate of candidateIds) {
    if (candidate && candidate.length > 0) return candidate;
  }
  if (customerId) {
    const mapping = await deps.getCustomerByStripeId(customerId);
    if (mapping) return mapping.profile_id;
  }
  return null;
}

function planFromSubscription(subscription: StripeSubscription): {
  planCode: string;
  billingCycle: 'monthly' | 'annual';
} {
  const metadata = subscription.metadata ?? {};
  const price = subscription.items?.data?.[0]?.price ?? null;
  const fromKey = parseSubscriptionLookupKey(price?.lookup_key);

  const planCode = metadata.plan_code || fromKey?.planCode || '';
  const billingCycle =
    (metadata.billing_cycle as 'monthly' | 'annual' | undefined) ||
    fromKey?.billingCycle ||
    (price?.recurring?.interval === 'year' ? 'annual' : 'monthly');

  if (!planCode) {
    throw new PermanentStripeEventError(
      'missing_plan_code',
      `Subscription ${subscription.id} has no plan_code metadata and its price has no recognised lookup key (${price?.lookup_key ?? 'none'}).`
    );
  }

  return { planCode, billingCycle };
}

interface SubscriptionContext {
  profileId: string;
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  subscription: StripeSubscription;
}

async function applySubscription(
  deps: StripeWebhookDeps,
  subscription: StripeSubscription,
  eventCreated: number | null | undefined
): Promise<SubscriptionContext> {
  const metadata = subscription.metadata ?? {};
  const profileId = await resolveProfileId(deps, String(subscription.customer), [
    metadata.profile_id,
  ]);
  if (!profileId) {
    throw new PermanentStripeEventError(
      'unknown_customer',
      `Subscription ${subscription.id} has no profile mapping. Add metadata.profile_id at creation.`
    );
  }

  const { planCode, billingCycle } = planFromSubscription(subscription);
  await deps.upsertSubscription({
    profileId,
    subscription,
    planCode,
    billingCycle,
    eventCreated,
  });

  return { profileId, planCode, billingCycle, subscription };
}

/**
 * The idempotency key for a credit-pack purchase.
 *
 * The PaymentIntent is the one identifier shared by the Checkout Session and
 * the invoice it generates. Keying on it means the two paths (`checkout.session
 * .completed` and `invoice.paid`) grant the pack exactly once even if both
 * arrive. The session id is only a fallback for the unusual no-PaymentIntent
 * case, where the invoice path deliberately does not grant.
 */
export function packIdempotencyKey(
  paymentIntentId: string | null | undefined,
  fallbackId: string
): string {
  return paymentIntentId ? `stripe_pack_pi_${paymentIntentId}` : `stripe_pack_${fallbackId}`;
}

async function grantCreditPack(
  deps: StripeWebhookDeps,
  input: {
    profileId: string;
    packId: string;
    credits: number;
    paymentIntentId: string | null;
    checkoutSessionId?: string | null;
    invoiceId?: string | null;
  }
): Promise<void> {
  const fallback = input.checkoutSessionId ?? input.invoiceId;
  if (!input.paymentIntentId && !fallback) return;

  await deps.grantCredits({
    profileId: input.profileId,
    amount: input.credits,
    idempotencyKey: packIdempotencyKey(input.paymentIntentId, fallback ?? 'unknown'),
    sourceType: 'payment',
    sourceId: null,
    description: `Credit pack ${input.packId} (${input.credits} credits) purchased by card`,
    metadata: {
      pack_id: input.packId,
      ...(input.checkoutSessionId
        ? { stripe_checkout_session: input.checkoutSessionId }
        : {}),
      ...(input.invoiceId ? { stripe_invoice: input.invoiceId } : {}),
      ...(input.paymentIntentId ? { stripe_payment_intent: input.paymentIntentId } : {}),
    },
  });
}

async function handleCheckoutSession(
  deps: StripeWebhookDeps,
  session: StripeCheckoutSession,
  eventCreated: number | null | undefined
): Promise<void> {
  if (session.mode === 'setup') return;

  const metadata = session.metadata ?? {};
  const profileId = await resolveProfileId(deps, session.customer, [
    metadata.profile_id,
    session.client_reference_id,
  ]);
  if (!profileId) {
    throw new PermanentStripeEventError(
      'unknown_customer',
      `Checkout session ${session.id} has no profile_id to credit.`
    );
  }

  if (session.mode === 'payment') {
    // The browser returning to the success URL is not evidence of payment.
    // Only Stripe's `payment_status` is. An asynchronous method reports
    // `unpaid` here and is granted when `async_payment_succeeded` arrives.
    if (session.payment_status !== 'paid') return;

    const pack = creditPackFromMetadata(metadata);
    if (!pack) {
      throw new PermanentStripeEventError(
        'missing_credit_pack',
        `Paid Checkout session ${session.id} has no credit_pack_id metadata.`
      );
    }

    await grantCreditPack(deps, {
      profileId,
      packId: pack.packId,
      credits: pack.credits,
      paymentIntentId: session.payment_intent,
      checkoutSessionId: session.id,
    });
    await recordBirthdayRedemption(profileId, metadata);
    return;
  }

  if (session.mode === 'subscription' && session.subscription) {
    const subscription = await deps.fetchSubscription(session.subscription);
    await applySubscription(deps, subscription, eventCreated);
    await recordBirthdayRedemption(profileId, metadata);
  }
}

/**
 * Records that the birthday discount was used.
 *
 * The discount is marked as spent once, and only once the payment is
 * confirmed by Stripe. A second Checkout Session for the same birthday finds
 * nothing left to claim.
 */
async function recordBirthdayRedemption(
  profileId: string,
  metadata: Record<string, string | undefined>
): Promise<void> {
  const applied = Number(metadata.birthday_discount_piasters ?? '0');
  if (!Number.isFinite(applied) || applied <= 0) return;

  try {
    await redeemBirthdayReward(profileId);
  } catch (error) {
    // A failure to record the redemption must never undo a payment that
    // Stripe has already confirmed.
    console.error('Failed to record the birthday redemption:', error);
  }
}

async function handleSubscriptionChange(
  deps: StripeWebhookDeps,
  subscription: StripeSubscription,
  eventCreated: number | null | undefined
): Promise<void> {
  await applySubscription(deps, subscription, eventCreated);
}

/**
 * Handles every paid-invoice shape.
 *
 * `invoice.paid` and `invoice.payment_succeeded` are both accepted; the
 * per-invoice idempotency key means a deployment subscribed to both cannot
 * grant the monthly allowance twice. A failed or voided invoice is mirrored
 * and never grants credits.
 */
async function handleInvoice(
  deps: StripeWebhookDeps,
  invoice: StripeInvoice,
  eventCreated: number | null | undefined
): Promise<void> {
  const metadata = invoice.metadata ?? {};
  const isPaid = invoice.paid === true || invoice.status === 'paid';

  let profileId = await resolveProfileId(deps, invoice.customer, [metadata.profile_id]);
  let planCode: string | null = metadata.plan_code ?? null;
  let billingCycle: 'monthly' | 'annual' | null =
    (metadata.billing_cycle as 'monthly' | 'annual' | undefined) ?? null;
  let purchaseKind: 'subscription' | 'credit_pack' | null = invoice.subscription
    ? 'subscription'
    : metadata.credit_pack_id
      ? 'credit_pack'
      : null;

  if (invoice.subscription) {
    // Mirror the subscription first. The invoice row points at it, and on the
    // very first invoice the two events race; writing the parent first removes
    // the ordering dependency entirely.
    const subscription = await deps.fetchSubscription(invoice.subscription);
    const context = await applySubscription(deps, subscription, eventCreated);
    profileId = profileId ?? context.profileId;
    planCode = context.planCode;
    billingCycle = context.billingCycle;
    purchaseKind = 'subscription';
  }

  await deps.upsertInvoice(invoice, profileId, {
    eventCreated,
    planCode,
    billingCycle,
    purchaseKind,
  });

  if (!isPaid) return;

  if (invoice.subscription) {
    // Grant the plan's monthly allowance once per paid invoice. The invoice id
    // is the idempotency key, so a retry cannot double-grant, and proration
    // invoices (subscription_update) are deliberately excluded: they are a
    // change to an existing cycle, not a new allowance.
    const grantsAllowance =
      invoice.billing_reason === 'subscription_create' ||
      invoice.billing_reason === 'subscription_cycle';

    if (!grantsAllowance || invoice.amount_paid <= 0) return;

    const plan = await deps.getPlanByCode(planCode ?? '');
    const credits = plan?.monthlyAiCredits ?? Number.parseInt(metadata.monthly_credits ?? '', 10);
    if (!plan || !Number.isFinite(credits) || credits <= 0) return;

    if (!profileId) return;

    await deps.grantCredits({
      profileId,
      amount: credits,
      idempotencyKey: `stripe_invoice_${invoice.id}`,
      sourceType: 'subscription',
      sourceId: null,
      description: `${plan.nameEn} monthly AI credits (invoice ${invoice.number ?? invoice.id})`,
      metadata: {
        stripe_invoice: invoice.id,
        stripe_subscription: invoice.subscription,
        billing_reason: invoice.billing_reason,
      },
    });
    return;
  }

  // A one-time pack invoice is the second, independent confirmation path. It
  // is keyed on the PaymentIntent, so it cannot double-grant with the Checkout
  // Session event. If no PaymentIntent is present, only the session path may
  // grant, which is safer than guessing a key.
  const pack = creditPackFromMetadata(metadata);
  if (!pack || !profileId || !invoice.payment_intent) return;

  await grantCreditPack(deps, {
    profileId,
    packId: pack.packId,
    credits: pack.credits,
    paymentIntentId: invoice.payment_intent,
    invoiceId: invoice.id,
  });
}

async function handleCustomer(
  deps: StripeWebhookDeps,
  customer: StripeCustomer,
  deleted: boolean
): Promise<void> {
  await deps.updateCustomerEmail(customer.id, customer.email ?? null, deleted);
}

async function handleRefund(
  deps: StripeWebhookDeps,
  refund: StripeRefund,
  eventCreated: number | null | undefined,
  knownCharge?: StripeCharge | null
): Promise<void> {
  const charge =
    knownCharge ??
    (refund.charge ? await deps.fetchCharge(refund.charge) : null);

  const customerId = charge?.customer ?? null;
  const profileId = await resolveProfileId(deps, customerId, [
    refund.metadata?.profile_id,
    charge?.metadata?.profile_id,
  ]);

  let invoiceId = charge?.invoice ?? null;
  if (!invoiceId && refund.payment_intent) {
    const invoiceRow = await deps.getInvoiceByPaymentIntent(refund.payment_intent);
    invoiceId = invoiceRow?.id ?? null;
  }

  await deps.upsertRefund({
    profileId,
    refund,
    customerId,
    invoiceId,
    eventCreated,
  });
}

async function handleChargeRefunded(
  deps: StripeWebhookDeps,
  charge: StripeCharge,
  eventCreated: number | null | undefined
): Promise<void> {
  // `charge.refunded` carries the charge, not the individual refund objects.
  // Listing the charge's refunds and upserting each one keeps this path and
  // the `refund.*` path writing the same rows, so neither double-counts.
  const refunds = await deps.fetchRefundsForCharge(charge.id);
  for (const refund of refunds) {
    await handleRefund(deps, refund, eventCreated, charge);
  }
}

async function handleDispute(
  deps: StripeWebhookDeps,
  dispute: StripeDispute,
  eventCreated: number | null | undefined
): Promise<void> {
  const charge = dispute.charge ? await deps.fetchCharge(dispute.charge) : null;
  const customerId = charge?.customer ?? null;
  const profileId = await resolveProfileId(deps, customerId, [
    charge?.metadata?.profile_id,
  ]);

  await deps.upsertDispute({ profileId, dispute, customerId, eventCreated });
}

async function dispatch(
  deps: StripeWebhookDeps,
  event: StripeEvent<unknown>
): Promise<string[]> {
  const handled: string[] = [];
  const object = event.data?.object;

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutSession(deps, object as StripeCheckoutSession, event.created);
      handled.push(event.type);
      break;

    case 'checkout.session.async_payment_failed':
      // Stripe has confirmed the delayed payment did not succeed. There is
      // nothing to grant and nothing to retry; the session is recorded in the
      // event log for support.
      handled.push(event.type);
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await handleSubscriptionChange(
        deps,
        object as StripeSubscription,
        event.created
      );
      handled.push(event.type);
      break;

    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      await handleInvoice(deps, object as StripeInvoice, event.created);
      handled.push(event.type);
      break;

    case 'invoice.payment_failed':
    case 'invoice.payment_action_required':
    case 'invoice.voided':
    case 'invoice.marked_uncollectible':
      await handleInvoice(deps, object as StripeInvoice, event.created);
      handled.push(event.type);
      break;

    case 'customer.updated':
      await handleCustomer(deps, object as StripeCustomer, false);
      handled.push(event.type);
      break;

    case 'customer.deleted':
      await handleCustomer(deps, object as StripeCustomer, true);
      handled.push(event.type);
      break;

    case 'refund.created':
    case 'refund.updated':
    case 'refund.failed':
      await handleRefund(deps, object as StripeRefund, event.created);
      handled.push(event.type);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(deps, object as StripeCharge, event.created);
      handled.push(event.type);
      break;

    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
      await handleDispute(deps, object as StripeDispute, event.created);
      handled.push(event.type);
      break;

    default:
      // Acknowledged and ignored. Stripe sends many event types; recording the
      // id means a redelivery of this one is cheap.
      break;
  }

  return handled;
}

/**
 * Records and handles one verified event.
 *
 * A duplicate is acknowledged without re-running side effects. A transient
 * failure is recorded and rethrown so the route answers 5xx and Stripe retries.
 * A permanent failure is recorded and acknowledged, because retrying cannot
 * supply the missing metadata and a three-day retry storm only hides it.
 */
export async function processStripeEvent(
  event: StripeEvent<unknown>,
  deps: StripeWebhookDeps = stripeWebhookDeps
): Promise<ProcessResult> {
  const status = await deps.recordEvent({
    id: event.id,
    type: event.type,
    api_version: event.api_version ?? null,
    livemode: Boolean(event.livemode),
    payload: event,
  });

  if (status === 'duplicate') {
    return { received: true, duplicate: true, handled: [] };
  }

  const retried = status === 'retry';

  try {
    const handled = await dispatch(deps, event);
    await deps.markEventProcessed(event.id, null);
    return { received: true, duplicate: false, handled, retried };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof PermanentStripeEventError) {
      console.error(
        `Stripe webhook ${event.id} (${event.type}) acknowledged as unappliable:`,
        error.code,
        message
      );
      await deps.markEventProcessed(event.id, `permanent:${error.code}: ${message}`, true);
      return {
        received: true,
        duplicate: false,
        handled: [],
        ignored: true,
        reason: error.code,
      };
    }

    await deps.markEventProcessed(event.id, message);
    throw error;
  }
}
