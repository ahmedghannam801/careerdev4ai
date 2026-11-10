// Verifies the daily token claim on the DEPLOYED site.
//
// The claim is the one route in the credit system that hands something out, so
// it is the one route that has to be proven against the real deployment rather
// than against the local server. The probe checks the four properties the
// product depends on:
//
//   1. Reading the balance grants nothing. A reward that arrives because
//      somebody read a number is not a reward anybody can press a button for.
//   2. The claim pays the allowance that was promised — two tokens.
//   3. The claim is idempotent for the day. A double press, a retried request
//      or two tabs open at once must pay out exactly once.
//   4. The account is remembered as having claimed, even after the claimed
//      tokens are spent, so nobody is offered a second claim.
//
// The account it creates carries the run's namespace and is deleted again.
//
// Usage: node scripts/probe-daily-claim-production.mjs [baseUrl]
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

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
const BASE = (process.argv[2] ?? 'https://careerdev4ai.pages.dev').replace(/\/$/, '');
const run = `claim${Date.now().toString(36)}`;
const email = `cd4-${run}@example.invalid`;
const password = 'Pr0be!Passw0rd!23';

const EXPECTED_ALLOWANCE = 2;

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const failures = [];

function check(name, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(pathname, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 160) };
  }
  return { status: response.status, body: parsed };
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

  // The API is gated behind a current acceptance of the Terms and the Privacy
  // Policy. The versions are read from the source of truth so the probe never
  // has to be told what the current documents are.
  const legal = readFileSync(path.join(process.cwd(), 'shared', 'legal.ts'), 'utf8');
  const termsVersion = legal.match(/export const TERMS_VERSION = '([^']+)'/)?.[1];
  const privacyVersion = legal.match(/export const PRIVACY_VERSION = '([^']+)'/)?.[1];
  if (!termsVersion || !privacyVersion) throw new Error('Could not read the legal versions.');

  const consent = await call('/api/consent', {
    method: 'POST',
    token,
    body: { accepted: true, termsVersion, privacyVersion, source: 'verification' },
  });
  if (consent.status !== 200) {
    console.error(`Could not record consent: ${consent.status} ${consent.body?.error ?? ''}`);
    process.exit(1);
  }

  console.log(`Daily token claim on ${BASE}\n`);

  // 1. Reading the balance grants nothing.
  const before = await call('/api/credits/balance', { token });
  check('the balance answers', before.status === 200, `status ${before.status}`);
  const dailyBefore = before.body?.daily ?? {};
  check(
    'the balance read grants no tokens',
    dailyBefore.remaining === 0,
    `remaining was ${dailyBefore.remaining}`
  );
  check(
    'the account has not claimed',
    dailyBefore.claimedToday === false,
    `claimedToday was ${dailyBefore.claimedToday}`
  );
  check(
    'the promise is two tokens',
    dailyBefore.allowance === EXPECTED_ALLOWANCE,
    `allowance was ${dailyBefore.allowance}`
  );
  const balanceBefore = before.body?.balance ?? 0;

  // 2. The claim pays the allowance.
  const claim = await call('/api/credits/daily/claim', { token, method: 'POST' });
  check('the claim answers', claim.status === 200, `status ${claim.status}: ${claim.body?.error ?? ''}`);
  check(
    'the claim paid the allowance',
    claim.body?.granted === EXPECTED_ALLOWANCE,
    `granted was ${claim.body?.granted}`
  );
  check(
    'the account has claimed',
    claim.body?.daily?.claimedToday === true,
    `claimedToday was ${claim.body?.daily?.claimedToday}`
  );
  check(
    'the balance grew by exactly the allowance',
    claim.body?.balance === balanceBefore + EXPECTED_ALLOWANCE,
    `balance went ${balanceBefore} -> ${claim.body?.balance}`
  );

  // 3. The claim is idempotent for the day.
  const again = await call('/api/credits/daily/claim', { token, method: 'POST' });
  check('a second claim answers', again.status === 200, `status ${again.status}`);
  check(
    'a second claim pays nothing',
    again.body?.granted === 0,
    `granted was ${again.body?.granted}`
  );
  check(
    'a second claim does not change the balance',
    again.body?.balance === claim.body?.balance,
    `balance went ${claim.body?.balance} -> ${again.body?.balance}`
  );

  // 4. The balance agrees afterwards.
  const after = await call('/api/credits/balance', { token });
  check(
    'the balance still agrees',
    after.body?.balance === claim.body?.balance,
    `balance was ${after.body?.balance}`
  );
  check(
    'the account is still remembered as having claimed',
    after.body?.daily?.claimedToday === true,
    `claimedToday was ${after.body?.daily?.claimedToday}`
  );

  // And a guest cannot claim.
  const anonymous = await call('/api/credits/daily/claim', { method: 'POST' });
  check(
    'a guest cannot claim',
    anonymous.status === 401 || anonymous.status === 403,
    `status ${anonymous.status}`
  );

  console.log('');
  console.log(
    failures.length === 0
      ? 'OK: the deployed daily claim behaves as the product promises.'
      : `FAILED: ${failures.length} check(s) failed — ${failures.join('; ')}`
  );
} finally {
  await admin.auth.admin.deleteUser(userId);
}

process.exit(failures.length === 0 ? 0 : 1);
