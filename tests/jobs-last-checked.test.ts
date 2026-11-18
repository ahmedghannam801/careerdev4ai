/**
 * When the Live Jobs screen says the boards were last checked.
 *
 * The label the candidate reads has to be the truth about the postings, not
 * the truth about their own request. A search served from the server's cache
 * was read from the boards up to five minutes earlier, so the moment the
 * boards were read is carried through the cache, through the API and into the
 * interface.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  clearJobSearchCache,
  readCachedJobSearch,
  writeJobSearchCache,
  type JobSearchResult,
} from '../server/jsearch/client.ts';

const app = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');
const jobsApi = readFileSync(new URL('../src/lib/jobsApi.ts', import.meta.url), 'utf8');
const jobsView = readFileSync(new URL('../src/components/views/JobsView.tsx', import.meta.url), 'utf8');

function storedResult(fetchedAt: string): JobSearchResult {
  return {
    jobs: [],
    cursor: null,
    quota: { limit: null, remaining: null },
    cached: false,
    fetchedAt,
  };
}

describe('the Live Jobs "last checked" line', () => {
  it('keeps the moment the boards were read when the answer comes from the cache', () => {
    clearJobSearchCache();
    const fetchedAt = '2026-11-18T09:30:00.000Z';
    writeJobSearchCache({ query: 'sql engineer' }, storedResult(fetchedAt));

    const cached = readCachedJobSearch({ query: 'sql engineer' });
    assert.ok(cached, 'the answer is served from the cache');
    assert.equal(cached.cached, true, 'the answer says it came from the cache');
    assert.equal(
      cached.fetchedAt,
      fetchedAt,
      'a cached answer keeps the moment the boards were read'
    );

    clearJobSearchCache();
  });

  it('does not serve one search the answer to another', () => {
    clearJobSearchCache();
    writeJobSearchCache({ query: 'sql engineer' }, storedResult('2026-11-18T09:30:00.000Z'));

    assert.equal(
      readCachedJobSearch({ query: 'python engineer' }),
      null,
      'a different search is not answered from another search\'s cache entry'
    );

    clearJobSearchCache();
  });

  it('tells the browser when the boards were read', () => {
    assert.match(
      app,
      /checkedAt:\s*result\.fetchedAt/,
      'the search route sends the provider\'s own timestamp'
    );
  });

  it('shows that timestamp instead of the moment the browser asked', () => {
    assert.match(
      jobsApi,
      /checkedAt:\s*string/,
      'the client reads the timestamp the server sent'
    );
    assert.match(
      jobsView,
      /Date\.parse\(response\.checkedAt\)/,
      'the interface uses the server\'s timestamp'
    );
    assert.doesNotMatch(
      jobsView,
      /setLastCheckedAt\(Date\.now\(\)\)/,
      'the interface does not stamp the moment the browser asked'
    );
  });
});
