import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isOnboardingStatus,
  onboardingCompletedForStatus,
  shouldForceOnboarding,
} from '../shared/onboarding.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

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

  it('routes first-run users from the persisted status, not the legacy boolean', () => {
    const app = readFileSync(join(REPO_ROOT, 'src', 'App.tsx'), 'utf-8');
    // A skipped user has `onboarding_completed = false` by design. Routing on
    // that boolean is what dragged them back into the tour on every sign-in.
    assert.match(app, /shouldForceOnboarding\(/);
    assert.doesNotMatch(app, /if \(!profile\.onboardingCompleted\)/);
  });

  it('offers a real reopen path from Settings', () => {
    const settings = readFileSync(
      join(REPO_ROOT, 'src', 'components', 'views', 'SettingsView.tsx'),
      'utf-8'
    );
    assert.match(settings, /Show me around again/);
    assert.match(settings, /onboardingStatus: 'started'/);
  });
});
