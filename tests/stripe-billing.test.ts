// Stripe integration — pure unit tests.
//
// These cover the pieces that must be right before any money moves and that can
// be checked without a Stripe key or a database:
//
//   * the form encoder the REST client depends on
//   * the catalogue derived from the application's own prices
//   * the lookup-key round trip (including `career_plus`, which contains `_`)
//   * webhook signature verification, including the tampered and stale cases
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encodeParams } from '../server/stripe/client.ts';
import { buildCatalog } from '../server/stripe/catalog.ts';
import {
  computeStripeSignature,
  parseStripeSignatureHeader,
  verifyStripeSignature,
} from '../server/stripe/signature.ts';
import { parseSubscriptionLookupKey } from '../server/stripe/webhooks.ts';

describe('Stripe form encoding', () => {
  test('encodes nested objects with brackets', () => {
    const encoded = encodeParams({ metadata: { profile_id: 'abc' } });
    assert.equal(encoded, 'metadata%5Bprofile_id%5D=abc');
  });

  test('encodes arrays by index', () => {
    const encoded = encodeParams({ line_items: [{ price: 'price_1', quantity: 1 }] });
    assert.equal(
      encoded,
      'line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1'
    );
  });

  test('encodes booleans and skips null and undefined', () => {
    const encoded = encodeParams({
      active: true,
      cancel_at_period_end: false,
      missing: null,
      absent: undefined,
    });
    assert.equal(encoded, 'active=true&cancel_at_period_end=false');
  });

  test('percent-encodes values that contain separators', () => {
    const encoded = encodeParams({ return_url: 'https://example.com/#/a?b=1&c=2' });
    assert.equal(
      encoded,
      'return_url=https%3A%2F%2Fexample.com%2F%23%2Fa%3Fb%3D1%26c%3D2'
    );
  });
});

describe('Stripe catalogue', () => {
  const plans = [
    { code: 'free', nameEn: 'Free', priceMonthlyPiasters: 0, priceAnnualPiasters: 0 },
    { code: 'student', nameEn: 'Student', priceMonthlyPiasters: 9900, priceAnnualPiasters: 99900 },
    { code: 'pro', nameEn: 'Pro', priceMonthlyPiasters: 17900, priceAnnualPiasters: 179000 },
    {
      code: 'career_plus',
      nameEn: 'Career Plus',
      priceMonthlyPiasters: 29900,
      priceAnnualPiasters: 299000,
    },
  ];

  const catalog = buildCatalog(plans);

  test('free tier produces no Stripe objects', () => {
    assert.equal(catalog.some((entry) => entry.planCode === 'free'), false);
  });

  test('every paid plan has a monthly and an annual price', () => {
    const subscriptionEntries = catalog.filter((entry) => entry.kind === 'subscription');
    assert.equal(subscriptionEntries.length, 6);
    assert.ok(subscriptionEntries.some((entry) => entry.lookupKey === 'careerdev4ai_student_monthly'));
    assert.ok(
      subscriptionEntries.some((entry) => entry.lookupKey === 'careerdev4ai_career_plus_annual')
    );
  });

  test('amounts are the plan prices in piasters, in EGP', () => {
    const pro = catalog.find((entry) => entry.lookupKey === 'careerdev4ai_pro_monthly');
    assert.ok(pro);
    assert.equal(pro.unitAmount, 17900);
    assert.equal(pro.currency, 'egp');
    assert.deepEqual(pro.recurring, { interval: 'month' });
  });

  test('credit packs are one-time prices', () => {
    const packs = catalog.filter((entry) => entry.kind === 'credit_pack');
    assert.equal(packs.length, 3);
    const pack = packs.find((entry) => entry.packId === 'pack_40');
    assert.ok(pack);
    assert.equal(pack.unitAmount, 9900);
    assert.equal(pack.recurring, null);
    assert.equal(pack.credits, 40);
  });
});

describe('Subscription lookup keys', () => {
  test('round-trips every plan, including one with an underscore', () => {
    for (const plan of ['student', 'pro', 'career_plus']) {
      for (const cycle of ['monthly', 'annual'] as const) {
        const parsed = parseSubscriptionLookupKey(`careerdev4ai_${plan}_${cycle}`);
        assert.deepEqual(parsed, { planCode: plan, billingCycle: cycle });
      }
    }
  });

  test('rejects a foreign or malformed key', () => {
    assert.equal(parseSubscriptionLookupKey('acme_pro_monthly'), null);
    assert.equal(parseSubscriptionLookupKey('careerdev4ai_pro_weekly'), null);
    assert.equal(parseSubscriptionLookupKey(null), null);
  });
});

describe('Webhook signatures', () => {
  const secret = 'whsec_test_secret';
  const payload = '{"id":"evt_1","type":"checkout.session.completed"}';

  async function signedHeader(body: string, timestamp: number): Promise<string> {
    const signature = await computeStripeSignature(body, String(timestamp), secret);
    return `t=${timestamp},v1=${signature}`;
  }

  test('parses the timestamp and every v1 value', () => {
    const parsed = parseStripeSignatureHeader('t=1700000000,v1=aaa,v1=bbb');
    assert.deepEqual(parsed, { timestamp: 1700000000, signatures: ['aaa', 'bbb'] });
    assert.equal(parseStripeSignatureHeader('v1=aaa'), null);
    assert.equal(parseStripeSignatureHeader(''), null);
  });

  test('accepts a correctly signed body', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = await signedHeader(payload, timestamp);
    assert.equal(await verifyStripeSignature(payload, header, secret), true);
  });

  test('rejects a tampered body', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = await signedHeader(payload, timestamp);
    assert.equal(
      await verifyStripeSignature(payload.replace('evt_1', 'evt_2'), header, secret),
      false
    );
  });

  test('rejects a signature signed with another secret', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await computeStripeSignature(payload, String(timestamp), 'whsec_other');
    assert.equal(
      await verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret),
      false
    );
  });

  test('rejects a stale timestamp outside the tolerance', async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 3600;
    const header = await signedHeader(payload, timestamp);
    assert.equal(await verifyStripeSignature(payload, header, secret), false);
  });

  test('rejects a missing or malformed header', async () => {
    assert.equal(await verifyStripeSignature(payload, null, secret), false);
    assert.equal(await verifyStripeSignature(payload, 'garbage', secret), false);
  });

  test('rejects everything when no secret is configured', async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const header = await signedHeader(payload, timestamp);
    assert.equal(await verifyStripeSignature(payload, header, ''), false);
  });
});
