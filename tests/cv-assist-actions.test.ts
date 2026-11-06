/**
 * The AI suggestions offered on each section of the CV.
 *
 * The assistant used to have exactly one mode: write the field. A candidate
 * who wanted their experience turned into bullet points, their achievements
 * suggested, or their own wording tightened had no way to ask for it.
 *
 * Two things are protected here.
 *
 * The first is that an action is never offered where it makes no sense: a
 * certificate has no achievements to suggest, and the control must not
 * pretend otherwise.
 *
 * The second is that an action changes what the model is asked for, and only
 * that. The grounding rules, the candidate's own record and the check that
 * removes a claim the candidate cannot stand behind are in the prompt for
 * EVERY action — an action is a different instruction, never a weaker set of
 * rules.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CV_ASSIST_ACTIONS,
  CV_ASSIST_ACTION_ORDER,
  cvAssistActionsFor,
  isCvAssistAction,
  resolveCvAssistAction,
  type CvAssistField,
} from '../shared/cvAiAssist.ts';

import { buildCvAssistPrompt } from '../server/cv/aiAssist.ts';

describe('the AI actions', () => {
  it('knows every action it offers', () => {
    for (const action of CV_ASSIST_ACTION_ORDER) {
      assert.ok(CV_ASSIST_ACTIONS[action], `${action} has no specification`);
      assert.ok(
        CV_ASSIST_ACTIONS[action].instruction.length > 20,
        `${action} has no real instruction`
      );
    }
  });

  it('rejects an action it does not offer', () => {
    assert.equal(isCvAssistAction('write'), true);
    assert.equal(isCvAssistAction('improve'), true);
    assert.equal(isCvAssistAction('invent'), false);
    assert.equal(isCvAssistAction(''), false);
    assert.equal(isCvAssistAction(undefined), false);
  });

  it('offers a plain write for every field', () => {
    const fields: CvAssistField[] = [
      'summary',
      'headline',
      'experience',
      'education',
      'project',
      'certification',
      'course',
      'volunteering',
      'skills',
    ];
    for (const field of fields) {
      assert.ok(
        cvAssistActionsFor(field).includes('write'),
        `${field} cannot be written`
      );
    }
  });

  it('does not offer achievements for a field that has none', () => {
    assert.ok(!cvAssistActionsFor('certification').includes('achievements'));
    assert.ok(!cvAssistActionsFor('education').includes('achievements'));
    assert.ok(!cvAssistActionsFor('course').includes('achievements'));
    assert.ok(cvAssistActionsFor('experience').includes('achievements'));
    assert.ok(cvAssistActionsFor('volunteering').includes('achievements'));
  });

  it('only offers responsibilities where there is a role', () => {
    assert.ok(cvAssistActionsFor('experience').includes('responsibilities'));
    for (const field of ['summary', 'education', 'certification', 'skills'] as CvAssistField[]) {
      assert.ok(
        !cvAssistActionsFor(field).includes('responsibilities'),
        `${field} was offered responsibilities`
      );
    }
  });

  it('falls back to a plain write for an action that does not apply', () => {
    assert.equal(resolveCvAssistAction('experience', 'achievements'), 'achievements');
    assert.equal(resolveCvAssistAction('certification', 'achievements'), 'write');
    assert.equal(resolveCvAssistAction('experience', 'invent'), 'write');
    assert.equal(resolveCvAssistAction('experience', undefined), 'write');
  });
});

describe('the prompt for an action', () => {
  const base = {
    careerContextBlock: 'Candidate record: engineer with five years of experience.',
    sourceBlock: null,
  };

  const promptFor = (field: CvAssistField, action?: string) =>
    buildCvAssistPrompt({
      request: { field, action: action as never, tone: 'professional', length: 'medium' },
      ...base,
    });

  it('asks for what the candidate asked for', () => {
    const write = promptFor('experience', 'write');
    const achievements = promptFor('experience', 'achievements');
    const responsibilities = promptFor('experience', 'responsibilities');

    assert.notEqual(write, achievements);
    assert.match(achievements, /achievement/i);
    assert.match(responsibilities, /responsibilit/i);
  });

  it('keeps the grounding rules for every action', () => {
    for (const action of CV_ASSIST_ACTION_ORDER) {
      const prompt = promptFor('experience', action);
      // The record the candidate owns is in the prompt...
      assert.match(prompt, /Candidate record/);
      // ...and the instruction not to invent is in the prompt too.
      assert.match(prompt, /GROUNDING RULES/i);
      assert.match(prompt, /Never invent/i);
      assert.match(prompt, /only about the candidate/i);
    }
  });

  it('falls back to a plain write for an action that does not apply', () => {
    const wrong = promptFor('certification', 'achievements');
    const right = promptFor('certification', 'write');
    assert.equal(wrong, right);
  });

  it('keeps the candidate\'s own text in the prompt', () => {
    const prompt = buildCvAssistPrompt({
      request: {
        field: 'experience',
        action: 'improve',
        existingText: 'I led the migration to the new billing system.',
      },
      ...base,
    });
    assert.match(prompt, /I led the migration to the new billing system\./);
  });
});
