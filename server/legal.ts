import { hasApprovedTerms } from '../shared/legal.ts';

/**
 * Production and local application traffic require actual approved Terms copy.
 * The test-only server harness may opt into a non-public fixture so its test
 * accounts can exercise protected endpoints without inventing legal content.
 * Both the harness marker and fixture value are required; NODE_ENV remains
 * production so integration tests exercise the production server mode.
 */
export function hasServerTermsApproval(): boolean {
  const testFixtureEnabled = process.env.CAREERDEV_TEST_SERVER === 'true'
    && process.env.CAREERDEV_TEST_TERMS_FIXTURE === 'approved-test-fixture-only';
  return hasApprovedTerms() || testFixtureEnabled;
}
