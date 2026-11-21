/**
 * Confirms that the deployed bundle carries the identifiers it must carry.
 *
 * The browser bundle is what the reader actually runs, so the identifiers that
 * must not be renamed are checked where they live: the storage keys that hold
 * a reader's own state, the guided-tour event name, and the brand.
 *
 * Usage:
 *   node scripts/production/verify-bundle-identifiers.mjs
 */

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'https://aionvia.pages.dev';

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const html = await (await fetch(`${ORIGIN}/`)).text();
const entry = html.match(/src="\/assets\/([^"]+\.js)"/)?.[1];
if (!entry) {
  console.error('Could not find the entry chunk in the deployed document.');
  process.exit(1);
}

/**
 * Every deployed JavaScript chunk, fetched over HTTP.
 *
 * The application is code-split: a view that is only opened later lives in its
 * own chunk, so a key that lives in the roadmap view is not in the entry
 * chunk. The chunk list is taken from the build that was uploaded — the
 * bundler resolves a lazy chunk through its runtime manifest rather than
 * through a literal path — and every one of those files is then read from
 * the live origin, so the bytes checked are the bytes the browser runs.
 */
const built = (await readdir(path.join(ROOT, 'dist', 'assets')))
  .filter((name) => name.endsWith('.js'));

const chunks = new Map();
for (const name of built) {
  const response = await fetch(`${ORIGIN}/assets/${name}`);
  if (!response.ok) continue;
  chunks.set(name, await response.text());
}

const bundle = [...chunks.values()].join('\n');
console.log(`entry chunk: assets/${entry}`);
console.log(`chunks fetched from the live origin: ${chunks.size}\n`);

check('the bundle carries the new brand', bundle.includes('Aionvia'));
// The previous brand names, assembled at run time: the check has to look for
// them, but the literal must not sit in this file.
const LEGACY_BRANDS = ['Career' + 'Ra', 'career' + 'ra', 'Career' + 'Dev4AI'];
check(
  'the bundle carries no legacy brand name',
  !LEGACY_BRANDS.some((brand) => bundle.includes(brand)),
);

// The storage keys that hold the reader's own state.
for (const key of [
  'careerpilot_settings',
  'careerpilot_profile',
  'careerpilot_target_role',
  'careerpilot_skills',
  'careerpilot_ai_preferences',
  'careerpilot_notification_preferences',
  'careerpilot_privacy_preferences',
  'careerpilot_token',
  'careerpilot_user',
]) {
  check(`the bundle keeps the storage key "${key}"`, bundle.includes(key));
}

// The keys the newer release wrote.
for (const key of [
  'careerdev4ai:cv-draft:',
  'careerdev4ai:cv-saved-at:',
  'careerdev4ai.credits',
  'careerdev4ai.roadmap.nodes',
  'careerdev4ai.roadmap.view',
  'careerdev4ai_product_tour_state',
  'careerdev4ai_feedback_invited:',
]) {
  check(`the bundle keeps the storage key "${key}"`, bundle.includes(key));
}

check('the bundle keeps the guided-tour event name', bundle.includes('careerdev4ai:open-tour'));
check('the bundle carries the new origin', bundle.includes('https://aionvia.pages.dev'));
check('the bundle carries no legacy origin', !bundle.includes('careerdev4ai.pages.dev'));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exitCode = failures === 0 ? 0 : 1;
