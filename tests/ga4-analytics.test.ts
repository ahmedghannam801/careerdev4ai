/**
 * The Admin Center traffic dashboard and the Google credential behind it.
 *
 * The dashboard reads the GA4 property from the server. The credential it uses
 * was changed from a service-account private key to an OAuth 2.0 client with a
 * refresh token, because the organisation forbids creating service-account
 * keys and because a private key can never be withdrawn without deleting it
 * in the Google console. These tests lock the behaviour of the new scheme:
 *
 *   1. the server exchanges the refresh token for a short-lived access token
 *      and reads the property with it;
 *   2. the access token is reused until it expires, and is asked for again
 *      after it does — also when Google rejects it;
 *   3. a refused authorisation and a failing Data API are reported without
 *      taking the application down;
 *   4. no credential ever reaches a response body, a log line or the browser
 *      bundle;
 *   5. the route keeps the gate it had: a session, an administrator role and
 *      the `analytics.read` permission.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  createGa4Client,
  fetchTrafficReport,
  ga4Config,
  isGa4Configured,
  type Ga4Config,
  type Ga4TrafficReport,
} from '../server/analytics/ga4.ts';
import { ANALYTICS_FUNNEL } from '../shared/analyticsEvents.ts';
import { admin, api, apiAnonymous, createTestUser, deleteTestUser, type TestUser } from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const PROPERTY_ID = '123456789';

/** The credentials of the test deployment. None of them is a real secret. */
const CONFIG: Ga4Config = {
  propertyId: PROPERTY_ID,
  clientId: 'test-client-id.apps.googleusercontent.com',
  clientSecret: 'test-client-secret-value',
  refreshToken: 'test-refresh-token-value',
};

/** The read-only scope the Data API needs. */
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

/** One request the fake Google received. */
interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** The answers the fake Google gives. */
interface FakeGoogleOptions {
  /** The token responses, one per call. The last one is repeated. */
  token?: Array<{ status: number; body: unknown }>;
  /** The Data API answer, decided per request. */
  report?: (request: any, callIndex: number) => { status: number; body: unknown };
}

/** A JSON response, as Google would send it. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The rows of a Data API answer, shaped by the request that asked for them. */
function dataApiAnswer(request: any): unknown {
  const dimensions = (request?.dimensions ?? []).map((dimension: any) => dimension.name);

  if (dimensions.includes('dateRange')) {
    return {
      rows: [
        { dimensionValues: [{ value: '0' }], metricValues: [{ value: '10' }, { value: '12' }, { value: '30' }] },
        { dimensionValues: [{ value: '1' }], metricValues: [{ value: '40' }, { value: '50' }, { value: '120' }] },
        { dimensionValues: [{ value: '2' }], metricValues: [{ value: '150' }, { value: '200' }, { value: '600' }] },
      ],
    };
  }
  if (dimensions.includes('sessionSource')) {
    return {
      rows: [
        {
          dimensionValues: [{ value: 'google' }, { value: 'Organic Search' }],
          metricValues: [{ value: '100' }, { value: '90' }],
        },
      ],
    };
  }
  if (dimensions.includes('pagePath')) {
    return {
      rows: [
        {
          dimensionValues: [{ value: '/pricing' }, { value: 'Pricing' }],
          metricValues: [{ value: '70' }, { value: '60' }],
        },
      ],
    };
  }
  if (dimensions.includes('deviceCategory')) {
    return {
      rows: [
        {
          dimensionValues: [{ value: 'mobile' }],
          metricValues: [{ value: '200' }, { value: '150' }],
        },
      ],
    };
  }
  if (dimensions.includes('country')) {
    return {
      rows: [
        {
          dimensionValues: [{ value: 'Egypt' }],
          metricValues: [{ value: '120' }, { value: '90' }],
        },
      ],
    };
  }
  if (dimensions.includes('eventName')) {
    return {
      rows: ANALYTICS_FUNNEL.map((entry, index) => ({
        dimensionValues: [{ value: entry.event }],
        metricValues: [{ value: String(40 - index) }, { value: String(20 - index) }],
      })),
    };
  }
  // The totals report asks for metrics only.
  return {
    rows: [{ metricValues: [{ value: '1000' }, { value: '120' }, { value: '880' }] }],
  };
}

/** A fake Google that records what it was asked. */
function createFakeGoogle(options: FakeGoogleOptions = {}) {
  const calls: RecordedCall[] = [];
  let tokenCalls = 0;
  let reportCalls = 0;

  const fetchImpl = (async (input: any, init: any = {}) => {
    const url = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers ?? {};
    if (typeof rawHeaders.forEach === 'function' && !Array.isArray(rawHeaders)) {
      rawHeaders.forEach((value: string, key: string) => {
        headers[String(key).toLowerCase()] = String(value);
      });
    } else {
      for (const [key, value] of Object.entries(rawHeaders)) {
        headers[String(key).toLowerCase()] = String(value);
      }
    }
    const body = typeof init?.body === 'string' ? init.body : '';
    calls.push({ url, method, headers, body });

    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      const answers = options.token ?? [
        { status: 200, body: { access_token: 'access-token-1', expires_in: 3600, scope: SCOPE } },
      ];
      const chosen = answers[Math.min(tokenCalls, answers.length - 1)];
      tokenCalls += 1;
      return jsonResponse(chosen.status, chosen.body);
    }

    if (url.includes('analyticsdata.googleapis.com')) {
      const request = body ? JSON.parse(body) : {};
      const index = reportCalls;
      reportCalls += 1;
      const chosen = options.report
        ? options.report(request, index)
        : { status: 200, body: dataApiAnswer(request) };
      return jsonResponse(chosen.status, chosen.body);
    }

    throw new Error(`the fake Google was asked something unexpected: ${url}`);
  }) as unknown as typeof fetch;

  return {
    calls,
    fetchImpl,
    tokenCalls: () => tokenCalls,
    reportCalls: () => reportCalls,
    /** The calls that went to the token endpoint. */
    tokenRequests: () => calls.filter((call) => call.url.startsWith('https://oauth2.googleapis.com/token')),
    /** The calls that went to the Data API. */
    reportRequests: () => calls.filter((call) => call.url.includes('analyticsdata.googleapis.com')),
  };
}

/** A clock the test moves by hand. */
function createClock() {
  let current = Date.UTC(2026, 0, 1, 12, 0, 0);
  return {
    now: () => current,
    advance(milliseconds: number) {
      current += milliseconds;
    },
  };
}

/** Captures what the module writes to the console while it runs. */
async function captureConsole(run: () => Promise<unknown>): Promise<{ lines: string[]; result: unknown }> {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    const result = await run();
    return { lines, result };
  } finally {
    console.error = original;
  }
}

/* -------------------------------------------------------------------------- */
/* The credential                                                               */
/* -------------------------------------------------------------------------- */

describe('the Google credential of the analytics', () => {
  it('is not configured when the environment is empty', () => {
    const saved = { ...process.env };
    delete process.env.GA4_PROPERTY_ID;
    delete process.env.GA4_CLIENT_ID;
    delete process.env.GA4_CLIENT_SECRET;
    delete process.env.GA4_REFRESH_TOKEN;
    try {
      assert.equal(ga4Config(), null);
      assert.equal(isGa4Configured(), false);
    } finally {
      process.env = saved;
    }
  });

  it('is not configured while one of the four values is missing', () => {
    const saved = { ...process.env };
    process.env.GA4_PROPERTY_ID = PROPERTY_ID;
    process.env.GA4_CLIENT_ID = CONFIG.clientId;
    process.env.GA4_CLIENT_SECRET = CONFIG.clientSecret;
    delete process.env.GA4_REFRESH_TOKEN;
    try {
      assert.equal(ga4Config(), null);
    } finally {
      process.env = saved;
    }
  });

  it('is configured when all four values are present', () => {
    const saved = { ...process.env };
    process.env.GA4_PROPERTY_ID = PROPERTY_ID;
    process.env.GA4_CLIENT_ID = CONFIG.clientId;
    process.env.GA4_CLIENT_SECRET = CONFIG.clientSecret;
    process.env.GA4_REFRESH_TOKEN = CONFIG.refreshToken;
    try {
      assert.deepEqual(ga4Config(), {
        propertyId: PROPERTY_ID,
        clientId: CONFIG.clientId,
        clientSecret: CONFIG.clientSecret,
        refreshToken: CONFIG.refreshToken,
      });
      assert.equal(isGa4Configured(), true);
    } finally {
      process.env = saved;
    }
  });

  it('no longer knows how to read a service-account private key', () => {
    const source = readFileSync(join(REPO_ROOT, 'server/analytics/ga4.ts'), 'utf8');
    assert.equal(source.includes('GA4_PRIVATE_KEY'), false);
    assert.equal(source.includes('GA4_SERVICE_ACCOUNT_EMAIL'), false);
    assert.equal(source.includes('BEGIN PRIVATE KEY'), false);
    // No assertion is signed any more: there is no key and no self-issued JWT.
    assert.equal(source.includes('urn:ietf:params:oauth:grant-type:jwt-bearer'), false);
    assert.equal(source.includes('crypto.subtle'), false);
    assert.equal(source.includes('RS256'), false);
    // What is left is the refresh-token grant.
    assert.equal(source.includes('grant_type: \'refresh_token\''), true);
  });
});

/* -------------------------------------------------------------------------- */
/* The exchange                                                                 */
/* -------------------------------------------------------------------------- */

describe('the analytics authentication', () => {
  it('exchanges the refresh token for an access token and reads the property', async () => {
    const google = createFakeGoogle();
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.equal(report.connected, true);
    assert.equal(report.propertyId, PROPERTY_ID);

    // The token was asked for from Google's OAuth endpoint, with the refresh
    // token grant — not with a self-signed assertion.
    assert.equal(google.tokenCalls(), 1);
    const tokenRequest = google.tokenRequests()[0];
    assert.equal(tokenRequest.method, 'POST');
    assert.equal(tokenRequest.url, 'https://oauth2.googleapis.com/token');
    assert.match(tokenRequest.body, /grant_type=refresh_token/);
    assert.match(tokenRequest.body, /client_id=test-client-id/);
    assert.equal(tokenRequest.body.includes('assertion'), false);

    // The property was read with the short-lived access token.
    assert.equal(google.reportCalls(), 7);
    for (const request of google.reportRequests()) {
      assert.equal(request.headers.authorization, 'Bearer access-token-1');
      assert.match(request.url, /^https:\/\/analyticsdata\.googleapis\.com\/v1beta\/properties\/123456789:runReport$/);
    }
  });

  it('turns the answer of the property into the numbers of the panel', async () => {
    const google = createFakeGoogle();
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.deepEqual(report.today, { activeUsers: 10, sessions: 12, pageViews: 30 });
    assert.deepEqual(report.last7Days, { activeUsers: 40, sessions: 50, pageViews: 120 });
    assert.deepEqual(report.last30Days, { activeUsers: 150, sessions: 200, pageViews: 600 });
    assert.deepEqual(report.totals, { totalUsers: 1000, newUsers: 120, returningUsers: 880 });
    assert.equal(report.sources[0].source, 'google');
    assert.equal(report.sources[0].channel, 'Organic Search');
    assert.equal(report.sources[0].sessions, 100);
    assert.equal(report.topPages[0].path, '/pricing');
    assert.equal(report.topPages[0].views, 70);
    assert.equal(report.devices[0].device, 'mobile');
    assert.equal(report.countries[0].country, 'Egypt');
    assert.equal(report.funnel.length, ANALYTICS_FUNNEL.length);
    assert.equal(report.funnel[0].event, ANALYTICS_FUNNEL[0].event);
    assert.equal(report.funnel[0].users, 20);
    assert.equal(report.funnel[0].rate, 1);
    assert.equal(report.funnel[1].rate, 19 / 20);
  });
});

/* -------------------------------------------------------------------------- */
/* The lifetime of the token                                                    */
/* -------------------------------------------------------------------------- */

describe('the lifetime of the access token', () => {
  it('reuses the token while it is valid and asks again once it expired', async () => {
    const google = createFakeGoogle({
      token: [
        { status: 200, body: { access_token: 'access-token-1', expires_in: 3600, scope: SCOPE } },
        { status: 200, body: { access_token: 'access-token-2', expires_in: 3600, scope: SCOPE } },
      ],
    });
    const clock = createClock();
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl, now: clock.now });

    await client.fetchTrafficReport();
    assert.equal(google.tokenCalls(), 1);

    // The report itself is cached for ten minutes; once it is stale the
    // property is read again, with the token that is still valid.
    clock.advance(11 * 60 * 1000);
    await client.fetchTrafficReport();
    assert.equal(google.tokenCalls(), 1, 'a valid token is not asked for again');

    // Once the token has expired a new one is requested.
    clock.advance(60 * 60 * 1000);
    await client.fetchTrafficReport();
    assert.equal(google.tokenCalls(), 2, 'an expired token is replaced');

    const reports = google.reportRequests();
    assert.equal(reports[reports.length - 1].headers.authorization, 'Bearer access-token-2');
  });

  it('asks for a new token when Google rejects the one it holds', async () => {
    const google = createFakeGoogle({
      token: [
        { status: 200, body: { access_token: 'access-token-1', expires_in: 3600, scope: SCOPE } },
        { status: 200, body: { access_token: 'access-token-2', expires_in: 3600, scope: SCOPE } },
      ],
      // The first seven calls are the first attempt; they are refused.
      report: (_request, index) =>
        index < 7
          ? { status: 401, body: { error: { code: 401, status: 'UNAUTHENTICATED' } } }
          : { status: 200, body: dataApiAnswer(_request) },
    });
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.equal(report.connected, true);
    assert.equal(google.tokenCalls(), 2, 'a refused token is replaced once');
    const reports = google.reportRequests();
    assert.equal(reports[reports.length - 1].headers.authorization, 'Bearer access-token-2');
  });
});

/* -------------------------------------------------------------------------- */
/* The failures                                                                 */
/* -------------------------------------------------------------------------- */

describe('a failing Google', () => {
  it('reports a refused authorisation without calling the property', async () => {
    const google = createFakeGoogle({
      token: [{ status: 400, body: { error: 'invalid_grant', error_description: 'Bad Request' } }],
    });
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.equal(report.connected, true);
    assert.equal(report.propertyId, PROPERTY_ID);
    assert.match(String(report.message), /invalid_grant/);
    assert.equal(google.reportCalls(), 0, 'the property is not read without a token');
  });

  it('reports a rejected OAuth client', async () => {
    const google = createFakeGoogle({
      token: [{ status: 401, body: { error: 'invalid_client' } }],
    });
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.match(String(report.message), /invalid_client/);
    assert.match(String(report.message), /client/);
  });

  it('reports an authorisation that was granted without the read-only scope', async () => {
    const google = createFakeGoogle({
      token: [
        {
          status: 200,
          body: {
            access_token: 'access-token-1',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/drive.readonly',
          },
        },
      ],
    });
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.match(String(report.message), /analytics\.readonly/);
  });

  it('reports a property the authorised account may not read', async () => {
    const google = createFakeGoogle({
      report: () => ({
        status: 403,
        body: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'no access' } },
      }),
    });
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.equal(report.connected, true);
    assert.match(String(report.message), /403/);
    assert.match(String(report.message), /no read access/);
  });

  it('reports a failing Data API', async () => {
    const google = createFakeGoogle({
      report: () => ({ status: 500, body: { error: { code: 500, status: 'INTERNAL' } } }),
    });
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.equal(report.connected, true);
    assert.match(String(report.message), /500/);
  });

  it('reports a property id Google does not know', async () => {
    const google = createFakeGoogle({
      report: () => ({ status: 404, body: { error: { code: 404, status: 'NOT_FOUND' } } }),
    });
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const report = await client.fetchTrafficReport();

    assert.match(String(report.message), /404/);
    assert.match(String(report.message), /property id/);
  });
});

/* -------------------------------------------------------------------------- */
/* The absence of leaks                                                         */
/* -------------------------------------------------------------------------- */

describe('the credential never leaves the server', () => {
  it('keeps every secret out of the report and out of the log', async () => {
    const google = createFakeGoogle({
      token: [{ status: 400, body: { error: 'invalid_grant', error_description: 'Bad Request' } }],
    });
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    const { lines, result } = await captureConsole(() => client.fetchTrafficReport());
    const report = result as Ga4TrafficReport;
    const printed = lines.join('\n');
    const serialised = JSON.stringify(report);

    for (const secret of [CONFIG.refreshToken, CONFIG.clientSecret, CONFIG.clientId]) {
      assert.equal(serialised.includes(secret), false, 'the report holds no credential');
      assert.equal(printed.includes(secret), false, 'the log holds no credential');
    }
    assert.equal(serialised.includes('invalid_grant'), true, 'the reason is still reported');
  });

  it('never sends a credential to the Data API', async () => {
    const google = createFakeGoogle();
    const client = createGa4Client({ config: CONFIG, fetchImpl: google.fetchImpl });

    await client.fetchTrafficReport();

    for (const request of google.reportRequests()) {
      assert.equal(request.body.includes(CONFIG.refreshToken), false);
      assert.equal(request.body.includes(CONFIG.clientSecret), false);
      assert.equal(request.url.includes(CONFIG.refreshToken), false);
      assert.equal(request.url.includes(CONFIG.clientSecret), false);
    }
  });

  it('does not read a property it has no credentials for', async () => {
    const saved = { ...process.env };
    delete process.env.GA4_PROPERTY_ID;
    delete process.env.GA4_CLIENT_ID;
    delete process.env.GA4_CLIENT_SECRET;
    delete process.env.GA4_REFRESH_TOKEN;
    try {
      const report = await fetchTrafficReport();
      assert.equal(report.connected, false);
      assert.match(String(report.message), /not connected/);
      assert.match(String(report.message), /GA4_CLIENT_ID|client id/);
    } finally {
      process.env = saved;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The browser                                                                  */
/* -------------------------------------------------------------------------- */

describe('the browser is never given a credential', () => {
  /** Every file of the browser application. */
  function browserSources(directory: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        found.push(...browserSources(path));
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|html)$/.test(entry)) continue;
      found.push(path);
    }
    return found;
  }

  it('reads no GA4 secret from the environment of the browser', () => {
    for (const file of browserSources(join(REPO_ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8');
      assert.equal(
        /import\.meta\.env\.(VITE_)?GA4_(CLIENT_SECRET|REFRESH_TOKEN|PRIVATE_KEY)/.test(source),
        false,
        `${file} reads a GA4 secret from the browser environment`
      );
      assert.equal(
        /process\.env\.GA4_/.test(source),
        false,
        `${file} reads a GA4 secret from the server environment`
      );
      assert.equal(
        /from\s+['"][^'"]*server\/analytics\/ga4/.test(source),
        false,
        `${file} imports the server module of the analytics`
      );
    }
  });

  it('inlines no GA4 secret into the bundle', () => {
    const vite = readFileSync(join(REPO_ROOT, 'vite.config.ts'), 'utf8');
    assert.equal(/GA4/.test(vite), false, 'the build inlines no GA4 variable');
  });

  it('no longer asks for a private key', () => {
    const panel = readFileSync(
      join(REPO_ROOT, 'src/components/admin/TrafficAnalyticsPanel.tsx'),
      'utf8'
    );
    assert.equal(panel.includes('GA4_PRIVATE_KEY'), false);
    assert.equal(panel.includes('GA4_SERVICE_ACCOUNT_EMAIL'), false);
    assert.equal(panel.includes('BEGIN PRIVATE KEY'), false);
    // The names of the variables are shown, so the operator knows what to add.
    assert.equal(panel.includes('GA4_CLIENT_ID'), true);
    assert.equal(panel.includes('GA4_REFRESH_TOKEN'), true);
  });

  it('keeps the browser measurement id, which is public by design', () => {
    const analytics = readFileSync(join(REPO_ROOT, 'src/lib/analytics.ts'), 'utf8');
    assert.equal(analytics.includes('G-KVH4XKTE23'), true);
  });

  it('keeps the Google endpoints out of the built browser bundle', () => {
    const assets = join(REPO_ROOT, 'dist/assets');
    if (!existsSync(assets)) return; // the bundle is not built in this checkout
    for (const file of readdirSync(assets)) {
      if (!file.endsWith('.js')) continue;
      const source = readFileSync(join(assets, file), 'utf8');
      assert.equal(
        source.includes('oauth2.googleapis.com'),
        false,
        `${file} reaches the OAuth token endpoint`
      );
      assert.equal(
        source.includes('analyticsdata.googleapis.com'),
        false,
        `${file} reaches the Data API`
      );
      // The names of the variables may be shown as setup instructions, but a
      // name is never bound to a value.
      for (const name of ['GA4_CLIENT_SECRET', 'GA4_REFRESH_TOKEN', 'GA4_PROPERTY_ID']) {
        assert.equal(source.includes(`${name}=`), false, `${file} binds ${name}`);
        assert.equal(source.includes(`${name}:`), false, `${file} binds ${name}`);
      }
    }
  });

  it('puts the Google credential in the built worker, not in the browser', () => {
    const worker = join(REPO_ROOT, 'dist/_worker.js');
    if (!existsSync(worker)) return; // the bundle is not built in this checkout
    const source = readFileSync(worker, 'utf8');
    assert.equal(source.includes('oauth2.googleapis.com'), true);
    assert.equal(source.includes('grant_type'), true);
    assert.equal(source.includes('GA4_REFRESH_TOKEN'), true);
  });
});

/* -------------------------------------------------------------------------- */
/* The route                                                                    */
/* -------------------------------------------------------------------------- */

describe('the Admin traffic route', () => {
  let normalUser: TestUser;
  let adminUser: TestUser;
  let moderatorUser: TestUser;
  const adminRowIds: string[] = [];

  async function makeAdmin(user: TestUser, role: string): Promise<void> {
    const { data, error } = await admin
      .from('admin_users')
      .insert({
        profile_id: user.id,
        email: user.email,
        full_name: `Test ${role}`,
        role,
        status: 'active',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`could not create the ${role} row: ${error?.message}`);
    adminRowIds.push(data.id);
  }

  before(async () => {
    normalUser = await createTestUser('ga4-normal');
    adminUser = await createTestUser('ga4-admin');
    moderatorUser = await createTestUser('ga4-moderator');
    await makeAdmin(adminUser, 'super_admin');
    await makeAdmin(moderatorUser, 'moderator');
  });

  after(async () => {
    for (const adminId of adminRowIds) {
      await admin.from('admin_users').delete().eq('id', adminId);
    }
    for (const user of [normalUser, adminUser, moderatorUser]) {
      if (user) await deleteTestUser(user);
    }
  });

  it('refuses a caller without a session', async () => {
    const response = await apiAnonymous('GET', '/api/admin/analytics/traffic');
    assert.equal(response.status, 401);
    assert.equal(response.body?.error, 'Unauthorized');
  });

  it('refuses a caller whose token is not a session', async () => {
    const response = await api('GET', '/api/admin/analytics/traffic', { token: 'not-a-session' });
    assert.equal(response.status, 401);
  });

  it('refuses a signed-in user who is not an administrator', async () => {
    const response = await api('GET', '/api/admin/analytics/traffic', { token: normalUser.token });
    assert.equal(response.status, 403);
    assert.equal(response.body?.error, 'Administrator access required');
  });

  it('refuses a moderator, who may not read the analytics', async () => {
    const response = await api('GET', '/api/admin/analytics/traffic', { token: moderatorUser.token });
    assert.equal(response.status, 403);
    assert.match(String(response.body?.error), /analytics\.read/);
  });

  it('answers an administrator without ever showing a credential', async () => {
    const response = await api('GET', '/api/admin/analytics/traffic', { token: adminUser.token });
    assert.equal(response.status, 200);
    assert.equal(response.body?.success, true);
    assert.equal(typeof response.body?.traffic?.connected, 'boolean');
    assert.equal(typeof response.body?.traffic?.measuredAt, 'string');

    const serialised = JSON.stringify(response.body);
    assert.equal(serialised.includes('-----BEGIN'), false);
    assert.equal(serialised.includes('GA4_CLIENT_SECRET'), false);
    assert.equal(serialised.includes('GA4_REFRESH_TOKEN'), false);
    assert.equal(serialised.includes('GA4_PRIVATE_KEY'), false);
    assert.equal(serialised.includes('refresh_token'), false);
    assert.equal(serialised.includes('client_secret'), false);
    assert.equal(serialised.includes('access_token'), false);
  });
});
