// Production verification of the measured CV analysis.
//
// Signs a throwaway candidate in on the deployed site and measures a CV with
// the real endpoints:
//
//   1. POST /api/cv/analysis answers with a measured report;
//   2. POST /api/cv/analysis/stream answers with the stages as they happen
//      and then with the same measurement — this is what proves the stream
//      survives the deployed runtime;
//   3. a measurement of a stored CV is recorded, and the history reads it back.
//
// The throwaway identity is removed at the end.
//
// Usage: node scripts/verify-analyzer-production.mjs [baseUrl]
import fs from 'node:fs';
import path from 'node:path';

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
const email = `cp-verify-analyzer-${stamp}@example.invalid`;
const password = `Tst-${stamp}-Aa1!x`;

const CV = {
  fullName: 'Ahmed Ebrahim',
  email: 'ahmed.ebrahim@example.com',
  phone: '+20 100 123 4567',
  location: 'Cairo, Egypt',
  title: 'Full-Stack Engineer',
  summary:
    'Full-stack engineer with five years of experience building and shipping production web applications for fintech clients in Egypt, focused on measurable delivery and clean architecture.',
  experiences: [
    {
      company: 'Nile Digital',
      role: 'Senior Backend Developer',
      period: '2021 - Present',
      bullets: [
        'Reduced checkout latency by 38% by rewriting the payment service in Node.js.',
        'Led the migration of 12 services to Kubernetes, cutting deployment time to 6 minutes.',
      ],
    },
  ],
  education: [
    {
      institution: 'Cairo University',
      degree: 'Bachelor of Science',
      field: 'Computer Science',
      period: '2015 - 2019',
    },
  ],
  projects: [
    {
      title: 'Arabic Speech-to-CV',
      role: 'Solo builder',
      technologies: ['React', 'TypeScript', 'Node.js'],
      bullets: ['Cut CV writing time by 70% for 1200 recorded interviews.'],
    },
  ],
  skillsList: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
  certifications: [],
};

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
  return { status: res.status, body, headers: res.headers };
}

/** The raw body of the streaming endpoint, with the events it carried. */
async function stream(pathname, token, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const events = text
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
      const data = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      return { event, data: data ? JSON.parse(data) : null };
    });
  return { status: res.status, contentType: res.headers.get('content-type'), events };
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

let userId = null;

async function main() {
  console.log(`[verify] base ${BASE}`);

  const health = await api('/api/health');
  console.log(`[verify] GET /api/health -> ${health.status}`);

  const anonymous = await api('/api/cv/analysis', { method: 'POST', body: { cv: CV } });
  console.log(`[verify] POST /api/cv/analysis without a session -> ${anonymous.status}`);
  if (anonymous.status !== 401) {
    console.log('[verify] FAILED: the measurement answered an anonymous caller');
    process.exitCode = 1;
    return;
  }

  const user = await signUp();
  userId = user.id;
  console.log(`[verify] signed up ${email} (${user.id})`);

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

  const measured = await api('/api/cv/analysis', {
    method: 'POST',
    token: user.token,
    body: { cv: CV, targetRoleTitle: 'Full-Stack Engineer' },
  });
  console.log(`[verify] POST /api/cv/analysis -> ${measured.status}`);
  const score = measured.body?.analysis?.overallScore;
  console.log(`[verify] measured score: ${score} (${measured.body?.analysis?.band})`);
  if (measured.status !== 200 || typeof score !== 'number') {
    console.log(`[verify] FAILED: ${JSON.stringify(measured.body).slice(0, 400)}`);
    process.exitCode = 1;
    return;
  }

  const streamed = await stream('/api/cv/analysis/stream', user.token, {
    cv: CV,
    targetRoleTitle: 'Full-Stack Engineer',
  });
  console.log(`[verify] POST /api/cv/analysis/stream -> ${streamed.status} (${streamed.contentType})`);
  const stages = streamed.events.filter((entry) => entry.event === 'stage');
  const completed = streamed.events.filter(
    (entry) => entry.event === 'stage' && entry.data?.status === 'completed'
  );
  const done = streamed.events.find((entry) => entry.event === 'complete');
  console.log(
    `[verify] stream: ${stages.length} stage events, ${completed.length} completed, result ${
      done ? 'present' : 'MISSING'
    }`
  );
  if (!done) {
    console.log(
      `[verify] FAILED: the stream did not carry a result: ${JSON.stringify(streamed.events).slice(0, 400)}`
    );
    process.exitCode = 1;
    return;
  }
  if (done.data?.analysis?.overallScore !== score) {
    console.log('[verify] FAILED: the stream and the plain route disagree');
    process.exitCode = 1;
    return;
  }

  // A measurement of a stored CV is recorded, and the history reads it back.
  const cv = await api('/api/cvs', {
    method: 'POST',
    token: user.token,
    body: { name: 'Verification CV', targetRoleTitle: 'Full-Stack Engineer' },
  });
  const cvId = cv.body?.cv?.id;
  const version = await api('/api/cv-versions', {
    method: 'POST',
    token: user.token,
    body: { cvId, name: 'Verification v1', profileJson: CV },
  });
  const cvVersionId = version.body?.version?.id;
  console.log(`[verify] created a CV and a version (${cvId}, ${cvVersionId})`);

  const stored = await api('/api/cv/analysis', {
    method: 'POST',
    token: user.token,
    body: { cvVersionId, targetRoleTitle: 'Full-Stack Engineer' },
  });
  console.log(
    `[verify] measured the stored CV -> ${stored.status}, recorded as ${stored.body?.measurementId}`
  );

  const history = await api(`/api/cv/analyses?cvId=${cvId}`, { token: user.token });
  console.log(`[verify] history -> ${history.status}, ${history.body?.measurements?.length} record(s)`);
  if (stored.status !== 200 || !stored.body?.measurementId || !history.body?.measurements?.length) {
    console.log('[verify] FAILED: the measurement was not recorded');
    process.exitCode = 1;
    return;
  }

  console.log('[verify] OK: the measured analysis works end to end on the deployed site.');
}

main()
  .catch((error) => {
    console.error('[verify] error:', error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await removeUser(userId);
  });
