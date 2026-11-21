/**
 * The difficulty of a single question in a diagnostic knowledge check.
 *
 * WHY THIS MODULE EXISTS
 * A diagnostic check used to report one number: "4/5". A candidate who
 * answered every easy question correctly and every hard question wrongly
 * scored exactly the same as a candidate who did the opposite, and the
 * candidate could not tell which of the two they were. The check's own
 * catalogue knew the answer — the questions were written at three different
 * levels — but that information never left the data file.
 *
 * So the difficulty is now a first-class property of every question:
 *
 *   1. The candidate sees the difficulty of the question in front of them
 *      before they answer it, so they know what they are being asked.
 *   2. The result is broken down per difficulty, so a strong overall score
 *      cannot hide a weak advanced band.
 *   3. The rule is written once, here, so the badge, the breakdown and the
 *      explanations can never describe the same thing differently.
 */

/* -------------------------------------------------------------------------- */
/* The three levels                                                            */
/* -------------------------------------------------------------------------- */

/** How demanding one question is. */
export type QuestionDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

/** Every difficulty, ordered from least to most demanding. */
export const QUESTION_DIFFICULTIES = [
  'Beginner',
  'Intermediate',
  'Advanced',
] as const;

/** How each difficulty is named to the candidate. */
export const QUESTION_DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  Beginner: 'Beginner',
  Intermediate: 'Intermediate',
  Advanced: 'Advanced',
};

/**
 * What each level means, in one line.
 *
 * These are the sentences the candidate reads next to the badge.
 */
export const QUESTION_DIFFICULTY_DESCRIPTIONS: Record<QuestionDifficulty, string> = {
  Beginner: 'One concept, one correct answer.',
  Intermediate: 'Applied reasoning in a realistic scenario.',
  Advanced: 'Multiple concepts, trade-offs or execution-order diagnosis.',
};

/**
 * The rule, in one sentence, shown with the results.
 *
 * It carries no placeholder: it describes the whole scheme, not one number.
 */
export const ASSESSMENT_DIFFICULTY_RULE =
  'Every question carries a difficulty: Beginner (one concept, one correct answer), Intermediate (applied reasoning in a realistic scenario), Advanced (multiple concepts, trade-offs or execution-order diagnosis). Your result is broken down per difficulty, so a strong overall score cannot hide a weak advanced band.';

/**
 * Narrows an unknown value to a difficulty.
 *
 * Anything that is not one of the three is not a difficulty, and is treated
 * as "not known" rather than silently becoming the easiest level.
 */
export function isQuestionDifficulty(value: unknown): value is QuestionDifficulty {
  return (
    typeof value === 'string' &&
    (QUESTION_DIFFICULTIES as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* The breakdown                                                               */
/* -------------------------------------------------------------------------- */

/** The minimum shape a question needs for the breakdown to work. */
export interface DifficultyQuestion {
  id: string;
  difficulty: QuestionDifficulty;
  correctIndex: number;
}

/** One row of the per-difficulty result. */
export interface DifficultyTally {
  difficulty: QuestionDifficulty;
  /** How many questions of this difficulty were answered correctly. */
  correct: number;
  /** How many questions of this difficulty there were. */
  total: number;
}

/**
 * Counts the answers per difficulty.
 *
 * The answers are the ones the candidate actually gave, keyed by the index of
 * the question in the check. A question with no answer counts as asked and
 * wrong — it is not dropped from the denominator, because a skipped question
 * is a fact about the result.
 *
 * The rows come back in a fixed order (Beginner, Intermediate, Advanced) and
 * a difficulty with no questions is left out entirely, so the breakdown never
 * shows an empty row.
 */
export function difficultyBreakdown(
  questions: readonly DifficultyQuestion[],
  answers: Record<number, number>
): DifficultyTally[] {
  const tallies = new Map<QuestionDifficulty, DifficultyTally>();

  questions.forEach((question, index) => {
    if (!isQuestionDifficulty(question.difficulty)) return;
    const existing = tallies.get(question.difficulty) ?? {
      difficulty: question.difficulty,
      correct: 0,
      total: 0,
    };
    existing.total += 1;
    if (answers[index] === question.correctIndex) {
      existing.correct += 1;
    }
    tallies.set(question.difficulty, existing);
  });

  return QUESTION_DIFFICULTIES.filter((difficulty) => tallies.has(difficulty)).map(
    (difficulty) => tallies.get(difficulty) as DifficultyTally
  );
}

/**
 * The score of one difficulty row, as a percentage.
 *
 * A row with no questions is 0 rather than a division by zero, and the
 * candidate never sees it because empty rows are not produced.
 */
export function difficultyPercentage(tally: DifficultyTally): number {
  if (!tally.total) return 0;
  return Math.round((tally.correct / tally.total) * 100);
}

/**
 * The hardest band the candidate was weak in.
 *
 * This is what makes the breakdown worth reading: a candidate who scored
 * 90% overall but 40% on the advanced band gets told exactly that, instead
 * of being congratulated.
 */
export function weakestDifficulty(
  breakdown: readonly DifficultyTally[]
): DifficultyTally | null {
  const withQuestions = breakdown.filter((row) => row.total > 0);
  if (withQuestions.length === 0) return null;
  return withQuestions.reduce((weakest, row) =>
    difficultyPercentage(row) < difficultyPercentage(weakest) ? row : weakest
  );
}
