/**
 * Score definitions.
 *
 * Every percentage in the product has to answer three questions: what it
 * measures, how it is calculated, and what it does not include. The audit
 * found percentages that answered none of them, which made two different
 * numbers look like the same thing.
 *
 * The explanations live here so the tooltip, the breakdown panel and the AI
 * context quote the same definition. The calculations themselves live with
 * their domains (`skillGap.ts` for readiness, `profileCompleteness.ts` for the
 * checklist), and the helpers below are the small formulas the UI needs to
 * show the arithmetic.
 */

export type ScoreId =
  | 'roleReadiness'
  | 'roadmapCompletion'
  | 'cvAts'
  | 'profileCompleteness';

export interface ScoreExplanation {
  id: ScoreId;
  title: string;
  /** One sentence a candidate can read without any other context. */
  definition: string;
  /** The arithmetic, written out. */
  formula: string;
  /** What the score deliberately does not measure. */
  excludes: string;
  /** The main inputs, for a breakdown list. */
  inputs: string[];
}

export const SCORE_EXPLANATIONS: Record<ScoreId, ScoreExplanation> = {
  roleReadiness: {
    id: 'roleReadiness',
    title: 'Role readiness',
    definition:
      'How much of your target role’s required skill level you already meet. 100% means every required skill is at or above the level the role expects.',
    formula:
      'sum(min(your level, required level)) ÷ sum(required level) × 100',
    excludes:
      'Preferred (stretch) skills are shown in the gap list but are not counted. Evidence, projects and courses are not counted twice: they only raise the level they support.',
    inputs: [
      'The required skills of your chosen target role',
      'Your effective level for each skill (best of self-reported, assessed and evidenced)',
    ],
  },
  roadmapCompletion: {
    id: 'roadmapCompletion',
    title: 'Roadmap completion',
    definition:
      'The share of roadmap steps you have finished. Each step is a concrete learning or practice action, not a phase.',
    formula: 'completed steps ÷ total steps × 100',
    excludes:
      'Steps you skipped are counted as not completed, because the plan still has that work in it.',
    inputs: ['Roadmap tasks marked completed', 'All roadmap tasks in the plan'],
  },
  cvAts: {
    id: 'cvAts',
    title: 'CV alignment score',
    definition:
      'How well your CV matches the target role or the job description it was analysed against: keywords, measurable impact, structure and relevance.',
    formula:
      '0.30 × keyword match + 0.25 × measurable impact + 0.20 × structure + 0.25 × relevance, rounded',
    excludes:
      'A score belongs to the role it was generated for. After you change target role, the old score is marked stale rather than reused.',
    inputs: [
      'Keywords in the CV that the role or job description asks for',
      'Quantified achievements',
      'Section structure and formatting',
      'Relevance of the experience to the role',
    ],
  },
  profileCompleteness: {
    id: 'profileCompleteness',
    title: 'Profile completeness',
    definition:
      'A weighted checklist of the sections an employer expects to find. Missing items are listed with the points they are worth, so the number always has an explanation.',
    formula:
      'earned points ÷ 100, where every checklist item is worth a fixed number of points',
    excludes:
      'A roadmap project suggestion does not count as a project. Rate at least three skills; the role’s unrated requirements do not count as yours.',
    inputs: [
      'Basic information and summary',
      'Target role and education',
      'Experience, skills and projects',
      'Certifications, professional links and a saved CV',
    ],
  },
};

/** Rounds a ratio into a whole percentage, with a safe zero denominator. */
export function percentageOf(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

/** Roadmap completion from raw step counts. */
export function roadmapCompletion(
  completedSteps: number,
  totalSteps: number
): { percent: number; completed: number; total: number; formula: string } {
  const percent = percentageOf(completedSteps, totalSteps);
  return {
    percent,
    completed: Math.max(0, completedSteps),
    total: Math.max(0, totalSteps),
    formula: `${Math.max(0, completedSteps)} ÷ ${Math.max(0, totalSteps)} × 100 = ${percent}%`,
  };
}

/**
 * The CV score the UI may show.
 *
 * A saved analysis belongs to the role it was run for. When the target role
 * changed, the caller passes `stale: true` and the UI must show "needs a
 * refresh" rather than the old number as if it were current.
 */
export function cvAlignmentDisplay(input: {
  score: number | null | undefined;
  analysisRoleTitle?: string | null;
  currentRoleTitle?: string | null;
}): { score: number | null; stale: boolean; reason: string | null } {
  if (typeof input.score !== 'number' || !Number.isFinite(input.score)) {
    return { score: null, stale: false, reason: 'No CV analysis has been run yet.' };
  }
  const analysisRole = input.analysisRoleTitle?.trim().toLowerCase() ?? '';
  const currentRole = input.currentRoleTitle?.trim().toLowerCase() ?? '';
  const stale = Boolean(analysisRole && currentRole && analysisRole !== currentRole);
  return {
    score: Math.round(input.score),
    stale,
    reason: stale
      ? `This score was measured for ${input.analysisRoleTitle}, not ${input.currentRoleTitle}. Run a new analysis to refresh it.`
      : null,
  };
}
