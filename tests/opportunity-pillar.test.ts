/**
 * The two halves of the ecosystem.
 *
 * "Live Jobs & Internship" is the employment half: a vacancy, or a placement
 * somebody is taken on to do. "Opportunities & Activities" is the other half:
 * volunteering, student programmes, training, competitions, scholarships —
 * everything a candidate JOINS or ATTENDS rather than is HIRED for.
 *
 * The distinction is stored with the record and filtered on in the database,
 * so these checks are about the rule itself and about the places that apply
 * it. A change that turned the split back into a label would fail here.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  EMPLOYMENT_OPPORTUNITY_KINDS,
  OPPORTUNITY_KINDS,
  OPPORTUNITY_PILLARS,
  TRAINING_OPPORTUNITY_KINDS,
  isOpportunityPillar,
  isTrainingOpportunityKind,
  kindsForPillar,
  pillarForKind,
} from '../shared/opportunities.ts';
import {
  filterLiveJobsByPillar,
  isTrainingEmploymentType,
  jobPillarFor,
  type LiveJob,
} from '../shared/jobs.ts';

const serverRoot = new URL('../server/', import.meta.url);
const appSource = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');

function liveJob(overrides: Partial<LiveJob> & { id: string }): LiveJob {
  return {
    title: 'Engineer',
    company: 'Somewhere',
    location: null,
    country: 'eg',
    isRemote: false,
    employmentType: 'Full-time',
    postedAt: null,
    expiresAt: null,
    expired: false,
    description: null,
    url: null,
    applyUrl: null,
    publisher: 'Indeed',
    source: 'indeed',
    isInternship: false,
    isTraining: false,
    requiredSkills: [],
    skillSource: 'none',
    requiredExperience: null,
    benefits: [],
    salary: null,
    minEducation: null,
    logoUrl: null,
    ...overrides,
  } as LiveJob;
}

describe('the pillar of an opportunity', () => {
  it('puts employment on one side and everything else on the other', () => {
    assert.deepEqual(EMPLOYMENT_OPPORTUNITY_KINDS, ['internship']);
    for (const kind of OPPORTUNITY_KINDS) {
      assert.equal(
        pillarForKind(kind),
        kind === 'internship' ? 'jobs' : 'opportunities',
        `${kind} is on the side it belongs to`
      );
    }
  });

  it('names both halves', () => {
    assert.deepEqual([...OPPORTUNITY_PILLARS], ['jobs', 'opportunities']);
    assert.ok(isOpportunityPillar('jobs'));
    assert.ok(isOpportunityPillar('opportunities'));
    assert.ok(!isOpportunityPillar('courses'));
    assert.ok(!isOpportunityPillar(null));
  });

  it('has no kind that belongs to neither half', () => {
    const employment = kindsForPillar('jobs');
    const activities = kindsForPillar('opportunities');
    assert.equal(employment.length + activities.length, OPPORTUNITY_KINDS.length);
    assert.deepEqual(
      employment.filter((kind) => activities.includes(kind)),
      []
    );
  });

  it('knows the training programmes from the kind, not from a free-text tag', () => {
    assert.ok(isTrainingOpportunityKind('training'));
    assert.ok(isTrainingOpportunityKind('bootcamp'));
    assert.ok(isTrainingOpportunityKind('workshop'));
    assert.ok(isTrainingOpportunityKind('webinar'));
    assert.ok(isTrainingOpportunityKind('certification'));
    assert.ok(!isTrainingOpportunityKind('volunteering'));
    assert.ok(!isTrainingOpportunityKind('internship'));
    assert.ok(!isTrainingOpportunityKind(null));
    assert.deepEqual(
      TRAINING_OPPORTUNITY_KINDS.every((kind) => pillarForKind(kind) === 'opportunities'),
      true,
      'every training programme is an activity rather than employment'
    );
  });
});

describe('the pillar of a posting', () => {
  it('reads a training programme out of the employment type the posting stated', () => {
    assert.ok(isTrainingEmploymentType('Training'));
    assert.ok(isTrainingEmploymentType('TRAINING PROGRAMME'));
    assert.ok(isTrainingEmploymentType('Bootcamp'));
    assert.ok(isTrainingEmploymentType('Course'));
    assert.ok(isTrainingEmploymentType('دورة'));
    assert.ok(isTrainingEmploymentType('دورات'));
    assert.ok(isTrainingEmploymentType('برنامج تدريبي'));
  });

  it('does not mistake a vacancy or a placement for a course', () => {
    assert.ok(!isTrainingEmploymentType('Full-time'));
    assert.ok(!isTrainingEmploymentType('Part-time'));
    assert.ok(!isTrainingEmploymentType('Contractor'));
    assert.ok(!isTrainingEmploymentType(null));
    // The Arabic word for a placement covers a course as well, and the
    // platform has always read it as a placement. That reading is kept.
    assert.ok(!isTrainingEmploymentType('تدريب'));
    assert.ok(!isTrainingEmploymentType('Internship'));
  });

  it('keeps the training out of the employment feed', () => {
    const vacancy = liveJob({ id: 'vacancy' });
    const placement = liveJob({ id: 'placement', isInternship: true, employmentType: 'Internship' });
    const course = liveJob({ id: 'course', isTraining: true, employmentType: 'Training' });

    assert.equal(jobPillarFor(vacancy), 'jobs');
    assert.equal(jobPillarFor(placement), 'jobs');
    assert.equal(jobPillarFor(course), 'opportunities');

    assert.deepEqual(
      filterLiveJobsByPillar([vacancy, placement, course], 'jobs').map((job) => job.id),
      ['vacancy', 'placement'],
      'the employment feed holds the vacancies and the placements'
    );
    assert.deepEqual(
      filterLiveJobsByPillar([vacancy, placement, course], 'opportunities').map((job) => job.id),
      ['course'],
      'the training is kept with the activities'
    );
  });
});

describe('the split in the server', () => {
  it('filters the catalogue on the stored pillar, in the database', () => {
    const dbSource = readFileSync(new URL('db/volunteerOpportunities.ts', serverRoot), 'utf8');
    assert.match(
      dbSource,
      /\.eq\('pillar', pillar\)/,
      'the catalogue query asks the database for one pillar'
    );
    assert.match(
      dbSource,
      /pillarForKind\(kind\)/,
      'a row written before the split is given a pillar rather than none'
    );
  });

  it('offers the pillar as a filter on the catalogue endpoint', () => {
    assert.match(
      appSource,
      /\/api\/volunteer\/opportunities[^\n]*requireAuth/,
      'the catalogue endpoint exists'
    );
    assert.match(appSource, /isOpportunityPillar\(pillarParam\)/, 'the pillar is validated');
    assert.match(
      appSource,
      /listVolunteerOpportunities\(req\.authUser!\.id, \{ pillar \}\)/,
      'the endpoint passes the pillar down to the database'
    );
  });

  it('offers the pillar as a filter to the administration screen', () => {
    assert.match(
      appSource,
      /listOpportunitiesForAdmin\(\{ pillar \}\)/,
      'an administrator can ask for one half of the catalogue'
    );
  });

  it('keeps the training out of the live vacancies feed', () => {
    const clientSource = readFileSync(new URL('jsearch/client.ts', serverRoot), 'utf8');
    assert.match(
      clientSource,
      /filterLiveJobsByPillar\([\s\S]*?'jobs'/,
      'the vacancies feed asks for the employment pillar'
    );
  });
});
