import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDeliverTo, type EmailDeliveryConfig } from '../server/email/config.ts';
import { verifyResendSignature } from '../server/email/webhook.ts';

function config(overrides: Partial<EmailDeliveryConfig> = {}): EmailDeliveryConfig {
  return {
    apiKeyConfigured: true,
    sender: 'Aionvia <onboarding@resend.dev>',
    senderAddress: 'onboarding@resend.dev',
    senderDomain: 'resend.dev',
    senderIsSharedTestAddress: true,
    ownerRecipient: 'owner@example.com',
    domains: [],
    verifiedDomains: [],
    domainVerified: true,
    productionReady: false,
    reason: 'shared sender',
    checkedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

test('the shared sender may only deliver to the Resend account owner', () => {
  const shared = config();
  assert.equal(canDeliverTo(shared, 'owner@example.com'), true);
  assert.equal(canDeliverTo(shared, 'someone@example.com'), false);
  assert.equal(canDeliverTo(shared, 'OWNER@example.com'), true);
});

test('a verified domain allows any recipient, and an unverified one allows none', () => {
  const verified = config({
    sender: 'Aionvia <noreply@aionvia.app>',
    senderAddress: 'noreply@aionvia.app',
    senderDomain: 'aionvia.app',
    senderIsSharedTestAddress: false,
    domainVerified: true,
    productionReady: true,
    reason: null,
  });
  assert.equal(canDeliverTo(verified, 'someone@example.com'), true);

  const unverified = { ...verified, domainVerified: false, productionReady: false };
  assert.equal(canDeliverTo(unverified, 'someone@example.com'), false);
  assert.equal(canDeliverTo(unverified, 'owner@example.com'), false);
});

test('a missing key never permits a send', () => {
  const noKey = config({ apiKeyConfigured: false, productionReady: true });
  assert.equal(canDeliverTo(noKey, 'owner@example.com'), false);
});

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sign(id: string, timestamp: string, body: string, secretBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return `v1,${toBase64(new Uint8Array(signature))}`;
}

test('a Resend webhook signature is verified against the exact body', async () => {
  const secretBytes = new TextEncoder().encode('a-test-webhook-secret');
  const secret = `whsec_${toBase64(secretBytes)}`;
  const id = 'msg_test_1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_1' } });
  const signature = await sign(id, timestamp, body, secretBytes);

  assert.equal(
    await verifyResendSignature(body, { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature }, secret),
    true,
  );
  assert.equal(
    await verifyResendSignature(`${body} `, { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature }, secret),
    false,
  );
  assert.equal(
    await verifyResendSignature(body, { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,AAAA' }, secret),
    false,
  );
});

test('a replayed webhook timestamp is refused', async () => {
  const secretBytes = new TextEncoder().encode('a-test-webhook-secret');
  const secret = `whsec_${toBase64(secretBytes)}`;
  const id = 'msg_test_2';
  const timestamp = String(Math.floor(Date.now() / 1000) - 600);
  const body = '{"type":"email.delivered"}';
  const signature = await sign(id, timestamp, body, secretBytes);
  assert.equal(
    await verifyResendSignature(body, { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': signature }, secret),
    false,
  );
});
