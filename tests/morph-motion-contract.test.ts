/**
 * Regression checks for the shape-morphing motion system.
 *
 * The morphing primitives are allowed to change how a control LOOKS. They are
 * not allowed to change what it MEANS. These tests protect the two rules
 * that keep that true:
 *
 *   1. A morph only ever shows a state the product is really in. There is no
 *      timer anywhere that decides a control succeeded.
 *   2. A morph never moves the layout. The space a control will need is
 *      reserved before the control needs it.
 *
 * They also protect the accessibility promise: reduced motion removes the
 * travel, not the information, and a state change is announced as well as
 * drawn.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const morph = source('../src/components/motion/Morph.tsx');
const saveStatus = source('../src/components/cv/studio/CvSaveStatusIndicator.tsx');
const copilot = source('../src/components/copilot/CopilotDrawer.tsx');
const liveJobCard = source('../src/components/jobs/LiveJobCard.tsx');
const roadmapView = source('../src/components/views/RoadmapView.tsx');
const assessment = source('../src/components/views/SkillAssessmentView.tsx');
const packageJson = source('../package.json');

describe('the morphing library', () => {
  it('takes its travel away when the visitor asks for reduced motion', () => {
    assert.match(morph, /useReducedMotion\(\)/);
    // Every primitive that moves something consults the preference.
    assert.match(morph, /reduced \? \{ duration: 0 \}/);
    assert.match(morph, /const useShapeTransition = \(\): Transition =>/);
  });

  it('reserves the space a control will need before it needs it', () => {
    // The labels of a control share one grid cell, so the widest of them
    // decides the width and the control is that wide from the first frame.
    assert.match(morph, /col-start-1 row-start-1/);
    assert.match(morph, /relative grid shrink-0/);
  });

  it('announces a state change to a reader as well as drawing it', () => {
    assert.match(morph, /aria-live="polite"/);
    assert.match(morph, /aria-busy=/);
    // The control keeps the name of the ACTION it performs.
    assert.match(morph, /aria-label=\{label\}/);
  });

  it('never invents a success', () => {
    // Nothing in the library decides that an operation worked.
    assert.doesNotMatch(morph, /setTimeout/);
    assert.doesNotMatch(morph, /setInterval/);
    assert.doesNotMatch(morph, /onComplete/);
  });

  it('adds no runtime dependency of its own', () => {
    const dependencies = Object.keys(
      (JSON.parse(packageJson) as { dependencies: Record<string, string> }).dependencies
    );
    // The morphing library is built on the motion library the product
    // already uses. It brings nothing of its own with it.
    assert.ok(dependencies.includes('motion'));
    assert.doesNotMatch(morph, /from '(gsap|lenis|@gsap\/react)'/);
  });
});

describe('a morph only ever shows a state the product is really in', () => {
  it('shows the CV Studio what the autosave actually did', () => {
    assert.match(saveStatus, /cvSaveStatus === 'saving'/);
    assert.match(saveStatus, /state=\{saving \? 'working' : 'done'\}/);
    // The failure keeps the panel it always had, with the reason and a way
    // to try again.
    assert.match(saveStatus, /cvSaveError/);
    assert.match(saveStatus, /Retry/);
  });

  it('shows the assistant what it is really doing', () => {
    assert.match(copilot, /isCopilotTyping \? 'loading'/);
    assert.match(copilot, /await sendCopilotMessage\(q\)/);
    // The confirmation of a sent message is set AFTER the message has gone.
    assert.match(copilot, /await sendCopilotMessage\(q\);\s*\n\s*setJustSent\(true\)/);
  });

  it('shows the job card what is true of the vacancy', () => {
    assert.match(liveJobCard, /state=\{bookmarked \? 'success' : 'idle'\}/);
    assert.match(liveJobCard, /state=\{tracking \? 'loading' : 'idle'\}/);
    assert.match(liveJobCard, /state=\{tailoring \? 'loading' : 'idle'\}/);
  });

  it('shows the roadmap what is true of each step', () => {
    assert.match(roadmapView, /const MILESTONE_STATE: Record<RoadmapTaskStatus, MilestoneMorphState>/);
    assert.match(roadmapView, /state=\{MILESTONE_STATE\[task\.status\]\}/);
    // A step that was skipped is never dressed up as finished.
    assert.match(roadmapView, /skipped: 'available'/);
    assert.match(roadmapView, /blocked: 'locked'/);
  });

  it('shows the assessment what is true of the attempt', () => {
    assert.match(assessment, /syncState === 'saved'/);
    assert.match(assessment, /syncState === 'failed'/);
    // The chosen answer is chosen because the candidate chose it.
    assert.match(assessment, /selectedAnswers\[currentQuestionIndex\] === oIdx/);
  });
});

describe('a morph never changes what a reader hears', () => {
  it('keeps the word of the state beside the shape of the state', () => {
    // The roadmap says the state in words as well as drawing it, so nothing
    // depends on seeing the shape.
    assert.match(roadmapView, /sr-only/);
  });
});
