/**
 * Which card provider this deployment uses.
 *
 * Two providers can be configured at once, and the interface must not care. The
 * order is fixed and explicit:
 *
 *   1. XPay, when its key and webhook secret are both present and the deployment
 *      is allowed to take money;
 *   2. Stripe, when it is configured, so the existing cards keep working while
 *      the XPay account is being approved;
 *   3. neither, and the card rail is hidden.
 *
 * The status is read from the server, never guessed from a build flag: a bundle
 * has no business knowing which keys exist.
 */

import { fetchStripeBillingStatus, startStripeCheckout } from './stripeApi';
import { fetchXPayStatus, goToHostedPage, startXPayCheckout, type XPayStatus } from './xpayApi';

export type CardProvider = 'xpay' | 'stripe' | 'none';

export interface CardBillingStatus {
  provider: CardProvider;
  configured: boolean;
  checkoutReady: boolean;
  testMode: boolean;
  /** Non-fatal notes worth showing an operator, never a candidate. */
  warnings: string[];
}

function toResult(provider: CardProvider, configured: boolean, ready: boolean, testMode: boolean, warnings: string[]): CardBillingStatus {
  return { provider, configured, checkoutReady: configured && ready, testMode, warnings };
}

/**
 * Reads the provider status.
 *
 * A provider that cannot answer is treated as unavailable rather than as
 * ready: offering a card button that always fails is worse than not offering
 * one, and the wallet rails beside it still work.
 */
export async function fetchCardBillingStatus(): Promise<CardBillingStatus> {
  const xpay = await fetchXPayStatus().catch(() => null);

  if (xpay?.configured) {
    const warnings = xpay.config.errors.map((issue) => issue.message);
    return toResult('xpay', true, xpay.checkoutReady, xpay.testMode, warnings);
  }

  const stripe = await fetchStripeBillingStatus().catch(() => null);
  if (stripe?.configured) {
    return toResult(
      'stripe',
      true,
      Boolean(stripe.checkoutReady),
      stripe.mode === 'test',
      stripe.config.errors.map((issue) => issue.message)
    );
  }

  return toResult('none', false, false, false, []);
}

export interface CardPaymentInput {
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  couponCode?: string;
  locale?: 'ar' | 'en';
  /** Reused when the same click is retried, so one cart is not opened twice. */
  idempotencyKey?: string;
}

/**
 * Starts a card payment and leaves for the hosted page.
 *
 * The provider that answers is the one the server chose; the caller only learns
 * which one it was, so a screen can say "test mode" when it needs to.
 */
export async function beginCardPayment(input: CardPaymentInput): Promise<CardProvider> {
  const status = await fetchCardBillingStatus();

  if (status.provider === 'xpay') {
    const session = await startXPayCheckout({
      planCode: input.planCode,
      billingCycle: input.billingCycle,
      couponCode: input.couponCode,
      locale: input.locale,
      idempotencyKey: input.idempotencyKey,
    });
    await goToHostedPage(session.url);
    return 'xpay';
  }

  if (status.provider === 'stripe') {
    const session = await startStripeCheckout({
      planCode: input.planCode,
      billingCycle: input.billingCycle,
      promotionCode: input.couponCode,
    });
    const { goToStripe } = await import('./stripeApi');
    await goToStripe(session.url);
    return 'stripe';
  }

  const error = new Error('Card payments are not configured on this server.') as Error & { code: string };
  error.code = 'CARD_NOT_CONFIGURED';
  throw error;
}

/** True when the hosted session belongs to XPay, from its id prefix. */
export function isXPaySessionId(sessionId: string | null | undefined): sessionId is string {
  return typeof sessionId === 'string' && /^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId);
}

/** The provider status, for a screen that wants to describe the state. */
export type { XPayStatus };
