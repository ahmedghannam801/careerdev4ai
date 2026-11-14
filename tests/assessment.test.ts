/**
 * Behavioural checks for the diagnostic assessment rules.
 *
 * A candidate scored 100% on the Python check and the platform showed
 * "Level 5" on one screen and "4/5" on another, with nothing explaining
 * either number. These tests protect the three promises that fixed it:
 *
 *   - a knowledge check stops at 4/5, and only practical proof reaches 5/5;
 *   - every level says where it came from;
 *   - a general check does not silently become a role-specialised skill.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ASSESSMENT_RUBRIC,
  ASSESSMENT_SCOPE_GENERAL,
  ASSESSMENT_SCOPE_ROLE_SPECIALISED,
  DIAGNOSTIC_CEILING,
  SKILL_LEVEL_SOURCE_LABELS,
  VERIFIED_MASTERY_LEVEL,
  assessmentScope,
  assessmentScopeSentence,
  describeAttempt,
  explainAssessmentLevel,
  levelForAssessmentScore,
  readinessImpact,
  rubricBandFor,
  type AssessmentAttempt,
} from '../shared/assessment.ts';

describe('the scoring rubric', () => {
  it('publishes every band', () => {
    assert.deepEqual(
      ASSESSMENT_RUBRIC.map((band) => band.level),
      [5, 4, 3, 2, 1]
    );
    for (const band of ASSESSMENT_RUBRIC) {
      assert.ok(band.label.length > 0);
      assert.ok(band.description.length > 0);
    }
  });

  it('maps a score to its band', () => {
    assert.equal(rubricBandFor(95).level, 4);
    assert.equal(rubricBandFor(85).level, 4);
    assert.equal(rubricBandFor(65).level, 3);
    assert.equal(rubricBandFor(45).level, 2);
    assert.equal(rubricBandFor(10).level, 1);
  });

  it('keeps the top band for the score that reaches it with proof', () => {
    const topBand = ASSESSMENT_RUBRIC.find((band) => band.level === 5);
    assert.equal(topBand?.from, 90);
    assert.equal(levelForAssessmentScore(95, true), 5);
  });
});

describe('a knowledge check stops at 4/5', () => {
  it('caps a perfect score at 4 without practical proof', () => {
    assert.equal(levelForAssessmentScore(100), 4);
    assert.equal(levelForAssessmentScore(100, false), DIAGNOSTIC_CEILING);
  });

  it('reaches 5 with practical proof', () => {
    assert.equal(levelForAssessmentScore(100, true), VERIFIED_MASTERY_LEVEL);
    assert.equal(levelForAssessmentScore(90, true), 5);
  });

  it('does not reach 5 below the threshold', () => {
    assert.equal(levelForAssessmentScore(89, true), 4);
  });

  it('maps the bands the same way with and without proof', () => {
    assert.equal(levelForAssessmentScore(85), 4);
    assert.equal(levelForAssessmentScore(65), 3);
    assert.equal(levelForAssessmentScore(45), 2);
    assert.equal(levelForAssessmentScore(10), 1);
  });

  it('explains why the level is what it is', () => {
    const template = explainAssessmentLevel(100, false);
    assert.match(template, /\{level\}/);
    assert.match(template, /\{ceiling\}/);
    const withEvidence = explainAssessmentLevel(100, true);
    assert.notEqual(template, withEvidence);
  });
});

describe('what a check tests', () => {
  it('knows a general skill', () => {
    assert.equal(assessmentScope('Python'), 'general_fundamentals');
    assert.equal(assessmentScope('SQL'), 'general_fundamentals');
  });

  it('knows a role-specialised skill', () => {
    assert.equal(assessmentScope('Python for Data Analysis'), 'role_specialized');
    assert.equal(assessmentScope('Advanced Excel'), 'role_specialized');
  });

  it('uses a different sentence for each', () => {
    assert.equal(
      assessmentScopeSentence('Python'),
      ASSESSMENT_SCOPE_GENERAL
    );
    assert.equal(
      assessmentScopeSentence('Python for Data Analysis'),
      ASSESSMENT_SCOPE_ROLE_SPECIALISED
    );
  });
});

describe('every level says where it came from', () => {
  it('names each source', () => {
    assert.equal(SKILL_LEVEL_SOURCE_LABELS.direct_assessment, 'Direct Assessment');
    assert.equal(SKILL_LEVEL_SOURCE_LABELS.self_reported, 'Self-Reported');
    assert.equal(
      SKILL_LEVEL_SOURCE_LABELS.ai_estimated_from_cv,
      'AI-Estimated from CV'
    );
    assert.equal(SKILL_LEVEL_SOURCE_LABELS.project_evidence, 'Project Evidence');
  });
});

describe('the attempt log', () => {
  const attempt: AssessmentAttempt = {
    id: 'a-1',
    skill: 'Python',
    categoryTitle: 'Python Fundamentals',
    score: 4,
    total: 5,
    percentage: 80,
    level: 4,
    completedAt: '2026-11-20T10:00:00.000Z',
    practicalBacked: false,
    scope: 'general_fundamentals',
  };

  it('summarises the attempt with its band', () => {
    const summary = describeAttempt(attempt);
    assert.match(summary, /Python/);
    assert.match(summary, /4\/5/);
    assert.match(summary, /Advanced Knowledge/);
  });
});

describe('the readiness impact is a number, not a feeling', () => {
  it('states the exact change', () => {
    const impact = readinessImpact({
      before: 62,
      after: 71.5,
      linkedSkills: ['SQL'],
    });
    assert.equal(impact.delta, 9.5);
    assert.match(impact.sentence, /\+9\.5% Role Readiness/);
    assert.match(impact.sentence, /SQL/);
  });

  it('says plainly when nothing changed', () => {
    const impact = readinessImpact({ before: 60, after: 60, linkedSkills: ['SQL'] });
    assert.equal(impact.delta, 0);
    assert.match(impact.sentence, /No change/);
  });
});
