// Verifies the deployed career target against a real, ordinary account.
//
// It checks the properties the product promises:
//   * a brand-new account has NO target role — the platform must not invent
//     one (this is the "Frontend Engineer" bug);
//   * the target role, the career track and the experience level can be set
//     through the one profile endpoint, and they come back;
//   * a role change is reflected by the server, not just by the client;
//   * an experience level outside the vocabulary is refused, not stored;
//   * the role is not stored as a free-text title — it is the catalogue's.
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
const BASE = process.argv[2] ?? 'https://careerdev4ai.pages.dev';
const run = `probe${Date.now().toString(36)}`;
const email = `cd4-${run}@example.invalid`;
const password = 'Pr0be!Passw0rd!23';

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

async function call(path, token, method = 'GET', body) {
  const response = await fetch(`${BASE}${path}`, {
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

  console.log(`The career target on ${BASE}\n`);

  // The consent gate answers before the route's own check, so the current
  // documents are accepted first. Without it the profile route answers 403.
  const consent = await call('/api/consent', token);
  await fetch(`${BASE}/api/consent`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accepted: true,
      source: 'settings',
      termsVersion: consent.body.consent?.termsVersion ?? consent.body.termsVersion,
      privacyVersion: consent.body.consent?.privacyVersion ?? consent.body.privacyVersion,
    }),
  });

  // --- 1. A new account has NO role -------------------------------------
  const fresh = await call('/api/profile', token);
  check('the profile answers', fresh.status === 200, `status ${fresh.status}`);
  const freshProfile = fresh.body?.profile ?? {};
  check(
    'a brand-new account has NO target role',
    !freshProfile.targetRole,
    `targetRole = ${JSON.stringify(freshProfile.targetRole ?? null)}`
  );
  check(
    'the platform did not invent a role for it',
    freshProfile.targetRole !== 'Frontend Engineer',
    `targetRole = ${JSON.stringify(freshProfile.targetRole ?? null)}`
  );

  // --- 2. The role, the track and the level can be set -------------------
  const set = await call('/api/profile', token, 'PATCH', {
    targetRoleId: 'data-analyst',
    targetRoleDomain: 'data',
    experienceLevel: 'junior',
  });
  check('the target can be set', set.status === 200, set.body?.error ?? `status ${set.status}`);
  const setProfile = set.body?.profile ?? {};
  check(
    'the role was stored',
    setProfile.targetRole === 'Data Analyst',
    `targetRole = ${JSON.stringify(setProfile.targetRole ?? null)}`
  );
  check(
    'the career track followed the role',
    setProfile.targetIndustry === 'Data & Analytics',
    `targetIndustry = ${JSON.stringify(setProfile.targetIndustry ?? null)}`
  );
  check(
    'the experience level was stored',
    setProfile.experienceLevel === 'junior',
    `experienceLevel = ${JSON.stringify(setProfile.experienceLevel ?? null)}`
  );

  // --- 3. It comes back on a fresh read ----------------------------------
  const read = await call('/api/profile', token);
  const readProfile = read.body?.profile ?? {};
  check(
    'the role survives a re-read',
    readProfile.targetRole === 'Data Analyst',
    `targetRole = ${JSON.stringify(readProfile.targetRole ?? null)}`
  );
  check(
    'the experience level survives a re-read',
    readProfile.experienceLevel === 'junior',
    `experienceLevel = ${JSON.stringify(readProfile.experienceLevel ?? null)}`
  );

  // --- 4. The database agrees --------------------------------------------
  const stored = await admin
    .from('profiles')
    .select('target_role, target_industry, experience_level')
    .eq('id', userId)
    .single();
  check(
    'the database holds the role',
    stored.data?.target_role === 'Data Analyst',
    `target_role = ${JSON.stringify(stored.data?.target_role ?? null)}`
  );
  check(
    'the database holds the experience level',
    stored.data?.experience_level === 'junior',
    `experience_level = ${JSON.stringify(stored.data?.experience_level ?? null)}`
  );

  // --- 5. A role change replaces the old one -----------------------------
  const changed = await call('/api/profile', token, 'PATCH', {
    targetRoleId: 'frontend-engineer',
    targetRoleDomain: 'technology',
  });
  const changedProfile = changed.body?.profile ?? {};
  check(
    'the role can be changed',
    changedProfile.targetRole === 'Frontend Engineer',
    `targetRole = ${JSON.stringify(changedProfile.targetRole ?? null)}`
  );
  check(
    'the career track followed the new role',
    changedProfile.targetIndustry === 'Technology & Software',
    `targetIndustry = ${JSON.stringify(changedProfile.targetIndustry ?? null)}`
  );
  check(
    'the experience level was left alone by a role change',
    changedProfile.experienceLevel === 'junior',
    `experienceLevel = ${JSON.stringify(changedProfile.experienceLevel ?? null)}`
  );

  // --- 6. An experience level outside the vocabulary is refused ----------
  const refused = await call('/api/profile', token, 'PATCH', {
    experienceLevel: 'director',
  });
  check(
    'an unknown experience level is refused',
    refused.status === 400,
    `status ${refused.status}`
  );
  const afterRefusal = await call('/api/profile', token);
  check(
    'the refused level was not stored',
    (afterRefusal.body?.profile ?? {}).experienceLevel === 'junior',
    `experienceLevel = ${JSON.stringify((afterRefusal.body?.profile ?? {}).experienceLevel ?? null)}`
  );

  // --- 7. A free-text role is not accepted --------------------------------
  // The catalogue is the only source of roles, so a title the platform does
  // not know is REFUSED — and, crucially, refusing it must leave the
  // candidate's existing role alone rather than clearing it.
  const freeText = await call('/api/profile', token, 'PATCH', {
    targetRole: 'Junior Data Analyst',
  });
  check(
    'a free-text role is refused',
    freeText.status >= 400,
    `status ${freeText.status}`
  );
  const afterFreeText = await admin
    .from('profiles')
    .select('target_role')
    .eq('id', userId)
    .single();
  check(
    'the refused role left the existing one alone',
    afterFreeText.data?.target_role === 'Frontend Engineer',
    `target_role = ${JSON.stringify(afterFreeText.data?.target_role ?? null)}`
  );
} finally {
  await admin.auth.admin.deleteUser(userId);
}

console.log(
  failures === 0
    ? '\nOK: the deployed career target behaves as the product promises.'
    : `\nFAILED: ${failures} check(s) did not hold.`
);
process.exit(failures === 0 ? 0 : 1);
