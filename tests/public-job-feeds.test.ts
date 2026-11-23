/**
 * The key-free job boards, read without the network.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The platform used to depend on one paid provider, and when its monthly quota
 * was spent the search answered with an empty list. The candidate was shown
 * "no openings matched this search", which was not what had happened.
 *
 * The boards the platform now reads itself are covered here, against fixtures
 * that look exactly like each board's own answer, so the following are proved
 * without a request leaving the process:
 *
 *   * a posting keeps the title, the employer, the location, the date, the
 *     description and the application link the board stated;
 *   * nothing is invented: a record without a title or an employer is dropped
 *     rather than completed with a placeholder;
 *   * a board that fails is named with its reason, and the other boards'
 *     postings are still returned;
 *   * when every board fails, the search throws instead of pretending the
 *     boards had no vacancies;
 *   * the candidate's own filters are applied to the records.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { clearPublicFeedCache, searchPublicFeeds } from '../server/jobs/publicFeeds.ts';
import { searchAllJobs } from '../server/jobs/feed.ts';

const REMOTIVE = {
  jobs: [
    {
      id: 1,
      url: 'https://remotive.com/remote-jobs/engineering/data-analyst-1',
      title: 'Data Analyst',
      company_name: 'Northwind Insights',
      company_logo: 'https://remotive.com/job/1/logo',
      tags: ['sql', 'python'],
      job_type: 'full_time',
      publication_date: new Date().toISOString().slice(0, 19),
      candidate_required_location: 'Worldwide',
      salary: '$60,000',
      description: '<p>Analyse the numbers behind the product.</p>',
    },
    {
      id: 2,
      url: 'https://remotive.com/remote-jobs/design/product-designer-2',
      title: 'Product Designer',
      company_name: 'Blue Harbour',
      tags: ['figma'],
      job_type: 'contract',
      publication_date: new Date().toISOString().slice(0, 19),
      candidate_required_location: 'USA',
      description: '<p>Design the next release.</p>',
    },
  ],
};

const JOBICY = {
  jobs: [
    {
      id: 3,
      url: 'https://jobicy.com/jobs/3-data-analyst-intern',
      jobTitle: 'Data Analyst Intern',
      companyName: 'Cedar Labs',
      jobIndustry: ['Data Science'],
      jobType: ['Internship'],
      jobGeo: 'Anywhere',
      jobDescription: '<p>Six-month placement.</p>',
      pubDate: new Date().toISOString(),
    },
  ],
};

const ARBEITNOW = {
  data: [
    {
      slug: 'werkstudent-data-berlin',
      company_name: 'Spree Analytics',
      title: 'Werkstudent Data',
      description: '<p>Teilzeit in Berlin.</p>',
      remote: false,
      url: 'https://www.arbeitnow.com/jobs/companies/spree/werkstudent-data-berlin',
      tags: ['Data'],
      job_types: ['working student'],
      location: 'Berlin',
      created_at: Math.floor(Date.now() / 1000),
    },
    {
      // No employer: it cannot be shown honestly, so it must not appear.
      slug: 'broken',
      title: 'A posting with no employer',
      description: '',
      remote: false,
      url: 'https://www.arbeitnow.com/jobs/companies/none/broken',
      tags: [],
      job_types: [],
      location: 'Berlin',
      created_at: Math.floor(Date.now() / 1000),
    },
  ],
};

const ORIGINAL_FETCH = globalThis.fetch;

function stubFetch(handler: (url: string) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return handler(url);
  }) as typeof fetch;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Answers each board with its fixture; every other board answers empty. */
function answerEveryBoard(overrides: Record<string, Response> = {}): void {
  stubFetch((url) => {
    if (overrides[url]) return overrides[url];
    if (url.startsWith('https://remotive.com')) return json(REMOTIVE);
    if (url.startsWith('https://jobicy.com')) return json(JOBICY);
    if (url.startsWith('https://www.arbeitnow.com')) return json(ARBEITNOW);
    if (url.startsWith('https://himalayas.app')) return json({ jobs: [] });
    if (url.startsWith('https://remoteok.com')) return json([]);
    return new Response('not found', { status: 404 });
  });
}

beforeEach(() => {
  clearPublicFeedCache();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  clearPublicFeedCache();
});

describe('the key-free job boards', () => {
  it('keeps what each board stated, and names the board it came from', async () => {
    answerEveryBoard();

    const result = await searchPublicFeeds({ query: 'data analyst' });
    const analyst = result.jobs.find((job) => job.title === 'Data Analyst');

    assert.ok(analyst, 'the Remotive posting is returned');
    assert.equal(analyst?.company, 'Northwind Insights');
    assert.equal(analyst?.location, 'Worldwide');
    assert.equal(analyst?.source, 'remotive');
    assert.equal(analyst?.publisher, 'Remotive');
    assert.equal(analyst?.salary, '$60,000');
    assert.match(analyst?.description ?? '', /Analyse the numbers behind the product\./);
    assert.equal(analyst?.url, 'https://remotive.com/remote-jobs/engineering/data-analyst-1');
    assert.ok(analyst?.postedAt, 'the date the board stated is carried through');
  });

  it('drops a record that cannot be shown honestly instead of inventing an employer', async () => {
    answerEveryBoard();

    const result = await searchPublicFeeds({});
    assert.equal(
      result.jobs.some((job) => job.title === 'A posting with no employer'),
      false
    );
    for (const job of result.jobs) {
      assert.ok(job.title.length > 0);
      assert.ok(job.company.length > 0);
      assert.ok(job.url, 'every posting carries the link its board stated');
    }
  });

  it('applies the candidate’s query, kind and remote filters to the records', async () => {
    answerEveryBoard();

    const analystOnly = await searchPublicFeeds({ query: 'data analyst' });
    // A two-word query has to be answered by both words: "Werkstudent Data"
    // matches "data" but not "analyst", so it is not an answer to this query.
    assert.deepEqual(
      new Set(analystOnly.jobs.map((job) => job.title)),
      new Set(['Data Analyst', 'Data Analyst Intern'])
    );

    clearPublicFeedCache();
    const internships = await searchPublicFeeds({ kind: 'internships' });
    assert.deepEqual(internships.jobs.map((job) => job.title), ['Data Analyst Intern']);
    assert.equal(internships.jobs[0]?.isInternship, true);

    clearPublicFeedCache();
    const remoteOnly = await searchPublicFeeds({ remoteOnly: true });
    assert.equal(remoteOnly.jobs.every((job) => job.isRemote === true), true);
  });

  it('names a board that failed, and still returns the other boards', async () => {
    answerEveryBoard({
      'https://jobicy.com/api/v2/remote-jobs?count=50': new Response('boom', { status: 500 }),
    });

    const result = await searchPublicFeeds({ query: 'data' });

    assert.ok(result.boardsFailed.includes('Jobicy'));
    assert.equal(result.allBoardsAnswered, false, 'the answer says that a board is missing');
    assert.match(result.boardErrors[0]?.message ?? '', /answered 500/);
    // The boards that did answer are still there.
    assert.ok(result.jobs.length > 0);
    assert.ok(result.jobs.some((job) => job.source === 'remotive'));
  });

  it('answers an empty list honestly when every board answered with nothing', async () => {
    stubFetch(() => json({ jobs: [] }));

    const result = await searchPublicFeeds({ query: 'astronaut' });

    assert.deepEqual(result.jobs, []);
    assert.equal(result.boardsFailed.length, 0);
    assert.equal(result.allBoardsAnswered, true);
    assert.equal(result.boardsRead.length, 5, 'every board was read');
  });

  it('throws rather than answering "no vacancies" when every board fails', async () => {
    const previousKey = process.env.JSEARCH_RAPIDAPI_KEY;
    const previousGeneric = process.env.RAPIDAPI_KEY;
    const previousBoards = process.env.JOB_ATS_BOARDS;
    delete process.env.JSEARCH_RAPIDAPI_KEY;
    delete process.env.RAPIDAPI_KEY;
    delete process.env.JOB_ATS_BOARDS;
    stubFetch(() => new Response('down', { status: 503 }));

    try {
      await assert.rejects(
        () => searchAllJobs({ query: 'data analyst' }),
        (error: unknown) => error instanceof Error && /could not be read/i.test(error.message)
      );
    } finally {
      if (previousKey !== undefined) process.env.JSEARCH_RAPIDAPI_KEY = previousKey;
      if (previousGeneric !== undefined) process.env.RAPIDAPI_KEY = previousGeneric;
      if (previousBoards !== undefined) process.env.JOB_ATS_BOARDS = previousBoards;
    }
  });
});
