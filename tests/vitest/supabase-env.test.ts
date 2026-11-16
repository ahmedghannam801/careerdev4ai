import { describe, expect, it } from 'vitest';
import { validateTestEnvironment } from '../env.mjs';

const productionUrl = 'https://ciihprsfdojzvjnqgbxl.supabase.co';
const testProjectRef = 'aaaaaaaaaaaaaaaaaaaa';

function validTestEnv(overrides: Record<string, string> = {}) {
  return {
    SUPABASE_URL: `https://${testProjectRef}.supabase.co`,
    SUPABASE_ANON_KEY: 'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_TEST_PROJECT_REF: testProjectRef,
    SUPABASE_TEST_PROJECT_EXCLUSIVE: 'true',
    ...overrides,
  };
}

describe('Supabase integration environment safety', () => {
  it('accepts an explicit dedicated non-production project', () => {
    expect(validateTestEnvironment(validTestEnv(), productionUrl).SUPABASE_TEST_PROJECT_REF)
      .toBe(testProjectRef);
  });

  it('rejects the configured production Supabase project', () => {
    expect(() => validateTestEnvironment(
      validTestEnv({
        SUPABASE_URL: productionUrl,
        SUPABASE_TEST_PROJECT_REF: 'ciihprsfdojzvjnqgbxl',
      }),
      productionUrl,
    )).toThrow(/forbidden on the production Supabase project/);
  });

  it('rejects a URL whose project reference differs from the declared test project', () => {
    expect(() => validateTestEnvironment(
      validTestEnv({ SUPABASE_URL: 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co' }),
      productionUrl,
    )).toThrow(/does not match SUPABASE_TEST_PROJECT_REF/);
  });

  it('fails closed unless the operator confirms exclusive test-project use', () => {
    expect(() => validateTestEnvironment(
      validTestEnv({ SUPABASE_TEST_PROJECT_EXCLUSIVE: 'false' }),
      productionUrl,
    )).toThrow(/reserved for integration tests/);
  });

  it('rejects non-canonical URLs and equal anon/service-role credentials', () => {
    expect(() => validateTestEnvironment(
      validTestEnv({ SUPABASE_URL: 'http://aaaaaaaaaaaaaaaaaaaa.supabase.co' }),
      productionUrl,
    )).toThrow(/canonical https:\/\//);

    expect(() => validateTestEnvironment(
      validTestEnv({ SUPABASE_SERVICE_ROLE_KEY: 'test-anon-key' }),
      productionUrl,
    )).toThrow(/must be distinct/);
  });
});
