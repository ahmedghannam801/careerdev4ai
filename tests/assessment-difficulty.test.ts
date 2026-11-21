/**
 * Tests for the per-question difficulty of a diagnostic knowledge check.
 *
 * What these lock down:
 *
 *   * every question in the catalogue carries a real difficulty, so no
 *     question can quietly fall back to being "easy";
 *   * the breakdown counts the answers the candidate actually gave, per
 *     difficulty, and a skipped question stays in the denominator;
 *   * the breakdown is ordered from Beginner to Advanced and never shows an
 *     empty row;
 *   * the weakest band is the one with the lowest score, not the one that
 *     happens to come first.
 *
 * These are pure: they need no browser, no server and no database.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  ASSESSMENT_DIFFICULTY_RULE,
  QUESTION_DIFFICULTIES,
  QUESTION_DIFFICULTY_DESCRIPTIONS,
  QUESTION_DIFFICULTY_LABELS,
  difficultyBreakdown,
  difficultyPercentage,
  isQuestionDifficulty,
  weakestDifficulty,
  type DifficultyQuestion,
  type QuestionDifficulty,
} from '../src/lib/assessmentDifficulty.ts';

function question(
  id: string,
  difficulty: QuestionDifficulty,
  correctIndex = 0
): DifficultyQuestion {
  return { id, difficulty, correctIndex };
}

describe('question difficulty vocabulary', () => {
  it('knows exactly three levels, ordered from least to most demanding', () => {
    assert.deepEqual(QUESTION_DIFFICULTIES, ['Beginner', 'Intermediate', 'Advanced']);
  });

  it('names and explains every level', () => {
    for (const difficulty of QUESTION_DIFFICULTIES) {
      assert.ok(QUESTION_DIFFICULTY_LABELS[difficulty]);
      assert.ok(QUESTION_DIFFICULTY_DESCRIPTIONS[difficulty]);
    }
  });

  it('accepts only real difficulties', () => {
    assert.equal(isQuestionDifficulty('Beginner'), true);
    assert.equal(isQuestionDifficulty('Advanced'), true);
    assert.equal(isQuestionDifficulty('Expert'), false);
    assert.equal(isQuestionDifficulty('beginner'), false);
    assert.equal(isQuestionDifficulty(undefined), false);
    assert.equal(isQuestionDifficulty(3), false);
  });

  it('publishes the rule in words', () => {
    assert.match(ASSESSMENT_DIFFICULTY_RULE, /Beginner/);
    assert.match(ASSESSMENT_DIFFICULTY_RULE, /Intermediate/);
    assert.match(ASSESSMENT_DIFFICULTY_RULE, /Advanced/);
  });
});

describe('difficulty breakdown', () => {
  const questions = [
    question('q1', 'Beginner', 0),
    question('q2', 'Beginner', 1),
    question('q3', 'Intermediate', 0),
    question('q4', 'Advanced', 0),
    question('q5', 'Advanced', 2),
  ];

  it('counts the answers the candidate gave, per difficulty', () => {
    const rows = difficultyBreakdown(questions, {
      0: 0, // Beginner, correct
      1: 0, // Beginner, wrong
      2: 0, // Intermediate, correct
      3: 0, // Advanced, correct
      4: 1, // Advanced, wrong
    });

    assert.deepEqual(rows, [
      { difficulty: 'Beginner', correct: 1, total: 2 },
      { difficulty: 'Intermediate', correct: 1, total: 1 },
      { difficulty: 'Advanced', correct: 1, total: 2 },
    ]);
  });

  it('keeps a skipped question in the denominator', () => {
    const rows = difficultyBreakdown(questions, { 0: 0 });
    const beginner = rows.find((row) => row.difficulty === 'Beginner');
    assert.ok(beginner);
    assert.equal(beginner.total, 2);
    assert.equal(beginner.correct, 1);
  });

  it('returns the rows ordered from Beginner to Advanced', () => {
    const rows = difficultyBreakdown(questions, {});
    assert.deepEqual(
      rows.map((row) => row.difficulty),
      ['Beginner', 'Intermediate', 'Advanced']
    );
  });

  it('leaves out a difficulty that has no questions', () => {
    const rows = difficultyBreakdown([question('q1', 'Advanced', 0)], { 0: 0 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].difficulty, 'Advanced');
  });

  it('returns nothing for a check with no questions', () => {
    assert.deepEqual(difficultyBreakdown([], {}), []);
  });

  it('ignores a question whose difficulty is not a real level', () => {
    const broken = [{ id: 'q1', difficulty: 'Expert' as never, correctIndex: 0 }];
    assert.deepEqual(difficultyBreakdown(broken, { 0: 0 }), []);
  });

  it('turns a row into a percentage', () => {
    assert.equal(difficultyPercentage({ difficulty: 'Beginner', correct: 1, total: 2 }), 50);
    assert.equal(difficultyPercentage({ difficulty: 'Beginner', correct: 3, total: 3 }), 100);
    assert.equal(difficultyPercentage({ difficulty: 'Beginner', correct: 0, total: 0 }), 0);
  });
});

describe('the question catalogue', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const catalogue = readFileSync(
    join(here, '..', 'src', 'components', 'views', 'SkillAssessmentView.tsx'),
    'utf8'
  );

  it('gives every question a real difficulty', () => {
    const ids = [...catalogue.matchAll(/id: '([a-z]+-\d+)',/g)].map((match) => match[1]);
    assert.ok(ids.length > 0, 'the catalogue should hold questions');

    for (const id of ids) {
      const pattern = new RegExp(`id: '${id}',\\s*difficulty: '(Beginner|Intermediate|Advanced)'`);
      assert.match(catalogue, pattern, `question ${id} has no difficulty`);
    }
  });

  it('uses all three difficulties somewhere in the catalogue', () => {
    for (const difficulty of QUESTION_DIFFICULTIES) {
      assert.ok(
        catalogue.includes(`difficulty: '${difficulty}'`),
        `no question is marked ${difficulty}`
      );
    }
  });

  it('never marks a question with a level outside the three', () => {
    const used = [...catalogue.matchAll(/difficulty: '([^']+)'/g)].map((match) => match[1]);
    for (const value of used) {
      assert.ok(
        (QUESTION_DIFFICULTIES as readonly string[]).includes(value),
        `"${value}" is not a known difficulty`
      );
    }
  });
});

describe('the weakest band', () => {
  it('is the band with the lowest score, not the first one', () => {
    const rows = difficultyBreakdown(
      [question('q1', 'Beginner', 0), question('q2', 'Advanced', 0)],
      { 0: 0, 1: 1 }
    );
    const weakest = weakestDifficulty(rows);
    assert.ok(weakest);
    assert.equal(weakest.difficulty, 'Advanced');
    assert.equal(difficultyPercentage(weakest), 0);
  });

  it('is nothing when the check had no questions', () => {
    assert.equal(weakestDifficulty([]), null);
  });

  it('ignores a band with no questions when looking for the weakest', () => {
    const weakest = weakestDifficulty([
      { difficulty: 'Beginner', correct: 0, total: 0 },
      { difficulty: 'Advanced', correct: 1, total: 1 },
    ]);
    assert.ok(weakest);
    assert.equal(weakest.difficulty, 'Advanced');
  });
});
