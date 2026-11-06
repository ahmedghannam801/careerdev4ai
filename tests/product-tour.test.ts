import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_CHAPTERS, ALL_TOUR_STEPS, TOTAL_TOUR_STEPS } from '../src/components/onboarding/tourData';
import { tourAr } from '../src/translations/parts/tour';

test('Product Tour Structure: 10 Chapters and 47 Steps', () => {
  assert.equal(TOUR_CHAPTERS.length, 10, 'Expected exactly 10 tour chapters');
  assert.equal(TOTAL_TOUR_STEPS, 47, 'Expected exactly 47 tour steps total');
  assert.equal(ALL_TOUR_STEPS.length, 47, 'Expected ALL_TOUR_STEPS to contain 47 steps');

  // Verify chapter step counts per requirements
  const expectedStepsPerChapter: Record<string, number> = {
    'welcome': 5,
    'dashboard': 6,
    'career-planning': 5,
    'roadmap': 5,
    'learning': 5,
    'skills': 4,
    'projects': 4,
    'opportunities': 4,
    'career-tools': 5,
    'profile-progress': 4,
  };

  for (const chapter of TOUR_CHAPTERS) {
    const expected = expectedStepsPerChapter[chapter.id];
    assert.equal(
      chapter.steps.length,
      expected,
      `Chapter ${chapter.id} should have ${expected} steps, found ${chapter.steps.length}`
    );
  }
});

test('Product Tour Step Integrity & Properties', () => {
  const seenStepIds = new Set<string>();

  for (const step of ALL_TOUR_STEPS) {
    assert.ok(step.id, 'Step must have an ID');
    assert.ok(!seenStepIds.has(step.id), `Step ID ${step.id} must be unique`);
    seenStepIds.add(step.id);

    assert.ok(step.chapterId, `Step ${step.id} must specify chapterId`);
    assert.ok(step.view, `Step ${step.id} must specify view`);
    assert.ok(step.target, `Step ${step.id} must specify target selector`);
    assert.ok(step.title, `Step ${step.id} must have a title`);
    assert.ok(step.body, `Step ${step.id} must have a body`);
  }
});

test('Product Tour Arabic Localization Coverage', () => {
  for (const chapter of TOUR_CHAPTERS) {
    assert.ok(tourAr[chapter.title], `Missing Arabic translation for chapter title: ${chapter.title}`);
    assert.ok(tourAr[chapter.description], `Missing Arabic translation for chapter description: ${chapter.description}`);

    for (const step of chapter.steps) {
      assert.ok(tourAr[step.title], `Missing Arabic translation for step title: ${step.title}`);
      assert.ok(tourAr[step.body], `Missing Arabic translation for step body: ${step.body}`);
      if (step.example) {
        assert.ok(tourAr[step.example], `Missing Arabic translation for step example: ${step.example}`);
      }
    }
  }
});

