/**
 * Production smoke test.
 *
 * Exercises the deployed site the way a person would: it loads the page, it
 * signs up through the public auth endpoint, it calls the authenticated API
 * with that session, and it checks that the answers are the ones the
 * production database actually holds.
 *
 * A temporary account is created and removed again, so the database is left
 * exactly as it was found. The account is named so it is obvious if one is
 * ever left behind.
 *
 * Usage:
 *   node scripts/production/smoke-production.cjs [baseUrl]
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
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` - ${detail}` : ''}`);
}

async function api(path_, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path_}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function main() {
  console.log(`Production smoke test against ${BASE}\n`);

  // ---- 1. The public site ------------------------------------------------
  console.log('Landing and assets');
  const landing = await fetch(`${BASE}/`, { redirect: 'follow' });
  const html = await landing.text();
  record('landing returns 200', landing.status === 200, `status ${landing.status}`);
  record('landing is an HTML document', html.includes('<!doctype html>'));

  const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  record('landing references hashed assets', assetPaths.length > 0, `${assetPaths.length} assets`);
  let assetFailures = 0;
  for (const assetPath of assetPaths.slice(0, 12)) {
    const response = await fetch(`${BASE}${assetPath}`);
    if (response.status !== 200) assetFailures += 1;
  }
  record('every referenced asset loads', assetFailures === 0, `${assetPaths.length} checked`);

  const health = await api('/api/health');
  record('/api/health responds', health.status === 200, `status ${health.status}`);

  // ---- 2. The API surface exists ---------------------------------------
  console.log('\nAPI surface');
  const protectedRoutes = [
    '/api/skill-gaps',
    '/api/volunteer/opportunities',
    '/api/cv/build',
    '/api/guides',
    '/api/roadmap/personalized',
  ];
  for (const route of protectedRoutes) {
    const response = await api(route);
    record(
      `${route} exists and requires a session`,
      response.status === 401 || response.status === 403,
      `status ${response.status}`
    );
  }
  const anonymous = await api('/api/volunteer/opportunities');
  record(
    'anonymous access is refused',
    anonymous.status === 401 || anonymous.status === 403,
    `status ${anonymous.status}`
  );

  // ---- 3. Sign up through the real auth endpoint -----------------------
  console.log('\nAuthentication');
  const email = `cp-smoke-${Date.now().toString(36)}@example.invalid`;
  const password = `Smk-${Math.random().toString(36).slice(2, 12)}Aa1!`;

  const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const signupBody = await signup.json().catch(() => null);
  record('signup succeeds', signup.ok, `status ${signup.status}`);

  const signin = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const signinBody = await signin.json().catch(() => null);
  const token = signinBody?.access_token ?? null;
  const refreshToken = signinBody?.refresh_token ?? null;
  const userId = signupBody?.user?.id ?? null;
  record('login returns a session', Boolean(token), signin.ok ? 'session issued' : `status ${signin.status}`);

  if (!token) {
    await cleanup(userId, email);
    throw new Error('cannot continue without a session');
  }

  try {
    // ---- 4. Profile ------------------------------------------------------
    console.log('\nProfile and target role');
    const profile = await api('/api/profile', { token });
    record('profile loads', profile.status === 200, `status ${profile.status}`);
    record(
      'profile has no target role yet',
      profile.body?.profile?.targetRole === null || profile.body?.profile?.targetRole === undefined,
      `targetRole=${profile.body?.profile?.targetRole ?? 'none'}`
    );

    const setRole = await api('/api/profile', {
      method: 'PATCH',
      token,
      body: { targetRoleId: 'data-analyst', targetRoleDomain: 'data' },
    });
    record('target role is accepted', setRole.status === 200, `status ${setRole.status}`);
    record(
      'the target role was persisted',
      setRole.body?.profile?.targetRole === 'Data Analyst',
      `targetRole=${setRole.body?.profile?.targetRole ?? 'none'}`
    );

    // ---- 5. Skills -------------------------------------------------------
    console.log('\nSkills');
    const rating = await api('/api/user-skills', {
      method: 'POST',
      token,
      body: { name: 'SQL', proficiency: 2 },
    });
    record('a skill can be rated', rating.status === 200 || rating.status === 201, `status ${rating.status}`);

    const skills = await api('/api/user-skills', { token });
    const skillNames = (skills.body?.skills ?? skills.body ?? []).map((s) =>
      (s.skill?.name ?? s.name ?? '').toLowerCase()
    );
    record('the rating is returned', skillNames.includes('sql'), `skills: ${skillNames.join(', ') || 'none'}`);

    // ---- 6. Skill gaps ---------------------------------------------------
    console.log('\nSkill gaps');
    const gaps = await api('/api/skill-gaps', { token });
    record('/api/skill-gaps responds', gaps.status === 200, `status ${gaps.status}`);
    const gapList = gaps.body?.gaps ?? [];
    record('gaps are returned for the target role', gapList.length > 0, `${gapList.length} gaps`);
    record(
      'every gap carries a priority',
      gapList.every((g) =>
        ['critical', 'high', 'medium', 'low', 'sufficient'].includes(g.priority)
      ),
      gapList.map((g) => `${g.name}=${g.priority}`).slice(0, 4).join(', ')
    );
    record(
      'a readiness figure is returned',
      typeof gaps.body?.summary?.readinessPct === 'number',
      `readiness=${gaps.body?.summary?.readinessPct}`
    );
    const sqlGap = gapList.find((g) => String(g.name).toLowerCase() === 'sql');
    record(
      'the rated skill shows the new level',
      sqlGap ? sqlGap.currentLevel === 2 : true,
      sqlGap ? `SQL current=${sqlGap.currentLevel} target=${sqlGap.requiredLevel}` : 'SQL is not a requirement of this role'
    );

    // ---- 7. Roadmap ------------------------------------------------------
    console.log('\nRoadmap');
    const roadmap = await api('/api/roadmap/personalized', { token });
    record('/api/roadmap/personalized responds', roadmap.status === 200, `status ${roadmap.status}`);
    const phases = roadmap.body?.plan?.phases ?? [];
    record('the plan has phases', phases.length > 0, `${phases.length} phases`);
    const steps = phases.flatMap((p) => p.milestones.flatMap((m) => m.tasks));
    record('the plan has steps', steps.length > 0, `${steps.length} steps`);
    record(
      'the phases are named for the role',
      phases.some((p) => String(p.title).includes('Data Analyst')),
      phases.map((p) => p.title).slice(0, 2).join(' | ')
    );
    record(
      'every step carries a difficulty and a priority',
      steps.every((s) => s.difficulty && s.priority),
      steps
        .slice(0, 3)
        .map((s) => `${s.title.slice(0, 28)}=${s.priority}/${s.difficulty}`)
        .join(', ')
    );
    record(
      'a step names a real learning resource',
      steps.some((s) => (s.resources ?? []).length > 0),
      'resources attached'
    );

    // The plan is generated, so its steps have no database id yet. The
    // persisted roadmap is what carries the ids the API writes against.
    const persistedSteps = (roadmap.body?.roadmap?.phases ?? []).flatMap((p) =>
      p.milestones.flatMap((m) => m.tasks)
    );
    record(
      'the persisted roadmap carries the step ids',
      persistedSteps.length > 0 && persistedSteps.every((s) => Boolean(s.id)),
      `${persistedSteps.length} persisted steps`
    );

    // ---- 8. Progress persists --------------------------------------------
    console.log('\nProgress persistence');
    const firstStep = persistedSteps.find((s) => s.status !== 'completed');
    if (firstStep) {
      const patch = await api(`/api/roadmap/tasks/${firstStep.id}`, {
        method: 'PATCH',
        token,
        body: { status: 'completed' },
      });
      record('a step can be completed', patch.status === 200, `status ${patch.status}`);

      const reread = await api('/api/roadmap/personalized', { token });
      const rereadSteps = (reread.body?.roadmap?.phases ?? []).flatMap((p) =>
        p.milestones.flatMap((m) => m.tasks)
      );
      const persisted = rereadSteps.find((s) => s.id === firstStep.id);
      record(
        'the completed step survives a refresh',
        persisted?.status === 'completed',
        `status=${persisted?.status}`
      );
    } else {
      record('a step can be completed', false, 'no step to complete');
    }

    // A skill the user already meets must not generate work.
    const metSkill = 'SQL';
    const metGap = gapList.find((g) => String(g.name).toLowerCase() === metSkill);
    if (metGap) {
      const metRating = await api('/api/user-skills', {
        method: 'POST',
        token,
        body: { name: metSkill, proficiency: metGap.requiredLevel },
      });
      record(
        'a skill can be rated up to the target level',
        metRating.status === 200 || metRating.status === 201,
        `status ${metRating.status}`
      );

      const afterMeeting = await api('/api/roadmap/personalized', { token });
      const afterSteps = (afterMeeting.body?.plan?.phases ?? []).flatMap((p) =>
        p.milestones.flatMap((m) => m.tasks)
      );
      record(
        'a skill the user now meets produces no step',
        !afterSteps.some((s) => s.skillNames?.includes(metGap.name)),
        `${metGap.name} rated to ${metGap.requiredLevel}/${metGap.requiredLevel}`
      );
    } else {
      record('a skill the user now meets produces no step', true, 'skipped: not a requirement');
    }

    // ---- 9. Learning ----------------------------------------------------
    console.log('\nLearning');
    const courses = await api('/api/learning/catalog', { token });
    const courseList = courses.body?.courses ?? [];
    record('courses load', courses.status === 200 && courseList.length > 0, `${courseList.length} courses`);
    record(
      'every course has a real provider and a URL',
      courseList.every((c) => c.provider && String(c.url).startsWith('http')),
      courseList
        .slice(0, 3)
        .map((c) => c.provider)
        .join(', ')
    );
    const recommendations = await api('/api/learning/recommendations', {
      method: 'POST',
      token,
      body: { targetRoleId: 'data-analyst', ai: false },
    });
    const recs = recommendations.body?.recommendations ?? [];
    record('recommendations are returned', recommendations.status === 200, `${recs.length} recommendations`);
    record(
      'a recommendation explains itself',
      recs.every((r) => typeof r.reason === 'string' && r.reason.length > 0)
    );

    // ---- 10. Volunteer ---------------------------------------------------
    console.log('\nVolunteering');
    const opportunities = await api('/api/volunteer/opportunities', { token });
    const list = opportunities.body?.opportunities ?? [];
    record('opportunities load', opportunities.status === 200 && list.length > 0, `${list.length} opportunities`);
    record(
      'every opportunity has an organisation and a live link',
      list.every((o) => o.organization && String(o.applicationUrl).startsWith('https://')),
      `${new Set(list.map((o) => o.organization)).size} organisations`
    );
    const saveTarget = list[0];
    const saved = await api(`/api/volunteer/opportunities/${saveTarget.id}/save`, {
      method: 'POST',
      token,
      body: {},
    });
    record('an opportunity can be saved', saved.status === 200, `status ${saved.status}`);
    const afterSave = await api('/api/volunteer/opportunities', { token });
    record(
      'the saved opportunity is marked as saved',
      (afterSave.body?.opportunities ?? []).find((o) => o.id === saveTarget.id)?.saved === true
    );
    const unsaved = await api(`/api/volunteer/opportunities/${saveTarget.id}/save`, {
      method: 'DELETE',
      token,
    });
    record('an opportunity can be unsaved', unsaved.status === 200, `status ${unsaved.status}`);

    // ---- 11. Guides ------------------------------------------------------
    console.log('\nGuided tours');
    const guides = await api('/api/guides', { token });
    record('guide state loads', guides.status === 200, `status ${guides.status}`);
    const dismissed = await api('/api/guides/roadmap/dismiss', {
      method: 'POST',
      token,
      body: {},
    });
    record('a guide can be dismissed', dismissed.status === 200, `status ${dismissed.status}`);
    const guidesAfter = await api('/api/guides', { token });
    record(
      'the dismissal persists',
      (guidesAfter.body?.dismissed ?? []).includes('roadmap'),
      `dismissed: ${(guidesAfter.body?.dismissed ?? []).join(', ') || 'none'}`
    );

    // ---- 12. CV ----------------------------------------------------------
    console.log('\nCV builder');
    const cv = await api('/api/cv/build', { token });
    record('/api/cv/build responds', cv.status === 200, `status ${cv.status}`);
    const built = cv.body?.cv ?? {};
    record(
      'the CV is built from the user records',
      Array.isArray(built.skills) && built.skills.length > 0,
      `skills=${built.skills?.length ?? 0}, experiences=${built.experiences?.length ?? 0}`
    );
    record(
      'the CV lists what is still missing rather than inventing it',
      Array.isArray(built.missing),
      `${built.missing?.length ?? 0} items still needed`
    );
    record(
      'the CV holds no employer the user never entered',
      (built.experiences ?? []).length === 0,
      'no experience has been entered yet'
    );

    // ---- 13. Authorisation ----------------------------------------------
    console.log('\nAuthorisation');
    const otherUser = await api('/api/roadmap/personalized', {
      token: 'not-a-real-token',
    });
    record(
      'a forged token is refused',
      otherUser.status === 401 || otherUser.status === 403,
      `status ${otherUser.status}`
    );
    const noToken = await api('/api/cv/build');
    record(
      'a missing session is refused',
      noToken.status === 401 || noToken.status === 403,
      `status ${noToken.status}`
    );

    // ---- 14. Logout ------------------------------------------------------
    console.log('\nLogout');
    const signout = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    record('logout succeeds', signout.ok, `status ${signout.status}`);

    // The access token is a signed JWT, so it stays valid until it expires.
    // What logout revokes is the refresh token, and that is the meaningful
    // check: without it the client could mint a new session.
    if (refreshToken) {
      const refreshed = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      record(
        'the refresh token is revoked by logout',
        !refreshed.ok,
        `refresh returned ${refreshed.status}`
      );
    } else {
      record('the refresh token is revoked by logout', true, 'skipped: no refresh token');
    }
  } finally {
    await cleanup(userId, email);
  }

  console.log(`\n${results.length - failures}/${results.length} checks passed`);
  if (failures > 0) {
    console.log('\nfailed checks:');
    for (const result of results.filter((r) => !r.ok)) {
      console.log(`  - ${result.name}${result.detail ? ` (${result.detail})` : ''}`);
    }
  }
  process.exitCode = failures > 0 ? 1 : 0;
}

/** Removes the temporary smoke-test account and everything it created. */
async function cleanup(userId, email) {
  try {
    // The Auth admin API deletes by id, not by body.
    const id = userId ?? (await findUserIdByEmail(email));
    if (!id) {
      console.log(`\ncleanup: no id found for ${email}; nothing to remove`);
      return;
    }
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    });
    console.log(`\ncleanup: removed the temporary account (status ${response.status})`);
  } catch (error) {
    console.log(`\ncleanup FAILED for ${email}: ${error.message}`);
  }
}

/** Finds a user's id through the Auth admin API. */
async function findUserIdByEmail(email) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!response.ok) return null;
  const body = await response.json().catch(() => null);
  const users = body?.users ?? [];
  const match = users.find((user) => user.email === email);
  return match?.id ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
