import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeCareerMetrics, toMetricSkills } from '../shared/careerMetrics.ts';
import { computeProgressSnapshot } from '../shared/progressMetrics.ts';

describe('cross-page career metric consistency', () => {
  it('keeps Dashboard/Roadmap engine totals aligned with Progress for the same account', () => {
    const contextSkills = [
      { name: 'SQL', currentLevel: 4, targetLevel: 4, gap: 0, required: true, source: 'verified_evidence' },
      { name: 'Python', currentLevel: 4, targetLevel: 4, gap: 0, required: true, source: 'self_reported' },
      { name: 'Excel', currentLevel: 2, targetLevel: 4, gap: 2, required: false, source: 'assessment' },
    ];
    const phases = [{ milestones: [{ tasks: [{ status: 'completed' }, { status: 'in_progress' }] }] }];

    const engine = computeCareerMetrics({
      skills: toMetricSkills(contextSkills),
      roadmapTasks: [{ status: 'completed' }, { status: 'in_progress' }],
      cvReadinessPct: 0,
    });
    const progress = computeProgressSnapshot({ skills: contextSkills, roadmapPhases: phases });

    assert.equal(progress.masteredSkills, engine.skillsMastered);
    assert.equal(progress.roadmapPct, engine.roadmapCompletionPct);
    assert.equal(progress.completedTasks, engine.roadmapCompleted);
    assert.equal(progress.totalTasks, engine.roadmapTotal);
  });

  it('covers the seven representative account transitions without cross-page drift', () => {
    const cases = [
      { name: 'new account', skills: [], taskStatuses: [] },
      { name: 'self-reported skill', skills: [{ name: 'SQL', currentLevel: 4, targetLevel: 4, source: 'self_reported' }], taskStatuses: [] },
      { name: 'verified evidence', skills: [{ name: 'SQL', currentLevel: 4, targetLevel: 4, source: 'verified_evidence' }], taskStatuses: [] },
      { name: 'completed and incomplete assessments', skills: [{ name: 'SQL', currentLevel: 4, targetLevel: 4, source: 'assessment' }, { name: 'Python', currentLevel: 2, targetLevel: 4, source: null }], taskStatuses: [] },
      { name: 'missing or role-mismatched CV', skills: [{ name: 'SQL', currentLevel: 4, targetLevel: 4, source: 'verified_evidence' }], taskStatuses: [], cvReadinessPct: 0 },
      { name: 'partially completed roadmap', skills: [], taskStatuses: ['completed', 'in_progress', 'not_started'] },
      { name: 'role change and newly added evidence', skills: [{ name: 'SQL', currentLevel: 4, targetLevel: 5, source: 'verified_evidence' }, { name: 'Python', currentLevel: 3, targetLevel: 5, source: 'assessment' }], taskStatuses: ['completed'] },
    ];

    for (const scenario of cases) {
      const phases = [{ milestones: [{ tasks: scenario.taskStatuses.map((status) => ({ status })) }] }];
      const engine = computeCareerMetrics({
        skills: toMetricSkills(scenario.skills),
        roadmapTasks: scenario.taskStatuses.map((status) => ({ status })),
        cvReadinessPct: 'cvReadinessPct' in scenario ? scenario.cvReadinessPct : undefined,
      });
      const progress = computeProgressSnapshot({ skills: scenario.skills, roadmapPhases: phases });
      assert.equal(progress.masteredSkills, engine.skillsMastered, scenario.name);
      assert.equal(progress.roadmapPct, engine.roadmapCompletionPct, scenario.name);
      assert.equal(progress.completedTasks, engine.roadmapCompleted, scenario.name);
      assert.equal(progress.totalTasks, engine.roadmapTotal, scenario.name);
    }
  });

  it('does not turn missing proof or CV data into readiness/mastery credit', () => {
    const skills = toMetricSkills([
      { name: 'SQL', currentLevel: 5, targetLevel: 5, required: true },
    ]);
    const metrics = computeCareerMetrics({ skills });
    assert.equal(metrics.skillsMastered, 0);
    assert.equal(metrics.roleReadinessPct, 52);
  });
});
