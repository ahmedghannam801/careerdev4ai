/**
 * The server contract for the CV Studio AI edit allowance.
 *
 * These tests exercise the same plan-aware claim decision as the API, with a
 * small in-memory store standing in for the atomic database RPC.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  claimCvAiEditForPlan,
  CvAiQuotaUnavailableError,
  getCvAiQuotaStateForPlan,
  parseCvAiQuotaRow,
  type CvAiQuotaStorageRow,
} from '../shared/cvAiQuotaService.ts';
import { CV_AI_EDIT_LIMIT, CV_AI_EDIT_WINDOW_MS, resolveCvAiQuotaState } from '../shared/cvAiQuota.ts';

type CvAiEditQuotaRow = CvAiQuotaStorageRow & {
  limit: number;
  remaining: number;
  locked: boolean;
};

function quotaRow(used: number, resetAt: string | null): CvAiEditQuotaRow {
  return {
    limit: CV_AI_EDIT_LIMIT,
    used,
    remaining: Math.max(CV_AI_EDIT_LIMIT - used, 0),
    locked: used >= CV_AI_EDIT_LIMIT,
    resetAt,
  };
}

describe('CV Studio AI edit quota', () => {
  it('allows three free AI edits, locks the fourth, and retains the 24-hour reset time', async () => {
    const startedAt = Date.now();
    let used = 0;
    let resetAt: string | null = null;
    const consume = async (): Promise<CvAiEditQuotaRow> => {
      if (used >= CV_AI_EDIT_LIMIT) {
        return { ...quotaRow(used, resetAt), allowed: false };
      }
      used += 1;
      resetAt ??= new Date(startedAt + CV_AI_EDIT_WINDOW_MS).toISOString();
      return { ...quotaRow(used, resetAt), allowed: true };
    };

    const first = await claimCvAiEditForPlan('free', consume);
    const second = await claimCvAiEditForPlan('free', consume);
    const third = await claimCvAiEditForPlan('free', consume);
    const fourth = await claimCvAiEditForPlan('free', consume);

    assert.equal(first.allowed, true);
    assert.equal(first.state.remaining, 2);
    assert.equal(second.allowed, true);
    assert.equal(second.state.remaining, 1);
    assert.equal(third.allowed, true);
    assert.equal(third.state.remaining, 0);
    assert.equal(third.state.locked, true);
    assert.equal(third.state.resetAt, resetAt);
    assert.ok(resetAt);
    assert.equal(Date.parse(resetAt) - startedAt, CV_AI_EDIT_WINDOW_MS);
    assert.equal(fourth.allowed, false);
    assert.equal(fourth.reserved, false);
    assert.equal(fourth.state.locked, true);
    assert.equal(fourth.state.resetAt, resetAt);
  });

  it('automatically restores all three edits after the window expires', () => {
    const now = Date.now();
    const state = resolveCvAiQuotaState(
      { used: CV_AI_EDIT_LIMIT, resetAt: new Date(now - 1).toISOString() },
      'free',
      now
    );

    assert.equal(state.used, 0);
    assert.equal(state.remaining, CV_AI_EDIT_LIMIT);
    assert.equal(state.locked, false);
    assert.equal(state.resetAt, null);
  });

  it('gives every paid plan unlimited edits without touching the counter', async () => {
    for (const planCode of ['student', 'pro', 'career_plus']) {
      let called = false;
      const claim = await claimCvAiEditForPlan(planCode, async () => {
        called = true;
        throw new Error('paid plans must not reserve a quota slot');
      });

      assert.equal(claim.allowed, true);
      assert.equal(claim.reserved, false);
      assert.equal(claim.state.unlimited, true);
      assert.equal(claim.state.remaining, null);
      assert.equal(called, false);
    }
  });

  it('fails closed when the quota store cannot reserve an edit', async () => {
    await assert.rejects(
      claimCvAiEditForPlan('free', async () => {
        throw new Error('database unavailable');
      }),
      CvAiQuotaUnavailableError
    );
  });

  it('fails closed when the quota store cannot be read', async () => {
    await assert.rejects(
      getCvAiQuotaStateForPlan('free', async () => {
        throw new Error('database unavailable');
      }),
      CvAiQuotaUnavailableError
    );
  });

  it('rejects an empty RPC response and accepts the third reservation explicitly', () => {
    assert.throws(() => parseCvAiQuotaRow(null), /response was empty/);
    assert.throws(
      () => parseCvAiQuotaRow({ limit: 3, used: 0, remaining: 3, locked: false, reset_at: null }, { requireAllowed: true }),
      /response was invalid/
    );

    const third = parseCvAiQuotaRow({
      limit: 3,
      used: 3,
      remaining: 0,
      locked: true,
      allowed: true,
      reset_at: new Date(Date.now() + CV_AI_EDIT_WINDOW_MS).toISOString(),
    }, { requireAllowed: true });
    assert.equal(third.allowed, true);
    assert.equal(third.locked, true);
  });
});
