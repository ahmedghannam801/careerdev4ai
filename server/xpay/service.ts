/**
 * XPay billing service.
 *
 * One place that knows how a plan or a credit pack becomes a Checkout Session,
 * what the candidate's card payments currently grant, and how a session is read
 * back when a webhook is late. The route layer stays thin.
 *
 * Two decisions are made here and nowhere else:
 *
 *   * The price comes from this application's catalogue. XPay is told an
 *     amount, never asked what something costs.
 *   * A coupon is applied here, before the session exists, so the amount on the
 *     hosted page is the amount the candidate agreed to. One discount per
 *     session, as XPay allows.
 */

import { randomUUID } from 'node:crypto';

import { getPlanByCode } from '../db/subscriptions.ts';
import { validateCoupon } from '../coupons/service.ts';
import { getActiveBirthdayReward } from '../birthday/service.ts';
import type { BillingCycle, SubscriptionPlanCode } from '../../shared/subscriptions.ts';
import { CREDIT_PACKS } from '../../shared/credits.ts';
import { describeXPayConfig, getXPayConfig, isXPayConfigured, type XPayConfigStatus } from './config.ts';
import { discoverPaymentMethods, type PaymentMethodAvailability } from './account.ts';
import {
  buildCheckoutBody,
  createXPayCheckout,
  findCreditPack,
  getXPayCheckoutSession,
  purchaseAmount,
  purchaseEntitlement,
  type CheckoutPurchase,
  type XPaySessionResponse,
} from './checkout.ts';
import {
  getActiveXPayAccess,
  getXPayPurchaseBySession,
  listXPaySessionsForProfile,
  upsertXPaySession,
  type XPayCheckoutSessionRow,
  type XPayPurchaseRow,
} from './store.ts';
import { readPaymentMethodType, readVoucher, syncSession } from './webhooks.ts';

export class XPayCheckoutError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'XPayCheckoutError';
    this.status = status;
    this.code = code;
  }
}

export interface CreateCheckoutInput {
  profileId: string;
  /** Prefilled on the hosted page. Taken from the session, not from the body. */
  email?: string | null;
  origin: string;
  locale: 'ar' | 'en';
  planCode?: string;
  billingCycle?: BillingCycle;
  packId?: string;
  couponCode?: string | null;
  /**
   * The candidate may ask for their birthday discount; the server decides
   * whether it applies and what it is worth. The request never carries an
   * amount.
   */
  applyBirthdayReward?: boolean;
  /** Reused when the browser retries the same click. */
  idempotencyKey?: string;
}

export interface CreateCheckoutResult {
  url: string;
  sessionId: string;
  /** The internal order reference carried in the XPay session metadata. */
  orderId: string;
  amount: { list: number; discount: number; charge: number; currency: 'EGP' };
  entitlement: ReturnType<typeof purchaseEntitlement>;
}

/** Resolves the purchase the caller asked for, from the platform's catalogue. */
async function resolvePurchase(input: CreateCheckoutInput): Promise<CheckoutPurchase> {
  if (input.packId) {
    const pack = findCreditPack(input.packId);
    if (!pack) {
      throw new XPayCheckoutError('That credit pack does not exist.', 404, 'unknown_credit_pack');
    }
    return { kind: 'credit_pack', pack };
  }

  const planCode = input.planCode;
  if (!planCode || !/^[a-z0-9_]{2,40}$/.test(planCode)) {
    throw new XPayCheckoutError('A plan or a credit pack is required.', 400, 'missing_purchase');
  }

  const plan = await getPlanByCode(planCode as SubscriptionPlanCode);
  if (!plan || !plan.isActive) {
    throw new XPayCheckoutError('That plan is not available.', 404, 'unknown_plan');
  }
  if (plan.code === 'free') {
    throw new XPayCheckoutError('The free plan needs no payment.', 400, 'free_plan_not_sellable');
  }

  const billingCycle: BillingCycle = input.billingCycle === 'annual' ? 'annual' : 'monthly';
  const price =
    billingCycle === 'annual' ? plan.priceAnnualPiasters : plan.priceMonthlyPiasters;
  if (!(price > 0)) {
    throw new XPayCheckoutError('That plan has no price configured.', 400, 'plan_has_no_price');
  }

  return { kind: 'subscription', plan, billingCycle };
}

/**
 * Starts a hosted checkout.
 *
 * The session row is written before the browser leaves, so a candidate who
 * closes the tab mid-payment still leaves a record the reconciler can find. A
 * paid session is never sold twice: a candidate who already has an active
 * period for this plan is told so instead of being charged again.
 */
export async function createXPayCheckoutForProfile(
  input: CreateCheckoutInput
): Promise<CreateCheckoutResult> {
  const status = describeXPayConfig();
  if (!status.configured) {
    throw new XPayCheckoutError('Card payments are not configured on this server.', 503, 'not_configured');
  }
  if (!status.checkoutReady) {
    const issue = status.errors[0];
    throw new XPayCheckoutError(
      issue?.message ?? 'Card payments are not ready on this server.',
      503,
      issue?.code ?? 'not_ready'
    );
  }

  const purchase = await resolvePurchase(input);

  if (purchase.kind === 'subscription') {
    const active = await getActiveXPayAccess(input.profileId);
    if (active && active.plan_code === purchase.plan.code) {
      throw new XPayCheckoutError(
        'This plan is already active until the end of the current period.',
        409,
        'plan_already_active'
      );
    }
  }

  // The coupon is validated against the catalogue price, not against anything
  // the browser sent.
  let discountAmount = 0;
  let couponCode: string | null = null;
  if (input.couponCode && input.couponCode.trim()) {
    const validation = await validateCoupon(
      input.couponCode,
      purchase.kind === 'subscription' ? purchase.plan.code : 'credit_pack',
      purchaseAmount(purchase).listAmount
    );
    if (!validation.valid) {
      throw new XPayCheckoutError(
        validation.reason ?? 'That coupon cannot be used here.',
        400,
        'invalid_coupon'
      );
    }
    discountAmount = validation.discountAmountPiasters;
    couponCode = input.couponCode.trim().toUpperCase();
  }

  /**
   * The birthday discount.
   *
   * It is worked out here, from the catalogue price, and only when the server
   * has confirmed that today really is the candidate's birthday. It is applied
   * instead of a coupon rather than on top of one: two discounts on one
   * checkout would be a price nobody agreed to.
   */
  let birthdayDiscountAmount = 0;
  if (input.applyBirthdayReward && !couponCode && purchase.kind === 'subscription') {
    const reward = await getActiveBirthdayReward(input.profileId);
    if (reward) {
      const gross = purchaseAmount(purchase).listAmount;
      birthdayDiscountAmount = Math.min(
        Math.floor((gross * reward.discountPercentage) / 100),
        reward.maxDiscountPiasters
      );
    }
  }

  const couponDiscount = discountAmount + birthdayDiscountAmount;
  const amount = purchaseAmount(purchase, couponDiscount);
  const entitlement = purchaseEntitlement(purchase);
  const config = getXPayConfig();
  const orderId = `ord_${randomUUID().replace(/-/g, '')}`;
  const body = buildCheckoutBody({
    purchase,
    profileId: input.profileId,
    email: input.email ?? null,
    amount,
    orderId,
    origin: input.origin,
    locale: input.locale,
    couponCode,
    // The discount is carried in metadata so fulfilment can record that the
    // birthday reward was used, and so the amount can be audited later.
    extraMetadata: birthdayDiscountAmount > 0
      ? { birthday_discount: String(birthdayDiscountAmount), birthday_reward: 'applied' }
      : undefined,
    paymentMethodConfigurationId: config.paymentMethodConfigurationId,
    // A candidate paying by Fawry needs time to take the reference to an
    // outlet, so the window is shorter than XPay's 24-hour default but not so
    // short that a slow local payment is cut off mid-flow.
    expiresAfterMinutes: 180,
  });

  const session = await createXPayCheckout(body, { idempotencyKey: input.idempotencyKey });

  // A session created but not stored is a payment nobody can match to a
  // candidate, so this write happens before the browser is sent anywhere.
  await upsertXPaySession({
    id: session.id,
    profileId: input.profileId,
    purchaseKind: purchase.kind,
    planCode: entitlement.planCode,
    billingCycle: entitlement.billingCycle,
    packId: entitlement.packId,
    credits: entitlement.credits,
    listAmount: amount.listAmount,
    discountAmount: amount.discountAmount,
    amountTotal: amount.chargeAmount,
    currency: 'EGP',
    status: session.status,
    paymentStatus: session.paymentStatus,
    paymentMethodType: readPaymentMethodType(session),
    paymentIntentId: session.paymentIntentId ?? null,
    voucherReference: readVoucher(session).reference,
    voucherExpiresAt: readVoucher(session).expiresAt,
    couponCode,
    livemode: session.livemode === true,
    metadata: body.metadata,
  });

  return {
    url: session.url as string,
    sessionId: session.id,
    orderId,
    amount: {
      list: amount.listAmount,
      discount: amount.discountAmount,
      charge: amount.chargeAmount,
      currency: 'EGP',
    },
    entitlement,
  };
}

/**
 * Reads a session back from XPay and applies it.
 *
 * The return page and the reconciler both use this. A browser landing on
 * `?xpay=success` is not evidence of payment; this function asks XPay and applies
 * the same guard the webhook applies: only `paymentStatus === 'paid'` grants
 * anything.
 */
export async function reconcileXPaySession(
  sessionId: string,
  options: { profileId?: string } = {}
): Promise<{
  session: XPaySessionResponse;
  stored: XPayCheckoutSessionRow | null;
  purchase: XPayPurchaseRow | null;
}> {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    throw new XPayCheckoutError('That is not a checkout session id.', 400, 'invalid_session_id');
  }

  let session: XPaySessionResponse;
  try {
    session = await getXPayCheckoutSession(sessionId);
  } catch (error) {
    throw new XPayCheckoutError(
      error instanceof Error ? error.message : 'The payment could not be checked.',
      502,
      'session_unavailable'
    );
  }

  // The session's own metadata decides whose it is; the caller may only read
  // their own.
  const stored = await syncSession(session);
  if (!stored) {
    throw new XPayCheckoutError('That session does not belong to a candidate here.', 404, 'session_unlinked');
  }
  if (options.profileId && stored.profile_id !== options.profileId) {
    throw new XPayCheckoutError('That session belongs to another candidate.', 403, 'forbidden');
  }

  if (session.paymentStatus === 'paid') {
    // Deliberately the same path the webhook takes, so the two cannot disagree.
    const { fulfillPaidSession } = await import('./webhooks.ts');
    await fulfillPaidSession(session);
  }

  return {
    session,
    stored,
    purchase: await getXPayPurchaseBySession(sessionId),
  };
}

export interface XPayBillingStatus {
  configured: boolean;
  mode: 'disabled' | 'test' | 'live';
  testMode: boolean;
  checkoutReady: boolean;
  config: XPayConfigStatus;
  paymentMethods: PaymentMethodAvailability | null;
  activePurchase: XPayPurchaseRow | null;
  sessions: Array<{
    id: string;
    purchaseKind: 'subscription' | 'credit_pack';
    planCode: string | null;
    billingCycle: BillingCycle | null;
    /** The internal order reference recorded when the session was opened. */
    orderId: string | null;
    amountTotal: number;
    currency: string;
    status: string;
    paymentStatus: string;
    paymentMethodType: string | null;
    voucherReference: string | null;
    voucherExpiresAt: string | null;
    createdAt: string;
  }>;
}

/** Everything a billing screen needs about this candidate, in one call. */
export async function getXPayBillingStatus(profileId: string): Promise<XPayBillingStatus> {
  const config = describeXPayConfig();

  // A storage failure is reported, not thrown: the pricing page asks this
  // question on every visit, and a 500 here would hide the plans behind an
  // error. When the tables are missing the screen still gets the readiness
  // answer, which is the part that decides whether checkout may open.
  const [purchase, sessions] = await Promise.all([
    getActiveXPayAccess(profileId).catch((error) => {
      console.error('XPay billing status: purchase lookup failed:', profileId, error);
      return null;
    }),
    listXPaySessionsForProfile(profileId).catch((error) => {
      console.error('XPay billing status: session listing failed:', profileId, error);
      return [];
    }),
  ]);

  let paymentMethods: PaymentMethodAvailability | null = null;
  if (isXPayConfigured()) {
    // A discovery failure must not break the billing screen: the account read
    // is a convenience, and the checkout itself still works.
    paymentMethods = await discoverPaymentMethods().catch(() => null);
  }

  return {
    configured: config.configured,
    mode: config.mode,
    testMode: config.mode === 'test',
    checkoutReady: config.checkoutReady,
    config,
    paymentMethods,
    activePurchase: purchase,
    sessions: sessions.map((session) => ({
      id: session.id,
      purchaseKind: session.purchase_kind,
      planCode: session.plan_code,
      billingCycle: session.billing_cycle,
      orderId: typeof session.metadata?.order_id === 'string' ? session.metadata.order_id : null,
      amountTotal: session.amount_total,
      currency: session.currency,
      status: session.status,
      paymentStatus: session.payment_status,
      paymentMethodType: session.payment_method_type,
      voucherReference: session.voucher_reference,
      voucherExpiresAt: session.voucher_expires_at,
      createdAt: session.created_at,
    })),
  };
}

/** The credit packs XPay can sell, for a screen that offers them. */
export function sellablePacks(): Array<{ id: string; credits: number; pricePiasters: number; nameEn: string; nameAr: string }> {
  return CREDIT_PACKS.map((pack) => ({
    id: pack.id,
    credits: pack.credits,
    pricePiasters: pack.pricePiasters,
    nameEn: pack.nameEn,
    nameAr: pack.nameAr,
  }));
}
