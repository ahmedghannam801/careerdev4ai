/**
 * Interview readiness and the portfolio target.
 *
 * The QA audit's BUG-23: a candidate who had never applied to a job was
 * shown an interview readiness of 0%, because the formula counted job
 * applications instead of interview performance. And BUG-22: a card reading
 * "Shipped Projects: 0/0", whose denominator of zero told the candidate
 * nothing about what they were aiming for.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeInterviewReadiness,
  DEFAULT_PORTFOLIO_TARGET,
  MOCK_INTERVIEW_TARGET,
  portfolioTarget,
} from '../shared/interviewReadiness.ts';

describe('interview readiness', () => {
  it('is not measured when no mock interview has been scored', () => {
    const metrics = computeInterviewReadiness([]);

    assert.equal(metrics.readinessPct, null);
    assert.equal(metrics.isUnmeasured, true);
    assert.equal(metrics.averagePerformance, null);
  });

  it('is not zero when nothing has been practised', () => {
    // Zero would say "you are not ready". The truth is "we do not know yet".
    const metrics = computeInterviewReadiness([{ score: null }]);

    assert.equal(metrics.readinessPct, null);
    assert.notEqual(metrics.readinessPct, 0);
  });

  it('does not read the number of job applications', () => {
    // The function has no application input at all: readiness is measured
    // from the interviews alone. A candidate who has applied nowhere is not
    // penalised, because the measure never looks.
    //
    // Three interviews (practice 100%) scoring 8/10 (performance 80%) gives
    // (100 + 80) / 2 = 90.
    const metrics = computeInterviewReadiness([
      { score: 8 },
      { score: 8 },
      { score: 8 },
    ]);

    assert.equal(metrics.readinessPct, 90);
  });

  it('weighs practice and performance together', () => {
    // Three interviews (practice 100%) scoring 5/10 (performance 50%).
    const metrics = computeInterviewReadiness([
      { score: 5 },
      { score: 5 },
      { score: 5 },
    ]);

    assert.equal(metrics.readinessPct, 75);
  });

  it('reports the average performance out of ten', () => {
    const metrics = computeInterviewReadiness([{ score: 6 }, { score: 8 }]);

    assert.equal(metrics.averagePerformance, 7);
    assert.equal(metrics.scoredInterviews, 2);
  });

  it('counts every mock interview, scored or not', () => {
    const metrics = computeInterviewReadiness([{ score: 7 }, { score: null }]);

    assert.equal(metrics.mockInterviewsCompleted, 2);
    assert.equal(metrics.scoredInterviews, 1);
  });

  it('caps the practice half at the target', () => {
    const many = Array.from({ length: 10 }, () => ({ score: 10 }));
    const metrics = computeInterviewReadiness(many);

    assert.equal(metrics.readinessPct, 100);
    assert.equal(MOCK_INTERVIEW_TARGET, 3);
  });

  it('never exceeds a hundred', () => {
    const metrics = computeInterviewReadiness([{ score: 12 }, { score: 11 }]);

    assert.ok((metrics.readinessPct ?? 0) <= 100);
  });

  it('explains how the number was reached', () => {
    const metrics = computeInterviewReadiness([{ score: 7 }]);

    assert.match(metrics.formula, /practice/i);
    assert.match(metrics.formula, /performance/i);
  });
});

describe('the portfolio target', () => {
  it('is at least two projects', () => {
    assert.equal(portfolioTarget([]), DEFAULT_PORTFOLIO_TARGET);
    assert.equal(portfolioTarget(null), DEFAULT_PORTFOLIO_TARGET);
    assert.equal(portfolioTarget(undefined), DEFAULT_PORTFOLIO_TARGET);
    assert.equal(DEFAULT_PORTFOLIO_TARGET, 2);
  });

  it('uses the role’s own expected projects when it names more', () => {
    assert.equal(portfolioTarget(['One', 'Two', 'Three']), 3);
  });

  it('never drops below two, whatever the role says', () => {
    assert.equal(portfolioTarget(['Only one']), 2);
  });
});
