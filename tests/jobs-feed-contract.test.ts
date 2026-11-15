/** Contract tests for the Jobs & Internships feed and its source presentation. */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  buildJobSearchQuery,
  filterLiveJobsByKind,
  JOB_SOURCE_IDS,
  JOB_SOURCE_LABELS,
  normalizeLiveJob,
  resolveJobSource,
} from '../shared/jobs.ts';

const jobsView = readFileSync(new URL('../src/components/views/JobsView.tsx', import.meta.url), 'utf8');
const liveJobCard = readFileSync(new URL('../src/components/jobs/LiveJobCard.tsx', import.meta.url), 'utf8');
const themeCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

function providerJob(id: string, publisher: string, employmentType: string) {
  return normalizeLiveJob({
    job_id: id,
    job_title: `${id} role`,
    employer_name: 'Example employer',
    job_publisher: publisher,
    job_employment_type: employmentType,
  });
}

describe('Jobs & Internships source and filter contract', () => {
  it('presents all five requested sources without claiming Wonderin is a live feed', () => {
    assert.deepEqual(JOB_SOURCE_IDS, [
      'google_jobs',
      'indeed',
      'ziprecruiter',
      'handshake',
      'wonderin',
    ]);
    assert.deepEqual(Object.values(JOB_SOURCE_LABELS), [
      'Google Jobs',
      'Indeed',
      'ZipRecruiter',
      'Handshake',
      'Wonderin.ai',
    ]);
    assert.match(jobsView, /Search on Wonderin\.ai/);
    assert.match(jobsView, /publishes no job feed/);
  });

  it('classifies the four aggregated feeds and the direct-search source by attribution', () => {
    assert.equal(resolveJobSource('Indeed'), 'indeed');
    assert.equal(resolveJobSource('ZipRecruiter'), 'ziprecruiter');
    assert.equal(resolveJobSource('Handshake'), 'handshake');
    assert.equal(resolveJobSource('Google Jobs'), 'google_jobs');
    assert.equal(resolveJobSource('Wonderin.ai'), 'wonderin');
  });

  it('asks the provider for internships and filters returned records by their stated type', () => {
    const query = buildJobSearchQuery({ query: 'analyst', country: 'eg', kind: 'internships' });
    assert.deepEqual(query.employmentTypes, ['INTERN']);

    const internship = providerJob('intern', 'Handshake', 'Internship');
    const fullTime = providerJob('fulltime', 'Indeed', 'Full-time');
    const partTime = providerJob('parttime', 'ZipRecruiter', 'Part-time');
    assert.ok(internship && fullTime && partTime);
    const jobs = [internship, fullTime, partTime];

    assert.deepEqual(filterLiveJobsByKind(jobs, 'internships').map((job) => job.id), ['intern']);
    assert.deepEqual(filterLiveJobsByKind(jobs, 'jobs').map((job) => job.id), ['fulltime', 'parttime']);
    assert.equal(filterLiveJobsByKind(jobs, 'all').length, 3);
  });

  it('uses semantic theme tokens for readable source badges, filters, and controls', () => {
    assert.match(
      liveJobCard,
      /border-\[var\(--border-strong\)\] bg-\[var\(--surface-main\)\].*text-\[var\(--text-primary\)\]/s
    );
    assert.match(
      jobsView,
      /border-\[var\(--border-strong\)\] bg-\[var\(--surface-secondary\)\].*text-\[var\(--text-primary\)\]/s
    );
    assert.match(themeCss, /\.dark\s*\{/);
    assert.match(themeCss, /--color-text-primary:\s*#F5F0E8/);
    assert.match(themeCss, /--text-primary:\s*var\(--color-text\)/);
  });
});
