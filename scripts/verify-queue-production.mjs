// Production verification of the background-job queue.
//
// Signs a throwaway candidate in on the deployed site, starts a background job,
// and follows it to its outcome. Proves that the row is written, that the
// message is published, that a worker claims it, that the work happens and
// that the outcome is recorded.
//
// Usage: node scripts/verify-queue-production.mjs [baseUrl]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.argv[2] ?? 'https://careerdev4ai.pages.dev').replace(/\/$/, '');
const ROOT = process.cwd();

function readEnv() {
  const entries = {};
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    entries[key] = value;
  }
  return entries;
}

const env = readEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const ANON_KEY = env.SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const stamp = Date.now().toString(36);
const email = `cp-verify-${stamp}@example.invalid`;
const password = `Tst-${stamp}-Aa1!x`;

async function api(pathname, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const res = await fetch(`${BASE}${pathname}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function signUp() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!body?.access_token) {
    throw new Error(`Could not sign up: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { id: body.user?.id, token: body.access_token };
}

/** Removes the throwaway identity. */
async function removeUser(id) {
  if (!id) return;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  console.log(`[verify] removed the throwaway identity (${res.status})`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let userId = null;

async function main() {
  console.log(`[verify] base ${BASE}`);

  const health = await api('/api/health');
  console.log(`[verify] GET /api/health -> ${health.status}`);
  console.log(`[verify] health body: ${JSON.stringify(health.body).slice(0, 400)}`);

  const user = await signUp();
  userId = user.id;
  console.log(`[verify] signed up ${email} (${user.id})`);

  // The consent gate must be open before a protected route answers. The
  // versions are read from the source of truth so the script never has to be
  // told what the current documents are.
  const legal = fs.readFileSync(path.join(ROOT, 'shared', 'legal.ts'), 'utf8');
  const termsVersion = legal.match(/export const TERMS_VERSION = '([^']+)'/)?.[1];
  const privacyVersion = legal.match(/export const PRIVACY_VERSION = '([^']+)'/)?.[1];
  if (!termsVersion || !privacyVersion) throw new Error('Could not read the legal versions.');

  const consent = await api('/api/consent', {
    method: 'POST',
    token: user.token,
    body: { accepted: true, termsVersion, privacyVersion, source: 'verification' },
  });
  console.log(`[verify] consent -> ${consent.status}`);

  const availability = await api('/api/background-jobs/availability', { token: user.token });
  console.log(
    `[verify] availability -> ${availability.status} ${JSON.stringify(availability.body?.availability)}`,
  );

  const started = await api('/api/background-jobs', {
    method: 'POST',
    token: user.token,
    body: { kind: 'match-jobs', query: 'production queue verification', location: 'Remote' },
  });
  console.log(`[verify] start job -> ${started.status} ${JSON.stringify(started.body).slice(0, 400)}`);

  const jobId = started.body?.job?.id;
  if (!jobId) {
    console.log('[verify] FAILED: the job was not accepted');
    process.exitCode = 1;
    return;
  }

  let last = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(2000);
    const read = await api(`/api/background-jobs/${jobId}`, { token: user.token });
    const job = read.body?.job;
    const line = `${job?.status} stage=${job?.stage} attempt=${job?.attempt} error=${job?.errorCode ?? '-'}`;
    if (line !== last) {
      console.log(`[verify] job: ${line}`);
      last = line;
    }
    if (job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled') {
      console.log(`[verify] final: ${JSON.stringify(job).slice(0, 900)}`);
      if (job.status === 'completed') {
        console.log('[verify] OK: the job ran end to end on the deployed site.');
      } else {
        console.log(`[verify] the job ended as ${job.status}: ${job.errorMessage}`);
        process.exitCode = 1;
      }
      return;
    }
  }

  console.log('[verify] FAILED: the job never reached an outcome');
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('[verify] error:', error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await removeUser(userId);
  });
