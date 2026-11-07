/**
 * Creates (or verifies) the Stripe Products and Prices for the application's
 * plans and credit packs.
 *
 * Run it once after configuring STRIPE_SECRET_KEY, and again whenever a price
 * changes. It is idempotent: a Product is matched by `metadata.catalog_key` and
 * a Price by `lookup_key`, so running it twice creates nothing.
 *
 *   npm run stripe:sync
 */

import dotenv from 'dotenv';

dotenv.config();

// Imported after dotenv.config() so the lazily-read environment is populated.
const { getPublicPlans } = await import('../server/subscriptions/service.ts');
const { syncStripeCatalog } = await import('../server/stripe/catalog.ts');
const { isTestMode } = await import('../server/stripe/config.ts');

async function main(): Promise<void> {
  console.log(`Stripe catalogue sync — ${isTestMode() ? 'TEST' : 'LIVE'} mode`);

  const plans = await getPublicPlans();
  if (plans.length === 0) {
    throw new Error('No subscription plans were returned. Apply the subscription migrations first.');
  }

  const rows = await syncStripeCatalog(plans);

  console.log('');
  console.log('lookup key                              price id                  amount');
  console.log('--------------------------------------- ------------------------- ----------');
  for (const row of rows) {
    const label = row.lookupKey.padEnd(39, ' ');
    const price = row.priceId.padEnd(25, ' ');
    const amount = `${(row.amount / 100).toFixed(2)} ${row.currency.toUpperCase()}`;
    console.log(`${label} ${price} ${amount}${row.created ? '  (created)' : ''}`);
  }
  console.log('');
  console.log(`${rows.length} prices ready.`);
}

main().catch((error) => {
  console.error('');
  console.error('Stripe catalogue sync failed:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
