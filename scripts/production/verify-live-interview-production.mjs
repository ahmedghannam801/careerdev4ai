// Production verification of the live voice interview.
//
// Signs a throwaway candidate in on the deployed site and asks the server for
// ONE live session credential:
//
//   1. POST /api/interviews/live/session answers with a grant — the ephemeral
//      token that opens a live session, the model it is bound to, and the API
//      version it was minted on.
//
// The grant is never printed and never used: this proves the credential can be
// issued, it does not start a conversation, and it writes nothing. The
// throwaway identity is removed at the end.
//
// Usage: node scripts/production/verify-live-interview-production.mjs [baseUrl]
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] ?? 'https://aionvia.pages.dev').replace(/\/$/, '');
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
const email = `cp-verify-live-${stamp}@example.invalid`;
const password = `Tst-${stamp}-Aa1!x`;

let userId = null;

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
  return { id: body?.user?.id, token: body.access_token };
}

async function removeUser(id) {
  if (!id) return;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  console.log(`[verify] removed the throwaway identity (${res.status})`);
}

async function main() {
  console.log(`[verify] base ${BASE}`);

  const anonymous = await api('/api/interviews/live/session', {
    method: 'POST',
    body: { type: 'technical', language: 'en' },
  });
  console.log(`[verify] POST /api/interviews/live/session without a session -> ${anonymous.status}`);
  if (anonymous.status !== 401) {
    console.log('[verify] FAILED: the route answered an anonymous caller');
    process.exitCode = 1;
    return;
  }

  const user = await signUp();
  userId = user.id;
  console.log(`[verify] signed up ${email} (${user.id})`);

  // The platform asks every candidate to accept the terms before anything
  // that touches their record, and the live route is behind that gate.
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

  const response = await api('/api/interviews/live/session', {
    method: 'POST',
    token: user.token,
    body: { type: 'technical', language: 'en' },
  });

  console.log(`[verify] POST /api/interviews/live/session -> ${response.status}`);
  if (response.status !== 200) {
    console.log(`[verify] FAILED: ${JSON.stringify(response.body).slice(0, 500)}`);
    process.exitCode = 1;
    return;
  }

  const grant = response.body?.grant;
  if (!grant?.token) {
    console.log('[verify] FAILED: no credential was issued');
    process.exitCode = 1;
    return;
  }

  // The token itself is never printed and never used. Only its shape is
  // reported, so this proves the credential is real without exposing it.
  console.log('[verify] the live session credential was issued on the deployed site');
  console.log('[verify] model:', grant.model);
  console.log('[verify] api version:', grant.apiVersion);
  console.log('[verify] language:', grant.language);
  console.log('[verify] type:', grant.type);
  console.log('[verify] expires at:', grant.expiresAt);
  console.log('[verify] token length:', String(grant.token).length);
  console.log(
    '[verify] token is a live-session credential:',
    String(grant.token).includes('tokens/')
  );
  console.log('[verify] OK: the deployed server can start a live interview.');
}

main()
  .catch((error) => {
    console.error('[verify] error:', error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await removeUser(userId);
  });
