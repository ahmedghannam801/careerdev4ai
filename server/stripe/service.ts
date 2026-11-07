/**
 * Stripe billing service.
 *
 * One place that knows how a plan or credit pack becomes a Checkout Session,
 * and how a candidate reaches the Customer Portal. The route layer stays thin
 * and the webhook layer never creates sessions, so each concern has one home.
 */

import { getPlanByCode } from '../db/subscriptions.ts';
import { CREDIT_PACKS } from '../../shared/credits.ts';
import { stripeGet, stripePost, StripeError } from './client.ts';
import type { StripeParams } from './client.ts';
import {
  assertStripeCheckoutReady,
  describeStripeConfig,
  getStripeConfig,
  isTestMode,
  subscriptionLookupKey,
  creditPackLookupKey,
  type StripeConfigStatus,
} from './config.ts';
import { buildCatalog, validatePriceAgainstCatalog } from './catalog.ts';
import type { CatalogEntry } from './catalog.ts';
import {
  getActiveStripeSubscription,
  getLatestStripeSubscription,
  getStripeCustomerRow,
  saveStripeCustomer,
} from './store.ts';
import type {
  StripeCustomer,
  StripeCheckoutSession,
  StripePrice,
  StripeSubscriptionRow,
} from './types.ts';

/** How long a resolved Price id may be reused inside one isolate. */
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
const priceCache = new Map<string, { id: string; at: number }>();

/**
 * Resolves a lookup key to a Price id and refuses to use a Price that does not
 * match the application's catalogue.
 *
 * Stripe is the payment processor, but the application's catalogue is the
 * source of truth for what a plan costs. A price edited in the Dashboard to the
 * wrong amount would otherwise be charged silently.
 */
export async function resolvePriceId(
  lookupKey: string,
  entries?: CatalogEntry[]
): Promise<string> {
  const cached = priceCache.get(lookupKey);
  if (cached && Date.now() - cached.at < PRICE_CACHE_TTL_MS) return cached.id;

  const result = await stripeGet<{ data: StripePrice[] }>('/v1/prices', {
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });

  const price = result.data[0];
  if (!price) {
    throw new StripeError(
      `No active Stripe Price has the lookup key "${lookupKey}". Run "npm run stripe:sync" to create it.`,
      404,
      'invalid_request_error',
      'resource_missing'
    );
  }

  if (entries) {
    const entry = entries.find((candidate) => candidate.lookupKey === lookupKey);
    if (entry) {
      const issues = validatePriceAgainstCatalog(price, entry, isTestMode());
      if (issues.length > 0) {
        throw new StripeError(
          `The Stripe Price for "${lookupKey}" does not match the catalogue: ${issues.join(' ')}`,
          500,
          'configuration_error',
          'price_mismatch'
        );
      }
    }
  }

  priceCache.set(lookupKey, { id: price.id, at: Date.now() });
  return price.id;
}

/** Drops the in-isolate Price cache. Used by the catalogue sync script. */
export function clearPriceCache(): void {
  priceCache.clear();
}

export async function getOrCreateStripeCustomer(
  profileId: string,
  email?: string | null
): Promise<string> {
  const existing = await getStripeCustomerRow(profileId);
  if (existing) return existing.stripe_customer_id;

  const customer = await stripePost<StripeCustomer>('/v1/customers', {
    ...(email ? { email } : {}),
    metadata: { profile_id: profileId },
  });

  try {
    await saveStripeCustomer(profileId, customer);
    return customer.id;
  } catch (error) {
    // A concurrent request may have created the mapping first. The unique
    // constraint on profile_id turns that into a recoverable race.
    const raced = await getStripeCustomerRow(profileId);
    if (raced) return raced.stripe_customer_id;
    throw error;
  }
}

export type CheckoutTarget =
  | { kind: 'subscription'; planCode: string; billingCycle: 'monthly' | 'annual' }
  | { kind: 'credit_pack'; packId: string };

export interface CheckoutInput {
  profileId: string;
  email?: string | null;
  planCode: string;
  billingCycle: 'monthly' | 'annual';
  /** The origin the browser is on; only configured origins are accepted. */
  origin: string;
  /** A Stripe promotion code (not a database coupon). */
  promotionCode?: string | null;
}

export interface CheckoutResult {
  url: string;
  sessionId: string;
  mode: 'payment' | 'subscription';
  lookupKey: string;
}

interface ResolvedTargetBase {
  lookupKey: string;
  metadata: Record<string, string>;
  expected: CatalogEntry;
}

type ResolvedTarget = CheckoutTarget & ResolvedTargetBase;

async function resolveTarget(input: CheckoutInput): Promise<ResolvedTarget> {
  const plan = await getPlanByCode(input.planCode);

  if (plan) {
    if (plan.code === 'free') {
      throw new StripeError('The free plan does not require a payment.', 400, 'invalid_request_error');
    }
    const lookupKey = subscriptionLookupKey(plan.code, input.billingCycle);
    const expected = buildCatalog([plan]).find((entry) => entry.lookupKey === lookupKey);
    if (!expected) {
      throw new StripeError(
        `The ${plan.code} plan has no configured ${input.billingCycle} price.`,
        400,
        'invalid_request_error'
      );
    }

    return {
      kind: 'subscription',
      planCode: plan.code,
      billingCycle: input.billingCycle,
      lookupKey,
      expected,
      metadata: {
        profile_id: input.profileId,
        plan_code: plan.code,
        billing_cycle: input.billingCycle,
        monthly_credits: String(plan.monthlyAiCredits),
      },
    };
  }

  const pack = CREDIT_PACKS.find((candidate) => candidate.id === input.planCode);
  if (!pack) {
    throw new StripeError(
      `Unknown plan or credit pack "${input.planCode}".`,
      400,
      'invalid_request_error'
    );
  }

  const lookupKey = creditPackLookupKey(pack.id);
  const expected = buildCatalog([]).find((entry) => entry.lookupKey === lookupKey);
  if (!expected) {
    throw new StripeError(
      `The credit pack "${pack.id}" has no configured Stripe price.`,
      400,
      'invalid_request_error'
    );
  }

  return {
    kind: 'credit_pack',
    packId: pack.id,
    lookupKey,
    expected,
    metadata: {
      profile_id: input.profileId,
      credit_pack_id: pack.id,
      credits: String(pack.credits),
    },
  };
}

/**
 * Creates a hosted Checkout Session and returns its URL.
 *
 * The idempotency key is bucketed per candidate, target and two minutes: a
 * double-clicked button returns the session that is already open instead of
 * creating a second one, while a genuine retry after a minute or two is still
 * allowed.
 */
export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  // A payment must never be taken before a verified webhook can activate it.
  // This is checked before the customer, the price and the session exist.
  assertStripeCheckoutReady();

  const target = await resolveTarget(input);
  const priceId = await resolvePriceId(target.lookupKey, [target.expected]);
  const customerId = await getOrCreateStripeCustomer(input.profileId, input.email);

  const mode: 'payment' | 'subscription' =
    target.kind === 'subscription' ? 'subscription' : 'payment';

  const successUrl = `${input.origin}/#/pricing?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${input.origin}/#/pricing?stripe=cancelled`;

  const params: StripeParams = {
    mode,
    customer: customerId,
    client_reference_id: input.profileId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: target.metadata,
    locale: 'auto',
    billing_address_collection: 'auto',
    tax_id_collection: { enabled: true },
  };

  if (mode === 'subscription') {
    params.subscription_data = { metadata: target.metadata };
  } else {
    // A one-time credit-pack payment produces no invoice by default. Asking
    // Stripe for one gives the candidate a receipt and gives the admin
    // revenue mirror a row to report, without changing the charge itself.
    //
    // The invoice carries the same metadata so the `invoice.paid` handler can
    // grant the pack exactly once using the PaymentIntent as the idempotency
    // key, even if the Checkout Session event is lost or delivered late.
    params.invoice_creation = {
      enabled: true,
      invoice_data: { metadata: target.metadata },
    };
    // The PaymentIntent metadata is what a refund or dispute event carries
    // through the charge, which is how a refund is attributed to a profile.
    params.payment_intent_data = { metadata: target.metadata };
  }

  if (input.promotionCode) {
    params.discounts = [{ promotion_code: input.promotionCode }];
  } else {
    params.allow_promotion_codes = true;
  }

  if (getStripeConfig().automaticTax) {
    params.automatic_tax = { enabled: true };
  }

  const bucket = Math.floor(Date.now() / 120_000);
  const session = await stripePost<StripeCheckoutSession>(
    '/v1/checkout/sessions',
    params,
    { idempotencyKey: `checkout:${input.profileId}:${target.lookupKey}:${bucket}` }
  );

  if (!session.url) {
    throw new StripeError('Stripe created a Checkout Session without a URL.', 502);
  }

  return {
    url: session.url,
    sessionId: session.id,
    mode,
    lookupKey: target.lookupKey,
  };
}

/** Opens the Stripe-hosted Customer Portal for an existing customer. */
export async function createPortalSession(
  profileId: string,
  origin: string
): Promise<{ url: string }> {
  assertStripeCheckoutReady();

  const customer = await getStripeCustomerRow(profileId);
  if (!customer) {
    throw new StripeError(
      'This account has no Stripe customer yet. Start a card checkout first.',
      404,
      'invalid_request_error'
    );
  }

  const config = getStripeConfig();
  const session = await stripePost<{ url: string }>('/v1/billing_portal/sessions', {
    customer: customer.stripe_customer_id,
    // Return to the page that owns the billing UI, so the client can refresh
    // its state and show the result of a cancellation or card change.
    return_url: `${origin}/#/pricing?billing=portal`,
    ...(config.portalConfigurationId
      ? { configuration: config.portalConfigurationId }
      : {}),
  });

  return { url: session.url };
}

export interface StripeBillingSummary {
  configured: boolean;
  mode: 'disabled' | 'test' | 'live';
  checkoutReady: boolean;
  testMode: boolean;
  customerId: string | null;
  subscription: StripeSubscriptionRow | null;
  latestSubscription: StripeSubscriptionRow | null;
  config: StripeConfigStatus;
}

export async function getStripeBillingSummary(
  profileId: string
): Promise<StripeBillingSummary> {
  const config = describeStripeConfig();
  const customer = await getStripeCustomerRow(profileId);
  const [subscription, latestSubscription] = await Promise.all([
    getActiveStripeSubscription(profileId),
    getLatestStripeSubscription(profileId),
  ]);

  return {
    configured: config.configured,
    mode: config.mode,
    checkoutReady: config.checkoutReady,
    testMode: config.mode !== 'live',
    customerId: customer?.stripe_customer_id ?? null,
    subscription,
    latestSubscription,
    config,
  };
}
