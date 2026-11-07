/**
 * The Stripe catalogue, derived from the application's own prices.
 *
 * Stripe holds Products (what is sold) and Prices (how much, how often). The
 * application already owns the plan and credit-pack definitions, so Stripe is
 * a projection of them, not a second source of truth. `syncStripeCatalog()`
 * creates anything missing and is safe to run repeatedly: Prices are matched
 * by `lookup_key`, which never changes for a given tier.
 *
 * Amounts are in the currency's minor unit. EGP has two decimals, and the
 * application already stores piasters, so the numbers pass through unchanged.
 */

import { stripeGet, stripePost } from './client.ts';
import { creditPackLookupKey, isTestMode, subscriptionLookupKey } from './config.ts';
import { CREDIT_PACKS } from '../../shared/credits.ts';
import { listActivePlans } from '../db/subscriptions.ts';
import type { StripePrice, StripeProduct } from './types.ts';

export interface PlanPriceSource {
  code: string;
  nameEn: string;
  priceMonthlyPiasters: number;
  priceAnnualPiasters: number;
}

export interface CatalogEntry {
  lookupKey: string;
  productKey: string;
  kind: 'subscription' | 'credit_pack';
  planCode?: string;
  billingCycle?: 'monthly' | 'annual';
  packId?: string;
  credits?: number;
  productName: string;
  productDescription: string;
  unitAmount: number;
  currency: 'egp';
  recurring: { interval: 'month' | 'year' } | null;
}

/**
 * Builds the complete Stripe catalogue from the plan rows and the credit packs.
 * The free tier is deliberately absent: it has no price and needs no Product.
 */
export function buildCatalog(plans: PlanPriceSource[]): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const plan of plans) {
    if (plan.code === 'free') continue;

    if (plan.priceMonthlyPiasters > 0) {
      entries.push({
        lookupKey: subscriptionLookupKey(plan.code, 'monthly'),
        productKey: `plan_${plan.code}`,
        kind: 'subscription',
        planCode: plan.code,
        billingCycle: 'monthly',
        productName: `${plan.nameEn} (monthly)`,
        productDescription: `CareerDev4AI ${plan.nameEn} subscription, billed monthly.`,
        unitAmount: plan.priceMonthlyPiasters,
        currency: 'egp',
        recurring: { interval: 'month' },
      });
    }

    if (plan.priceAnnualPiasters > 0) {
      entries.push({
        lookupKey: subscriptionLookupKey(plan.code, 'annual'),
        productKey: `plan_${plan.code}`,
        kind: 'subscription',
        planCode: plan.code,
        billingCycle: 'annual',
        productName: `${plan.nameEn} (annual)`,
        productDescription: `CareerDev4AI ${plan.nameEn} subscription, billed annually.`,
        unitAmount: plan.priceAnnualPiasters,
        currency: 'egp',
        recurring: { interval: 'year' },
      });
    }
  }

  for (const pack of CREDIT_PACKS) {
    entries.push({
      lookupKey: creditPackLookupKey(pack.id),
      productKey: `pack_${pack.id}`,
      kind: 'credit_pack',
      packId: pack.id,
      credits: pack.credits,
      productName: `${pack.nameEn} — ${pack.credits} AI credits`,
      productDescription: `One-time purchase of ${pack.credits} CareerDev4AI AI credits.`,
      unitAmount: pack.pricePiasters,
      currency: 'egp',
      recurring: null,
    });
  }

  return entries;
}

/**
 * Checks one Stripe Price against what the application expects to sell.
 *
 * The lookup key is only a name; an operator can attach it to a Price with the
 * wrong amount, currency, interval or livemode. Checking the numbers before a
 * Checkout Session is created is what stops the application from advertising
 * 179 EGP and charging 1 EGP, or from charging in USD.
 */
export function validatePriceAgainstCatalog(
  price: StripePrice | null | undefined,
  entry: CatalogEntry,
  testMode: boolean
): string[] {
  if (!price) {
    return [`No active Stripe Price has the lookup key "${entry.lookupKey}".`];
  }

  const issues: string[] = [];

  if (!price.active) issues.push(`Price ${price.id} is not active.`);
  if (price.currency.toLowerCase() !== entry.currency) {
    issues.push(`Price ${price.id} is in ${price.currency}, expected ${entry.currency}.`);
  }
  if (price.unit_amount !== entry.unitAmount) {
    issues.push(
      `Price ${price.id} is ${price.unit_amount ?? 'unset'} minor units, expected ${entry.unitAmount}.`
    );
  }
  if (price.livemode !== !testMode) {
    issues.push(
      `Price ${price.id} is ${price.livemode ? 'live' : 'test'} mode, but the server is running in ${
        testMode ? 'test' : 'live'
      } mode.`
    );
  }

  if (entry.recurring) {
    if (!price.recurring) {
      issues.push(`Price ${price.id} is one-time, expected a recurring ${entry.recurring.interval} price.`);
    } else if (price.recurring.interval !== entry.recurring.interval) {
      issues.push(
        `Price ${price.id} recurs every ${price.recurring.interval}, expected ${entry.recurring.interval}.`
      );
    }
  } else if (price.recurring) {
    issues.push(`Price ${price.id} is recurring, expected a one-time price.`);
  }

  return issues;
}

export interface CatalogValidationIssue {
  lookupKey: string;
  message: string;
}

export interface CatalogValidationResult {
  ok: boolean;
  checked: number;
  issues: CatalogValidationIssue[];
}

const CATALOG_VALIDATION_TTL_MS = 5 * 60 * 1000;
let catalogValidationCache: { at: number; result: CatalogValidationResult } | null = null;

/**
 * Validates every catalogue entry against Stripe in one API call.
 *
 * Cached briefly: the status endpoint is called on page load, and a Dashboard
 * edit does not need to be reflected within the same minute.
 */
export async function validateStripeCatalog(): Promise<CatalogValidationResult> {
  if (catalogValidationCache && Date.now() - catalogValidationCache.at < CATALOG_VALIDATION_TTL_MS) {
    return catalogValidationCache.result;
  }

  const plans = await listActivePlans();
  const entries = buildCatalog(plans);
  const lookupKeys = entries.map((entry) => entry.lookupKey);

  const response = await stripeGet<{ data: StripePrice[] }>('/v1/prices', {
    lookup_keys: lookupKeys,
    active: true,
    limit: 100,
  });

  const byKey = new Map<string, StripePrice>();
  for (const price of response.data) {
    if (price.lookup_key) byKey.set(price.lookup_key, price);
  }

  const testMode = isTestMode();
  const issues: CatalogValidationIssue[] = [];
  for (const entry of entries) {
    for (const message of validatePriceAgainstCatalog(byKey.get(entry.lookupKey), entry, testMode)) {
      issues.push({ lookupKey: entry.lookupKey, message });
    }
  }

  const result: CatalogValidationResult = {
    ok: issues.length === 0,
    checked: entries.length,
    issues,
  };
  catalogValidationCache = { at: Date.now(), result };
  return result;
}

/** Drops the in-isolate catalogue validation cache. Used by the sync script. */
export function clearCatalogValidationCache(): void {
  catalogValidationCache = null;
}

export interface SyncResultRow {
  lookupKey: string;
  productId: string;
  priceId: string;
  amount: number;
  currency: string;
  created: boolean;
}

/**
 * Creates any missing Product and Price in Stripe.
 *
 * Idempotent by design:
 *   * a Product is found by its `catalog_key` metadata;
 *   * a Price is found by its `lookup_key`.
 * Re-running after a price change creates a new Price with the same lookup
 * key after the old one is deactivated — Stripe does not allow two active
 * Prices to share a lookup key, so the operator archives the old one first.
 */
export async function syncStripeCatalog(plans: PlanPriceSource[]): Promise<SyncResultRow[]> {
  const entries = buildCatalog(plans);

  const existingProducts = await stripeGet<{ data: StripeProduct[] }>('/v1/products', {
    active: true,
    limit: 100,
  });

  const productByKey = new Map<string, StripeProduct>();
  for (const product of existingProducts.data) {
    const key = product.metadata?.catalog_key;
    if (key) productByKey.set(key, product);
  }

  const rows: SyncResultRow[] = [];

  for (const entry of entries) {
    let product = productByKey.get(entry.productKey);
    if (!product) {
      product = await stripePost<StripeProduct>('/v1/products', {
        name: entry.productName,
        description: entry.productDescription,
        metadata: {
          catalog_key: entry.productKey,
          kind: entry.kind,
          plan_code: entry.planCode ?? '',
          pack_id: entry.packId ?? '',
          credits: entry.credits ? String(entry.credits) : '',
        },
      });
      productByKey.set(entry.productKey, product);
    }

    const existingPrices = await stripeGet<{ data: StripePrice[] }>('/v1/prices', {
      lookup_keys: [entry.lookupKey],
      active: true,
      limit: 1,
    });

    let price = existingPrices.data[0];
    let created = false;
    if (!price) {
      price = await stripePost<StripePrice>('/v1/prices', {
        product: product.id,
        currency: entry.currency,
        unit_amount: entry.unitAmount,
        lookup_key: entry.lookupKey,
        ...(entry.recurring ? { recurring: { interval: entry.recurring.interval } } : {}),
        metadata: {
          catalog_key: entry.lookupKey,
          kind: entry.kind,
          plan_code: entry.planCode ?? '',
          billing_cycle: entry.billingCycle ?? '',
          pack_id: entry.packId ?? '',
          credits: entry.credits ? String(entry.credits) : '',
        },
      });
      created = true;
    }

    rows.push({
      lookupKey: entry.lookupKey,
      productId: product.id,
      priceId: price.id,
      amount: price.unit_amount ?? entry.unitAmount,
      currency: price.currency,
      created,
    });
  }

  return rows;
}
