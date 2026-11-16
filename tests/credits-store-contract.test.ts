import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCreditBalance,
  getCreditsSnapshot,
  isSyncMessageForIdentity,
  resetCredits,
} from '../src/lib/creditsStore.ts';
import { creditActivityForPath } from '../src/lib/creditActivity.ts';

const balance = (value: number) => ({
  balance: value,
  monthlyAllocation: 20,
  consumedThisMonth: 20 - value,
  tier: 'free',
  expiresAt: null,
});

test('credit snapshots do not regress when cross-tab updates arrive out of order', () => {
  resetCredits();
  applyCreditBalance(balance(8), { broadcast: false, updatedAt: 200 });
  applyCreditBalance(balance(9), { broadcast: false, updatedAt: 100 });
  assert.equal(getCreditsSnapshot().balance?.balance, 8);
  assert.equal(getCreditsSnapshot().updatedAt, 200);
  resetCredits();
});

test('cross-tab credit messages are isolated by signed-in account', () => {
  const message = { type: 'credits:update', userId: 'user-a', balance: balance(4) };
  assert.equal(isSyncMessageForIdentity(message, 'user-a'), true);
  assert.equal(isSyncMessageForIdentity(message, 'user-b'), false);
  assert.equal(isSyncMessageForIdentity(message, null), false);
  assert.equal(isSyncMessageForIdentity({ type: 'credits:update' }, 'user-a'), false);
});

test('all server token-spend endpoints trigger shared balance refresh activity', () => {
  const spendPaths = [
    '/api/optimize-cv',
    '/api/cv/job-description/generate',
    '/api/projects/recommendations',
    '/api/projects/analyze',
  ];
  for (const path of spendPaths) {
    assert.equal(creditActivityForPath(path), 'ai-operation', `${path} is synchronized`);
  }
  assert.equal(creditActivityForPath('/api/profile'), null, 'non-spend requests do not trigger reads');
});
