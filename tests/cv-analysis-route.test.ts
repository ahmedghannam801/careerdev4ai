// The measured analysis route.
//
// The route that measures a CV is the one part of the feature that touches the
// API. These tests hold it to three rules:
//
//   1. it is private: a candidate's CV is not readable by an anonymous caller;
//   2. it measures, it does not describe: the answer comes from the document
//      and it is the same every time;
//   3. it does not need a model. The route must answer with a measured score
//      whether or not a provider is configured, because a score that can be
//      counted does not need one.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { api, admin, createTestUser, deleteTestUser, type TestUser } from './helpers.ts';

/** The raw text of a response, for the endpoints that stream. */
async function apiText(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {}
): Promise<{ status: number; text: string; headers: Headers }> {
  const baseUrl =
    process.env.TEST_API_BASE_URL ?? `http://127.0.0.1:${process.env.TEST_API_PORT ?? '3111'}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

/** The events of a stream, in the order they arrived. */
function parseEvents(text: string): { event: string; data: any }[] {
  return text
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
}

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

describe('the measured analysis route', () => {
  let user: TestUser;

  before(async () => {
    user = await createTestUser('cv-analysis');
  });

  after(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('it requires a session', async () => {
    const res = await api('POST', '/api/cv/analysis', { body: { cv: CV } });
    assert.equal(res.status, 401);
  });

  test('a CV is required before it can be measured', async () => {
    const res = await api('POST', '/api/cv/analysis', { token: user.token, body: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body?.code, 'document_required');
  });

  test('it answers with a measured analysis', async () => {
    const res = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cv: CV, targetRoleTitle: 'Full-Stack Engineer' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body?.success, true);

    const report = res.body?.analysis;
    assert.ok(report, 'the route must return the report');
    assert.equal(typeof report.overallScore, 'number');
    assert.ok(report.overallScore >= 0 && report.overallScore <= 100);
    assert.equal(report.dimensions.length, 6);
    assert.ok(report.generatedAt, 'the report must say when it was measured');

    // The stored shape is carried as well, so a caller that already knows how
    // to read a score can read this one.
    assert.equal(res.body?.atsAnalysis?.overallScore, report.overallScore);
    assert.equal(typeof res.body?.atsAnalysis?.breakdown?.keywordsMatch, 'number');
  });

  test('the same document is measured the same way twice', async () => {
    const first = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cv: CV, targetRoleTitle: 'Full-Stack Engineer' },
    });
    const second = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cv: CV, targetRoleTitle: 'Full-Stack Engineer' },
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(
      first.body?.analysis?.overallScore,
      second.body?.analysis?.overallScore,
      'a measurement does not change between two runs'
    );
    assert.deepEqual(
      first.body?.analysis?.dimensions?.map((entry: { key: string; score: number | null }) => [
        entry.key,
        entry.score,
      ]),
      second.body?.analysis?.dimensions?.map((entry: { key: string; score: number | null }) => [
        entry.key,
        entry.score,
      ])
    );
  });

  test('it measures without a model, and says so', async () => {
    // The route runs no model, so the answer does not depend on one. The
    // health endpoint says whether the server has a provider; the measurement
    // must be the same either way.
    const health = await api('GET', '/api/health');
    const res = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cv: CV, targetRoleTitle: 'Full-Stack Engineer' },
    });

    assert.equal(res.status, 200);
    assert.equal(
      res.body?.analysis?.overallScore > 0,
      true,
      `the CV must be measured whether a model is configured (${String(health.body?.modelConfigured)}) or not`
    );
  });

  test('a document that cannot be read is refused rather than scored', async () => {
    const res = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: {
        cv: {
          fullName: '',
          email: '',
          summary: '',
          experiences: [],
          education: [],
          projects: [],
          skillsList: [],
        },
        targetRoleTitle: 'Full-Stack Engineer',
      },
    });

    assert.equal(res.status, 422);
    assert.equal(res.body?.code, 'document_unreadable');
    assert.equal(res.body?.analysis, undefined);
  });

  test('the market dimension stays unavailable without a job description', async () => {
    const res = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cv: CV, targetRoleTitle: 'Full-Stack Engineer' },
    });

    const market = res.body?.analysis?.dimensions?.find(
      (entry: { key: string }) => entry.key === 'egyptMarketFit'
    );
    assert.equal(market?.available, false);
    assert.equal(market?.score, null);
  });
});

describe('the measured analysis of a stored CV', () => {
  let user: TestUser;
  let cvId: string;
  let cvVersionId: string;

  before(async () => {
    user = await createTestUser('cv-analysis-stored');
    const cv = await api('POST', '/api/cvs', {
      token: user.token,
      body: { name: 'Analyzer CV', targetRoleTitle: 'Full-Stack Engineer' },
    });
    cvId = cv.body?.cv?.id;
    const version = await api('POST', '/api/cv-versions', {
      token: user.token,
      body: { cvId, name: 'Analyzer v1', profileJson: CV },
    });
    cvVersionId = version.body?.version?.id;
  });

  after(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('a stored version is measured and the run is recorded', async () => {
    const res = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cvVersionId, targetRoleTitle: 'Full-Stack Engineer' },
    });

    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(typeof res.body?.analysis?.overallScore, 'number');
    assert.ok(res.body?.measurementId, 'a measurement of a stored CV is recorded');
  });

  test('the history keeps every run instead of replacing the earlier one', async () => {
    const first = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cvVersionId, targetRoleTitle: 'Full-Stack Engineer' },
    });
    const second = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cvVersionId, targetRoleTitle: 'Full-Stack Engineer' },
    });

    assert.notEqual(first.body?.measurementId, second.body?.measurementId);

    const history = await api('GET', `/api/cv/analyses?cvId=${cvId}`, { token: user.token });
    assert.equal(history.status, 200);
    assert.ok(history.body?.measurements?.length >= 2, 'both runs are kept');

    const ids = history.body.measurements.map((entry: { id: string }) => entry.id);
    assert.ok(ids.includes(first.body?.measurementId));
    assert.ok(ids.includes(second.body?.measurementId));
  });

  test("another candidate's version cannot be measured", async () => {
    const other = await createTestUser('cv-analysis-other');
    try {
      const res = await api('POST', '/api/cv/analysis', {
        token: other.token,
        body: { cvVersionId },
      });

      assert.equal(res.status, 404);
      assert.equal(res.body?.code, 'unknown_version');
      assert.equal(res.body?.analysis, undefined);
    } finally {
      await deleteTestUser(other.id);
    }
  });

  test("another candidate's history is not readable", async () => {
    const other = await createTestUser('cv-analysis-other-history');
    try {
      const res = await api('GET', `/api/cv/analyses?cvId=${cvId}`, { token: other.token });
      assert.equal(res.status, 200);
      assert.equal(
        res.body?.measurements?.length,
        0,
        'the history of somebody else is empty, not forbidden'
      );
    } finally {
      await deleteTestUser(other.id);
    }
  });

  test('the stream reports the stages and then the result', async () => {
    const res = await apiText('POST', '/api/cv/analysis/stream', {
      token: user.token,
      body: { cvVersionId, targetRoleTitle: 'Full-Stack Engineer' },
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);

    const events = parseEvents(res.text);
    const stages = events.filter((entry) => entry.event === 'stage');
    assert.ok(stages.length > 0, 'the stages must be reported as they happen');

    const completed = events.filter((entry) => entry.event === 'stage' && entry.data?.status === 'completed');
    assert.ok(completed.length > 0, 'a stage is only closed after it has been done');

    const done = events.find((entry) => entry.event === 'complete');
    assert.ok(done, 'the stream ends with the result');
    assert.equal(typeof done.data.analysis.overallScore, 'number');
    assert.equal(typeof done.data.atsAnalysis.overallScore, 'number');
  });

  test('the stream carries the same measurement as the plain route', async () => {
    const plain = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cvVersionId, targetRoleTitle: 'Full-Stack Engineer' },
    });
    const streamed = await apiText('POST', '/api/cv/analysis/stream', {
      token: user.token,
      body: { cvVersionId, targetRoleTitle: 'Full-Stack Engineer' },
    });

    const done = parseEvents(streamed.text).find((entry) => entry.event === 'complete');
    assert.equal(done?.data?.analysis?.overallScore, plain.body?.analysis?.overallScore);
    assert.deepEqual(
      done?.data?.analysis?.dimensions?.map((entry: { key: string; score: number | null }) => [
        entry.key,
        entry.score,
      ]),
      plain.body?.analysis?.dimensions?.map((entry: { key: string; score: number | null }) => [
        entry.key,
        entry.score,
      ])
    );
  });

  test('the stream needs a session', async () => {
    const res = await apiText('POST', '/api/cv/analysis/stream', { body: { cvVersionId } });
    assert.equal(res.status, 401);
  });
});

describe('the measured analysis is not gated by the legal acceptance', () => {
  let user: TestUser;

  before(async () => {
    // A candidate who has not accepted the current terms.
    user = await createTestUser('cv-analysis-no-consent', { consent: false });
  });

  after(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('a signed-in candidate can still measure their own CV', async () => {
    const res = await api('POST', '/api/cv/analysis', {
      token: user.token,
      body: { cv: CV, targetRoleTitle: 'Full-Stack Engineer' },
    });

    // The measurement is counted on the platform from the candidate's own
    // document: no model is called and nothing leaves the account.
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(typeof res.body?.analysis?.overallScore, 'number');
  });

  test('the gate is still closed for an anonymous caller', async () => {
    const res = await api('POST', '/api/cv/analysis', { body: { cv: CV } });
    assert.equal(res.status, 401);
  });
});

describe('the record of the measured analyses', () => {  let user: TestUser;

  before(async () => {
    user = await createTestUser('cv-analysis-table');
  });

  after(async () => {
    if (user) await deleteTestUser(user.id);
  });

  test('the table holds the whole measurement and who owns it', async () => {
    const { data, error } = await admin
      .from('cv_measurements')
      .select('id, profile_id, cv_id, cv_version_id, target_role_title, overall_score, band, report, created_at')
      .eq('profile_id', user.id)
      .limit(1);

    assert.equal(error, null, JSON.stringify(error));
    assert.ok(Array.isArray(data));
  });

  test('the browser cannot read the table directly', async () => {
    // The analysis is produced and read by the server. A browser that got
    // hold of the anon or the authenticated key must not be able to write a
    // score that no document supports, or read anybody else's.
    const { error } = await user.client.from('cv_measurements').select('*').limit(1);
    assert.ok(error, 'the table must not be readable with the client key');
  });
});
