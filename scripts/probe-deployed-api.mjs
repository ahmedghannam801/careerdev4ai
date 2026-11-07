// Verifies the deployed API with a real, ordinary, signed-in account.
//
// It checks the properties that matter:
//   * the referral endpoint answers for a normal user and never for a guest;
//   * the credit balance carries the daily allowance;
//   * the administrative endpoints refuse a normal user, with 403 and with 401;
//   * a token that was tampered with is refused with 401.
//
// The account it creates carries the run's namespace and is deleted again.
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';

function loadEnv() {
  const out = {};
  for (const file of ['.env', '.env.test']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      out[match[1]] = match[2].trim().replace(/^["']/, '').replace(/["']$/, '');
    }
  }
  return out;
}

const env = loadEnv();
const BASE = process.argv[2] ?? 'https://preview.careerdev4ai.pages.dev';
const run = `probe${Date.now().toString(36)}`;
const email = `cd4-${run}@example.invalid`;
const password = 'Pr0be!Passw0rd!23';

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function call(path, token) {
  const response = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { status: response.status, body };
}

const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (created.error) {
  console.error('Could not create the probe account:', created.error.message);
  process.exit(1);
}
const userId = created.data.user.id;

try {
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) {
    console.error('Could not sign in:', signedIn.error.message);
    process.exit(1);
  }
  const token = signedIn.data.session.access_token;

  console.log(`=== ${BASE} ===\n`);

  // The consent gate is itself an authorization layer: it answers before the
  // route's own check. Accepting the current documents lets the probe see
  // the layer behind it.
  const consent = await call('/api/consent', token);
  console.log('GET /api/consent              ->', consent.status);

  const accepted = await fetch(`${BASE}/api/consent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accepted: true,
      source: 'settings',
      termsVersion: consent.body.consent?.termsVersion ?? consent.body.termsVersion,
      privacyVersion: consent.body.consent?.privacyVersion ?? consent.body.privacyVersion,
    }),
  });
  console.log('POST /api/consent             ->', accepted.status);

  const me = await call('/api/admin/me', token);
  console.log('GET /api/admin/me            ->', me.status, JSON.stringify(me.body).slice(0, 120));
  console.log(
    '   a normal user has no admin identity:',
    me.body && me.body.admin === null
  );

  for (const path of [
    '/api/admin/analytics',
    '/api/admin/users',
    '/api/admin/admins',
    '/api/admin/audit',
    '/api/admin/reports',
  ]) {
    const result = await call(path, token);
    console.log(`GET ${path.padEnd(28)} -> ${result.status}`, result.body.error ?? '');
  }

  const referrals = await call('/api/referrals/me', token);
  console.log(
    'GET /api/referrals/me         ->',
    referrals.status,
    referrals.body.code ? `code ${referrals.body.code}` : JSON.stringify(referrals.body).slice(0, 120)
  );

  const credits = await call('/api/credits/balance', token);
  console.log(
    'GET /api/credits/balance      ->',
    credits.status,
    'balance',
    credits.body.balance,
    '| daily',
    JSON.stringify(credits.body.daily ?? null)
  );

  const guest = await call('/api/admin/analytics', null);
  console.log('GET /api/admin/analytics (guest) ->', guest.status, guest.body.error ?? '');

  const tampered = await call('/api/admin/analytics', `${token.slice(0, -6)}aaaaaa`);
  console.log('GET /api/admin/analytics (tampered token) ->', tampered.status, tampered.body.error ?? '');

  const guestReferrals = await call('/api/referrals/me', null);
  console.log('GET /api/referrals/me (guest) ->', guestReferrals.status, guestReferrals.body.error ?? '');
} finally {
  await admin.auth.admin.deleteUser(userId);
}
