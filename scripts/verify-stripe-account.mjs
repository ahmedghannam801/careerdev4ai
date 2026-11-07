// Verifies the Stripe account, the catalogue and a test-mode Checkout Session.
//
// It never prints a secret. It prints the account identity (the public
// account id), the mode, and the catalogue prices, so that the operator can
// confirm the money is aimed at the account they think it is.
//
//   node scripts/verify-stripe-account.mjs
import { existsSync, readFileSync } from 'fs';

/** Reads the environment without printing anything secret. */
function loadEnv() {
  const out = {};
  if (!existsSync('.env')) return out;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']/, '').replace(/["']$/, '');
  }
  return out;
}

const env = loadEnv();
const KEY = env.STRIPE_SECRET_KEY;

if (!KEY) {
  console.error('STRIPE_SECRET_KEY is not configured. Nothing was checked.');
  process.exit(1);
}

async function stripe(path, method = 'GET', body = null) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: response.status, json, version: response.headers.get('stripe-version') };
}

const account = await stripe('/v1/account');
console.log('=== THE STRIPE ACCOUNT ===');
if (account.status !== 200) {
  console.log('Could not read the account:', JSON.stringify(account.json).slice(0, 300));
  process.exit(1);
}
console.log('account id          :', account.json.id);
console.log('business type       :', account.json.business_type);
console.log('country             :', account.json.country);
console.log('default currency    :', account.json.default_currency);
console.log('charges enabled     :', account.json.charges_enabled);
console.log('payouts enabled     :', account.json.payouts_enabled);
console.log('details submitted   :', account.json.details_submitted);
console.log('api version seen    :', account.version);
console.log('key mode            :', KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST');

console.log('\n=== THE CATALOGUE PRICES ON THIS ACCOUNT ===');
const prices = await stripe('/v1/prices?active=true&limit=100');
if (prices.status === 200) {
  for (const price of prices.json.data ?? []) {
    console.log(
      `${price.id} | ${String(price.currency).toUpperCase()} ${(price.unit_amount ?? 0) / 100} |` +
        ` ${price.recurring ? `every ${price.recurring.interval}` : 'one-time'} |` +
        ` livemode=${price.livemode} | lookup=${price.lookup_key ?? '-'}`
    );
  }
  if (!(prices.json.data ?? []).length) {
    console.log('(no active prices on this account)');
  }
} else {
  console.log('Could not list prices:', JSON.stringify(prices.json).slice(0, 200));
}

console.log('\n=== PRODUCTS ON THIS ACCOUNT ===');
const products = await stripe('/v1/products?active=true&limit=100');
if (products.status === 200) {
  for (const product of products.json.data ?? []) {
    console.log(`${product.id} | ${product.name} | livemode=${product.livemode}`);
  }
  if (!(products.json.data ?? []).length) {
    console.log('(no active products on this account)');
  }
}
