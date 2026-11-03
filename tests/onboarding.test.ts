import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isOnboardingStatus,
  onboardingCompletedForStatus,
  shouldForceOnboarding,
} from '../shared/onboarding.ts';

describe('persisted onboarding state', () => {
  it('accepts only the supported statuses', () => {
    for (const status of ['not_started', 'started', 'completed', 'skipped']) {
      assert.equal(isOnboardingStatus(status), true);
    }
    assert.equal(isOnboardingStatus('later'), false);
    assert.equal(isOnboardingStatus(null), false);
  });

  it('resumes started setup but does not force skipped or completed users', () => {
    assert.equal(shouldForceOnboarding({ status: 'started' }), true);
    assert.equal(shouldForceOnboarding({ status: 'not_started' }), true);
    assert.equal(shouldForceOnboarding({ status: 'completed' }), false);
    assert.equal(shouldForceOnboarding({ status: 'skipped' }), false);
    assert.equal(shouldForceOnboarding({ status: 'not_started', completed: true }), false);
  });

  it('keeps the legacy completion flag in sync without treating skip as completion', () => {
    assert.equal(onboardingCompletedForStatus('completed'), true);
    assert.equal(onboardingCompletedForStatus('skipped'), false);
    assert.equal(onboardingCompletedForStatus('started'), false);
  });
});
