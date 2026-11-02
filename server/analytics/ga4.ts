/**
 * Google Analytics 4 — the Data API.
 *
 * This is the server half of the measurement. The browser reports events with
 * `src/lib/analytics.ts`; this module reads the property back so the
 * administration centre can show what actually happened.
 *
 * How the server authenticates
 * -----------------------------
 *
 * The Data API speaks OAuth 2.0. Google offers two ways to hold that token in
 * a server that is not itself running on Google Cloud:
 *
 *   1. a service account with a downloaded JSON key, which signs a JWT and
 *      exchanges it for an access token (the `jwt-bearer` grant);
 *   2. an OAuth client that a person authorised once, which holds a refresh
 *      token and exchanges it for an access token (the `refresh_token` grant).
 *
 * This module uses the second one. The first one needs a private key that
 * never expires and can only be withdrawn by deleting it in the Google
 * console, and the organisation this product runs in forbids creating such
 * keys at all. The refresh token is better behaved in every way that matters:
 * Google keeps it revocable from the account that granted it, it is bound to
 * one read-only scope, and the token it produces is short-lived.
 *
 * The exchange happens here, on the server, on demand: the refresh token is
 * kept in a secret, the access token it produces lives in memory for an hour,
 * and the browser only ever receives the numbers.
 *
 * When the credentials are absent the module reports that it is not
 * connected and returns nothing else. The administration centre then shows
 * the setup instructions rather than a broken panel — the measurement keeps
 * working, the reporting simply is not wired up yet.
 */

import { ANALYTICS_EVENTS, ANALYTICS_FUNNEL } from '../../shared/analyticsEvents.ts';

/** The Data API endpoint. */
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';

/** The OAuth 2.0 token endpoint. */
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** The scope the Data API needs. It is read-only by construction. */
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

/** How long a report is reused before it is asked for again. */
const CACHE_TTL_MS = 10 * 60 * 1000;

/** The message shown when the integration has no credentials at all. */
const NOT_CONNECTED_MESSAGE =
  'Google Analytics is not connected. Add the property id, the OAuth client id, the OAuth client secret and a refresh token to the environment to see traffic here.';

/* -------------------------------------------------------------------------- */
/* Configuration                                                               */
/* -------------------------------------------------------------------------- */

/** The credentials of the property, when they are configured. */
export interface Ga4Config {
  /** The numeric property id, without the `properties/` prefix. */
  propertyId: string;
  /** The OAuth client id of the Google Cloud project. */
  clientId: string;
  /** The OAuth client secret of the Google Cloud project. */
  clientSecret: string;
  /** The refresh token a person granted to that client. */
  refreshToken: string;
}

/**
 * Reads the configuration from the environment.
 *
 * `null` means the integration is not configured. All four values are server
 * secrets: they are read from the environment of the deployment and never
 * sent to the browser.
 */
export function ga4Config(): Ga4Config | null {
  const propertyId = (process.env.GA4_PROPERTY_ID ?? '').trim();
  const clientId = (process.env.GA4_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.GA4_CLIENT_SECRET ?? '').trim();
  const refreshToken = (process.env.GA4_REFRESH_TOKEN ?? '').trim();

  if (!propertyId || !clientId || !clientSecret || !refreshToken) return null;

  return { propertyId, clientId, clientSecret, refreshToken };
}

/** Whether the Data API is configured on this deployment. */
export function isGa4Configured(): boolean {
  return ga4Config() !== null;
}

/* -------------------------------------------------------------------------- */
/* The report shapes                                                           */
/* -------------------------------------------------------------------------- */

/** The numbers of one period. */
export interface Ga4Period {
  /** The active users of the period. */
  activeUsers: number;
  /** The sessions of the period. */
  sessions: number;
  /** The page views of the period. */
  pageViews: number;
}

/** A row of the traffic-source report. */
export interface Ga4Source {
  /** The referring source, e.g. "google" or "direct". */
  source: string;
  /** The channel group, e.g. "Organic Search". */
  channel: string;
  /** The sessions it produced. */
  sessions: number;
  /** The users it produced. */
  users: number;
}

/** A row of the top-pages report. */
export interface Ga4Page {
  /** The path of the page. */
  path: string;
  /** The title of the page. */
  title: string;
  /** The page views it received. */
  views: number;
  /** The users it reached. */
  users: number;
}

/** A row of the devices report. */
export interface Ga4Device {
  /** The device category, e.g. "mobile". */
  device: string;
  /** The sessions it produced. */
  sessions: number;
  /** The users it reached. */
  users: number;
}

/** A row of the geography report. */
export interface Ga4Country {
  /** The country, as GA4 reports it. */
  country: string;
  /** The users it reached. */
  users: number;
  /** The sessions it produced. */
  sessions: number;
}

/** A step of the conversion funnel. */
export interface Ga4FunnelStep {
  /** The name of the step, for the display. */
  step: string;
  /** The event that records the step. */
  event: string;
  /** The number of times the event was recorded. */
  count: number;
  /** The number of users the event reached. */
  users: number;
  /** The share of the first step, between 0 and 1. */
  rate: number;
}

/** Everything the administration centre shows about traffic. */
export interface Ga4TrafficReport {
  /** Whether the property is connected at all. */
  connected: boolean;
  /** The property the numbers came from. */
  propertyId?: string;
  /** When the report was produced. */
  measuredAt: string;
  /** Today. */
  today: Ga4Period;
  /** The last seven days. */
  last7Days: Ga4Period;
  /** The last thirty days. */
  last30Days: Ga4Period;
  /** The all-time totals. */
  totals: {
    /** The users the property has ever seen. */
    totalUsers: number;
    /** The users seen for the first time in the last thirty days. */
    newUsers: number;
    /** The users seen before in the last thirty days. */
    returningUsers: number;
  };
  /** Where the traffic came from. */
  sources: Ga4Source[];
  /** The pages that were read. */
  topPages: Ga4Page[];
  /** The devices the traffic came from. */
  devices: Ga4Device[];
  /** The countries the traffic came from. */
  countries: Ga4Country[];
  /** The journey through the product. */
  funnel: Ga4FunnelStep[];
  /** Why the report is empty, when it is empty for a reason. */
  message?: string;
}

/** The report returned when the property is not connected. */
function disconnectedReport(message: string): Ga4TrafficReport {
  const empty = { activeUsers: 0, sessions: 0, pageViews: 0 };
  return {
    connected: false,
    measuredAt: new Date().toISOString(),
    today: { ...empty },
    last7Days: { ...empty },
    last30Days: { ...empty },
    totals: { totalUsers: 0, newUsers: 0, returningUsers: 0 },
    sources: [],
    topPages: [],
    devices: [],
    countries: [],
    funnel: [],
    message,
  };
}

/* -------------------------------------------------------------------------- */
/* The client                                                                  */
/* -------------------------------------------------------------------------- */

/** How the client reaches Google. */
export interface Ga4ClientOptions {
  /** The credentials to use. */
  config: Ga4Config;
  /** The fetch implementation. Defaults to the global one. */
  fetchImpl?: typeof fetch;
  /** The clock, in milliseconds. Defaults to the system one. */
  now?: () => number;
}

/** A client that reads one property. */
export interface Ga4Client {
  /** Reads the traffic report, or explains why it could not be read. */
  fetchTrafficReport(): Promise<Ga4TrafficReport>;
  /** Forgets the cached access token, so the next call asks Google for one. */
  invalidateToken(): void;
}

/**
 * Raised when Google rejects the access token itself.
 *
 * A rejected token is not a failure of the integration: the token may simply
 * have been revoked, or the deployment may have been running longer than the
 * token lived. The client answers it with a fresh token and one retry.
 */
class Ga4TokenRejected extends Error {}

/**
 * Creates a client for one property.
 *
 * The client holds the access token and the report in memory for as long as
 * they are valid. Nothing is written to disk, and nothing is shared between
 * two clients.
 */
export function createGa4Client(options: Ga4ClientOptions): Ga4Client {
  const { config } = options;
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  /** The cached access token and the moment it stops being valid. */
  let cachedToken: { value: string; expiresAt: number } | null = null;
  /** The cache of the whole report. */
  let cachedReport: { value: Ga4TrafficReport; expiresAt: number } | null = null;

  /**
   * Exchanges the refresh token for an access token.
   *
   * The token Google returns is short-lived. It is kept until shortly before
   * it expires and then asked for again, so the deployment always holds a
   * valid token and never a stored copy of the refresh token beyond the one
   * in the environment.
   */
  async function accessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > now()) return cachedToken.value;

    const response = await doFetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      throw new Error(await tokenFailureMessage(response));
    }

    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!payload.access_token) {
      throw new Error('Google did not return an access token for the analytics request.');
    }

    // The authorisation is only useful if it may read the property. A grant
    // that was made without the read-only scope is reported as such, so the
    // operator knows to authorise it again rather than to look for a bug.
    const granted = typeof payload.scope === 'string' ? payload.scope : '';
    if (granted && !granted.includes('analytics.readonly')) {
      throw new Error(
        `The Google authorisation of this integration does not include ${SCOPE}. Authorise it again with that scope.`
      );
    }

    cachedToken = {
      value: payload.access_token,
      expiresAt: now() + Math.max(60, (payload.expires_in ?? 3600) - 120) * 1000,
    };
    return cachedToken.value;
  }

  /**
   * Describes a failed token exchange.
   *
   * Only the error code Google returned is used. The body of the response is
   * never echoed, so nothing that was sent to Google can come back out of
   * this function and reach a log or a response body.
   */
  async function tokenFailureMessage(response: Response): Promise<string> {
    const code = await readErrorCode(response);
    if (code === 'invalid_grant') {
      return 'Google refused the stored analytics authorisation (invalid_grant). Authorise the integration again to restore this panel.';
    }
    if (code === 'invalid_client') {
      return 'Google rejected the OAuth client of this deployment (invalid_client). Check the client id and the client secret.';
    }
    if (code === 'unauthorized_client') {
      return 'The OAuth client of this deployment is not allowed to use this grant (unauthorized_client).';
    }
    return `Google refused the analytics authorisation of this deployment (${code ?? 'unknown error'}).`;
  }

  /**
   * Runs one report against the property.
   *
   * The function throws on failure: the caller decides whether that is fatal.
   */
  async function runReport(token: string, request: ReportRequest): Promise<ReportResponse> {
    const response = await doFetch(
      `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runReport`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    );

    if (response.status === 401) {
      throw new Ga4TokenRejected('The analytics access token was rejected by Google (401).');
    }

    if (!response.ok) {
      throw new Error(await reportFailureMessage(response));
    }

    return (await response.json()) as ReportResponse;
  }

  /**
   * Describes a failed report.
   *
   * As with the token exchange, the body of the response is not echoed: only
   * the status is used, so a credential can never travel back out through an
   * error message.
   */
  async function reportFailureMessage(response: Response): Promise<string> {
    const status = response.status;
    if (status === 403) {
      return 'Google refused the request: the authorised account has no read access to this property (403).';
    }
    if (status === 404) {
      return 'Google does not know this property id (404). Check the property id of the integration.';
    }
    if (status === 429) {
      return 'The Google Analytics Data API is rate-limiting this deployment (429). Try again shortly.';
    }
    return `The Google Analytics Data API could not be read (${status}).`;
  }

  /**
   * Builds the whole traffic report.
   *
   * The calls are made in parallel: the Data API allows it, and the dashboard
   * should not wait for six reports in sequence.
   */
  async function buildReport(): Promise<Ga4TrafficReport> {
    const token = await accessToken();
    try {
      return await runAllReports(token);
    } catch (error) {
      if (!(error instanceof Ga4TokenRejected)) throw error;
      // The token was refused. It may have been revoked, or it may have been
      // issued to a client that has since changed. A new one is asked for and
      // the report is tried once more.
      cachedToken = null;
      const fresh = await accessToken();
      return await runAllReports(fresh);
    }
  }

  /** The six reports of the panel, read in parallel. */
  async function runAllReports(token: string): Promise<Ga4TrafficReport> {
    const today = new Date().toISOString().slice(0, 10);

    const [
      periods,
      totals,
      sources,
      topPages,
      devices,
      countries,
      funnel,
    ] = await Promise.all([
      // Today, the last seven days and the last thirty days, in one report.
      runReport(token, {
        dateRanges: [
          { startDate: today, endDate: today },
          { startDate: daysAgo(6), endDate: today },
          { startDate: daysAgo(29), endDate: today },
        ],
        dimensions: [{ name: 'dateRange' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
      }),
      runReport(token, {
        dateRanges: [{ startDate: daysAgo(29), endDate: today }],
        metrics: [
          { name: 'totalUsers' },
          { name: 'newUsers' },
          { name: 'returningUsers' },
        ],
      }),
      runReport(token, {
        dateRanges: [{ startDate: daysAgo(29), endDate: today }],
        dimensions: [{ name: 'sessionSource' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 12,
      }),
      runReport(token, {
        dateRanges: [{ startDate: daysAgo(29), endDate: today }],
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 15,
      }),
      runReport(token, {
        dateRanges: [{ startDate: daysAgo(29), endDate: today }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 8,
      }),
      runReport(token, {
        dateRanges: [{ startDate: daysAgo(29), endDate: today }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
        limit: 12,
      }),
      runReport(token, {
        dateRanges: [{ startDate: daysAgo(29), endDate: today }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: { values: ANALYTICS_EVENTS },
          },
        },
        limit: 50,
      }),
    ]);

    const periodRows = periods.rows ?? [];
    const readPeriod = (index: number) => {
      const row = periodRows[index];
      if (!row) return { activeUsers: 0, sessions: 0, pageViews: 0 };
      return {
        activeUsers: metric(row, 0),
        sessions: metric(row, 1),
        pageViews: metric(row, 2),
      };
    };

    const totalRow = totals.rows?.[0];

    const funnelCounts = new Map<string, { count: number; users: number }>();
    for (const row of funnel.rows ?? []) {
      funnelCounts.set(dimension(row, 0), {
        count: metric(row, 0),
        users: metric(row, 1),
      });
    }

    const funnelUsers = FUNNEL_STEPS.map((entry) => funnelCounts.get(entry.event)?.users ?? 0);
    const firstStepUsers = funnelUsers[0] ?? 0;

    return {
      connected: true,
      propertyId: config.propertyId,
      measuredAt: new Date().toISOString(),
      today: readPeriod(0),
      last7Days: readPeriod(1),
      last30Days: readPeriod(2),
      totals: {
        totalUsers: totalRow ? metric(totalRow, 0) : 0,
        newUsers: totalRow ? metric(totalRow, 1) : 0,
        returningUsers: totalRow ? metric(totalRow, 2) : 0,
      },
      sources: (sources.rows ?? []).map((row) => ({
        source: dimension(row, 0) || '(direct)',
        channel: dimension(row, 1) || 'Unknown',
        sessions: metric(row, 0),
        users: metric(row, 1),
      })),
      topPages: (topPages.rows ?? []).map((row) => ({
        path: dimension(row, 0),
        title: dimension(row, 1),
        views: metric(row, 0),
        users: metric(row, 1),
      })),
      devices: (devices.rows ?? []).map((row) => ({
        device: dimension(row, 0) || 'unknown',
        sessions: metric(row, 0),
        users: metric(row, 1),
      })),
      countries: (countries.rows ?? []).map((row) => ({
        country: dimension(row, 0) || '(unknown)',
        users: metric(row, 0),
        sessions: metric(row, 1),
      })),
      funnel: FUNNEL_STEPS.map((entry, index) => ({
        step: entry.step,
        event: entry.event,
        count: funnelCounts.get(entry.event)?.count ?? 0,
        users: funnelUsers[index],
        rate: firstStepUsers > 0 ? funnelUsers[index] / firstStepUsers : 0,
      })),
    };
  }

  return {
    async fetchTrafficReport(): Promise<Ga4TrafficReport> {
      if (cachedReport && cachedReport.expiresAt > now()) return cachedReport.value;

      try {
        const report = await buildReport();
        cachedReport = { value: report, expiresAt: now() + CACHE_TTL_MS };
        return report;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'The analytics report could not be read.';
        // The message is written on its own: the error object may carry more
        // than the deployment should ever print.
        console.error('GA4 traffic report failed:', message);
        // A failure to read the property is not a failure of the application:
        // the dashboard says so and the measurement keeps running.
        return { ...disconnectedReport(message), connected: true, propertyId: config.propertyId };
      }
    },
    invalidateToken(): void {
      cachedToken = null;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The Data API                                                                */
/* -------------------------------------------------------------------------- */

/** A dimension and a metric of a report request. */
interface ReportRequest {
  dimensions?: Array<{ name: string }>;
  metrics?: Array<{ name: string }>;
  dateRanges?: Array<{ startDate: string; endDate: string }>;
  dimensionFilter?: unknown;
  metricFilter?: unknown;
  limit?: number;
  orderBys?: Array<{ metric?: { metricName: string }; dimension?: { dimensionName: string }; desc?: boolean }>;
  keepEmptyRows?: boolean;
}

/** One row of a Data API response. */
interface ReportRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

/** A Data API response. */
interface ReportResponse {
  rows?: ReportRow[];
  rowCount?: number;
}

/** Reads a dimension of a row. */
function dimension(row: ReportRow, index: number): string {
  return row.dimensionValues?.[index]?.value ?? '';
}

/** Reads a metric of a row as a number. */
function metric(row: ReportRow, index: number): number {
  const raw = row.metricValues?.[index]?.value;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reads the error code of a failed Google response.
 *
 * Only the code is taken. The rest of the body is discarded, so nothing that
 * was sent to Google can be echoed back into a log or a response.
 */
async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload?.error === 'string') return payload.error;
    if (payload?.error && typeof payload.error === 'object') {
      const status = (payload.error as { status?: unknown }).status;
      if (typeof status === 'string') return status;
    }
    return null;
  } catch {
    return null;
  }
}

/** The names of the funnel steps, in the order they happen. */
const FUNNEL_STEPS = ANALYTICS_FUNNEL;

/** The number of days a date range covers, ending today. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* The deployment                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The client of this deployment.
 *
 * It is created once and kept, so that the access token it holds is reused
 * between the requests of the panel instead of being asked for again for
 * every one of them. The credentials it was built with are compared on every
 * call, so a rotated secret is picked up instead of being ignored.
 */
let deploymentClient: { config: Ga4Config; client: Ga4Client } | null = null;

function deploymentGa4Client(config: Ga4Config): Ga4Client {
  const current = deploymentClient?.config;
  const unchanged =
    current !== undefined &&
    current.propertyId === config.propertyId &&
    current.clientId === config.clientId &&
    current.clientSecret === config.clientSecret &&
    current.refreshToken === config.refreshToken;

  if (!unchanged) {
    deploymentClient = { config, client: createGa4Client({ config }) };
  }
  return deploymentClient!.client;
}

/**
 * The traffic report.
 *
 * The report is cached for ten minutes: the Data API charges quota per
 * request, and a dashboard that is refreshed every few seconds does not need
 * numbers that new.
 */
export async function fetchTrafficReport(): Promise<Ga4TrafficReport> {
  const config = ga4Config();
  if (!config) return disconnectedReport(NOT_CONNECTED_MESSAGE);

  return deploymentGa4Client(config).fetchTrafficReport();
}
