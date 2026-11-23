import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTestEmail,
  emailDeliveryStatus,
  normalizeRecipient,
  resolveSender,
  sendEmail,
  sendTestEmail,
} from '../server/email/resend.ts';
import { withRuntimeEnv } from '../server/runtimeEnv.ts';

test('test email is branded, responsive, plain-text, and escapes recipient markup', () => {
  const message = buildTestEmail('owner+<test>@example.com');
  assert.equal(message.from, 'Aionvia <onboarding@resend.dev>');
  assert.deepEqual(message.to, ['owner+<test>@example.com']);
  assert.match(message.html, /#FF5A36/);
  assert.match(message.html, /name="viewport"/);
  assert.match(message.html, /TEST MESSAGE/);
  assert.match(message.html, /owner\+&lt;test&gt;@example.com/);
  assert.doesNotMatch(message.html, /owner\+<test>/);
  assert.match(message.text, /TEST MESSAGE/);
  assert.match(message.text, /No action is required/);
  assert.doesNotMatch(message.text, /https?:\/\//);
});

test('Resend call uses request-scoped credentials and returns only a valid message ID', async () => {
  const originalFetch = globalThis.fetch;
  let authorization = '';
  let idempotencyKey = '';
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    idempotencyKey = new Headers(init?.headers).get('Idempotency-Key') ?? '';
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ id: 're_test-message_123' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await withRuntimeEnv(
      { RESEND_API_KEY: 'test-only-secret', RESEND_TEST_RECIPIENT: 'owner@example.com' },
      () => sendTestEmail('owner@example.com', 'aionvia-test/user/123')
    );
    assert.deepEqual(result, { ok: true, id: 're_test-message_123' });
    assert.equal(authorization, 'Bearer test-only-secret');
    assert.equal(idempotencyKey, 'aionvia-test/user/123');
    assert.deepEqual(requestBody?.to, ['owner@example.com']);
    assert.equal(requestBody?.from, 'Aionvia <onboarding@resend.dev>');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Resend failures do not expose the provider response body', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('sensitive provider diagnostics', { status: 401 })) as typeof fetch;
  try {
    const result = await withRuntimeEnv(
      { RESEND_API_KEY: 'test-only-secret' },
      () => sendTestEmail('owner@example.com', 'aionvia-test/user/123')
    );
    assert.deepEqual(result, { ok: false, status: 401 });
    assert.equal(JSON.stringify(result).includes('sensitive'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a verified sending address replaces the shared test sender, and a broken one is ignored', () => {
  assert.equal(
    withRuntimeEnv({ RESEND_FROM: 'Aionvia <noreply@aionvia.app>' }, resolveSender),
    'Aionvia <noreply@aionvia.app>',
  );
  assert.equal(withRuntimeEnv({ RESEND_FROM: 'noreply@aionvia.app' }, resolveSender), 'noreply@aionvia.app');

  // Nothing usable in the setting: the deployment keeps sending from the
  // address Resend accepts without a verified domain rather than failing every
  // message with a malformed From.
  for (const value of ['not-an-address', 'Aionvia <>', '   ', 'a'.repeat(400)]) {
    assert.equal(withRuntimeEnv({ RESEND_FROM: value }, resolveSender), 'Aionvia <onboarding@resend.dev>');
  }
});

test('the delivery status says what is missing rather than waiting for a failed send', () => {
  // The process environment is the fallback when no request-scoped value is
  // set, so another test file that sets RESEND_FROM would otherwise decide the
  // answer here. The variables are cleared for the duration of this test.
  const saved = {
    RESEND_FROM: process.env.RESEND_FROM,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_TEST_RECIPIENT: process.env.RESEND_TEST_RECIPIENT,
  };
  delete process.env.RESEND_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_TEST_RECIPIENT;

  try {
  const unconfigured = withRuntimeEnv({}, emailDeliveryStatus);
  assert.equal(unconfigured.apiKeyConfigured, false);
  assert.equal(unconfigured.recipientConfigured, false);
  assert.equal(unconfigured.senderIsSharedTestAddress, true);

  const sharedSender = withRuntimeEnv(
    { RESEND_API_KEY: 'k', RESEND_TEST_RECIPIENT: 'owner@example.com' },
    emailDeliveryStatus,
  );
  assert.equal(sharedSender.apiKeyConfigured, true);
  assert.equal(sharedSender.recipientConfigured, true);
  // A key is not enough on its own: with the shared sender only the account
  // owner can receive anything, and the panel has to be able to say so.
  assert.equal(sharedSender.senderIsSharedTestAddress, true);

  const verified = withRuntimeEnv(
    {
      RESEND_API_KEY: 'k',
      RESEND_TEST_RECIPIENT: 'owner@example.com',
      RESEND_FROM: 'Aionvia <noreply@aionvia.app>',
    },
    emailDeliveryStatus,
  );
  assert.equal(verified.sender, 'Aionvia <noreply@aionvia.app>');
  assert.equal(verified.senderIsSharedTestAddress, false);

  // An address that cannot receive mail is not a recipient.
  const badRecipient = withRuntimeEnv(
    { RESEND_API_KEY: 'k', RESEND_TEST_RECIPIENT: 'owner@example' },
    emailDeliveryStatus,
  );
  assert.equal(badRecipient.recipientConfigured, false);
  assert.equal(normalizeRecipient('  owner@example.com  '), 'owner@example.com');
  assert.equal(normalizeRecipient(''), undefined);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('a send uses the deployment sender and carries no provider body back', async () => {
  const originalFetch = globalThis.fetch;
  let sentFrom = '';
  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    sentFrom = String((JSON.parse(String(init?.body)) as { from?: string }).from);
    return new Response(JSON.stringify({ id: 're_connected_1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const result = await withRuntimeEnv(
      { RESEND_API_KEY: 'deployment-key', RESEND_FROM: 'Aionvia <noreply@aionvia.app>' },
      () =>
        sendEmail(
          { to: 'candidate@example.com', subject: 'Your week', html: '<p>hi</p>', text: 'hi' },
          'aionvia/weekly/user',
        ),
    );
    assert.deepEqual(result, { ok: true, id: 're_connected_1' });
    assert.equal(sentFrom, 'Aionvia <noreply@aionvia.app>');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a caller-supplied key and sender are used before anything is stored', async () => {
  const originalFetch = globalThis.fetch;
  let authorization = '';
  let sentFrom = '';
  globalThis.fetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get('Authorization') ?? '';
    sentFrom = String((JSON.parse(String(init?.body)) as { from?: string }).from);
    return new Response(JSON.stringify({ id: 're_connect_check' }), { status: 200 });
  }) as typeof fetch;

  try {
    // No runtime environment at all: this is the state the connection script
    // runs in, before the key has been written to any file.
    await withRuntimeEnv({}, () =>
      sendEmail(
        { to: 'owner@example.com', subject: 'check', html: '<p>x</p>', text: 'x' },
        'aionvia-connect/1',
        { apiKey: 'candidate-key', sender: 'Aionvia <noreply@aionvia.app>' },
      ),
    );
    assert.equal(authorization, 'Bearer candidate-key');
    assert.equal(sentFrom, 'Aionvia <noreply@aionvia.app>');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
