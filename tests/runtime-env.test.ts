/**
 * Where a secret is read from.
 *
 * The platform reads its secrets from the environment of the deployment. On
 * Pages that environment belongs to the Worker, and the request is handed to
 * the Node HTTP server inside it.
 *
 * The handing-over does not carry the request-scoped environment with it: the
 * store that holds it is not the same context the server's handlers run in.
 * A secret that was kept only in that store therefore cannot be found, and
 * the feature that needs it fails with "not configured" even though the
 * deployment is configured correctly.
 *
 * The rule this test pins down is therefore simple: a secret is read from the
 * request-scoped environment when it is there, and from the process
 * environment otherwise. Both paths must work, because which one applies
 * depends on where in the platform the code is running.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { runtimeSecret, withRuntimeEnv } from '../server/runtimeEnv.ts';

describe('where a secret is read from', () => {
  afterEach(() => {
    delete process.env.CAREERPILOT_TEST_SECRET;
  });

  it('reads a secret from the request-scoped environment', () => {
    const value = withRuntimeEnv({ CAREERPILOT_TEST_SECRET: 'scoped' }, () =>
      runtimeSecret('CAREERPILOT_TEST_SECRET')
    );

    assert.equal(value, 'scoped');
  });

  it('reads a secret from the process environment when there is no scoped one', () => {
    process.env.CAREERPILOT_TEST_SECRET = 'process';

    assert.equal(runtimeSecret('CAREERPILOT_TEST_SECRET'), 'process');
  });

  it('reads a secret from the process environment when the scoped one does not have it', () => {
    // This is the case that matters on Pages: the request is being handled,
    // but the environment that was scoped to the request did not reach the
    // handler. A secret that is only in the scoped environment is not found,
    // so the process environment is the one that has to answer.
    process.env.CAREERPILOT_TEST_SECRET = 'process';

    const value = withRuntimeEnv({ SOME_OTHER_SETTING: 'value' }, () =>
      runtimeSecret('CAREERPILOT_TEST_SECRET')
    );

    assert.equal(value, 'process');
  });

  it('reports nothing rather than an empty string for a secret that is not set', () => {
    assert.equal(runtimeSecret('CAREERPILOT_TEST_SECRET'), undefined);

    const value = withRuntimeEnv({ SOME_OTHER_SETTING: 'value' }, () =>
      runtimeSecret('CAREERPILOT_TEST_SECRET')
    );

    assert.equal(value, undefined);
  });

  it('does not treat an empty value as a value', () => {
    const value = withRuntimeEnv({ CAREERPILOT_TEST_SECRET: '' }, () =>
      runtimeSecret('CAREERPILOT_TEST_SECRET')
    );

    assert.equal(value, undefined);
  });

  it('trims a value that was written with a line break around it', () => {
    // A secret that was piped into a command receives a line break. It is the
    // same secret, and a recipient address that carries one is not an
    // address — the message would be refused as malformed.
    const value = withRuntimeEnv({ CAREERPILOT_TEST_SECRET: 'someone@example.com\r\n' }, () =>
      runtimeSecret('CAREERPILOT_TEST_SECRET')
    );

    assert.equal(value, 'someone@example.com');
  });

  it('trims a value in the process environment as well', () => {
    process.env.CAREERPILOT_TEST_SECRET = '  someone@example.com  ';

    assert.equal(runtimeSecret('CAREERPILOT_TEST_SECRET'), 'someone@example.com');
  });
});
