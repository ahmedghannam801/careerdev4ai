/**
 * One documented entry point for the seven career scores.
 *
 * Domain-specific formulas remain in their existing pure modules; this
 * aggregator ensures consumers can request the same definitions together.
 */
import {
  computeCareerMetrics,
  type CareerJourneyFacts,
  type MetricRoadmapTask,
  type MetricSkill,
} from './careerMetrics.ts';
import {
  computeProfileCompleteness,
  type ProfileCompletenessInput,
} from './profileCompleteness.ts';
import {
  computeInterviewReadiness,
  type InterviewSessionInput,
} from './interviewReadiness.ts';

export const CAREER_SCORE_FORMULAS = {
  roleReadiness: 'sum(min(current level, required level)) / sum(required levels) * 100',
  skillsMastered:
    'count(target-role skills at or above target AND backed by an assessment or verified evidence) / count(target-role skills)',
  roadmapProgress: 'completed roadmap steps / all roadmap steps * 100',
  careerJourneyCompletion: 'weighted mean of Profile 10, Assessment 20, Learning 25, Projects 25, Apply 20',
  profileCompleteness: 'earned points / 100; projects 15, certifications 7, links 3, saved CV 2',
  careerAssetScore: 'the same auditable 100-point career-asset checklist used for profile completeness',
  interviewReadiness:
    'a third practice (mock interviews completed ÷ 3), a third performance (average rubric score ÷ 10) and a third skill readiness; independent of applications',
} as const;

export interface CareerScoresInput {
  skills: MetricSkill[];
  roadmapTasks?: MetricRoadmapTask[];
  journey?: CareerJourneyFacts;
  blockingSkillNames?: string[];
  careerGoal?: string | null;
  profile: ProfileCompletenessInput;
  interviewSessions: readonly InterviewSessionInput[];
  /**
   * The candidate's skill readiness, as a percentage.
   *
   * It is the third part of interview readiness: the mock interview rubrics
   * say how the candidate performed, and this says how ready the skills they
   * would be interviewed on actually are.
   */
  skillReadinessPct?: number | null;
}

export function computeCareerScores(input: CareerScoresInput) {
  const metrics = computeCareerMetrics({
    skills: input.skills,
    roadmapTasks: input.roadmapTasks,
    journey: input.journey,
    blockingSkillNames: input.blockingSkillNames,
    careerGoal: input.careerGoal,
  });
  const completeness = computeProfileCompleteness(input.profile);
  const interview = computeInterviewReadiness(input.interviewSessions, input.skillReadinessPct);

  return {
    roleReadinessPct: metrics.roleReadinessPct,
    skillsMastered: metrics.skillsMastered,
    skillsTotal: metrics.skillsTotal,
    // The identity the platform keeps everywhere:
    // Target Role Skills = Skills Mastered + Skills Below Target.
    skillsBelowTarget: metrics.skillsBelowTarget,
    skillsClaimedOnly: metrics.skillsClaimedOnly,
    roadmapProgressPct: metrics.roadmapCompletionPct,
    roadmapCompleted: metrics.roadmapCompleted,
    roadmapTotal: metrics.roadmapTotal,
    careerJourneyCompletionPct: metrics.journeyProgressPct,
    profileCompletenessPct: completeness.overallPercent,
    careerAssetScore: completeness.overallPercent,
    interviewReadinessPct: interview.readinessPct,
    averageInterviewPerformance: interview.averagePerformance,
    completedInterviewSessions: interview.mockInterviewsCompleted,
    metrics,
    completeness,
    interview,
    formulas: CAREER_SCORE_FORMULAS,
  };
}
