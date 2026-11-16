import { AsyncLocalStorage } from 'node:async_hooks';

const requestEnv = new AsyncLocalStorage<Record<string, unknown>>();

export function withRuntimeEnv<T>(env: Record<string, unknown>, callback: () => T): T {
  return requestEnv.run(env, callback);
}

/**
 * Reads a secret for the request that is being handled.
 *
 * On Pages the value comes from the request-scoped Worker environment: the
 * secret belongs to the deployment, and reading it through the environment
 * keeps it out of anything the application might serialise.
 *
 * The process environment is the fallback. Local development and the test
 * suite set the value there, and a deployment that does not run the request
 * inside the scoped store still finds it.
 */
export function runtimeSecret(name: string): string | undefined {
  const scoped = requestEnv.getStore()?.[name];
  if (typeof scoped === 'string' && scoped.length > 0) return scoped;

  const localValue = process.env[name];
  return localValue || undefined;
}
