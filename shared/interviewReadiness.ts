/**
 * Interview readiness.
 *
 * WHY THIS IS SEPARATE FROM THE APPLICATION PIPELINE
 * The QA audit found a candidate who had practised twelve mock interviews and
 * was told their "interview readiness" was 0% — because the formula counted
 * job applications instead of interview performance. A candidate who has not
 * applied anywhere is not bad at interviews; they have simply not applied
 * yet, and the number was punishing them for the wrong thing.
 *
 * So the four measures the platform reports are independent:
 *
 *   1. Active Applications    — how many applications are live.
 *   2. Mock Interviews Completed — how many mock interviews were practised.
 *   3. Interview Readiness % — how well the candidate performs in interviews,
 *                              measured from the mock interview rubrics and
 *                              the role preparation. It never reads the
 *                              application count.
 *   4. Average Interview Performance — the mean rubric score.
 *
 * Readiness has two halves: how many interviews they have practised, and how
 * well they did in them. A candidate with no mock interviews has not proved
 * they cannot interview — they have simply not practised — so readiness is
 * reported as "not yet measured" rather than as zero.
 */

/** A mock interview session, as this module needs to see it. */
export interface InterviewSessionInput {
  /** The rubric score, 1..10. Absent when the session was never scored. */
  score?: number | null;
  /** The role the session was for. */
  roleTitle?: string | null;
}

/** The four independent interview measures. */
export interface InterviewReadinessMetrics {
  /** How many mock interviews have been practised. */
  mockInterviewsCompleted: number;
  /** How many of them carry a rubric score. */
  scoredInterviews: number;
  /** The mean rubric score, 1..10. Null when nothing has been scored. */
  averagePerformance: number | null;
  /**
   * The readiness percentage, 0..100.
   *
   * Null when it cannot be measured — that is, when no mock interview has
   * been scored. It is deliberately NOT zero: zero says "you are not ready",
   * and the truth is "we do not know yet".
   */
  readinessPct: number | null;
  /** True when readiness could not be measured. */
  isUnmeasured: boolean;
  /** How the readiness figure was arrived at, for the tooltip. */
  formula: string;
}

/**
 * How many mock interviews a candidate should practise before readiness
 * means something.
 *
 * Three is the point at which the practice stops being a single warm-up and
 * starts being a pattern.
 */
export const MOCK_INTERVIEW_TARGET = 3;

/**
 * The readiness figure.
 *
 * Two halves, equally weighted:
 *
 *   * practice — how many mock interviews were completed against the target,
 *     capped at 100%;
 *   * performance — the mean rubric score, as a percentage of the maximum.
 *
 * Readiness is never reduced by how many jobs the candidate has applied to.
 */
export function computeInterviewReadiness(
  sessions: readonly InterviewSessionInput[]
): InterviewReadinessMetrics {
  const scored = sessions
    .map((session) => session.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));

  const averagePerformance =
    scored.length > 0 ? scored.reduce((sum, score) => sum + score, 0) / scored.length : null;

  if (scored.length === 0) {
    return {
      mockInterviewsCompleted: sessions.length,
      scoredInterviews: 0,
      averagePerformance: null,
      readinessPct: null,
      isUnmeasured: true,
      formula:
        'Interview readiness = half practice + half performance. Practice = mock interviews completed ÷ 3. Performance = your average rubric score ÷ 10. It is not measured yet because no mock interview has been scored.',
    };
  }

  const practicePct = Math.min(100, (sessions.length / MOCK_INTERVIEW_TARGET) * 100);
  const performancePct = Math.min(100, ((averagePerformance ?? 0) / 10) * 100);
  const readinessPct = Math.round((practicePct + performancePct) / 2);

  return {
    mockInterviewsCompleted: sessions.length,
    scoredInterviews: scored.length,
    averagePerformance,
    readinessPct,
    isUnmeasured: false,
    formula:
      'Interview readiness = half practice + half performance. Practice = mock interviews completed ÷ 3. Performance = your average rubric score ÷ 10.',
  };
}

/**
 * How many portfolio projects a role expects.
 *
 * The audit's complaint was a card reading "Shipped Projects: 0/0" — a
 * denominator of zero, which told the candidate nothing. The target is at
 * least two, because two projects is the smallest portfolio a hiring manager
 * can read as evidence.
 */
export const DEFAULT_PORTFOLIO_TARGET = 2;

/**
 * The portfolio target for a role.
 *
 * A role that names its own expected projects uses that count. Otherwise the
 * platform's default of two applies.
 */
export function portfolioTarget(expectedProjects?: readonly string[] | null): number {
  const named = expectedProjects?.length ?? 0;
  return Math.max(DEFAULT_PORTFOLIO_TARGET, named);
}
