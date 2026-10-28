/**
 * Security verification against the live production site.
 *
 * Checks the things a deployment can quietly break:
 *   - a secret that ended up in the served bundle;
 *   - an API route that answers without a session;
 *   - one user reading another user's data;
 *   - a security header that was dropped;
 *   - the service-role key appearing in anything the browser can fetch.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const BASE = process.argv[2] || 'https://careerpilot4ai.pages.dev';

function envValue(name) {
  const text = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

const SUPABASE_URL = envValue('SUPABASE_URL');
const ANON_KEY = envValue('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = envValue('SUPABASE_SERVICE_ROLE_KEY');

const results = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` - ${detail}` : ''}`);
}

async function main() {
  console.log(`Security verification against ${BASE}\n`);

  // ---- 1. The served bundle must not contain a secret -------------------
  console.log('Served assets');
  const landing = await fetch(`${BASE}/`);
  const html = await landing.text();
  const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);

  // The publishable key is the browser's key by design: it is the
  // anon-equivalent credential, it is meant to be readable by anyone, and
  // row level security is what protects the data. The service-role key and
  // the AI key must never be in the bundle.
  const secrets = {
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    GEMINI_API_KEY: envValue('GEMINI_API_KEY'),
  };
  const publishableKey = envValue('VITE_SUPABASE_PUBLISHABLE_KEY');

  let leaked = 0;
  let publishableFound = 0;
  for (const assetPath of assetPaths) {
    const response = await fetch(`${BASE}${assetPath}`);
    const body = await response.text();
    for (const [name, value] of Object.entries(secrets)) {
      if (value && body.includes(value)) {
        console.log(`  !! ${name} found in ${assetPath}`);
        leaked += 1;
      }
    }
    if (publishableKey && body.includes(publishableKey)) publishableFound += 1;
  }
  record(
    'no server secret is served to the browser',
    leaked === 0,
    `${assetPaths.length} assets checked`
  );
  record(
    'the service-role key is not served',
    !html.includes(SERVICE_ROLE_KEY) && leaked === 0
  );
  record(
    'the publishable key is served, as it must be',
    publishableFound > 0,
    `${publishableFound} assets carry the public browser key`
  );

  // The worker bundle is not fetched by the browser, but a leaked key in it
  // would still be a leak, so it is checked too.
  const worker = await fetch(`${BASE}/_worker.js`).catch(() => null);
  if (worker) {
    const body = await worker.text();
    const inWorker = Object.entries(secrets).some(
      ([, value]) => value && body.includes(value)
    );
    record('the worker bundle holds no secret', !inWorker, `${body.length} bytes`);
  } else {
    record('the worker bundle holds no secret', true, 'not directly fetchable');
  }

  // ---- 2. Every protected route must refuse an anonymous caller ---------
  console.log('\nAuthorisation');
  // The real protected routes, with the method each one accepts. A route
  // that only accepts POST answers 404 to a GET, which is the correct
  // behaviour and must not be read as "open".
  const protectedRoutes = [
    ['GET', '/api/profile'],
    ['GET', '/api/roadmap'],
    ['GET', '/api/roadmap/personalized'],
    ['GET', '/api/roadmap/preview'],
    ['GET', '/api/skill-gaps'],
    ['GET', '/api/user-skills'],
    ['GET', '/api/volunteer'],
    ['GET', '/api/volunteer/opportunities'],
    ['GET', '/api/projects'],
    ['GET', '/api/experiences'],
    ['GET', '/api/educations'],
    ['GET', '/api/certifications'],
    ['GET', '/api/cv/build'],
    ['GET', '/api/cv-versions'],
    ['GET', '/api/cvs'],
    ['GET', '/api/cover-letters'],
    ['GET', '/api/evidence'],
    ['GET', '/api/interviews'],
    ['GET', '/api/job-applications'],
    ['GET', '/api/learning/items'],
    ['GET', '/api/guides'],
    ['GET', '/api/notifications'],
    ['GET', '/api/preferences'],
    ['GET', '/api/activities'],
    ['GET', '/api/bookmarks'],
    ['GET', '/api/career-context'],
    ['GET', '/api/career-identity'],
    ['GET', '/api/career-milestones'],
    ['GET', '/api/profile-links'],
    ['GET', '/api/saved-roles'],
    ['GET', '/api/secondary-goals'],
    ['GET', '/api/languages'],
    ['POST', '/api/copilot'],
    ['POST', '/api/analyze-career'],
    ['POST', '/api/optimize-cv'],
    ['POST', '/api/suggest-summary'],
    ['POST', '/api/cv/ai-assist'],
    ['POST', '/api/generate-cover-letter'],
    ['POST', '/api/mock-interview'],
    ['POST', '/api/learning/recommendations'],
    ['POST', '/api/roadmap/generate'],
    ['POST', '/api/roadmap/enroll'],
    ['POST', '/api/resumes/upload'],
    ['POST', '/api/account/change-email'],
    ['POST', '/api/account/change-password'],
    ['POST', '/api/account/delete'],
  ];
  let open = 0;
  for (const [method, route] of protectedRoutes) {
    const response = await fetch(`${BASE}${route}`, { method });
    if (response.status !== 401 && response.status !== 403) {
      console.log(`  !! ${method} ${route} answered ${response.status} without a session`);
      open += 1;
    }
  }
  record(
    'no protected route answers without a session',
    open === 0,
    `${protectedRoutes.length} routes checked`
  );

  // A forged token must not be accepted.
  const forged = await fetch(`${BASE}/api/profile`, {
    headers: { Authorization: 'Bearer not.a.real.token' },
  });
  record(
    'a forged token is refused',
    forged.status === 401 || forged.status === 403,
    `status ${forged.status}`
  );

  // A token signed with a different key must not be accepted either.
  const wrongKey = await fetch(`${BASE}/api/profile`, {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.bogus' },
  });
  record(
    'a token with a bad signature is refused',
    wrongKey.status === 401 || wrongKey.status === 403,
    `status ${wrongKey.status}`
  );

  // ---- 3. One user must not read another user's data -------------------
  console.log('\nUser isolation');
  const isolation = await checkIsolation();
  record('one user cannot read another user data', isolation.ok, isolation.detail);

  // ---- 4. The security headers must still be there ---------------------
  console.log('\nSecurity headers');
  const response = await fetch(`${BASE}/`, { redirect: 'follow' });
  const expected = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'strict-transport-security': 'max-age=31536000',
    'content-security-policy': "default-src 'self'",
  };
  for (const [header, value] of Object.entries(expected)) {
    const actual = response.headers.get(header);
    record(
      `${header} is set`,
      actual !== null && actual.toLowerCase().includes(value.toLowerCase()),
      actual ?? 'missing'
    );
  }

  // The API must carry the same baseline headers as the static site.
  const apiResponse = await fetch(`${BASE}/api/health`);
  record(
    'the API sets the same baseline headers',
    apiResponse.headers.get('x-content-type-options') === 'nosniff' &&
      apiResponse.headers.get('x-frame-options') === 'DENY',
    `xfo=${apiResponse.headers.get('x-frame-options')}`
  );

  // ---- 5. The service-role key must not be usable from the browser ------
  console.log('\nService-role key');
  const withServiceRole = await fetch(`${BASE}/api/profile`, {
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  record(
    'the service-role key cannot be used as a user session',
    withServiceRole.status === 401 || withServiceRole.status === 403,
    `status ${withServiceRole.status}`
  );

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  if (failures > 0) {
    console.log('\nfailed checks:');
    for (const result of results.filter((r) => !r.ok)) {
      console.log(`  - ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
    }
  }
  process.exitCode = failures > 0 ? 1 : 0;
}

/** Signs two users up and checks that neither can read the other's data. */
async function checkIsolation() {
  const stamp = Date.now().toString(36);
  const userA = { email: `cp-iso-a-${stamp}@example.invalid`, password: `Iso-${stamp}Aa1!` };
  const userB = { email: `cp-iso-b-${stamp}@example.invalid`, password: `Iso-${stamp}Aa1!` };
  const ids = [];

  try {
    const tokenA = await signUpAndSignIn(userA);
    const tokenB = await signUpAndSignIn(userB);
    if (!tokenA || !tokenB) return { ok: false, detail: 'could not create the two users' };

    // A writes something of their own.
    const created = await fetch(`${BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ title: `isolation-probe-${stamp}`, goal: 'probe' }),
    });
    const projectId = (await created.json().catch(() => null))?.project?.id;
    if (projectId) ids.push({ table: 'projects', id: projectId });

    // B tries to read it. A 404 is the safer answer: it does not confirm
    // that the project exists.
    const read = await fetch(`${BASE}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    if (read.ok) {
      const body = await read.json().catch(() => null);
      if (body?.project) {
        return { ok: false, detail: 'user B read user A project' };
      }
    }

    // B must not see it in their own list either.
    const bList = await fetch(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const bBody = await bList.json().catch(() => null);
    const bProjects = bBody?.projects ?? [];
    if (bProjects.some((p) => p.id === projectId)) {
      return { ok: false, detail: "user A's project appears in user B's list" };
    }

    // B tries to change it.
    const changed = await fetch(`${BASE}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ title: 'hijacked' }),
    });
    if (changed.ok) {
      return { ok: false, detail: `user B changed user A project (status ${changed.status})` };
    }

    // A reads their own.
    const own = await fetch(`${BASE}/api/projects`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const ownBody = await own.json().catch(() => null);
    const ownProjects = ownBody?.projects ?? [];
    if (!ownProjects.some((p) => p.id === projectId)) {
      return { ok: false, detail: 'user A could not read their own project' };
    }

    // A's project is still theirs, unchanged.
    const unchanged = await fetch(`${BASE}/api/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const unchangedBody = await unchanged.json().catch(() => null);
    if (unchangedBody?.project?.title !== `isolation-probe-${stamp}`) {
      return { ok: false, detail: 'user A project was modified' };
    }

    return {
      ok: true,
      detail: `B refused (read ${read.status}, write ${changed.status}); B's list holds ${bProjects.length} project(s)`,
    };
  } finally {
    for (const { email } of [userA, userB]) {
      await deleteUserByEmail(email);
    }
  }
}

async function signUpAndSignIn(user) {
  await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const body = await response.json().catch(() => null);
  return body?.access_token ?? null;
}

async function deleteUserByEmail(email) {
  const list = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  const body = await list.json().catch(() => null);
  const match = (body?.users ?? []).find((user) => user.email === email);
  if (!match) return;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${match.id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
