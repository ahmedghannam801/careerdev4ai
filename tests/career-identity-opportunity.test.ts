/**
 * Behavioural checks for the career identity's new fields.
 *
 * Three corrections are protected here:
 *
 *   - the kind of opening the candidate is aiming at (internship, full-time
 *     entry-level, or both) is its own choice, and an unchosen one never
 *     narrows the search;
 *   - the professional headline is the candidate's own words and is not the
 *     current job title — a student has no job title;
 *   - a student who has not said when they graduate is asked, because a dated
 *     plan cannot be built without a year.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_TARGET_OPPORTUNITY_TYPE,
  deriveCareerIdentity,
  includesFullTimeEntry,
  includesInternship,
  normalizeTargetOpportunityType,
  targetOpportunityPhrase,
} from '../shared/careerIdentity.ts';

describe('the target opportunity type', () => {
  it('keeps the three choices apart', () => {
    assert.equal(normalizeTargetOpportunityType('internship'), 'internship');
    assert.equal(normalizeTargetOpportunityType('full_time_entry'), 'full_time_entry');
    assert.equal(normalizeTargetOpportunityType('both'), 'both');
  });

  it('reads a written label', () => {
    assert.equal(normalizeTargetOpportunityType('Full-Time Entry-Level'), 'full_time_entry');
  });

  it('refuses a value it does not know', () => {
    assert.equal(normalizeTargetOpportunityType('anything else'), null);
    assert.equal(normalizeTargetOpportunityType(null), null);
  });

  it('counts "both" as wanting internships and full-time roles', () => {
    assert.equal(includesInternship('both'), true);
    assert.equal(includesFullTimeEntry('both'), true);
    assert.equal(includesInternship('internship'), true);
    assert.equal(includesFullTimeEntry('internship'), false);
    assert.equal(includesFullTimeEntry('full_time_entry'), true);
    assert.equal(includesInternship('full_time_entry'), false);
  });

  it('names the openings in words', () => {
    assert.equal(targetOpportunityPhrase('internship'), 'an internship');
    assert.equal(
      targetOpportunityPhrase('full_time_entry'),
      'a full-time entry-level role'
    );
  });
});

describe('the identity reads the new fields', () => {
  it('keeps the candidate\'s chosen opportunity type', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'student',
      targetRoleTitle: 'Data Analyst',
      targetOpportunityType: 'internship',
      currentYear: 2026,
    });
    assert.equal(identity.targetOpportunityType, 'internship');
    assert.equal(identity.targetOpportunityTypeLabel, 'Internship');
    assert.equal(identity.targetOpportunityPhrase, 'an internship');
  });

  it('does not narrow the search when the candidate has not chosen', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'student',
      targetRoleTitle: 'Data Analyst',
      currentYear: 2026,
    });
    assert.equal(identity.targetOpportunityType, DEFAULT_TARGET_OPPORTUNITY_TYPE);
    assert.equal(identity.targetOpportunityType, 'both');
  });
});

describe('the professional headline is not the job title', () => {
  it('keeps the headline the candidate wrote', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'student',
      currentRole: '',
      targetRoleTitle: 'Data Analyst',
      professionalHeadline: 'Data Analyst in the making',
      currentYear: 2026,
    });
    assert.equal(identity.professionalHeadline, 'Data Analyst in the making');
    assert.equal(identity.professionalHeadlineIsSuggested, false);
  });

  it('offers one when the candidate has not written a headline', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'student',
      currentRole: '',
      targetRoleTitle: 'Data Analyst',
      currentYear: 2026,
    });
    assert.equal(identity.professionalHeadline, 'Aspiring Data Analyst');
    assert.equal(identity.professionalHeadlineIsSuggested, true);
  });

  it('does not claim a headline when there is no target role', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'student',
      currentRole: '',
      currentYear: 2026,
    });
    assert.equal(identity.professionalHeadline, null);
  });
});

describe('a student is asked when they graduate', () => {
  it('asks when the year is missing', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'student',
      targetRoleTitle: 'Data Analyst',
      currentYear: 2026,
    });
    const asked = identity.missingFields.some((field) => field.id === 'graduationYear');
    assert.equal(asked, true);
  });

  it('does not ask once the year is known', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'student',
      targetRoleTitle: 'Data Analyst',
      expectedGraduationYear: 2028,
      currentYear: 2026,
    });
    const asked = identity.missingFields.some((field) => field.id === 'graduationYear');
    assert.equal(asked, false);
    assert.equal(identity.expectedGraduationYear, 2028);
  });

  it('does not ask a graduate', () => {
    const identity = deriveCareerIdentity({
      currentStatus: 'employed',
      targetRoleTitle: 'Data Analyst',
      currentYear: 2026,
    });
    const asked = identity.missingFields.some((field) => field.id === 'graduationYear');
    assert.equal(asked, false);
  });
});
