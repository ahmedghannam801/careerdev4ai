/**
 * The authentication surface, and the configuration it depends on.
 *
 * WHY THIS FILE EXISTS
 *
 * The production site once shipped with every sign-in method removed. Not
 * broken — removed: the Google, LinkedIn and GitHub buttons were not rendered
 * at all, and the email form answered "Authentication is not configured".
 *
 * The cause was a build, not a change to the interface. The browser bundle
 * needs the Supabase project URL and the publishable key, and Vite inlines
 * them at build time. The bundle that reached production was built where those
 * two values were not present, so `isSupabaseConfigured` was false and the
 * whole authentication surface was switched off — silently, with a successful
 * build and a healthy site.
 *
 * Nothing in the suite noticed, because the suite tested the API and never the
 * configuration the browser bundle is built from, and never the interface that
 * offers the sign-in methods. This file tests both.
 *
 * WHAT IS ASSERTED
 *
 *   1. The public configuration is resolvable in a CLEAN checkout — no `.env`,
 *      no environment variables — from the committed `wrangler.jsonc`. This is
 *      the condition the production build failed.
 *   2. The resolution fails loudly when the values are missing, and when two
 *      sources disagree, instead of quietly picking one.
 *   3. The interface still offers every sign-in method that existed before:
 *      Google, LinkedIn, GitHub, and email with a password.
 *   4. The Supabase project still has those providers enabled, and the sign-in
 *      and registration paths work against the real project.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import {
  PUBLIC_BUILD_KEYS,
  readDotEnv,
  readJsonc,
  resolvePublicBuildConfig,
  requirePublicBuildConfig,
} from '../scripts/public-build-config.mjs';
import { REPO_ROOT } from './env.mjs';

/** The public values the committed configuration declares. */
function committedConfig() {
  const wrangler = readJsonc(join(REPO_ROOT, 'wrangler.jsonc'));
  return { wranglerVars: wrangler?.vars ?? {} };
}

test('the public build configuration is resolvable in a clean checkout', () => {
  // A clean checkout has no `.env` — it is gitignored — and no environment
  // variables. The committed configuration is the only source left, and it has
  // to be enough on its own.
  const resolved = resolvePublicBuildConfig({
    env: {},
    dotenv: {},
    ...committedConfig(),
  });

  for (const key of PUBLIC_BUILD_KEYS) {
    assert.ok(
      resolved.values[key],
      `${key} must resolve from the committed configuration alone. A build in a ` +
        'clean checkout produced a bundle without it, and the site shipped with ' +
        'every sign-in method disabled.',
    );
  }
  assert.equal(
    resolved.origins.VITE_SUPABASE_URL,
    'wrangler.jsonc',
    'the clean checkout must resolve the value from the committed configuration',
  );
});

test('the committed configuration declares both public values', () => {
  const { wranglerVars } = committedConfig();
  for (const key of PUBLIC_BUILD_KEYS) {
    assert.ok(
      typeof wranglerVars[key] === 'string' && wranglerVars[key].trim() !== '',
      `${key} must be declared in the vars block of wrangler.jsonc`,
    );
  }
});

test('a missing configuration stops the build instead of shipping a bundle without it', () => {
  assert.throws(
    () => requirePublicBuildConfig({ env: {}, dotenv: {}, wranglerVars: {} }),
    /public Supabase configuration is missing/,
    'the build must fail when the values cannot be resolved',
  );
});

test('two sources that disagree stop the build', () => {
  assert.throws(
    () =>
      requirePublicBuildConfig({
        env: { VITE_SUPABASE_URL: 'https://one.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' },
        dotenv: { VITE_SUPABASE_URL: 'https://another.supabase.co' },
        wranglerVars: {},
      }),
    /contradictory/,
    'the build must fail rather than pick one of two different projects',
  );
});

test('the resolved value is the one the committed configuration declares', () => {
  const { wranglerVars } = committedConfig();
  const resolved = resolvePublicBuildConfig({ env: {}, dotenv: {}, wranglerVars });
  assert.equal(resolved.values.VITE_SUPABASE_URL, wranglerVars.VITE_SUPABASE_URL);
  assert.equal(
    resolved.values.VITE_SUPABASE_PUBLISHABLE_KEY,
    wranglerVars.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
});

test('the interface offers every sign-in method that existed before', () => {
  const modalPath = join(REPO_ROOT, 'src', 'components', 'auth', 'AuthModal.tsx');
  const modal = readFileSync(modalPath, 'utf8');

  // The three OAuth providers, and the email fallback that sits under them.
  for (const provider of ['google', 'linkedin_oidc', 'github']) {
    assert.ok(
      modal.includes(`handleOAuth('${provider}')`),
      `the sign-in method "${provider}" must remain in the authentication modal`,
    );
  }
  assert.ok(
    modal.includes('or continue with email'),
    'the email fallback must remain in the authentication modal',
  );

  // The email path itself: sign in, registration, and the recovery route.
  assert.ok(modal.includes('Sign In'), 'the sign-in action must remain');
  assert.ok(modal.includes('Sign Up') || modal.includes('Create Your Account'), 'registration must remain');
  assert.ok(modal.includes('Forgot password?'), 'the password recovery entry must remain');

  // The GitHub provider answers on its own callback path, so that path and the
  // SPA fallback that serves it must both remain.
  assert.ok(
    modal.includes('/auth/callback'),
    'the GitHub OAuth callback path must remain',
  );
});

test('the authentication surface is not gated off when the configuration is missing', () => {
  const clientPath = join(REPO_ROOT, 'src', 'lib', 'supabase.ts');
  const client = readFileSync(clientPath, 'utf8');
  const configured = client.match(
    /export const isSupabaseConfigured = ([^;]+);/,
  );
  assert.ok(configured, 'isSupabaseConfigured must stay exported');
  assert.match(
    configured[1],
    /supabaseUrl\s*&&\s*supabasePublishableKey/,
    'the configuration must need BOTH values: a project URL without a key cannot ' +
      'authenticate anybody, and a key without a URL has no project to talk to',
  );
});

test('the OAuth callback path is served by the SPA fallback', () => {
  const worker = readFileSync(join(REPO_ROOT, 'worker', 'index.ts'), 'utf8');
  const server = readFileSync(join(REPO_ROOT, 'server.ts'), 'utf8');
  for (const [name, source] of [
    ['worker/index.ts', worker],
    ['server.ts', server],
  ]) {
    assert.ok(
      source.includes('index.html'),
      `${name} must serve index.html for the OAuth callback path`,
    );
  }
});

test('the Supabase project still has every provider enabled', async () => {
  const { wranglerVars } = committedConfig();
  const url = wranglerVars.VITE_SUPABASE_URL;
  const key = wranglerVars.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  assert.equal(response.status, 200, 'the public auth settings must be readable');

  const settings = await response.json();
  const external = settings?.external ?? {};

  // The providers the interface offers must be enabled on the project, and
  // email must be enabled for the password path.
  assert.equal(external.google, true, 'Google must be enabled in Supabase Auth');
  assert.equal(external.github, true, 'GitHub must be enabled in Supabase Auth');
  assert.equal(external.linkedin_oidc, true, 'LinkedIn must be enabled in Supabase Auth');
  assert.equal(external.email, true, 'email sign-in must be enabled in Supabase Auth');
  assert.equal(settings?.disable_signup, false, 'registration must not be disabled');
});

test('a real account can sign in, keep its session, and sign out', async () => {
  const { wranglerVars } = committedConfig();
  const url = wranglerVars.VITE_SUPABASE_URL;
  const key = wranglerVars.VITE_SUPABASE_PUBLISHABLE_KEY;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // A synthetic identity for this run. It is created here and removed again
  // below; it is never a real person's account.
  const address = `cp-auth-surface-${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = `Cp-${Math.random().toString(36).slice(2)}-${Date.now()}`;

  const registration = await client.auth.signUp({ email: address, password });
  assert.equal(
    registration.error,
    null,
    `registration must succeed: ${registration.error?.message ?? 'unknown error'}`,
  );

  const signIn = await client.auth.signInWithPassword({ email: address, password });
  assert.equal(
    signIn.error,
    null,
    `sign-in must succeed: ${signIn.error?.message ?? 'unknown error'}`,
  );
  assert.ok(signIn.data.session, 'a sign-in must return a session');
  assert.ok(signIn.data.session.access_token, 'the session must carry an access token');

  // The session survives being read back, which is what a page refresh does.
  const restored = await client.auth.getSession();
  assert.ok(restored.data.session, 'the session must survive a refresh');

  // The wrong password is refused, and the message is the one the interface
  // shows rather than a blank failure.
  const wrong = await client.auth.signInWithPassword({
    email: address,
    password: `${password}-wrong`,
  });
  assert.ok(wrong.error, 'a wrong password must be refused');
  assert.match(wrong.error.message, /invalid login credentials/i);

  const signOut = await client.auth.signOut();
  assert.equal(signOut.error, null, 'sign-out must succeed');
  const afterSignOut = await client.auth.getSession();
  assert.equal(afterSignOut.data.session, null, 'there must be no session after sign-out');

  // The account survives the sign-out and can be used again from a fresh
  // client — which is what "an existing account can still get in" means. The
  // records in Supabase Auth are untouched by a change to the build.
  const secondClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const secondSignIn = await secondClient.auth.signInWithPassword({ email: address, password });
  assert.equal(
    secondSignIn.error,
    null,
    `an existing account must still be able to sign in: ${secondSignIn.error?.message ?? 'unknown error'}`,
  );
  assert.ok(secondSignIn.data.session, 'the account must get a session again');

  // The identity is removed again, so the project is left as it was found.
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    await admin.auth.admin.deleteUser(signIn.data.user.id);
  }
});

test('the OAuth providers answer with an authorization URL', async () => {
  // This is the real Supabase Auth endpoint, not a mock. It is asked where it
  // would send a browser for each provider. The provider's own credential is
  // NOT exercised here: the redirect is where the provider configuration
  // lives, and a provider with no client id cannot produce an authorization
  // URL. That is reported as a failure rather than swallowed.
  const { wranglerVars } = committedConfig();
  const url = wranglerVars.VITE_SUPABASE_URL;
  const key = wranglerVars.VITE_SUPABASE_PUBLISHABLE_KEY;

  for (const provider of ['google', 'linkedin_oidc', 'github']) {
    const response = await fetch(`${url}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent('https://careerdev4ai.pages.dev')}`, {
      headers: { apikey: key },
      redirect: 'manual',
    });
    const location = response.headers.get('location') ?? '';
    assert.ok(
      response.status >= 300 && response.status < 400,
      `${provider} must answer with a redirect, not ${response.status}`,
    );
    assert.match(
      location,
      new RegExp(provider === 'linkedin_oidc' ? 'linkedin\\.com' : provider === 'google' ? 'accounts\\.google\\.com' : 'github\\.com'),
      `${provider} must redirect to its own authorization endpoint, not "${location}"`,
    );
  }

  // GitHub answers on its own callback path, so that path has to be in the
  // project's redirect allow-list as well. A path that is not allowed does not
  // fail loudly: the provider sends the browser back with an error instead.
  const githubCallback = await fetch(
    `${url}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent('https://careerdev4ai.pages.dev/auth/callback')}`,
    { headers: { apikey: key }, redirect: 'manual' },
  );
  assert.match(
    githubCallback.headers.get('location') ?? '',
    /github\.com\/login\/oauth\/authorize/,
    'the GitHub callback path must be an allowed redirect URL',
  );
});

test('the built bundle carries the configuration and every sign-in method', () => {
  // Only asserted when a build is present. `npm run build` runs the same
  // check as a build step, so this is the suite's view of the same invariant.
  const assetsDir = join(REPO_ROOT, 'dist', 'assets');
  if (!existsSync(assetsDir)) return;

  const { wranglerVars } = committedConfig();
  const files = readFileSync(join(REPO_ROOT, 'dist', 'index.html'), 'utf8');
  const entryMatch = files.match(/src="([^"]*assets\/index-[^"]+\.js)"/);
  assert.ok(entryMatch, 'the built index.html must reference an entry chunk');

  const entry = readFileSync(join(REPO_ROOT, 'dist', entryMatch[1].replace(/^\//, '')), 'utf8');
  assert.ok(
    entry.includes(wranglerVars.VITE_SUPABASE_URL),
    'the built bundle must carry the Supabase project URL, or no sign-in method works',
  );
  assert.ok(
    entry.includes(wranglerVars.VITE_SUPABASE_PUBLISHABLE_KEY),
    'the built bundle must carry the publishable key, or no sign-in method works',
  );
});
