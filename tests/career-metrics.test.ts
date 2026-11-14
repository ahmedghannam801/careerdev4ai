/**
 * The Career Intelligence Engine.
 *
 * These tests are the contract for every number the product shows. The QA
 * audit's central complaint was that the same candidate was told four
 * different figures by four different pages, so the engine's job is to make
 * one set of definitions the only source of truth.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAREER_JOURNEY_STAGES,
  CAREER_JOURNEY_STAGE_WEIGHTS,
  computeCareerMetrics,
  computeStageProgress,
  determineCurrentStage,
  explainMetric,
  fromSkillGaps,
  gapReason,
  isCriticalGap,
  METRIC_EXPLANATIONS,
  normalizeImportance,
  type CareerJourneyFacts,
  type MetricSkill,
} from '../shared/careerMetrics.ts';
import { computeSkillGaps, summarizeSkillGaps } from '../shared/skillGap.ts';

describe('the career metrics engine', () => {
  describe('skill gaps', () => {
    it('treats a skill below its target as a gap and a met skill as no gap', () => {
      const skills: MetricSkill[] = [
        { name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true },
        { name: 'Excel', currentLevel: 4, targetLevel: 4, importance: 'medium' },
      ];

      const metrics = computeCareerMetrics({ skills });

      assert.equal(metrics.gaps.length, 1);
      assert.equal(metrics.gaps[0].name, 'SQL');
      assert.equal(metrics.gaps[0].gap, 2);
      assert.equal(metrics.gaps[0].currentLevel, 2);
      assert.equal(metrics.gaps[0].targetLevel, 4);
    });

    it('never reports a negative gap', () => {
      const metrics = computeCareerMetrics({
        skills: [{ name: 'SQL', currentLevel: 5, targetLevel: 3, importance: 'core' }],
      });

      assert.equal(metrics.gaps.length, 0);
    });

    it('explains why a gap was classified the way it was', () => {
      const metrics = computeCareerMetrics({
        skills: [{ name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true }],
      });

      assert.equal(metrics.gaps[0].reasonKey, 'gap_core_requirement');
      assert.match(metrics.gaps[0].reason, /SQL is a core requirement/);
      assert.match(metrics.gaps[0].reason, /2 levels below/);
    });
  });

  describe('critical gaps', () => {
    it('treats a core or high-importance skill as critical at any gap size', () => {
      assert.equal(isCriticalGap({ gap: 1, importance: 'core' }), true);
      assert.equal(isCriticalGap({ gap: 1, importance: 'high' }), true);
      assert.equal(isCriticalGap({ gap: 1, importance: 'medium' }), false);
      assert.equal(isCriticalGap({ gap: 1, importance: 'low' }), false);
    });

    it('treats any gap of two levels or more as critical', () => {
      assert.equal(isCriticalGap({ gap: 2, importance: 'low' }), true);
      assert.equal(isCriticalGap({ gap: 3, importance: 'low' }), true);
    });

    it('never calls a met skill a critical gap', () => {
      assert.equal(isCriticalGap({ gap: 0, importance: 'core' }), false);
    });

    it('separates critical gaps from ordinary ones', () => {
      const metrics = computeCareerMetrics({
        skills: [
          { name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true },
          { name: 'Communication', currentLevel: 3, targetLevel: 4, importance: 'medium' },
        ],
      });

      assert.equal(metrics.gaps.length, 2);
      assert.equal(metrics.criticalGaps.length, 1);
      assert.equal(metrics.criticalGaps[0].name, 'SQL');
    });

    it('reads the role catalogue vocabulary of importance', () => {
      assert.equal(normalizeImportance('Core'), 'core');
      assert.equal(normalizeImportance('required'), 'core');
      assert.equal(normalizeImportance('IMPORTANT'), 'high');
      assert.equal(normalizeImportance('medium'), 'medium');
      assert.equal(normalizeImportance(null), 'low');
    });
  });

  describe('active blockers', () => {
    it('marks a core gap as a blocker', () => {
      const metrics = computeCareerMetrics({
        skills: [{ name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true }],
      });

      assert.equal(metrics.activeBlockers.length, 1);
      assert.equal(metrics.activeBlockers[0].blocker, true);
    });

    it('marks a high-importance gap that the current stage works on as a blocker', () => {
      const metrics = computeCareerMetrics({
        skills: [{ name: 'SQL', currentLevel: 3, targetLevel: 4, importance: 'high' }],
        roadmapTasks: [
          { skillName: 'SQL', stage: 'learning', status: 'pending' },
        ],
        journey: {
          ...emptyJourney(),
          profile: { complete: true },
          assessment: { attempted: true, completed: true },
        },
      });

      assert.equal(metrics.currentStage, 'learning');
      assert.equal(metrics.activeBlockers.length, 1);
      assert.equal(metrics.activeBlockers[0].name, 'SQL');
    });

    it('treats a roadmap task with no stage as part of the current stage', () => {
      const metrics = computeCareerMetrics({
        skills: [{ name: 'SQL', currentLevel: 3, targetLevel: 4, importance: 'high' }],
        roadmapTasks: [{ skillName: 'SQL', status: 'pending' }],
        journey: emptyJourney(),
      });

      assert.equal(metrics.activeBlockers.length, 1);
    });

    it('does not block on a gap the current stage does not work on', () => {
      const metrics = computeCareerMetrics({
        skills: [{ name: 'Statistics', currentLevel: 1, targetLevel: 3, importance: 'high' }],
        roadmapTasks: [{ skillName: 'SQL', stage: 'learning', status: 'pending' }],
        journey: emptyJourney(),
      });

      assert.equal(metrics.activeBlockers.length, 0);
    });

    it('names the career goal in the blocker reason when there is one', () => {
      const metrics = computeCareerMetrics({
        skills: [{ name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true }],
        careerGoal: 'Secure an internship',
      });

      assert.match(metrics.activeBlockers[0].reason, /Secure an internship/);
    });

    it('never reports a non-critical gap as a blocker', () => {
      const metrics = computeCareerMetrics({
        skills: [{ name: 'Communication', currentLevel: 3, targetLevel: 4, importance: 'medium' }],
        blockingSkillNames: ['Communication'],
      });

      assert.equal(metrics.activeBlockers.length, 0);
    });
  });

  describe('role readiness', () => {
    it('is the weighted match of the required skills', () => {
      const metrics = computeCareerMetrics({
        skills: [
          { name: 'SQL', currentLevel: 5, targetLevel: 5, importance: 'core', required: true },
          { name: 'Python', currentLevel: 1, targetLevel: 5, importance: 'core', required: true },
        ],
      });

      // (5 + 1) / (5 + 5) = 60%
      assert.equal(metrics.roleReadinessPct, 60);
    });

    it('does not count a preferred skill towards readiness', () => {
      const metrics = computeCareerMetrics({
        skills: [
          { name: 'SQL', currentLevel: 5, targetLevel: 5, importance: 'core', required: true },
          { name: 'Tableau', currentLevel: 0, targetLevel: 5, importance: 'medium' },
        ],
      });

      assert.equal(metrics.roleReadinessPct, 100);
    });

    it('is zero when the role has no requirements to meet', () => {
      const metrics = computeCareerMetrics({ skills: [] });
      assert.equal(metrics.roleReadinessPct, 0);
    });

    it('counts the skills that meet their target', () => {
      const metrics = computeCareerMetrics({
        skills: [
          { name: 'SQL', currentLevel: 4, targetLevel: 4, importance: 'core', required: true },
          { name: 'Python', currentLevel: 2, targetLevel: 4, importance: 'core', required: true },
        ],
      });

      assert.equal(metrics.skillsMastered, 1);
      assert.equal(metrics.skillsTotal, 2);
    });
  });

  describe('roadmap completion', () => {
    it('is the completed steps over the total steps', () => {
      const metrics = computeCareerMetrics({
        skills: [],
        roadmapTasks: [
          { status: 'completed' },
          { status: 'completed' },
          { status: 'pending' },
          { status: 'pending' },
        ],
      });

      assert.equal(metrics.roadmapCompletionPct, 50);
      assert.equal(metrics.roadmapCompleted, 2);
      assert.equal(metrics.roadmapTotal, 4);
    });

    it('counts a skipped step as not completed', () => {
      const metrics = computeCareerMetrics({
        skills: [],
        roadmapTasks: [{ status: 'skipped' }, { status: 'pending' }],
      });

      assert.equal(metrics.roadmapCompletionPct, 0);
    });

    it('is zero when the plan is empty', () => {
      const metrics = computeCareerMetrics({ skills: [], roadmapTasks: [] });
      assert.equal(metrics.roadmapCompletionPct, 0);
    });
  });

  describe('career journey progress', () => {
    it('weights the five stages', () => {
      const total = Object.values(CAREER_JOURNEY_STAGE_WEIGHTS).reduce((a, b) => a + b, 0);
      assert.equal(total, 100);
      assert.equal(CAREER_JOURNEY_STAGES.length, 5);
    });

    it('is zero for a candidate who has done nothing', () => {
      const metrics = computeCareerMetrics({ skills: [], journey: emptyJourney() });
      assert.equal(metrics.journeyProgressPct, 0);
    });

    it('is a hundred for a candidate who finished every stage', () => {
      const metrics = computeCareerMetrics({
        skills: [],
        journey: {
          profile: { complete: true },
          assessment: { attempted: true, completed: true },
          learning: { started: true, completedCourses: 3, totalCourses: 3 },
          projects: { completed: 2, target: 2 },
          apply: { applications: 5, target: 1 },
        },
      });

      assert.equal(metrics.journeyProgressPct, 100);
    });

    it('gives half credit for an assessment that was started but not finished', () => {
      const progress = computeStageProgress({
        ...emptyJourney(),
        assessment: { attempted: true, completed: false },
      });

      assert.equal(progress.assessment, 50);
    });

    it('scales the project stage against its target', () => {
      const progress = computeStageProgress({
        ...emptyJourney(),
        projects: { completed: 1, target: 2 },
      });

      assert.equal(progress.projects, 50);
    });

    it('knows which stage the candidate is standing in', () => {
      assert.equal(
        determineCurrentStage({
          ...emptyJourney(),
          profile: { complete: true },
          assessment: { attempted: true, completed: true },
        }),
        'learning'
      );
      assert.equal(determineCurrentStage(emptyJourney()), 'profile');
    });
  });

  describe('the explanations', () => {
    it('has an explanation for every metric the interface shows', () => {
      for (const id of ['roleReadiness', 'skillsMastered', 'roadmapCompletion', 'journeyProgress']) {
        assert.ok(METRIC_EXPLANATIONS[id], `missing explanation for ${id}`);
        assert.ok(METRIC_EXPLANATIONS[id].definition.length > 0);
        assert.ok(METRIC_EXPLANATIONS[id].formula.length > 0);
      }
    });

    it('shows the candidate their own arithmetic for roadmap completion', () => {
      const metrics = computeCareerMetrics({
        skills: [],
        roadmapTasks: [{ status: 'completed' }, { status: 'pending' }, { status: 'pending' }, { status: 'pending' }],
      });

      const explanation = explainMetric('roadmapCompletion', metrics);
      assert.equal(explanation.arithmetic, '1 ÷ 4 × 100 = 25%');
    });

    it('explains every gap classification in plain words', () => {
      const core = gapReason({ name: 'SQL', gap: 2, importance: 'core', required: true });
      const high = gapReason({ name: 'Python', gap: 1, importance: 'high' });
      const deep = gapReason({ name: 'Tableau', gap: 3, importance: 'low' });
      const minor = gapReason({ name: 'Communication', gap: 1, importance: 'medium' });

      assert.equal(core.reasonKey, 'gap_core_requirement');
      assert.equal(high.reasonKey, 'gap_high_importance');
      assert.equal(deep.reasonKey, 'gap_two_levels');
      assert.equal(minor.reasonKey, 'gap_below_target');
    });
  });

  describe('bridging to the existing gap engine', () => {
    it('converts the platform gap list into the metrics shape', () => {
      const requirements = {
        requiredSkills: [
          { name: 'SQL', category: 'technical' as const, minLevel: 4 },
          { name: 'Python', category: 'technical' as const, minLevel: 4 },
        ],
        preferredSkills: [],
      };

      const gaps = computeSkillGaps(requirements, [
        { name: 'SQL', level: 2 },
        { name: 'Python', level: 4 },
      ]);

      const bridged = fromSkillGaps(gaps, requirements);

      assert.equal(bridged.length, 1);
      assert.equal(bridged[0].name, 'SQL');
      assert.equal(bridged[0].currentLevel, 2);
      assert.equal(bridged[0].targetLevel, 4);
      assert.equal(bridged[0].critical, true);
    });

    it('agrees with the existing engine on the readiness figure', () => {
      const requirements = {
        requiredSkills: [
          { name: 'SQL', category: 'technical' as const, minLevel: 4 },
          { name: 'Python', category: 'technical' as const, minLevel: 4 },
        ],
        preferredSkills: [],
      };

      const gaps = computeSkillGaps(requirements, [
        { name: 'SQL', level: 2 },
        { name: 'Python', level: 4 },
      ]);
      const summary = summarizeSkillGaps(gaps, requirements);

      const metrics = computeCareerMetrics({
        skills: [
          { name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true },
          { name: 'Python', currentLevel: 4, targetLevel: 4, importance: 'core', required: true },
        ],
      });

      assert.equal(metrics.roleReadinessPct, summary.readinessPct);
    });
  });

  describe('one set of numbers for every page', () => {
    it('gives the same answer however the metrics are asked for', () => {
      const skills: MetricSkill[] = [
        { name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true },
        { name: 'Python', currentLevel: 3, targetLevel: 4, importance: 'high' },
        { name: 'Excel', currentLevel: 5, targetLevel: 4, importance: 'medium' },
      ];
      const roadmapTasks = [
        { status: 'completed', skillName: 'Excel' },
        { status: 'pending', skillName: 'SQL' },
      ];

      const first = computeCareerMetrics({ skills, roadmapTasks, journey: emptyJourney() });
      const second = computeCareerMetrics({ skills, roadmapTasks, journey: emptyJourney() });

      assert.deepEqual(first, second);
    });
  });
});

function emptyJourney(): CareerJourneyFacts {
  return {
    profile: { complete: false },
    assessment: { attempted: false },
    learning: { started: false, completedCourses: 0, totalCourses: 0 },
    projects: { completed: 0, target: 2 },
    apply: { applications: 0, target: 1 },
  };
}
