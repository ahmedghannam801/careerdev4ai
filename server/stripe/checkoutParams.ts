/**
 * The Checkout Studio parameters for the hosted Checkout Session.
 * ------------------------------------------------------------------
 * The parameter set this project sends to Stripe for a hosted checkout is
 * written down in one place, so it can be reviewed, tested and documented
 * instead of being spread across the call that builds the request.
 *
 * Every value here was checked against the Stripe Checkout Session API
 * reference before it was written down. The two that carry a version
 * dependency are handled explicitly:
 *
 *   * `ui_mode` — Stripe renamed the hosted checkout value. In API versions
 *     from `2026-03-25.dahlia` onwards the value is `hosted_page`; before
 *     that it is `hosted`, and Stripe rejects the other one outright. The
 *     Stripe SDKs that carry the new naming start at v21.0.0, so "SDK ≥ 21"
 *     and "API version ≥ 2026-03-25" are the same rule. This integration
 *     talks to the REST API rather than to an SDK, so it decides from the
 *     API version Stripe itself reported.
 *   * `submit_type` — Stripe only accepts it on a session in `payment` mode.
 *
 * The product type is never guessed: `mode` is `payment` for a one-time
 * charge and `subscription` for recurring billing, and the parameters that
 * only exist for one of the two follow it.
 */

import { getObservedStripeApiVersion } from './client.ts';
import type { StripeParams } from './client.ts';

/**
 * The API version that renamed the Checkout Session user-interface modes.
 * From this version on, `hosted_page` replaces `hosted`.
 */
export const HOSTED_PAGE_UI_MODE_MIN_VERSION = '2026-03-25';

export type CheckoutUiMode = 'hosted_page' | 'hosted';

/**
 * The label Stripe uses to measure this checkout integration's conversion
 * independently of any other hosted checkout on the same account.
 */
export const CHECKOUT_INTEGRATION_IDENTIFIER = 'hosted_web_0002';

/** The checkout is started from a web page, not from a mobile application. */
export const CHECKOUT_ORIGIN_CONTEXT = 'web';

/**
 * Extracts the date part of a Stripe API version.
 *
 * Versions are named `2026-03-25.dahlia`, `2025-09-30.clover` or, for an
 * account that never pinned one, simply `2026-03-25`.
 */
export function parseStripeApiVersionDate(version: string | null | undefined): string | null {
  if (!version) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(version.trim());
  return match ? match[1] : null;
}

/**
 * Whether a Stripe API version knows the `hosted_page` user-interface mode.
 *
 * An unknown version is reported as unsupported. That is not a guess either
 * way: the version is only unknown on the very first request of a cold
 * process, and the session creation resolves the question against Stripe
 * itself if it turns out to matter.
 */
export function supportsHostedPageUiMode(version: string | null | undefined): boolean {
  const date = parseStripeApiVersionDate(version);
  if (!date) return false;
  return date >= HOSTED_PAGE_UI_MODE_MIN_VERSION;
}

/**
 * The user-interface mode to ask Stripe for.
 *
 * An operator can pin it with `STRIPE_CHECKOUT_UI_MODE` when the account is
 * on a version this code cannot infer. Otherwise the version Stripe itself
 * reported decides it.
 *
 * When the version is not known yet the modern name is used: Stripe's own
 * default is the hosted page, and the account version is normally observed
 * from the price lookup that happens before the session is created. A
 * deployment on an older account is still safe, because the session creation
 * retries with the older name when Stripe says the modern one is not
 * supported — see `createCheckoutSession`.
 */
export function resolveCheckoutUiMode(): CheckoutUiMode {
  const override = (process.env.STRIPE_CHECKOUT_UI_MODE ?? '').trim();
  if (override === 'hosted_page' || override === 'hosted') return override;

  // An account on an older API version rejects the modern name outright, so a
  // known older version is answered with the older name. An unknown version
  // is answered with the modern name, which is Stripe's own default today.
  const observed = getObservedStripeApiVersion();
  if (observed && !supportsHostedPageUiMode(observed)) return 'hosted';
  return 'hosted_page';
}

/**
 * The other user-interface mode.
 *
 * Stripe renamed the hosted checkout value and rejects the old one outright
 * on newer API versions, and rejects the new one on older ones. When Stripe
 * says the value it was given is not supported, the other name is the one
 * that will be.
 */
export function alternateCheckoutUiMode(mode: CheckoutUiMode): CheckoutUiMode {
  return mode === 'hosted_page' ? 'hosted' : 'hosted_page';
}

/**
 * Whether a Stripe error is a refusal of the `ui_mode` value, and nothing else.
 *
 * The check is deliberately narrow: only an `invalid_request_error` that
 * names `ui_mode` counts, so a real problem with the session is never
 * swallowed and retried with different parameters.
 */
export function isCheckoutUiModeRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: number; type?: string | null; message?: string };
  if (candidate.status !== 400) return false;
  if (candidate.type && candidate.type !== 'invalid_request_error') return false;
  const message = candidate.message ?? '';
  return message.includes('ui_mode');
}

/**
 * The parameters every hosted Checkout Session in this project shares.
 *
 * `mode`, `success_url`, `cancel_url` and `line_items` are deliberately not
 * here: they carry the product type, the real origin and the real Price IDs,
 * and they are supplied by the caller that knows them.
 */
export function buildCheckoutStudioParams(options: {
  mode: 'payment' | 'subscription';
}): StripeParams {
  const params: StripeParams = {
    // The checkout is a hosted page the customer is redirected to.
    ui_mode: resolveCheckoutUiMode(),
    // Collect the billing address when Stripe needs it, not always.
    billing_address_collection: 'auto',
    // A phone number is not needed to take a payment.
    phone_number_collection: { enabled: false },
    // Tax is off unless the account has explicitly turned it on. The
    // committed default is off, which is what the Checkout Studio
    // configuration asks for; the environment variable keeps the existing
    // operator switch working.
    automatic_tax: { enabled: (process.env.STRIPE_AUTOMATIC_TAX ?? '').trim() === 'true' },
    // The promotion code is applied by this platform, not by Stripe's own
    // redemption field, so Stripe must not ask for one.
    allow_promotion_codes: false,
    // This checkout is started from a web page.
    origin_context: CHECKOUT_ORIGIN_CONTEXT,
    // The label Stripe measures this integration's conversion with.
    integration_identifier: CHECKOUT_INTEGRATION_IDENTIFIER,
  };

  // Tax ID collection is off by default: it is not part of this checkout's
  // parameter set, and Stripe rejects a session that asks for a tax ID from a
  // customer whose name and address it may not update. Verified against the
  // live test account: `tax_id_collection[enabled]=true` on its own answers
  // 400 with "Tax ID collection requires updating business name on the
  // customer", so it has to travel together with the `customer_update` that
  // allows it. Both are sent together or neither is.
  if ((process.env.STRIPE_TAX_ID_COLLECTION ?? '').trim() === 'true') {
    params.tax_id_collection = { enabled: true };
    params.customer_update = { name: 'auto', address: 'auto' };
  }

  if (options.mode === 'payment') {
    // Stripe only accepts `submit_type` on a one-time payment.
    params.submit_type = 'auto';
  } else {
    // A subscription always collects a payment method: the plan is recurring,
    // so there is no case in which none is needed.
    params.payment_method_collection = 'always';
  }

  return params;
}
