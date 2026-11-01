/**
 * Headline suggestions: the field that used to have no answer.
 *
 * The studio offered one AI draft and nothing when AI writing was switched
 * off. These tests protect the replacement:
 *
 *   - the deterministic generator always returns several role-specific lines;
 *   - it uses the candidate's own skills, experience, education and goal;
 *   - it never suggests a headline for a different occupation;
 *   - the model's options are merged in only when they pass the same relevance
 *     check, and the local options always fill the remaining slots;
 *   - a failed or empty model answer degrades to the local list rather than an
 *     endless spinner.
 *
 * Everything here is pure: no database and no model call.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  generateHeadlineSuggestions,
  isRelevantHeadlineSuggestion,
  mergeHeadlineSuggestions,
  sanitizeHeadlineSuggestion,
  type HeadlineSuggestionInput,
} from '../shared/headlineSuggestions.ts';
import {
  CV_HEADLINE_SUGGESTION_COUNT,
  CV_HEADLINE_SUGGESTION_MAX_CHARS,
  parseHeadlineSuggestionsPayload,
  validateHeadlineSuggestionsPayload,
} from '../shared/cvAiAssist.ts';
import {
  buildCvHeadlineSuggestionsPrompt,
  headlineInputFromCareerContext,
} from '../server/cv/aiAssist.ts';
import { resolveRole } from '../shared/careerRoles.ts';
import type { AiCareerContext } from '../server/ai/careerContext.ts';

function input(overrides: Partial<HeadlineSuggestionInput> = {}): HeadlineSuggestionInput {
  return {
    targetRoleTitle: 'HR Specialist',
    skills: ['Employee Relations', 'Recruitment', 'HRIS'],
    roleSkills: ['Employee Relations', 'Recruitment', 'Compensation & Benefits'],
    experience: ['HR Coordinator at Acme Corp (2021 - 2024)'],
    education: ['BSc — Human Resources — Cairo University'],
    careerGoal: 'get_first_job',
    language: 'en',
    ...overrides,
  };
}

function careerContext(roleId: string, skills: string[]): AiCareerContext {
  const role = resolveRole(roleId);
  assert.ok(role, `the ${roleId} role must exist in the catalogue`);
  return {
    careerState: 'student',
    careerGoal: 'get_first_job',
    targetRoleTitle: role.title,
    targetRole: role,
    targetRoleId: role.id,
    targetRoleDomain: role.domainId,
    language: 'en',
    skillGaps: [],
    currentSkills: skills.map((name) => ({ name, level: 3 })),
    strengths: [],
    education: ['BSc — Human Resources — Cairo University'],
    experience: ['HR Coordinator at Acme Corp (2021 - 2024)'],
    projects: [],
    volunteering: [],
    certifications: [],
    roadmapSummary: [],
    learningSummary: [],
    applicationsCount: 0,
    evidenceCount: 0,
  };
}

describe('deterministic headline suggestions', () => {
  it('returns several role-specific options', () => {
    const suggestions = generateHeadlineSuggestions(input());

    assert.ok(
      suggestions.length >= 3,
      `expected several suggestions, received ${suggestions.length}`
    );
    assert.ok(suggestions.length <= CV_HEADLINE_SUGGESTION_COUNT);
    for (const suggestion of suggestions) {
      assert.ok(
        isRelevantHeadlineSuggestion(suggestion, input()),
        `"${suggestion}" must name the target role`
      );
      assert.ok(
        suggestion.length <= CV_HEADLINE_SUGGESTION_MAX_CHARS,
        `"${suggestion}" must fit the headline budget`
      );
    }
  });

  it('uses the candidate\'s role-relevant skills first', () => {
    const suggestions = generateHeadlineSuggestions(
      input({
        skills: ['SQL', 'Employee Relations', 'Recruitment'],
      })
    );

    assert.ok(
      suggestions[0].includes('Employee Relations'),
      `the first option must lead with a role-relevant skill: ${suggestions[0]}`
    );
    assert.ok(
      suggestions[0].includes('Recruitment'),
      `the first option must use the next role-relevant skill: ${suggestions[0]}`
    );
  });

  it('produces different headlines for different target roles', () => {
    const hr = generateHeadlineSuggestions(input());
    const data = generateHeadlineSuggestions(
      input({
        targetRoleTitle: 'Data Analyst',
        skills: ['SQL', 'Data Visualization', 'Excel'],
        roleSkills: ['SQL', 'Data Visualization', 'Statistical Analysis'],
        experience: ['Reporting Analyst at Northwind (2022 - 2024)'],
        education: ['BSc — Statistics — Cairo University'],
      })
    );

    assert.notDeepEqual(hr, data);
    assert.ok(
      data.some((suggestion) => suggestion.includes('SQL')),
      'a Data Analyst headline may use SQL'
    );
    assert.ok(
      hr.every((suggestion) => !suggestion.includes('SQL')),
      'an HR Specialist headline must not advertise SQL'
    );
  });

  it('still returns a usable headline when the record is sparse', () => {
    const suggestions = generateHeadlineSuggestions({
      targetRoleTitle: 'HR Specialist',
      skills: [],
      experience: [],
      education: [],
      language: 'en',
    });

    assert.ok(suggestions.length >= 1);
    assert.ok(suggestions.every((suggestion) => suggestion.includes('HR Specialist')));
  });

  it('rejects a headline for a different occupation', () => {
    assert.equal(
      isRelevantHeadlineSuggestion('Data Analyst | SQL & Excel', {
        targetRoleTitle: 'HR Specialist',
      }),
      false
    );
    assert.equal(
      isRelevantHeadlineSuggestion('Senior HR Specialist | Employee Relations', {
        targetRoleTitle: 'HR Specialist',
      }),
      true
    );
  });

  it('writes Arabic options when the interface is Arabic', () => {
    const suggestions = generateHeadlineSuggestions(input({ language: 'ar' }));

    assert.ok(suggestions.length >= 1);
    assert.ok(suggestions.every((suggestion) => suggestion.includes('HR Specialist')));
    assert.ok(
      suggestions.some((suggestion) => /[\u0600-\u06ff]/.test(suggestion)),
      'at least one Arabic option must contain Arabic text'
    );
  });
});

describe('headline suggestion sanitising and merging', () => {
  it('strips bullets, quotes and line breaks and caps the length', () => {
    assert.equal(
      sanitizeHeadlineSuggestion('  - "HR Specialist | Recruitment"  '),
      'HR Specialist | Recruitment'
    );
    const long = 'HR Specialist '.repeat(40);
    assert.ok(sanitizeHeadlineSuggestion(long).length <= CV_HEADLINE_SUGGESTION_MAX_CHARS);
  });

  it('keeps relevant model options and fills the rest from the local list', () => {
    const local = generateHeadlineSuggestions(input());
    const merged = mergeHeadlineSuggestions(
      [
        'HR Specialist | Employee Relations & Recruitment',
        'Data Analyst | SQL & Excel',
        '',
        'Aspiring HR Specialist',
      ],
      local,
      { targetRoleTitle: 'HR Specialist' }
    );

    assert.ok(merged.includes('HR Specialist | Employee Relations & Recruitment'));
    assert.ok(merged.includes('Aspiring HR Specialist'));
    assert.ok(
      merged.every((suggestion) => !suggestion.includes('Data Analyst')),
      'an irrelevant model option must be filtered out'
    );
    assert.equal(new Set(merged.map((entry) => entry.toLowerCase())).size, merged.length);
    assert.ok(merged.length >= Math.min(local.length, CV_HEADLINE_SUGGESTION_COUNT));
  });

  it('falls back to the local list when the model returns nothing usable', () => {
    const local = generateHeadlineSuggestions(input());
    const merged = mergeHeadlineSuggestions([], local, {
      targetRoleTitle: 'HR Specialist',
    });
    assert.deepEqual(merged, local);
  });
});

describe('the headline suggestion contract', () => {
  it('accepts a valid list', () => {
    const payload = {
      suggestions: ['HR Specialist | Recruitment', 'Aspiring HR Specialist'],
    };
    assert.deepEqual(validateHeadlineSuggestionsPayload(payload), []);
    assert.deepEqual(parseHeadlineSuggestionsPayload(payload), payload.suggestions);
  });

  it('rejects an empty, malformed or over-long answer', () => {
    assert.ok(validateHeadlineSuggestionsPayload(null).length > 0);
    assert.ok(validateHeadlineSuggestionsPayload({}).length > 0);
    assert.ok(validateHeadlineSuggestionsPayload({ suggestions: [] }).length > 0);
    assert.ok(
      validateHeadlineSuggestionsPayload({
        suggestions: ['HR Specialist', 'x'.repeat(CV_HEADLINE_SUGGESTION_MAX_CHARS + 1)],
      }).length > 0
    );
    assert.deepEqual(parseHeadlineSuggestionsPayload({ suggestions: ['', '   '] }), []);
  });

  it('deduplicates options case-insensitively', () => {
    assert.deepEqual(
      parseHeadlineSuggestionsPayload({
        suggestions: ['HR Specialist', 'hr specialist', 'Aspiring HR Specialist'],
      }),
      ['HR Specialist', 'Aspiring HR Specialist']
    );
  });

  it('builds the record input from the candidate\'s own facts only', () => {
    const context = careerContext('hr-specialist', [
      'Employee Relations',
      'Recruitment',
      'SQL',
    ]);
    const built = headlineInputFromCareerContext(context, {
      targetRoleTitle: 'HR Specialist',
      language: 'en',
    });

    assert.equal(built.targetRoleTitle, 'HR Specialist');
    assert.deepEqual(built.skills, ['Employee Relations', 'Recruitment', 'SQL']);
    assert.ok(built.roleSkills?.includes('Employee Relations'));
    assert.equal(built.limit, CV_HEADLINE_SUGGESTION_COUNT);
  });

  it('puts the grounding rule and the role in the prompt', () => {
    const prompt = buildCvHeadlineSuggestionsPrompt({
      request: { language: 'en' },
      careerContextBlock: 'Target role: HR Specialist',
      targetRoleTitle: 'HR Specialist',
    });

    assert.match(prompt, /exactly 5 different headline options/i);
    assert.match(prompt, /HR Specialist/);
    assert.match(prompt, /GROUNDING RULES/);
    assert.match(prompt, /Return JSON/);
  });
});
