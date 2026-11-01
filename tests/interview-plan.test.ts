/**
 * The sequential adaptive interview plan and the catalogue's provider and
 * availability vocabulary.
 *
 * These rules are pure, so they run without a database or a model call:
 *
 *   - one full mock interview is 15 questions: behavioural/personal first,
 *     then technical questions for the primary target role;
 *   - the behavioural half is adapted to the candidate's real CV;
 *   - availability is reduced to FREE, FREE AUDIT and PAID, and an audit is
 *     never labelled as a free certificate;
 *   - Tier 1 providers are the priority list and tier is not eligibility.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  INTERVIEW_QUESTION_COUNT,
  buildInterviewPlan,
} from '../src/data/interviewBank.ts';
import { resolveRole } from '../shared/careerRoles.ts';
import {
  availabilityBucket,
  availabilityLabel,
  providerTier,
} from '../shared/courseProviders.ts';

const dataAnalyst = resolveRole('data-analyst');
assert.ok(dataAnalyst, 'the data-analyst role must exist');

describe('adaptive interview plan', () => {
  const plan = buildInterviewPlan({
    role: dataAnalyst!,
    experiences: [
      {
        role: 'Data Analyst Intern',
        company: 'NTI',
        achievements: ['Built a Power BI dashboard for course completion'],
      },
    ],
    projects: [
      {
        title: 'Workflow Hub',
        description: 'A workflow tracker built for a volunteer programme',
      },
    ],
    volunteering: [
      {
        organization: 'EYE',
        role: 'Volunteer Data Coordinator',
        responsibilities: ['Maintained the Workflow Hub for the team'],
        achievements: ['Reduced manual reporting time'],
      },
    ],
    completedTraining: [
      { title: 'AI for Business', provider: 'ITIDA & NTI' },
    ],
    ownedSkills: ['Power BI', 'Excel'],
  });

  it('is a 15-question interview', () => {
    assert.equal(plan.length, INTERVIEW_QUESTION_COUNT);
    assert.equal(plan.length, 15);
  });

  it('puts behavioural and personal questions first', () => {
    assert.deepEqual(
      plan.slice(0, 8).map((question) => question.stage),
      Array(8).fill('behavioral')
    );
    assert.deepEqual(
      plan.slice(8).map((question) => question.stage),
      Array(7).fill('technical')
    );
  });

  it('adapts the behavioural half to the real CV', () => {
    const behavioural = plan.filter((question) => question.stage === 'behavioral');
    const text = behavioural.map((question) => question.question).join(' ');

    assert.match(text, /EYE/);
    assert.match(text, /Workflow Hub/);
    assert.match(text, /AI for Business/);
  });

  it('builds the technical half from the primary target role', () => {
    const technical = plan.filter((question) => question.stage === 'technical');
    assert.ok(technical.length > 0);
    for (const question of technical) {
      assert.equal(question.stage, 'technical');
      assert.equal(question.roleTarget, dataAnalyst!.id);
    }
    assert.ok(
      technical.some((question) => /data analyst/i.test(question.question)),
      'at least one technical question must name the target role'
    );
  });

  it('keeps question indexes contiguous and one-based in the UI', () => {
    assert.deepEqual(
      plan.map((question) => question.index),
      Array.from({ length: 15 }, (_, index) => index)
    );
  });
});

describe('course provider tiers', () => {
  it('prioritises the Tier 1 providers', () => {
    for (const provider of [
      'Harvard University / edX',
      'CS50',
      'MIT OpenCourseWare',
      'edX',
      'Stanford University',
      'Microsoft Learn',
      'IBM SkillsBuild',
      'Google',
      'Cisco Networking Academy',
      'OpenLearn',
      'Kaggle Learn',
    ]) {
      assert.equal(providerTier(provider), 1, `${provider} must be Tier 1`);
    }
  });

  it('recognises other reputable providers as Tier 2', () => {
    assert.equal(providerTier('Coursera'), 2);
    assert.equal(providerTier('DataCamp'), 2);
    assert.equal(providerTier('HubSpot Academy'), 2);
  });

  it('leaves an unknown provider at Tier 3', () => {
    assert.equal(providerTier('Some Local Training Company'), 3);
  });
});

describe('course availability vocabulary', () => {
  it('distinguishes FREE, FREE AUDIT and PAID', () => {
    assert.equal(availabilityLabel('free'), 'FREE');
    assert.equal(availabilityLabel('audit'), 'FREE AUDIT');
    assert.equal(availabilityLabel('free_with_limitations'), 'FREE AUDIT');
    assert.equal(availabilityLabel('paid'), 'PAID');
  });

  it('never labels an audit as a free certificate', () => {
    assert.equal(availabilityBucket('audit'), 'free_audit');
    assert.notEqual(availabilityLabel('audit'), 'FREE');
  });

  it('treats a free course with a paid certificate as FREE', () => {
    assert.equal(availabilityBucket('free_course_paid_certificate'), 'free');
    assert.equal(availabilityLabel('free_course_paid_certificate'), 'FREE');
  });
});
