/**
 * Building a Checkout Session.
 *
 * XPay's hosted page is the only place a card number is typed, so this module
 * produces one JSON body and nothing else: no price is trusted from the
 * browser, no product name is taken from the client, and the amount always
 * comes from the catalogue the platform already owns.
 *
 * Two product facts shape the body:
 *
 *   * The platform sells in EGP, and XPay takes amounts in the currency's minor
 *     unit. The catalogue already stores piasters, so the numbers pass straight
 *     through.
 *   * Recurring billing is not enabled for this merchant account, so a plan is
 *     sold as a one-time payment that grants one period. `mode` stays `payment`
 *     and the period is granted when the money is confirmed, which is why the
 *     metadata carries the plan and the cycle rather than a price id.
 */

import { randomUUID } from 'node:crypto';

import { CREDIT_PACKS, type CreditPack } from '../../shared/credits.ts';
import type { BillingCycle, SubscriptionPlanDTO } from '../../shared/subscriptions.ts';
import { xpayGet, xpayPost } from './client.ts';
import { getXPayConfig } from './config.ts';

/** What the candidate is buying. */
export type CheckoutPurchase =
  | { kind: 'subscription'; plan: SubscriptionPlanDTO; billingCycle: BillingCycle }
  | { kind: 'credit_pack'; pack: CreditPack };

export interface CheckoutAmount {
  /** The catalogue price, in piasters. */
  listAmount: number;
  /** What the coupon takes off, in piasters. */
  discountAmount: number;
  /** What is charged, in piasters. */
  chargeAmount: number;
}

export interface XPayLineItem {
  priceData: {
    currency: 'EGP';
    unitAmount: number;
    productData: { name: string; description?: string };
  };
  quantity: number;
}

export interface XPayCheckoutBody {
  mode: 'payment';
  uiMode: 'hosted';
  submitType: 'PAY';
  lineItems: XPayLineItem[];
  afterCompletion: { type: 'redirect'; redirect: { url: string } };
  cancelUrl: string;
  externalCustomerId: string;
  customerCreation: 'if_required';
  customerDetails: { email?: string };
  metadata: Record<string, string>;
  locale: 'ar' | 'en';
  expiresAfterMinutes: number;
  paymentMethodConfigurationId?: string;
}

/** The amount for one purchase, before and after a coupon. */
export function purchaseAmount(purchase: CheckoutPurchase, discountAmount = 0): CheckoutAmount {
  const listAmount =
    purchase.kind === 'credit_pack'
      ? purchase.pack.pricePiasters
      : purchase.billingCycle === 'annual'
        ? purchase.plan.priceAnnualPiasters
        : purchase.plan.priceMonthlyPiasters;

  // A discount can never make the charge negative, and it never changes the
  // list price the candidate is shown.
  const discount = Math.max(0, Math.min(Math.round(discountAmount), listAmount));
  return { listAmount, discountAmount: discount, chargeAmount: listAmount - discount };
}

/** What this purchase grants once the money is confirmed. */
export function purchaseEntitlement(purchase: CheckoutPurchase): {
  planCode: string | null;
  billingCycle: BillingCycle | null;
  packId: string | null;
  credits: number;
} {
  if (purchase.kind === 'credit_pack') {
    return { planCode: null, billingCycle: null, packId: purchase.pack.id, credits: purchase.pack.credits };
  }
  return {
    planCode: purchase.plan.code,
    billingCycle: purchase.billingCycle,
    packId: null,
    credits: 0,
  };
}

export interface BuildCheckoutInput {
  purchase: CheckoutPurchase;
  profileId: string;
  email?: string | null;
  amount: CheckoutAmount;
  /** Where the browser returns. `{CHECKOUT_SESSION_ID}` is filled in by XPay. */
  origin: string;
  locale: 'ar' | 'en';
  couponCode?: string | null;
  /** Extra metadata a caller needs to carry onto the session. */
  extraMetadata?: Record<string, string>;
  paymentMethodConfigurationId?: string | null;
  expiresAfterMinutes?: number;
}

export const CHECKOUT_SESSION_PLACEHOLDER = '{CHECKOUT_SESSION_ID}';

/**
 * Builds the request body.
 *
 * Pure on purpose: every rule that decides what a candidate is charged is
 * testable without a network call or a database.
 */
export function buildCheckoutBody(input: BuildCheckoutInput): XPayCheckoutBody {
  const { purchase, amount } = input;
  const entitlement = purchaseEntitlement(purchase);
  const origin = input.origin.replace(/\/+$/, '');

  const name =
    purchase.kind === 'credit_pack'
      ? purchase.pack.nameEn
      : `${purchase.plan.nameEn} — ${purchase.billingCycle === 'annual' ? 'annual' : 'monthly'}`;

  const metadata: Record<string, string> = {
    profile_id: input.profileId,
    purchase_kind: purchase.kind,
    list_amount: String(amount.listAmount),
  };
  if (entitlement.planCode) metadata.plan_code = entitlement.planCode;
  if (entitlement.billingCycle) metadata.billing_cycle = entitlement.billingCycle;
  if (entitlement.packId) metadata.credit_pack_id = entitlement.packId;
  if (entitlement.credits) metadata.credits = String(entitlement.credits);
  if (input.couponCode) metadata.coupon_code = input.couponCode;
  if (amount.discountAmount > 0) metadata.discount_amount = String(amount.discountAmount);
  if (input.extraMetadata) Object.assign(metadata, input.extraMetadata);

  const body: XPayCheckoutBody = {
    mode: 'payment',
    uiMode: 'hosted',
    // One period of a plan and a pack of credits are both a single charge, so
    // the hosted button says "Pay" in each case. Selling a period as a
    // "Subscribe" button would promise a renewal this account cannot make.
    submitType: 'PAY',
    lineItems: [
      {
        priceData: {
          currency: 'EGP',
          unitAmount: amount.chargeAmount,
          productData: {
            name,
            description:
              purchase.kind === 'credit_pack'
                ? `${purchase.pack.credits} AI tokens`
                : `One ${purchase.billingCycle} period of ${purchase.plan.nameEn}`,
          },
        },
        quantity: 1,
      },
    ],
    afterCompletion: {
      type: 'redirect',
      redirect: { url: `${origin}/?xpay=success&session_id=${CHECKOUT_SESSION_PLACEHOLDER}` },
    },
    // A cancel returns to the pricing page rather than to XPay's own retry
    // page, so the candidate is not stranded on a page with no way back.
    cancelUrl: `${origin}/?xpay=cancelled`,
    // The candidate's own id, so no mapping table has to exist between this
    // application and XPay's customer records.
    externalCustomerId: input.profileId,
    customerCreation: 'if_required',
    customerDetails: input.email ? { email: input.email } : {},
    metadata,
    locale: input.locale === 'ar' ? 'ar' : 'en',
    expiresAfterMinutes: Math.max(5, Math.min(input.expiresAfterMinutes ?? 60, 1440)),
  };

  if (input.paymentMethodConfigurationId) {
    body.paymentMethodConfigurationId = input.paymentMethodConfigurationId;
  }

  return body;
}

export interface XPaySessionResponse {
  id: string;
  object: 'checkout.session';
  status: 'open' | 'complete' | 'expired';
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  url: string | null;
  currency?: string;
  amountTotal?: number;
  amountSubtotal?: number;
  livemode?: boolean;
  metadata?: Record<string, unknown> | null;
  externalCustomerId?: string | null;
  paymentIntentId?: string | null;
  paymentIntent?: { id?: string; nextAction?: unknown } | null;
  paymentMethodTypes?: Array<{ type?: string } | string> | null;
  expiresAt?: string;
}

/**
 * Creates the session.
 *
 * The idempotency key is derived from the purchase and the moment it was
 * started, not from `Date.now()` alone: two clicks on the same button a second
 * apart must not open two carts, and a retry after a timeout must return the
 * first session rather than a second one. The caller passes the key so a retry
 * can reuse it exactly.
 */
export async function createXPayCheckout(
  body: XPayCheckoutBody,
  options: { idempotencyKey?: string } = {}
): Promise<XPaySessionResponse> {
  const config = getXPayConfig();
  const session = await xpayPost<XPaySessionResponse>('/checkout/sessions', {
    body,
    idempotencyKey: options.idempotencyKey ?? randomUUID(),
    config,
  });

  if (!session || typeof session.id !== 'string') {
    throw new Error('XPay did not return a checkout session id.');
  }
  if (!session.url) {
    throw new Error('XPay did not return a checkout url for a hosted session.');
  }
  return session;
}

/**
 * Reads a session back.
 *
 * The return page and the reconciler both use this, because a browser landing
 * on `?xpay=success` proves nothing: only `paymentStatus` in this response, or
 * a signed webhook, says whether the money arrived.
 */
export async function getXPayCheckoutSession(sessionId: string): Promise<XPaySessionResponse> {
  return xpayGet<XPaySessionResponse>(`/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    config: getXPayConfig(),
  });
}

/** The credit pack with this id, or null. */
export function findCreditPack(packId: string): CreditPack | null {
  return CREDIT_PACKS.find((pack) => pack.id === packId) ?? null;
}
