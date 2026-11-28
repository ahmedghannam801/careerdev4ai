/**
 * The free AI flows, against the running API.
 * ---------------------------------------------------------------------------
 * The product promises that the AI chat, the mock interview and the ordinary
 * career flows cost nothing, and that only four actions spend a token. This
 * file proves the promise where it is actually enforced: on the server, for a
 * candidate whose balance is exactly zero.
 *
 * The platform as a whole is now free, so it also proves the other side of the
 * same promise: a CV template that used to cost five tokens costs nothing at
 * all, and the manual daily claim is gone rather than quietly paying out.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  admin,
  api,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers.ts';

/** The balance the candidate sees, read from the API. */
async function apiBalance(token: string): Promise<number> {
  const res = await api('GET', '/api/credits/balance', { token });
  assert.equal(res.status, 200, `the balance endpoint must answer 200, got ${res.status}`);
  return res.body?.balance as number;
}

/**
 * Leaves the candidate with a real balance of zero.
 *
 * A brand new account receives a five-token trial grant on the first read of
 * its balance. That grant is deliberate, so the test does not pretend it did
 * not happen: it reads the balance, then spends everything the ledger holds.
 * The account then has a ledger history and a zero balance, which is the state
 * a candidate who used their free tokens is really in.
 */
async function drainToZero(user: TestUser): Promise<void> {
  const before = await apiBalance(user.token);
  if (before > 0) {
    const { error } = await admin.rpc('consume_ai_credits', {
      p_profile_id: user.id,
      p_operation: 'ai_assist_inline',
      p_amount: before,
      p_idempotency_key: `free-flows-drain-${user.id}-${Date.now()}`,
      p_metadata: { reason: 'test: drain the trial grant to zero' },
    });
    if (error) throw new Error(`drainToZero failed: ${error.message}`);
  }

  const after = await apiBalance(user.token);
  assert.equal(after, 0, 'the test must start from a real zero balance');
}

/** Gives the candidate tokens through the same ledger table the product uses. */
async function grantCredits(
  profileId: string,
  amount: number,
  idempotencyKey: string
): Promise<void> {
  const { data: latest } = await admin
    .from('ai_credit_ledger')
    .select('running_balance')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from('ai_credit_ledger').insert({
    profile_id: profileId,
    operation: 'grant',
    amount,
    running_balance: (latest?.running_balance ?? 0) + amount,
    source_type: 'admin',
    ai_action_type: null,
    idempotency_key: idempotencyKey,
    description: 'Test harness credit grant for the free-flow contract',
  });
  if (error) throw new Error(`grantCredits failed: ${error.message}`);
}

/** Whether the test server has a model. A server without one answers 503. */
async function modelConfigured(): Promise<boolean> {
  const health = await api('GET', '/api/health');
  return health.body?.modelConfigured === true;
}

describe('free AI flows on a zero balance', () => {
  test('the AI chat answers without spending a token', async (t) => {
    const user = await createTestUser('free-chat', { subscription: false });
    try {
      await drainToZero(user);

      const res = await api('POST', '/api/copilot', {
        token: user.token,
        body: {
          userPrompt: 'What should I prioritize today for my target role?',
          context: { activeView: 'dashboard' },
          language: 'en',
        },
      });

      // The two failures this change removes. A zero-balance candidate must
      // never meet either of them on the chat route.
      assert.notEqual(res.status, 402, 'the chat must not ask for tokens');
      assert.notEqual(res.status, 403, 'the chat must not be blocked by the free plan');

      if (!(await modelConfigured())) {
        assert.equal(res.status, 503, 'a server without a model must say so');
        assert.equal(res.body?.code, 'model_unavailable');
      } else if (res.status === 429 && res.body?.code === 'provider_quota') {
        // The provider's own free-tier quota is not this product's paywall.
        t.skip('the AI provider has exhausted its own daily quota; the free-flow contract still holds');
        return;
      } else {
        assert.equal(
          res.status,
          200,
          `a zero-balance candidate must be able to chat (got ${res.status}: ${JSON.stringify(res.body)})`
        );
        assert.equal(typeof res.body?.text, 'string', 'the answer must be text');
        assert.ok((res.body?.text?.length ?? 0) > 0, 'the answer must not be empty');
      }

      assert.equal(await apiBalance(user.token), 0, 'the chat must leave the balance at zero');
    } finally {
      await deleteTestUser(user);
    }
  });

  test('a mock interview is evaluated without spending a token', async (t) => {
    const user = await createTestUser('free-interview', { subscription: false });
    try {
      await drainToZero(user);

      const res = await api('POST', '/api/mock-interview', {
        token: user.token,
        body: {
          roleTitle: 'Financial Analyst',
          interviewType: 'behavioural',
          question: 'Tell me about a report you owned end to end.',
          userAnswer:
            'I owned the monthly reporting pack, from the source data through the variance analysis to the board deck.',
          language: 'en',
        },
      });

      assert.notEqual(res.status, 402, 'the mock interview must not ask for tokens');
      assert.notEqual(res.status, 403, 'the mock interview must not be blocked by the free plan');

      if (!(await modelConfigured())) {
        assert.equal(res.status, 503, 'a server without a model must say so');
        assert.equal(res.body?.code, 'model_unavailable');
      } else if (res.status === 429 && res.body?.code === 'provider_quota') {
        t.skip('the AI provider has exhausted its own daily quota; the free-flow contract still holds');
        return;
      } else {
        assert.equal(
          res.status,
          200,
          `a zero-balance candidate must receive scored feedback (got ${res.status}: ${JSON.stringify(res.body)})`
        );
        assert.equal(typeof res.body?.score, 'number', 'the feedback must carry a score');
        assert.ok(
          (res.body?.score as number) >= 0 && (res.body?.score as number) <= 100,
          'the score must be a percentage'
        );
      }

      assert.equal(
        await apiBalance(user.token),
        0,
        'the mock interview must leave the balance at zero'
      );
    } finally {
      await deleteTestUser(user);
    }
  });

  test('a CV template costs nothing at all', async () => {
    const user = await createTestUser('free-template', { subscription: false });
    try {
      await drainToZero(user);

      await grantCredits(user.id, 5, `free-flow-template-${user.id}`);
      const before = await apiBalance(user.token);

      const res = await api('POST', '/api/cv-templates/modern-gradient/unlock', {
        token: user.token,
      });

      assert.equal(res.status, 200, `the unlock must succeed: ${JSON.stringify(res.body)}`);
      assert.equal(
        res.body?.creditsCharged,
        0,
        'the platform is free: unlocking a template must not take any tokens'
      );
      assert.equal(
        await apiBalance(user.token),
        before,
        'the balance must not have moved'
      );
    } finally {
      await deleteTestUser(user);
    }
  });

  test('a candidate with no tokens can still apply a template', async () => {
    const user = await createTestUser('free-template-zero', { subscription: false });
    try {
      await drainToZero(user);

      const res = await api('POST', '/api/cv-templates/apply', {
        token: user.token,
        body: { templateId: 'modern-gradient' },
      });

      assert.equal(res.status, 200, `the template must be available: ${JSON.stringify(res.body)}`);
      assert.equal(res.body?.access?.allowed, true);
    } finally {
      await deleteTestUser(user);
    }
  });

  test('the manual daily claim is gone, because the platform is free', async () => {
    const user = await createTestUser('free-daily-claim', { subscription: false });
    try {
      await drainToZero(user);

      const res = await api('POST', '/api/credits/daily/claim', { token: user.token });
      assert.equal(res.status, 410, 'the daily claim must be retired, not silently pay out');
      assert.equal(res.body?.code, 'PLATFORM_IS_FREE');
      assert.equal(
        await apiBalance(user.token),
        0,
        'a retired claim must not have granted anything'
      );
    } finally {
      await deleteTestUser(user);
    }
  });
});
