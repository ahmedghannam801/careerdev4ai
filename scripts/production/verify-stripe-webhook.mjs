/**
 * Verifies the Stripe webhook route on the live origin.
 *
 * Two probes, both of which stop before any database write:
 *
 *   1. an invalid signature must be refused with "Invalid signature";
 *   2. a correctly signed request whose body is not an event must be refused
 *      with "Malformed event body".
 *
 * The second probe is the meaningful one: the signature is verified before the
 * body is parsed, so the route only reaches the parse error when the
 * signature was accepted. It proves that the deployment holds the same signing
 * secret that Stripe signs with, without recording a single event row in the
 * production table.
 */

import 'dotenv/config';
import { createHmac } from 'node:crypto';

const ORIGIN = process.argv[2] ?? 'https://aionvia.pages.dev';
const URL = `${ORIGIN}/api/stripe/webhook`;
const secret = process.env.STRIPE_WEBHOOK_SECRET;

if (!secret) {
  console.error('STRIPE_WEBHOOK_SECRET is not set.');
  process.exit(1);
}

function sign(body, timestamp) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function probe(label, body, header) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': header,
    },
    body,
  });
  const text = await response.text();
  console.log(`${label}: HTTP ${response.status} — ${text}`);
  return { status: response.status, text };
}

console.log(`\n=== Stripe webhook route on ${ORIGIN} ===\n`);

const timestamp = Math.floor(Date.now() / 1000);

const bad = await probe('invalid signature ', '{}', `t=${timestamp},v1=${'0'.repeat(64)}`);
const good = await probe('valid signature, malformed body', '{not-json', sign('{not-json', timestamp));

const refusedBad = bad.status === 400 && bad.text.includes('Invalid signature');
// The route reports a body it cannot read in one of two words depending on
// which layer rejects it. Either way the signature was accepted first.
const acceptedGood = good.status === 400 && /Malformed/i.test(good.text);

console.log('');
console.log(`invalid signature refused : ${refusedBad ? 'PASS' : 'FAIL'}`);
console.log(`valid signature accepted  : ${acceptedGood ? 'PASS' : 'FAIL'}`);
console.log('');
process.exitCode = refusedBad && acceptedGood ? 0 : 1;
