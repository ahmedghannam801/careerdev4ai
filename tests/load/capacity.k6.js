import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween } from 'k6';

const errors = new Rate('api_error_rate');
const throttles = new Counter('api_429_count');
const authenticatedLatency = new Trend('authenticated_api_latency', true);

const STAGES = {
  '10': [{ duration: '5m', target: 10 }],
  '25': [{ duration: '5m', target: 25 }],
  '50': [{ duration: '10m', target: 50 }],
  '100': [{ duration: '10m', target: 100 }],
  '150': [{ duration: '5m', target: 150 }],
  soak: [{ duration: '30m', target: 50 }],
};

const stage = __ENV.STAGE || '10';
const baseUrl = (__ENV.STAGING_BASE_URL || '').replace(/\/$/, '');
const expectedHost = (__ENV.STAGING_HOST || '').toLowerCase();
const bearerToken = __ENV.TEST_BEARER_TOKEN || '';

function validateTarget() {
  if (__ENV.ALLOW_STAGING_LOAD_TEST !== 'YES') {
    throw new Error('Refusing to run: set ALLOW_STAGING_LOAD_TEST=YES only after confirming this is isolated staging.');
  }
  if (!baseUrl || !expectedHost || !bearerToken) {
    throw new Error('Required: STAGING_BASE_URL, STAGING_HOST and short-lived TEST_BEARER_TOKEN.');
  }
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (_) {
    throw new Error('STAGING_BASE_URL must be an absolute HTTPS URL.');
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || host !== expectedHost) {
    throw new Error('Refusing to run: require HTTPS and an exact STAGING_HOST match.');
  }
  // Both production origins are refused: the current one and the predecessor
  // that is still serving during the domain migration.
  if (
    host === 'roadmapak.pages.dev' ||
    host === 'careerdev4ai.pages.dev' ||
    host.endsWith('.supabase.co')
  ) {
    throw new Error('Refusing known production/API hostnames.');
  }
  if (!Object.prototype.hasOwnProperty.call(STAGES, stage)) {
    throw new Error(`Unknown STAGE '${stage}'. Choose 10, 25, 50, 100, 150, or soak.`);
  }
}

validateTarget();

export const options = {
  scenarios: {
    authenticated_read_mix: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: STAGES[stage],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    api_error_rate: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    authenticated_api_latency: ['p(95)<1000'],
    api_429_count: ['count<100'],
  },
  userAgent: 'Roadmapak-staging-capacity-test/k6',
};

const endpoints = [
  { path: '/api/state', weight: 5 },
  { path: '/api/credits/balance', weight: 2 },
  { path: '/api/subscription/current', weight: 1 },
  { path: '/api/referrals/me', weight: 1 },
  { path: '/api/background-jobs', weight: 2 },
  { path: '/api/background-jobs/availability', weight: 1 },
];
const totalWeight = endpoints.reduce((sum, endpoint) => sum + endpoint.weight, 0);

function chooseEndpoint() {
  let pick = randomIntBetween(1, totalWeight);
  for (const endpoint of endpoints) {
    pick -= endpoint.weight;
    if (pick <= 0) return endpoint;
  }
  return endpoints[0];
}

export default function () {
  const endpoint = chooseEndpoint();
  const response = http.get(`${baseUrl}${endpoint.path}`, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/json',
    },
    tags: { route: endpoint.path, test_type: 'authenticated-read-only' },
    timeout: '30s',
  });

  authenticatedLatency.add(response.timings.duration, { route: endpoint.path });
  if (response.status === 429) throttles.add(1);
  const ok = check(response, {
    'response is not a server error': (r) => r.status < 500,
    'authenticated read returned success': (r) => r.status >= 200 && r.status < 300,
  });
  errors.add(!ok);

  // Simulate user think time and limit request intensity per virtual user.
  sleep(randomIntBetween(2, 5));
}
