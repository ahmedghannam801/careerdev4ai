/**
 * Reports whether the dedicated integration-test Supabase project answers.
 *
 * The database-backed suite runs against a separate, disposable project; this
 * probe checks that the project is reachable and that the service-role key
 * works, so a timeout in the suite can be attributed to the project rather
 * than to the code.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

function readTestEnv() {
  const envPath = path.resolve(process.cwd(), '.env.test');
  const entries = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    entries[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');
  }
  return entries;
}

const env = readTestEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('test project url:', url);
console.log('test project ref:', env.SUPABASE_TEST_PROJECT_REF);

const started = Date.now();
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);

try {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: controller.signal,
  });
  console.log(`GET /rest/v1/ -> HTTP ${response.status} in ${Date.now() - started}ms`);
  const body = await response.text();
  console.log('body:', body.slice(0, 200));
} catch (error) {
  console.log(`request failed after ${Date.now() - started}ms: ${error.name}: ${error.message}`);
} finally {
  clearTimeout(timer);
}
