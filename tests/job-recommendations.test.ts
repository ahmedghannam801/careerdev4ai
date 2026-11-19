// The unit tests for the recommendation and comparison engines.
//
// They run without a database and without a network, and they prove the pure
// logic: how a recommendation is chosen, what it says, how postings are
// ranked against each other, and what a comparison shows.
//
// The explanations themselves come from the platform's own matcher, so these
// tests exercise the real scoring rather than a copy of it.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LiveJob } from '../shared/jobs.ts';
import { CAREER_ROLES, CATALOG_SKILL_NAMES } from '../shared/careerRoles.ts';
import { explainJobMatch, type JobMatchBreakdown } from '../shared/jobMatching.ts';
import {
  buildRecommendationQuery,
  describeRecommendation,
  matchHighlights,
  rankRecommendations,
} from '../server/jobs/recommend.ts';
import { compareJobs } from '../server/jobs/compare.ts';
import { computeJobInsights, STRONG_MATCH_THRESHOLD } from '../server/jobs/insights.ts';
import { highestEducationLevel, type MatchCandidate } from '../server/jobs/candidate.ts';

function job(overrides: Partial<LiveJob> = {}): LiveJob {
  return {
    id: 'job-1',
    title: 'Frontend Engineer',
    company: 'Example Co',
    location: 'Cairo',
    country: 'EG',
    isRemote: null,
    employmentType: 'FULLTIME',
    postedAt: '2026-11-01T09:00:00.000Z',
    expiresAt: null,
    expired: false,
    description: 'The role needs React and TypeScript every day.',
    url: 'https://example.test/jobs/1',
    applyUrl: null,
    publisher: 'Example Board',
    source: 'company_careers',
    isInternship: false,
    isTraining: false,
    requiredSkills: ['React', 'TypeScript'],
    skillSource: 'publisher',
    requiredExperience: null,
    benefits: [],
    salary: null,
    minEducation: null,
    logoUrl: null,
    ...overrides,
  };
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    skillNames: ['React', 'TypeScript'],
    experienceLevel: 'mid',
    targetOpportunityType: 'full_time_entry',
    educationLevel: 'bachelor',
    country: 'EG',
    city: 'Cairo',
    headline: null,
    targetRole: null,
    profileText: '',
    ...overrides,
  };
}

/** The real explanation, produced by the platform's own matcher. */
function explain(
  posting: LiveJob,
  against: MatchCandidate = candidate()
): JobMatchBreakdown {
  return explainJobMatch(posting, against, CATALOG_SKILL_NAMES, CAREER_ROLES);
}

/* -------------------------------------------------------------------------- */
/* What the platform searches for on the candidate's behalf                     */
/* -------------------------------------------------------------------------- */

describe('the recommendation query', () => {
  it('uses the role the candidate is aiming at', () => {
    const query = buildRecommendationQuery(candidate({ targetRole: 'Data Analyst' }));
    assert.equal(query, 'Data Analyst');
  });

  it('falls back to the skills the candidate owns', () => {
    const query = buildRecommendationQuery(candidate({ skillNames: ['Python', 'SQL'] }));
    assert.equal(query, 'Python SQL');
  });

  it('asks for an internship when that is the target', () => {
    const query = buildRecommendationQuery(
      candidate({ skillNames: [], targetOpportunityType: 'internship' })
    );
    assert.equal(query, 'internship');
  });

  it('asks for entry-level work when that is the target', () => {
    const query = buildRecommendationQuery(
      candidate({ skillNames: [], targetOpportunityType: 'full_time_entry' })
    );
    assert.equal(query, 'entry level job');
  });

  it('falls back to the plainest question when the record is empty', () => {
    const query = buildRecommendationQuery(
      candidate({ skillNames: [], targetOpportunityType: null })
    );
    assert.equal(query, 'jobs');
  });
});

/* -------------------------------------------------------------------------- */
/* The reason                                                                  */
/* -------------------------------------------------------------------------- */

describe('the reason a posting is recommended', () => {
  it('names the skills that matched', () => {
    const posting = job({ requiredSkills: ['React', 'TypeScript', 'GraphQL'] });
    const { reason, highlights } = describeRecommendation(posting, explain(posting));

    assert.match(reason, /React/);
    assert.match(reason, /TypeScript/);
    assert.ok(highlights.includes('React'));
  });

  it('says what the posting asks for when nothing matches', () => {
    const posting = job({ requiredSkills: ['Rust', 'Kubernetes'] });
    const { reason } = describeRecommendation(
      posting,
      explain(posting, candidate({ skillNames: ['React'] }))
    );

    assert.match(reason, /Rust/);
  });

  it('says plainly when the record is too thin to judge', () => {
    const posting = job({ requiredSkills: [], skillSource: 'none', description: null });
    const { reason } = describeRecommendation(
      posting,
      explain(posting, candidate({ skillNames: [] }))
    );

    assert.match(reason, /not enough/i);
  });

  it('never names a skill the candidate does not have', () => {
    const posting = job({ requiredSkills: ['React', 'TypeScript', 'GraphQL'] });
    const { reason } = describeRecommendation(
      posting,
      explain(posting, candidate({ skillNames: ['React'] }))
    );

    assert.ok(!reason.includes('TypeScript'));
  });

  it('collects the terms that drove the match', () => {
    const posting = job({ requiredSkills: ['React', 'TypeScript'] });
    const highlights = matchHighlights(explain(posting));
    assert.ok(highlights.includes('React'));
  });
});

/* -------------------------------------------------------------------------- */
/* The ranking                                                                 */
/* -------------------------------------------------------------------------- */

describe('the ranking', () => {
  it('puts the better fit first', () => {
    const strong = job({ id: 'strong', requiredSkills: ['React', 'TypeScript'] });
    const weak = job({ id: 'weak', requiredSkills: ['Rust', 'Kubernetes'] });

    const ranked = rankRecommendations(
      [weak, strong],
      new Map([
        [strong.id, explain(strong)],
        [weak.id, explain(weak, candidate({ skillNames: ['React'] }))],
      ])
    );

    assert.equal(ranked[0].job.id, 'strong');
  });

  it('never puts an unmeasured fit above a measured one', () => {
    const measured = job({ id: 'measured', requiredSkills: ['React'] });
    const unmeasured = job({
      id: 'unmeasured',
      requiredSkills: [],
      skillSource: 'none',
      description: null,
    });

    const breakdowns = new Map<string, JobMatchBreakdown>([
      [measured.id, explain(measured)],
      [unmeasured.id, explain(unmeasured)],
    ]);

    const ranked = rankRecommendations([unmeasured, measured], breakdowns);
    assert.equal(ranked[0].job.id, 'measured');
  });

  it('keeps the same order every time', () => {
    const first = job({ id: 'a', requiredSkills: ['React'] });
    const second = job({ id: 'b', requiredSkills: ['React'] });

    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first)],
      [second.id, explain(second)],
    ]);

    const one = rankRecommendations([first, second], breakdowns).map((entry) => entry.job.id);
    const two = rankRecommendations([second, first], breakdowns).map((entry) => entry.job.id);

    // Two postings with the same score and no dates: the identifier decides,
    // so the list does not reshuffle itself on every reload.
    assert.deepEqual([...one].sort(), [...two].sort());
    assert.deepEqual(one, [...one].sort());
  });

  it('keeps only as many as were asked for', () => {
    const jobs = Array.from({ length: 9 }, (_, index) =>
      job({ id: `job-${index}`, requiredSkills: ['React'] })
    );
    const breakdowns = new Map<string, JobMatchBreakdown>(
      jobs.map((posting) => [posting.id, explain(posting)])
    );

    assert.equal(rankRecommendations(jobs, breakdowns, 3).length, 3);
  });

  it('carries the explanation with every recommendation', () => {
    const posting = job({ requiredSkills: ['React', 'TypeScript'] });
    const ranked = rankRecommendations(
      [posting],
      new Map([[posting.id, explain(posting)]])
    );

    assert.equal(ranked.length, 1);
    assert.ok(ranked[0].reason.length > 0);
    assert.equal(ranked[0].match.score, explain(posting).score);
  });
});

/* -------------------------------------------------------------------------- */
/* The comparison                                                               */
/* -------------------------------------------------------------------------- */

describe('the comparison', () => {
  const first = job({ id: 'first', title: 'Frontend Engineer', requiredSkills: ['React', 'TypeScript'] });
  const second = job({ id: 'second', title: 'Backend Engineer', requiredSkills: ['React', 'Node.js'] });
  const third = job({ id: 'third', title: 'Data Engineer', requiredSkills: ['Python'] });

  it('keeps the order the candidate chose', () => {
    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first)],
      [second.id, explain(second)],
      [third.id, explain(third)],
    ]);

    const comparison = compareJobs([third, first, second], breakdowns);
    assert.deepEqual(
      comparison.entries.map((entry) => entry.job.id),
      ['third', 'first', 'second']
    );
  });

  it('finds the skills every posting asks for', () => {
    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first)],
      [second.id, explain(second)],
    ]);

    const comparison = compareJobs([first, second], breakdowns);
    assert.ok(comparison.commonRequirements.includes('React'));
    assert.ok(!comparison.commonRequirements.includes('Python'));
  });

  it('finds the skills only one posting asks for', () => {
    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first)],
      [second.id, explain(second)],
    ]);

    const comparison = compareJobs([first, second], breakdowns);
    assert.ok(comparison.uniqueRequirements[first.id].includes('TypeScript'));
    assert.ok(!comparison.uniqueRequirements[first.id].includes('React'));
  });

  it('says which posting leads on a factor', () => {
    const strong = job({ id: 'strong', requiredSkills: ['React', 'TypeScript'] });
    const weak = job({ id: 'weak', requiredSkills: ['Rust', 'Kubernetes'] });

    const breakdowns = new Map<string, JobMatchBreakdown>([
      [strong.id, explain(strong)],
      [weak.id, explain(weak, candidate({ skillNames: ['React'] }))],
    ]);

    const comparison = compareJobs([strong, weak], breakdowns);
    assert.ok(comparison.leadsOn[strong.id].includes('requiredSkills'));
  });

  it('gives no leader when the postings are tied', () => {
    const one = job({ id: 'one', requiredSkills: ['React'] });
    const two = job({ id: 'two', requiredSkills: ['React'] });

    const breakdowns = new Map<string, JobMatchBreakdown>([
      [one.id, explain(one)],
      [two.id, explain(two)],
    ]);

    const comparison = compareJobs([one, two], breakdowns);
    assert.deepEqual(comparison.leadsOn[one.id], []);
    assert.deepEqual(comparison.leadsOn[two.id], []);
  });

  it('shows what the candidate meets and what is still needed', () => {
    const posting = job({ id: 'posting', requiredSkills: ['React', 'Rust'] });
    const comparison = compareJobs(
      [posting],
      new Map([[posting.id, explain(posting, candidate({ skillNames: ['React'] }))]])
    );

    assert.deepEqual(comparison.entries[0].met, ['React']);
    assert.deepEqual(comparison.entries[0].missing, ['Rust']);
  });
});

/* -------------------------------------------------------------------------- */
/* The market, measured                                                         */
/* -------------------------------------------------------------------------- */

describe('the market, measured', () => {
  const first = job({
    id: 'first',
    title: 'Frontend Engineer',
    requiredSkills: ['React', 'TypeScript'],
    isRemote: true,
  });
  const second = job({
    id: 'second',
    title: 'Platform Engineer',
    requiredSkills: ['React', 'Kubernetes'],
    isRemote: false,
    source: 'company_careers',
  });
  const third = job({
    id: 'third',
    title: 'Data Engineer',
    requiredSkills: ['Rust'],
    isRemote: null,
  });

  it('counts the openings that were read and the ones that could be compared', () => {
    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first)],
      [second.id, explain(second)],
      [third.id, explain(third, candidate({ skillNames: ['React'] }))],
    ]);

    const insights = computeJobInsights([first, second, third], breakdowns);
    assert.equal(insights.openingsRead, 3);
    assert.equal(insights.openingsMeasured, 3);
  });

  it('counts the strong matches against the stated threshold', () => {
    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first)],
      [second.id, explain(second, candidate({ skillNames: ['React'] }))],
    ]);

    const insights = computeJobInsights([first, second], breakdowns);
    assert.equal(insights.strongThreshold, STRONG_MATCH_THRESHOLD);
    assert.ok(insights.strongMatches <= insights.openingsMeasured);
  });

  it('counts a skill once per opening that asks for it', () => {
    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first, candidate({ skillNames: ['React'] }))],
      [second.id, explain(second, candidate({ skillNames: ['React'] }))],
    ]);

    const insights = computeJobInsights([first, second], breakdowns);
    const kubernetes = insights.topMissingSkills.find((entry) => entry.value === 'Kubernetes');
    const typescript = insights.topMissingSkills.find((entry) => entry.value === 'TypeScript');

    assert.equal(kubernetes?.count, 1);
    assert.equal(typescript?.count, 1);
  });

  it('counts only the openings that said whether they are remote', () => {
    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first)],
      [second.id, explain(second)],
      [third.id, explain(third)],
    ]);

    const insights = computeJobInsights([first, second, third], breakdowns);
    assert.equal(insights.remoteShare?.of, 2);
    assert.equal(insights.remoteShare?.remote, 1);
    assert.equal(insights.remoteShare?.percent, 50);
  });

  it('leaves the remote share out when no opening said', () => {
    const only = job({ id: 'only', isRemote: null });
    const breakdowns = new Map<string, JobMatchBreakdown>([[only.id, explain(only)]]);

    const insights = computeJobInsights([only], breakdowns);
    assert.equal(insights.remoteShare, null);
  });

  it('names the openings with the biggest gap', () => {
    const wide = job({ id: 'wide', requiredSkills: ['Rust', 'Kubernetes', 'Go'] });
    const narrow = job({ id: 'narrow', requiredSkills: ['React'] });

    const breakdowns = new Map<string, JobMatchBreakdown>([
      [wide.id, explain(wide, candidate({ skillNames: ['React'] }))],
      [narrow.id, explain(narrow, candidate({ skillNames: ['React'] }))],
    ]);

    const insights = computeJobInsights([wide, narrow], breakdowns);
    assert.equal(insights.biggestGaps[0].jobId, 'wide');
    assert.equal(insights.biggestGaps[0].missing.length, 3);
  });

  it('lists the openings per board', () => {
    const breakdowns = new Map<string, JobMatchBreakdown>([
      [first.id, explain(first)],
      [second.id, explain(second)],
    ]);

    const insights = computeJobInsights([first, second], breakdowns);
    const total = insights.bySource.reduce((sum, entry) => sum + entry.count, 0);
    assert.equal(total, 2);
  });
});

/* -------------------------------------------------------------------------- */
/* The education level                                                          */
/* -------------------------------------------------------------------------- */

describe('the education level', () => {
  it('takes the highest degree the candidate has', () => {
    assert.equal(highestEducationLevel(['Bachelor of Science', 'Master of Science']), 'master');
  });

  it('reads a degree written in the usual words', () => {
    assert.equal(highestEducationLevel(['PhD in Computer Science']), 'doctorate');
  });

  it('has no level when nothing was recorded', () => {
    assert.equal(highestEducationLevel([]), null);
    assert.equal(highestEducationLevel([null, undefined]), null);
  });
});
