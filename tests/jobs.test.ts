/**
 * Live job vacancies.
 *
 * The platform shows three kinds of opportunity, and this suite proves the
 * first one is real and is never confused with the other two:
 *
 *   1. LIVE VACANCIES       — postings the job provider actually returned.
 *   2. OPPORTUNITY CATALOGUE — the platform's own curated programmes.
 *   3. LEARNING RESOURCES   — courses and tutorials.
 *
 * What this suite proves:
 *   1. a provider record becomes a vacancy without anything being invented;
 *   2. a record that cannot be shown honestly is dropped, not completed;
 *   3. an expired posting is never presented as a current opening;
 *   4. repeated postings are collapsed;
 *   5. only the provider's own vocabulary reaches the upstream request;
 *   6. the fit against the candidate's own skills is explained, and is absent
 *      when there is nothing to compare;
 *   7. the provider's failures become states the product can explain;
 *   8. a repeated search is answered from the cache instead of spending quota;
 *   9. the route is private, and it fails safely when no credential is set.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildJobSearchQuery,
  dedupeLiveJobs,
  matchJobToSkills,
  normalizeLiveJob,
  type LiveJob,
} from '../shared/jobs.ts';
import {
  JobSearchError,
  clearJobSearchCache,
  getJobDetails,
  searchJobs,
} from '../server/jsearch/client.ts';
import { api, apiAnonymous, createTestUser, deleteTestUser, type TestUser } from './helpers.ts';

let user: TestUser;

before(async () => {
  user = await createTestUser('jobs');
});

after(async () => {
  await deleteTestUser(user);
});

/** A provider record as the job provider actually sends one. */
function providerJob(overrides: Record<string, unknown> = {}) {
  return {
    job_id: 'abc-123',
    job_title: 'Frontend Engineer',
    employer_name: 'Nile Digital',
    job_city: 'Cairo',
    job_state: 'Cairo Governorate',
    job_country: 'eg',
    job_description: 'Build interfaces for a payments product.',
    job_apply_link: 'https://example.org/apply/abc-123',
    job_url: 'https://example.org/jobs/abc-123',
    job_publisher: 'Example Board',
    job_is_remote: false,
    job_employment_type: 'FULLTIME',
    job_posted_at_datetime: '2026-11-01T09:00:00Z',
    job_offer_expiration_datetime: '2026-12-01T09:00:00Z',
    job_required_skills: ['React', 'TypeScript'],
    job_required_experience: 'Mid',
    job_benefits: ['Health insurance'],
    job_salary: 'EGP 25,000',
    job_min_education: 'Bachelor',
    job_company_logo: 'https://example.org/logo.png',
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* Turning a provider record into a vacancy                                   */
/* -------------------------------------------------------------------------- */

describe('a provider record becomes a vacancy', () => {
  test('every field is carried through exactly as the source stated it', () => {
    const job = normalizeLiveJob(providerJob());

    assert.ok(job);
    assert.equal(job!.id, 'abc-123');
    assert.equal(job!.title, 'Frontend Engineer');
    assert.equal(job!.company, 'Nile Digital');
    assert.equal(job!.location, 'Cairo, Cairo Governorate');
    assert.equal(job!.country, 'eg');
    assert.equal(job!.isRemote, false);
    assert.equal(job!.employmentType, 'FULLTIME');
    assert.equal(job!.publisher, 'Example Board');
    assert.equal(job!.applyUrl, 'https://example.org/apply/abc-123');
    assert.equal(job!.url, 'https://example.org/jobs/abc-123');
    assert.equal(job!.salary, 'EGP 25,000');
    assert.equal(job!.minEducation, 'Bachelor');
    assert.equal(job!.requiredExperience, 'Mid');
    assert.deepEqual(job!.benefits, ['Health insurance']);
    assert.deepEqual(job!.requiredSkills, ['React', 'TypeScript']);
    assert.equal(job!.skillSource, 'publisher');
    assert.equal(job!.expired, false);
  });

  test('a field the source did not give stays absent instead of being guessed', () => {
    const job = normalizeLiveJob({
      job_id: 'x',
      job_title: 'Analyst',
      employer_name: 'Some Employer',
    });

    assert.ok(job);
    assert.equal(job!.salary, null);
    assert.equal(job!.location, null);
    assert.equal(job!.isRemote, null);
    assert.equal(job!.postedAt, null);
    assert.equal(job!.expiresAt, null);
    assert.equal(job!.description, null);
    assert.equal(job!.applyUrl, null);
    assert.equal(job!.publisher, null);
    assert.deepEqual(job!.requiredSkills, []);
    assert.equal(job!.skillSource, 'none');
  });

  test('a record without an identifier, a title or an employer is dropped', () => {
    assert.equal(normalizeLiveJob({ job_title: 'A', employer_name: 'B' }), null);
    assert.equal(normalizeLiveJob({ job_id: 'a', employer_name: 'B' }), null);
    assert.equal(normalizeLiveJob({ job_id: 'a', job_title: 'B' }), null);
    assert.equal(normalizeLiveJob(null), null);
    assert.equal(normalizeLiveJob('not a record'), null);
    assert.equal(normalizeLiveJob([]), null);
  });

  test('an offer whose expiry has passed is marked expired', () => {
    const now = new Date('2026-11-10T00:00:00Z');

    const expired = normalizeLiveJob(
      providerJob({ job_offer_expiration_datetime: '2026-11-01T00:00:00Z' }),
      now
    );
    const open = normalizeLiveJob(
      providerJob({ job_offer_expiration_datetime: '2026-12-01T00:00:00Z' }),
      now
    );

    assert.equal(expired!.expired, true);
    assert.equal(open!.expired, false);
  });

  test('a posting with no expiry at all is not treated as expired', () => {
    const job = normalizeLiveJob(providerJob({ job_offer_expiration_datetime: null }));
    assert.equal(job!.expiresAt, null);
    assert.equal(job!.expired, false);
  });

  test('a date given as epoch seconds is read correctly', () => {
    const job = normalizeLiveJob(
      providerJob({ job_posted_at_datetime: 1761968400, job_offer_expiration_datetime: null })
    );
    assert.ok(job!.postedAt);
    assert.equal(new Date(job!.postedAt!).getUTCFullYear(), 2025);
  });

  test('the skill list is de-duplicated without losing its order', () => {
    const job = normalizeLiveJob(
      providerJob({ job_required_skills: ['React', 'react', 'React', 'TypeScript'] })
    );
    assert.deepEqual(job!.requiredSkills, ['React', 'TypeScript']);
  });
});

/* -------------------------------------------------------------------------- */
/* Repeated postings                                                           */
/* -------------------------------------------------------------------------- */

describe('repeated postings are collapsed', () => {
  const first: LiveJob = {
    ...normalizeLiveJob(providerJob())!,
  };

  test('the same posting under the same identifier appears once', () => {
    const jobs = dedupeLiveJobs([first, { ...first }]);
    assert.equal(jobs.length, 1);
  });

  test('the same posting under two board identifiers appears once', () => {
    const fromAnotherBoard: LiveJob = {
      ...first,
      id: 'def-456',
      publisher: 'Another Board',
    };
    const jobs = dedupeLiveJobs([first, fromAnotherBoard]);
    assert.equal(jobs.length, 1);
  });

  test('genuinely different postings are all kept', () => {
    const second: LiveJob = {
      ...first,
      id: 'zzz-999',
      title: 'Backend Engineer',
    };
    const jobs = dedupeLiveJobs([first, second]);
    assert.equal(jobs.length, 2);
  });
});

/* -------------------------------------------------------------------------- */
/* The upstream request                                                        */
/* -------------------------------------------------------------------------- */

describe('the search parameters are checked before they reach the provider', () => {
  test('the product opens on Egypt and on the last seven days', () => {
    const query = buildJobSearchQuery({});
    assert.equal(query.country, 'eg');
    assert.equal(query.datePosted, 'week');
    assert.equal(query.page, 1);
    assert.equal(query.numPages, 1);
    assert.equal(query.remoteOnly, false);
    assert.deepEqual(query.employmentTypes, []);
  });

  test('a value outside the provider vocabulary falls back to the default', () => {
    const query = buildJobSearchQuery({
      datePosted: 'yesterday',
      employmentTypes: 'fulltime,not-a-type',
      requirements: 'no_experience,invented',
      country: 'EGYPT',
    });

    assert.equal(query.datePosted, 'week');
    assert.deepEqual(query.employmentTypes, ['FULLTIME']);
    assert.deepEqual(query.requirements, ['no_experience']);
    // A two-letter country code is accepted, but only in the shape the
    // provider documents.
    assert.equal(query.country, 'eg');
  });

  test('the page and page count stay inside the provider limits', () => {
    assert.equal(buildJobSearchQuery({ page: '0' }).page, 1);
    assert.equal(buildJobSearchQuery({ page: '999' }).page, 20);
    assert.equal(buildJobSearchQuery({ numPages: '50' }).numPages, 2);
    assert.equal(buildJobSearchQuery({ page: 'abc' }).page, 1);
  });

  test('an over-long query is shortened instead of being forwarded whole', () => {
    const query = buildJobSearchQuery({ query: 'a'.repeat(500) });
    assert.equal(query.query.length, 200);
  });

  test('an empty query still searches something real', () => {
    const query = buildJobSearchQuery({ query: '   ' });
    assert.ok(query.query.length > 0);
  });
});

/* -------------------------------------------------------------------------- */
/* Explaining the fit                                                          */
/* -------------------------------------------------------------------------- */

describe('the fit against the candidate is explained, not asserted', () => {
  test('the skills the record already has are separated from the ones it lacks', () => {
    const job = normalizeLiveJob(providerJob())!;
    const match = matchJobToSkills(job, ['React', 'Figma']);

    assert.deepEqual(match.matched, ['React']);
    assert.deepEqual(match.missing, ['TypeScript']);
    assert.equal(match.score, 50);
  });

  test('a posting that lists no skills produces no score at all', () => {
    const job = normalizeLiveJob(
      providerJob({ job_required_skills: [], job_description: 'A role with no skill list.' })
    )!;
    const match = matchJobToSkills(job, ['React']);

    assert.equal(match.score, null);
    assert.deepEqual(match.matched, []);
    assert.deepEqual(match.missing, []);
  });

  test('a posting that only mentions catalogue skills is compared, and says where they came from', () => {
    const job = normalizeLiveJob(
      providerJob({
        job_required_skills: [],
        job_description: 'You will work with React and TypeScript every day.',
      })
    )!;
    const match = matchJobToSkills(job, ['React'], ['React', 'TypeScript', 'Rust']);

    assert.deepEqual(match.matched, ['React']);
    assert.deepEqual(match.missing, ['TypeScript']);
    assert.equal(match.score, 50);
    assert.equal(job.skillSource, 'description');
  });

  test('a skill that only sounds similar is not counted as a match', () => {
    const job = normalizeLiveJob(providerJob({ job_required_skills: ['Rust'] }))!;
    const match = matchJobToSkills(job, ['React']);

    assert.deepEqual(match.matched, []);
    assert.equal(match.score, 0);
  });
});

/* -------------------------------------------------------------------------- */
/* The provider client                                                         */
/* -------------------------------------------------------------------------- */

describe('the provider client', () => {
  const realFetch = globalThis.fetch;
  let calls: Array<{ url: string; headers: Record<string, string> }> = [];

  /** Answers every provider call with the given response. */
  function stubProvider(
    responder: (url: string) => { status: number; body: unknown; headers?: Record<string, string> }
  ) {
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers: Record<string, string> = {};
      const raw = init?.headers as Record<string, string> | undefined;
      if (raw) for (const [key, value] of Object.entries(raw)) headers[key] = value;
      calls.push({ url, headers });

      const answer = responder(url);
      return new Response(JSON.stringify(answer.body), {
        status: answer.status,
        headers: { 'content-type': 'application/json', ...(answer.headers ?? {}) },
      });
    }) as typeof globalThis.fetch;
  }

  before(() => {
    process.env.JSEARCH_RAPIDAPI_KEY = 'test-provider-key';
    clearJobSearchCache();
  });

  // Each test starts with an empty cache and an empty call log, so one test
  // can never answer another one's request.
  beforeEach(() => {
    clearJobSearchCache();
    calls = [];
  });

  after(() => {
    globalThis.fetch = realFetch;
    delete process.env.JSEARCH_RAPIDAPI_KEY;
    clearJobSearchCache();
  });

  test('the provider answer becomes vacancies, with the quota it reported', async () => {
    stubProvider(() => ({
      status: 200,
      body: {
        status: 'OK',
        data: {
          jobs: [providerJob(), providerJob({ job_id: 'def-456', job_title: 'Backend Engineer' })],
        },
      },
      headers: { 'x-ratelimit-requests-limit': '500', 'x-ratelimit-requests-remaining': '498' },
    }));

    const result = await searchJobs({ query: 'frontend', country: 'eg' });

    assert.equal(result.jobs.length, 2);
    assert.equal(result.jobs[0].title, 'Frontend Engineer');
    assert.equal(result.quota.limit, 500);
    assert.equal(result.quota.remaining, 498);
    assert.equal(result.cached, false);
  });

  test('the credential and the provider host are sent as the provider documents', async () => {
    stubProvider(() => ({ status: 200, body: { status: 'OK', data: { jobs: [] } } }));

    await searchJobs({ query: 'frontend' });

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith('https://jsearch.p.rapidapi.com/search'));
    assert.equal(calls[0].headers['x-rapidapi-key'], 'test-provider-key');
    assert.equal(calls[0].headers['x-rapidapi-host'], 'jsearch.p.rapidapi.com');
    assert.ok(calls[0].url.includes('country=eg'));
  });

  test('a repeated search is answered from the cache instead of spending quota', async () => {
    stubProvider(() => ({
      status: 200,
      body: { status: 'OK', data: { jobs: [providerJob()] } },
    }));

    const first = await searchJobs({ query: 'cached search' });
    const second = await searchJobs({ query: 'cached search' });

    assert.equal(calls.length, 1, 'the provider should only have been asked once');
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.deepEqual(second.jobs, first.jobs);
  });

  test('a rate limit becomes a state the product can explain', async () => {
    stubProvider(() => ({
      status: 429,
      body: { status: 'ERROR' },
      headers: { 'retry-after': '30' },
    }));

    await assert.rejects(
      () => searchJobs({ query: 'rate limited search' }),
      (error: unknown) => {
        assert.ok(error instanceof JobSearchError);
        assert.equal(error.code, 'rate_limited');
        assert.equal(error.status, 429);
        assert.equal(error.retryAfterSeconds, 30);
        return true;
      }
    );
  });

  test('a rejected credential becomes a state the product can explain', async () => {
    stubProvider(() => ({ status: 401, body: { status: 'ERROR' } }));

    await assert.rejects(
      () => searchJobs({ query: 'rejected credential search' }),
      (error: unknown) => {
        assert.ok(error instanceof JobSearchError);
        assert.equal(error.code, 'invalid_credential');
        return true;
      }
    );
  });

  test('an error reported inside a successful answer is still an error', async () => {
    stubProvider(() => ({
      status: 200,
      body: { status: 'ERROR', data: { error: { code: 'INVALID_QUERY', message: 'Bad query' } } },
    }));

    await assert.rejects(
      () => searchJobs({ query: 'error body search' }),
      (error: unknown) => {
        assert.ok(error instanceof JobSearchError);
        assert.equal(error.code, 'bad_response');
        return true;
      }
    );
  });

  test('a provider outage becomes a state the product can explain', async () => {
    stubProvider(() => ({ status: 503, body: { status: 'ERROR' } }));

    await assert.rejects(
      () => searchJobs({ query: 'outage search' }),
      (error: unknown) => {
        assert.ok(error instanceof JobSearchError);
        assert.equal(error.code, 'upstream_unavailable');
        return true;
      }
    );
  });

  test('one vacancy can be loaded on its own', async () => {
    stubProvider(() => ({ status: 200, body: { status: 'OK', data: { job: providerJob() } } }));

    const job = await getJobDetails('abc-123');
    assert.equal(job?.title, 'Frontend Engineer');
    assert.ok(calls[0].url.includes('job_id=abc-123'));
  });

  test('a vacancy the provider does not know is an ordinary answer, not a failure', async () => {
    stubProvider(() => ({ status: 404, body: { status: 'ERROR' } }));

    const job = await getJobDetails('does-not-exist');
    assert.equal(job, null);
  });
});

/* -------------------------------------------------------------------------- */
/* The route                                                                   */
/* -------------------------------------------------------------------------- */

describe('the live jobs route', () => {
  test('an anonymous caller cannot reach the feed', async () => {
    const res = await apiAnonymous('GET', '/api/jobs/search');
    assert.equal(res.status, 401);
  });

  test('the route answers with a clear state when no provider credential is set', async () => {
    const res = await api('GET', '/api/jobs/search?query=engineer', { token: user.token });

    // The test environment deliberately has no provider credential, so this
    // proves the route fails safely instead of pretending to have results.
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'not_configured');
    assert.equal(res.body.success, false);
  });

  test('a single vacancy is not readable by an anonymous caller either', async () => {
    const res = await apiAnonymous('GET', '/api/jobs/abc-123');
    assert.equal(res.status, 401);
  });
});
