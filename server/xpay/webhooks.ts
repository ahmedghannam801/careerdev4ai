/**
 * Applying XPay events.
 *
 * The one rule this file exists to enforce: a subscription is activated by
 * `paymentStatus === 'paid'`, never by a session merely completing. Fawry
 * completes checkout and hands the customer a reference; the money arrives
 * hours later, in `checkout.session.async_payment_succeeded`. A handler that
 * fulfils on `checkout.session.completed` alone ships plans nobody paid for.
 *
 * Fulfilment is idempotent twice over: the event id is recorded before any side
 * effect, and the purchase row is unique per session, so a redelivery cannot
 * grant a second period or a second pack of credits.
 */

import type { BillingCycle } from '../../shared/subscriptions.ts';
import { grantAiCredits } from '../credits/grant.ts';
import { getPlanByCode } from '../db/subscriptions.ts';
import { redeemBirthdayReward } from '../birthday/service.ts';
import type { XPaySessionResponse } from './checkout.ts';
import {
  getXPayPurchaseBySession,
  markXPayEventProcessed,
  recordXPayEvent,
  recordXPayPurchase,
  upsertXPaySession,
  type XPayCheckoutSessionRow,
  type XPayPurchaseRow,
} from './store.ts';

export interface XPayEvent {
  id: string;
  type: string;
  livemode?: boolean;
  created?: number;
  data?: { object?: unknown };
}

/** Events that can change what a candidate is entitled to. */
export const XPAY_HANDLED_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
] as const;

export interface XPayFulfillmentDeps {
  getPlanByCode: typeof getPlanByCode;
  grantCredits: typeof grantAiCredits;
  recordPurchase: typeof recordXPayPurchase;
  getPurchaseBySession: typeof getXPayPurchaseBySession;
  upsertSession: typeof upsertXPaySession;
  recordEvent: typeof recordXPayEvent;
  markEventProcessed: typeof markXPayEventProcessed;
}

export const xpayFulfillmentDeps: XPayFulfillmentDeps = {
  getPlanByCode,
  grantCredits: grantAiCredits,
  recordPurchase: recordXPayPurchase,
  getPurchaseBySession: getXPayPurchaseBySession,
  upsertSession: upsertXPaySession,
  recordEvent: recordXPayEvent,
  markEventProcessed: markXPayEventProcessed,
};

/** A year or a month, added to a date without skipping a short month. */
export function addBillingPeriod(from: Date, cycle: BillingCycle): Date {
  const result = new Date(from.getTime());
  const day = result.getUTCDate();
  // Setting the day to 1 first stops 31 January + 1 month from landing in March.
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + (cycle === 'annual' ? 12 : 1));
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(day, daysInTargetMonth));
  return result;
}

function readMetadata(session: XPaySessionResponse): Record<string, string> {
  const raw = session.metadata;
  if (!raw || typeof raw !== 'object') return {};
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') metadata[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') metadata[key] = String(value);
  }
  return metadata;
}

/** The method the customer actually used, when the session names it. */
export function readPaymentMethodType(session: XPaySessionResponse): string | null {
  const types = session.paymentMethodTypes;
  if (!Array.isArray(types) || types.length === 0) return null;
  const first = types[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && typeof first.type === 'string') return first.type;
  return null;
}

/**
 * The Fawry reference, when the customer still has to pay one.
 *
 * XPay puts it at `paymentIntent.nextAction.displayVoucherDetails`, and the
 * shape is read defensively: an absent voucher is a normal card payment, not an
 * error.
 */
export function readVoucher(session: XPaySessionResponse): {
  reference: string | null;
  expiresAt: string | null;
} {
  const nextAction = (session.paymentIntent as { nextAction?: unknown } | null | undefined)?.nextAction;
  if (!nextAction || typeof nextAction !== 'object') return { reference: null, expiresAt: null };
  const details = (nextAction as Record<string, unknown>).displayVoucherDetails;
  if (!details || typeof details !== 'object') return { reference: null, expiresAt: null };
  const record = details as Record<string, unknown>;
  return {
    reference: typeof record.reference === 'string' ? record.reference : null,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
  };
}

function readProfileId(session: XPaySessionResponse, metadata: Record<string, string>): string | null {
  const fromMetadata = metadata.profile_id;
  if (fromMetadata && /^[0-9a-f-]{36}$/i.test(fromMetadata)) return fromMetadata;
  const external = session.externalCustomerId;
  if (typeof external === 'string' && /^[0-9a-f-]{36}$/i.test(external)) return external;
  return null;
}

function purchaseKind(metadata: Record<string, string>): 'subscription' | 'credit_pack' {
  if (metadata.purchase_kind === 'credit_pack') return 'credit_pack';
  if (metadata.credit_pack_id) return 'credit_pack';
  return 'subscription';
}

function planCodeFrom(metadata: Record<string, string>): string | null {
  const code = metadata.plan_code;
  return code && /^[a-z0-9_]{2,40}$/.test(code) ? code : null;
}

function billingCycleFrom(metadata: Record<string, string>): BillingCycle | null {
  return metadata.billing_cycle === 'annual' ? 'annual' : metadata.billing_cycle === 'monthly' ? 'monthly' : null;
}

function amountFromSession(session: XPaySessionResponse, metadata: Record<string, string>): number {
  if (typeof session.amountTotal === 'number' && Number.isFinite(session.amountTotal)) {
    return Math.max(0, Math.round(session.amountTotal));
  }
  const declared = Number.parseInt(metadata.list_amount ?? '', 10);
  return Number.isFinite(declared) ? Math.max(0, declared) : 0;
}

/**
 * Stores the session as this platform understands it.
 *
 * Called for every event the platform handles, paid or not, so the screen can
 * say "waiting for your Fawry payment" with the reference the customer holds.
 */
export async function syncSession(
  session: XPaySessionResponse,
  deps: XPayFulfillmentDeps = xpayFulfillmentDeps
): Promise<XPayCheckoutSessionRow | null> {
  const metadata = readMetadata(session);
  const profileId = readProfileId(session, metadata);
  if (!profileId) return null;

  const kind = purchaseKind(metadata);
  const voucher = readVoucher(session);

  return deps.upsertSession({
    id: session.id,
    profileId,
    purchaseKind: kind,
    planCode: planCodeFrom(metadata),
    billingCycle: billingCycleFrom(metadata),
    packId: metadata.credit_pack_id ?? null,
    credits: Number.parseInt(metadata.credits ?? '0', 10) || 0,
    listAmount: Number.parseInt(metadata.list_amount ?? '0', 10) || amountFromSession(session, metadata),
    discountAmount: Number.parseInt(metadata.discount_amount ?? '0', 10) || 0,
    amountTotal: amountFromSession(session, metadata),
    currency: session.currency ?? 'EGP',
    status: session.status,
    paymentStatus: session.paymentStatus,
    paymentMethodType: readPaymentMethodType(session),
    paymentIntentId: session.paymentIntentId ?? (session.paymentIntent?.id ?? null),
    voucherReference: voucher.reference,
    voucherExpiresAt: voucher.expiresAt,
    couponCode: metadata.coupon_code ?? null,
    livemode: session.livemode === true,
    metadata,
  });
}

/**
 * Grants what a paid session bought.
 *
 * Returns the purchase, and whether this call created it. A second call for the
 * same session returns the existing row and does nothing, which is what makes a
 * retried webhook harmless.
 */
export async function fulfillPaidSession(
  session: XPaySessionResponse,
  deps: XPayFulfillmentDeps = xpayFulfillmentDeps
): Promise<{ purchase: XPayPurchaseRow; created: boolean } | null> {
  // The guard that exists because of Fawry. `complete` is not `paid`.
  if (session.paymentStatus !== 'paid') return null;

  const stored = await syncSession(session, deps);
  if (!stored) return null;

  const existing = await deps.getPurchaseBySession(session.id);
  if (existing) return { purchase: existing, created: false };

  const metadata = readMetadata(session);
  const now = new Date();
  const accessStartsAt = now.toISOString();
  const accessEndsAt =
    stored.purchase_kind === 'subscription' && stored.billing_cycle
      ? addBillingPeriod(now, stored.billing_cycle).toISOString()
      : null;

  const purchase = await deps.recordPurchase({
    profileId: stored.profile_id,
    sessionId: session.id,
    purchaseKind: stored.purchase_kind,
    planCode: stored.plan_code,
    billingCycle: stored.billing_cycle,
    packId: stored.pack_id,
    credits: stored.credits,
    amountTotal: stored.amount_total,
    currency: stored.currency,
    paymentMethodType: stored.payment_method_type,
    livemode: stored.livemode,
    accessStartsAt,
    accessEndsAt,
    metadata: { ...metadata, xpay_session: session.id },
  });

  // Another delivery won the race and already recorded this session.
  if (!purchase) {
    const already = await deps.getPurchaseBySession(session.id);
    return already ? { purchase: already, created: false } : null;
  }

  if (stored.purchase_kind === 'credit_pack' && stored.credits > 0) {
    await deps.grantCredits({
      profileId: stored.profile_id,
      amount: stored.credits,
      // The session id is the idempotency key: a redelivery cannot buy the
      // same pack twice.
      idempotencyKey: `xpay-pack:${session.id}`,
      sourceType: 'payment',
      sourceId: null,
      description: `Credit pack ${stored.pack_id ?? ''} (${stored.credits} credits) bought through XPay`.trim(),
      metadata: { pack_id: stored.pack_id, xpay_session: session.id },
    });
  }

  // The birthday reward is spent only once the money is in. A candidate who
  // abandons the checkout keeps it.
  if (metadata.birthday_reward === 'applied') {
    await redeemBirthdayReward(stored.profile_id, null);
  }

  if (stored.purchase_kind === 'subscription' && stored.plan_code) {
    const plan = await deps.getPlanByCode(stored.plan_code);
    const monthlyCredits = plan?.monthlyAiCredits ?? 0;
    if (monthlyCredits > 0) {
      await deps.grantCredits({
        profileId: stored.profile_id,
        amount: monthlyCredits,
        idempotencyKey: `xpay-plan:${session.id}`,
        sourceType: 'subscription',
        sourceId: null,
        description: `Monthly AI tokens for ${stored.plan_code} (XPay)`,
        metadata: { plan_code: stored.plan_code, xpay_session: session.id },
      });
    }
  }

  return { purchase, created: true };
}

export interface ProcessXPayResult {
  received: true;
  duplicate: boolean;
  handled: string[];
  ignored?: boolean;
  reason?: string;
}

/**
 * Applies one verified event.
 *
 * A duplicate is acknowledged without side effects. A transient failure is
 * recorded and rethrown so the route answers 5xx and XPay retries; a delivery
 * that cannot be applied at all (no profile id) is recorded and acknowledged,
 * because retrying cannot supply the missing metadata.
 */
export async function processXPayEvent(
  event: XPayEvent,
  deps: XPayFulfillmentDeps = xpayFulfillmentDeps
): Promise<ProcessXPayResult> {
  const status = await deps.recordEvent({
    id: event.id,
    type: event.type,
    livemode: Boolean(event.livemode),
    payload: event,
  });

  if (status === 'duplicate') {
    return { received: true, duplicate: true, handled: [] };
  }

  const session = event.data?.object as XPaySessionResponse | undefined;
  if (!session || typeof session.id !== 'string') {
    await deps.markEventProcessed(event.id, null);
    return { received: true, duplicate: false, handled: [], ignored: true, reason: 'no_session_object' };
  }

  try {
    const handled: string[] = [];

    switch (event.type) {
      case 'checkout.session.completed': {
        // A card or ValU payment is already paid here. A Fawry payment is not:
        // the session is complete because the customer holds a reference.
        const stored = await syncSession(session, deps);
        if (!stored) {
          // A paid session with no candidate on it cannot be applied. Retrying
          // cannot supply the missing metadata, so it is acknowledged and
          // reported rather than retried for hours.
          await deps.markEventProcessed(event.id, 'unlinked_session');
          return {
            received: true,
            duplicate: false,
            handled: [],
            ignored: true,
            reason: 'unlinked_session',
          };
        }
        if (session.paymentStatus === 'paid') {
          await fulfillPaidSession(session, deps);
        }
        handled.push(event.type);
        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        // The money arrived. This is the event a Fawry payment is granted on.
        const stored = await syncSession(session, deps);
        if (!stored) {
          await deps.markEventProcessed(event.id, 'unlinked_session');
          return {
            received: true,
            duplicate: false,
            handled: [],
            ignored: true,
            reason: 'unlinked_session',
          };
        }
        if (session.paymentStatus === 'paid') {
          await fulfillPaidSession(session, deps);
        }
        handled.push(event.type);
        break;
      }

      case 'checkout.session.async_payment_failed': {
        // Nothing is granted, and the session is left unpaid so the screens say
        // so. The customer needs a new session to try again.
        await syncSession(session, deps);
        handled.push(event.type);
        break;
      }

      case 'checkout.session.expired': {
        await syncSession(session, deps);
        handled.push(event.type);
        break;
      }

      default:
        // Acknowledged and ignored; the id is recorded so a redelivery is cheap.
        break;
    }

    await deps.markEventProcessed(event.id, null);
    return { received: true, duplicate: false, handled };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.markEventProcessed(event.id, message);
    throw error;
  }
}
