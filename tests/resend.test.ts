import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTestEmail, sendTestEmail } from '../server/email/resend.ts';
import { withRuntimeEnv } from '../server/runtimeEnv.ts';

test('test email is branded, responsive, plain-text, and escapes recipient markup', () => {
  const message = buildTestEmail('owner+<test>@example.com');
  assert.equal(message.from, 'CareerDev4AI <onboarding@resend.dev>');
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
      () => sendTestEmail('owner@example.com', 'careerdev4ai-test/user/123')
    );
    assert.deepEqual(result, { ok: true, id: 're_test-message_123' });
    assert.equal(authorization, 'Bearer test-only-secret');
    assert.equal(idempotencyKey, 'careerdev4ai-test/user/123');
    assert.deepEqual(requestBody?.to, ['owner@example.com']);
    assert.equal(requestBody?.from, 'CareerDev4AI <onboarding@resend.dev>');
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
      () => sendTestEmail('owner@example.com', 'careerdev4ai-test/user/123')
    );
    assert.deepEqual(result, { ok: false, status: 401 });
    assert.equal(JSON.stringify(result).includes('sensitive'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
