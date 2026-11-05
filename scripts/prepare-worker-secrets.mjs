/**
 * Prepares the background-job Worker's secrets for upload.
 *
 * The Worker is a separate deployment, so it needs its own copy of the server
 * credentials. They are read from `.env` and written to a file that
 * `wrangler secret bulk` uploads.
 *
 * The file is written with Node rather than by piping the values on the
 * command line, because a shell pipe adds a byte-order mark to the value it
 * sends — and a credential that begins with a byte-order mark is a credential
 * the service rejects as invalid. The file is deleted by the script that
 * uploads it, and it is never committed.
 */
import fs from 'node:fs';

const KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'JSEARCH_RAPIDAPI_KEY',
];

const OUT = '.wrangler-secrets.json';

const text = fs.readFileSync('.env', 'utf8');
const map = {};
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const index = line.indexOf('=');
  if (index < 1) continue;
  map[line.slice(0, index).trim()] = line
    .slice(index + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
}

const missing = KEYS.filter((key) => !map[key]);
if (missing.length > 0) {
  console.error(`These keys are missing from .env: ${missing.join(', ')}`);
  process.exit(1);
}

const secrets = {};
for (const key of KEYS) secrets[key] = map[key];

if (Object.values(secrets).some((value) => value.includes('\uFEFF'))) {
  console.error('A value in .env begins with a byte-order mark, which would make it invalid.');
  process.exit(1);
}

fs.writeFileSync(OUT, JSON.stringify(secrets, null, 2));
console.log(`[worker-secrets] wrote ${OUT} with ${KEYS.length} secrets.`);
console.log('[worker-secrets] upload it with: npm run cf:jobs:secrets');
