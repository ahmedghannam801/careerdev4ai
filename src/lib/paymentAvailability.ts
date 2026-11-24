/**
 * Whether a candidate can pay right now, and what to say if they cannot.
 *
 * WHY THIS IS A SEPARATE, PURE FUNCTION
 * -------------------------------------
 * XPay is the platform's only gateway, and there is a window — before the
 * merchant account is configured, and whenever the provider cannot be reached —
 * in which the answer to "can I check out?" is *no*. That answer has to be the
 * same in the pricing page's banner, in the button that starts a checkout and in
 * the checkout dialog itself, or the screens disagree and one of them offers a
 * payment that cannot happen.
 *
 * The screens all read `resolvePaymentAvailability`, and the tests call it
 * directly with a status object, so the rules can be checked without a browser.
 *
 * WHAT IT MAY NOT DO
 * ------------------
 * It never invents a method. `methods` is what the merchant account returned,
 * and an empty list means payments are paused — not that the list is unknown.
 * Nothing here can mark a candidate as paid: payment is confirmed by the signed
 * webhook on the server, and this file only decides what to offer.
 */

import type { XPayStatus } from './xpayApi';

export type PaymentState = 'checking' | 'ready' | 'unavailable';

export type PaymentReason =
  /** The status has not come back yet. */
  | 'checking'
  /** The server says the merchant account can take money. */
  | 'ready'
  /** No key, no webhook secret, or a live key without the live switch. */
  | 'not_configured'
  /** The account exists but cannot charge in Egyptian pounds. */
  | 'egp_not_supported'
  /** The account is configured but has no enabled method. */
  | 'no_methods'
  /** The status request failed, so nothing is known about the account. */
  | 'unreachable';

export interface PaymentAvailability {
  state: PaymentState;
  reason: PaymentReason;
  /** The methods the merchant account returned, in its own words. */
  methods: string[];
  /** True only when a checkout can actually be started. */
  canStartCheckout: boolean;
  /** The heading to show when payments are paused. */
  titleKey: string;
  /** The sentence under it, which says that nothing was charged. */
  messageKey: string;
  /** The label of the disabled call to action. */
  actionLabelKey: string;
}

const PAUSED_TITLE = 'Payments are temporarily unavailable';

/**
 * What each reason means to a candidate.
 *
 * The wording matters: a paused checkout is not the candidate's problem, and it
 * must not read like a failed payment. Every message ends by saying that
 * nothing was charged and that the plan is unchanged, because that is the only
 * question someone with a card in hand is asking.
 */
const COPY: Record<Exclude<PaymentReason, 'ready'>, { messageKey: string }> = {
  checking: {
    messageKey: 'Checking the payment provider. This takes a moment.',
  },
  not_configured: {
    messageKey:
      'We are finishing the setup of our payment provider. Plans, prices and your current access are unchanged, and nothing can be charged until checkout is live again.',
  },
  egp_not_supported: {
    messageKey:
      'Our payment account cannot take Egyptian pounds yet, so checkout is paused. Nothing will be charged and your plan stays as it is.',
  },
  no_methods: {
    messageKey:
      'No payment method is enabled on our payment account yet, so checkout is paused. Nothing will be charged and your plan stays as it is.',
  },
  unreachable: {
    messageKey:
      'We could not reach the payment provider just now, so checkout is paused. Nothing was charged — please try again in a few minutes.',
  },
};

/**
 * Reads the provider's answer and decides what the screens may offer.
 *
 * `loading` is passed separately from `status` because "we have not asked yet"
 * and "we asked and got nothing" are different: the first is a moment, the
 * second is an outage, and they deserve different words.
 */
export function resolvePaymentAvailability(
  status: XPayStatus | null,
  loading = false
): PaymentAvailability {
  const paused = (reason: Exclude<PaymentReason, 'ready'>): PaymentAvailability => ({
    state: reason === 'checking' ? 'checking' : 'unavailable',
    reason,
    methods: [],
    canStartCheckout: false,
    titleKey: PAUSED_TITLE,
    messageKey: COPY[reason].messageKey,
    actionLabelKey: 'Payments temporarily unavailable',
  });

  if (loading) return paused('checking');
  if (!status) return paused('unreachable');

  // A missing key, a missing webhook secret or a live key without the live
  // switch are all "not open for business", not "temporarily broken".
  if (!status.configured || !status.checkoutReady) return paused('not_configured');

  const methods = status.paymentMethods?.methodsForEgp ?? [];

  if (status.paymentMethods && status.paymentMethods.egpSupported === false) {
    return paused('egp_not_supported');
  }
  if (methods.length === 0) return paused('no_methods');

  return {
    state: 'ready',
    reason: 'ready',
    methods,
    canStartCheckout: true,
    titleKey: '',
    messageKey: '',
    actionLabelKey: '',
  };
}
