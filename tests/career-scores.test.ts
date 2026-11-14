import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeCareerScores, CAREER_SCORE_FORMULAS } from '../shared/careerScores.ts';
import { COMPLETENESS_WEIGHTS } from '../shared/profileCompleteness.ts';

const profile = {
  fullName: 'Test Candidate',
  headline: 'Aspiring Data Analyst',
  location: 'Cairo',
  professionalSummary: 'A sufficiently detailed professional summary for scoring.',
  targetRoleTitle: 'Data Analyst',
  educationCount: 1,
  experienceCount: 1,
  ratedSkillCount: 3,
  activeProjectCount: 1,
  certificationCount: 1,
  hasProfessionalLink: true,
  cvVersionCount: 1,
};

describe('unified career score entry point', () => {
  it('returns all seven scores from their shared domain formulas', () => {
    const scores = computeCareerScores({
      skills: [
        { name: 'SQL', currentLevel: 2, targetLevel: 4, importance: 'core', required: true },
        { name: 'Excel', currentLevel: 3, targetLevel: 3, importance: 'core', required: true },
      ],
      roadmapTasks: [{ status: 'completed' }, { status: 'pending' }],
      journey: {
        profile: { complete: true },
        assessment: { attempted: true, completed: true },
        learning: { started: true, completedCourses: 1, totalCourses: 2 },
        projects: { completed: 1, target: 2 },
        apply: { applications: 0, target: 1 },
      },
      profile,
      interviewSessions: [{ score: 8 }, { score: 6 }, { score: 8 }],
    });

    assert.equal(scores.roleReadinessPct, 71);
    assert.equal(scores.skillsMastered, 1);
    assert.equal(scores.skillsTotal, 2);
    assert.equal(scores.skillsBelowTarget, 1);
    assert.equal(scores.roadmapProgressPct, 50);
    assert.equal(scores.roadmapCompleted, 1);
    assert.equal(scores.roadmapTotal, 2);
    assert.equal(scores.interviewReadinessPct, 87);
    assert.equal(scores.averageInterviewPerformance, 22 / 3);
    assert.equal(scores.completedInterviewSessions, 3);
    assert.equal(scores.profileCompletenessPct, scores.careerAssetScore);
  });

  it('preserves the requested profile asset weights and documents each formula', () => {
    assert.equal(COMPLETENESS_WEIGHTS.projects, 15);
    assert.equal(COMPLETENESS_WEIGHTS.certifications, 7);
    assert.equal(COMPLETENESS_WEIGHTS.links, 3);
    assert.equal(COMPLETENESS_WEIGHTS.cv, 2);
    assert.equal(Object.keys(CAREER_SCORE_FORMULAS).length, 7);
    assert.match(CAREER_SCORE_FORMULAS.interviewReadiness, /independent of applications/);
  });

  it('keeps unmeasured interview readiness distinct from zero', () => {
    const scores = computeCareerScores({
      skills: [],
      profile: {},
      interviewSessions: [],
    });
    assert.equal(scores.interviewReadinessPct, null);
  });
});
