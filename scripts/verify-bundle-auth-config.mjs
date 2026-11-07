/**
 * Verifies that the built browser bundle can sign people in.
 *
 * WHY THIS EXISTS
 *
 * The browser bundle carries the Supabase project URL and the publishable key
 * inside it, because that is the only way the browser can reach Supabase Auth.
 * A build that does not carry them produces an application in which every
 * sign-in method is disabled: the provider buttons are not rendered, and the
 * email form answers "Authentication is not configured".
 *
 * Nothing about that failure is visible at build time. The build succeeds, the
 * site loads, and only a visitor discovers that there is no way in. This check
 * is the last line of defence: it reads the artifact that is about to be
 * deployed and refuses to let a bundle without the configuration pass.
 *
 * It also checks that the sign-in methods themselves are in the bundle, so a
 * method cannot be dropped from the interface without the deployment noticing.
 *
 * Usage:
 *   node scripts/verify-bundle-auth-config.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPublicBuildConfig } from './public-build-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/**
 * The sign-in methods the interface must offer.
 *
 * They are listed here, not derived from the source, because the point of the
 * check is to catch a change to the source: a list that was read from the same
 * file it is meant to police could not catch that file losing a method.
 */
const SIGN_IN_METHODS = [
  'Continue with Google',
  'Continue with LinkedIn',
  'Continue with GitHub',
  'or continue with email',
];

function fail(message) {
  console.error(`[bundle-auth] ${message}`);
  process.exit(1);
}

/** Reads every JavaScript asset the build produced. */
function readBundleAssets() {
  const assetsDir = path.join(DIST, 'assets');
  if (!fs.existsSync(assetsDir)) {
    fail('dist/assets does not exist. Run `vite build` before this check.');
    return [];
  }
  return fs
    .readdirSync(assetsDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({
      name,
      contents: fs.readFileSync(path.join(assetsDir, name), 'utf8'),
    }));
}

/** The entry script the page loads, so the report can name the chunk. */
function readEntryScriptName() {
  const indexPath = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexPath)) return null;
  const html = fs.readFileSync(indexPath, 'utf8');
  const match = html.match(/<script[^>]*src="([^"]*assets\/index-[^"]+\.js)"/);
  return match ? path.basename(match[1]) : null;
}

const config = loadPublicBuildConfig(ROOT);
const assets = readBundleAssets();

if (assets.length === 0) {
  fail('no JavaScript assets were found in dist/assets.');
}

const entryName = readEntryScriptName();
const entry = assets.find((asset) => asset.name === entryName);
const haystack = assets.map((asset) => asset.contents).join('\n');

const problems = [];

for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
  const value = config.values[key];
  if (!haystack.includes(value)) {
    problems.push(
      `${key} is not in the built bundle. The bundle cannot reach Supabase Auth, ` +
        'so every sign-in method would be disabled.'
    );
  }
}

for (const method of SIGN_IN_METHODS) {
  if (!haystack.includes(method)) {
    problems.push(`the sign-in method "${method}" is not in the built bundle.`);
  }
}

if (problems.length > 0) {
  fail(
    [
      'the built bundle cannot deliver the authentication experience:',
      ...problems.map((problem) => `  - ${problem}`),
      '',
      'This bundle must not be deployed.',
      '',
    ].join('\n')
  );
}

console.log(
  `[bundle-auth] the bundle carries the public Supabase configuration and all ` +
    `${SIGN_IN_METHODS.length} sign-in methods (entry chunk: ${entryName ?? 'unknown'})`
);
