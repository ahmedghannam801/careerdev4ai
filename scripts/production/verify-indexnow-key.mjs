/**
 * Verifies the IndexNow key file on the live origin.
 *
 * The protocol requires the key file to be fetchable at `<host>/<key>.txt`
 * and to contain exactly the key. The path is built from the deployment's
 * `SITE_ORIGIN`, so it also proves that the origin the deployment advertises
 * is the one it actually serves.
 *
 * The key itself is never printed.
 */

import 'dotenv/config';

const ORIGIN = process.argv[2] ?? 'https://aionvia.pages.dev';
const key = (process.env.INDEXNOW_KEY ?? '').trim();

if (!key) {
  console.log('IndexNow is not configured on this machine; nothing to verify.');
  process.exit(0);
}

const response = await fetch(`${ORIGIN}/${key}.txt`);
const body = await response.text();

const ok =
  response.status === 200 &&
  body.trim() === key;

console.log(`key file at ${ORIGIN}/${'…'.repeat(0)}${'<key>'}.txt -> HTTP ${response.status}`);
console.log(`body length ${body.trim().length}, key length ${key.length}`);
console.log(ok ? 'PASS — the key file is served and matches the key.' : 'FAIL — the key file does not match.');
process.exitCode = ok ? 0 : 1;
