/**
 * Moves the Stripe webhook endpoint to the new production origin.
 *
 * The account has one endpoint, pointing at the predecessor origin. Stripe
 * does not accept a signing secret when an endpoint is created through the
 * API, so creating a second endpoint would leave it with a *different* secret
 * from the one the deployed worker verifies against — and only one of the two
 * could ever deliver.
 *
 * Repointing the existing endpoint keeps the signing secret untouched: the
 * worker verifies the same signature as before, no secret has to be rotated,
 * and there is no window in which a delivery is signed with a secret the
 * server does not hold.
 *
 * Usage:
 *   node scripts/stripe-migrate-webhook.mjs
 */

import 'dotenv/config';

const OLD_ORIGIN = 'https://careerdev4ai.pages.dev';
const NEW_ORIGIN = 'https://aionvia.pages.dev';
const key = process.env.STRIPE_SECRET_KEY;

if (!key) {
  console.error('STRIPE_SECRET_KEY is not set.');
  process.exit(1);
}

async function listEndpoints() {
  const response = await fetch('https://api.stripe.com/v1/webhook_endpoints?limit=20', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await response.json();
  return body.data ?? [];
}

const before = await listEndpoints();
console.log('--- webhook endpoints before ---');
for (const endpoint of before) {
  console.log(` ${endpoint.id}  ${endpoint.url}  (${endpoint.status})  events=${endpoint.enabled_events.length}`);
}

const target = before.find((endpoint) => endpoint.url.startsWith(OLD_ORIGIN));
if (!target) {
  console.error(`No endpoint on ${OLD_ORIGIN}; refusing to guess.`);
  process.exit(1);
}

if (target.url.startsWith(NEW_ORIGIN)) {
  console.log('\nAlready on the new origin.');
} else {
  const response = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${target.id}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ url: `${NEW_ORIGIN}/api/stripe/webhook` }),
  });
  const updated = await response.json();
  if (!response.ok) {
    console.error('Failed to update the endpoint:', JSON.stringify(updated.error ?? updated));
    process.exit(1);
  }
  console.log(`\nUpdated ${updated.id} -> ${updated.url} (${updated.status})`);
  console.log(`events preserved: ${updated.enabled_events.length === target.enabled_events.length}`);
}

console.log('\n--- webhook endpoints after ---');
for (const endpoint of await listEndpoints()) {
  console.log(` ${endpoint.id}  ${endpoint.url}  (${endpoint.status})`);
}
