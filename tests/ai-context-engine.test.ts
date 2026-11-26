// The AI context engine: what every prompt is built from.
//
// Nothing here calls a model or a database. The suite covers the three parts
// that decide what the model is allowed to know:
//
//   1. the platform knowledge base and its retrieval — the assistant must know
//      what the product does, and no fact may be invented;
//   2. the instruction composer — every feature receives the same honesty and
//      scope rules and the candidate's chosen language;
//   3. the feature registry and the context sections — each feature declares
//      how much of the candidate's record it needs, and a section nobody
//      declared is never read;
//
// plus the conversation memory's rendering and compression rules.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_CONTEXT_SECTIONS,
  buildAiContextBlock,
  type AiCareerContext,
} from '../server/ai/careerContext.ts';
import {
  AI_FEATURES,
  FEATURE_DEFINITIONS,
  HONESTY_RULES,
  PRODUCT_RULES,
  SCOPE_RULES,
  UnverifiedUserError,
  composeSystemInstruction,
  isVerifiedUserId,
  runAiTask,
  scopeHint,
  scopeHintInstruction,
} from '../server/ai/contextEngine.ts';
import {
  KNOWLEDGE_IDS,
  PLATFORM_KNOWLEDGE,
  knowledgeTerms,
  renderPlatformKnowledge,
  selectPlatformKnowledge,
} from '../server/ai/platformKnowledge.ts';
import {
  MEMORY_SUMMARY_CHARS,
  MEMORY_VERBATIM_TURNS,
  renderConversationMemory,
  shouldSummarize,
  summarizeConversationTurns,
} from '../server/ai/conversationMemory.ts';

describe('the platform knowledge base', () => {
  test('every entry is complete and uniquely identified', () => {
    assert.ok(PLATFORM_KNOWLEDGE.length >= 10);
    assert.equal(new Set(KNOWLEDGE_IDS).size, KNOWLEDGE_IDS.length);
    for (const entry of PLATFORM_KNOWLEDGE) {
      assert.ok(entry.title.trim().length > 0, `${entry.id} has no title`);
      assert.ok(entry.facts.length > 0, `${entry.id} has no facts`);
      assert.ok(entry.tags.length > 0, `${entry.id} is not attached to a feature`);
      assert.ok(entry.keywords.length > 0, `${entry.id} cannot be retrieved by a question`);
      assert.ok(entry.source.trim().length > 0, `${entry.id} does not say where it is proved`);
      for (const fact of entry.facts) {
        assert.ok(fact.trim().length > 0, `${entry.id} has an empty fact`);
      }
    }
  });

  test('the entries the product depends on are present', () => {
    for (const id of ['what-is-aionvia', 'tokens', 'plans', 'cv-studio', 'learning', 'privacy']) {
      assert.ok(KNOWLEDGE_IDS.includes(id), `missing knowledge entry: ${id}`);
    }
  });

  test('no entry states a price, which would drift from the plans table', () => {
    for (const entry of PLATFORM_KNOWLEDGE) {
      for (const fact of entry.facts) {
        assert.ok(
          !/\b\d+\s*(EGP|USD|\$|€)\b/i.test(fact),
          `${entry.id} quotes a price: ${fact}`
        );
      }
    }
  });

  test('a feature always receives the entries tagged for it', () => {
    const selection = selectPlatformKnowledge({ feature: 'cv', limit: 3 });
    assert.ok(selection.entries.length > 0);
    // Every entry is either specific to the feature or part of the product's
    // own identity, which every prompt carries.
    assert.ok(
      selection.entries.every(
        (entry) => entry.tags.includes('cv') || entry.tags.includes('general')
      )
    );
    assert.ok(selection.entries.some((entry) => entry.tags.includes('cv')));
  });

  test('the question can pull in an entry the screen would not', () => {
    const selection = selectPlatformKnowledge({
      feature: 'roadmap',
      query: 'how many tokens does the ats audit cost?',
      limit: 6,
    });
    assert.ok(
      selection.entries.some((entry) => entry.id === 'tokens'),
      'a question about tokens did not retrieve the token entry'
    );
  });

  test('the limit bounds the block, and nothing is chosen twice', () => {
    const selection = selectPlatformKnowledge({ feature: 'copilot', query: 'cv interview roadmap', limit: 2 });
    assert.ok(selection.entries.length <= 2);
    assert.equal(new Set(selection.entries.map((entry) => entry.id)).size, selection.entries.length);
    assert.equal(selection.entries.length + selection.dropped.length, PLATFORM_KNOWLEDGE.length);
  });

  test('the rendered block names the platform and carries the facts', () => {
    const entries = selectPlatformKnowledge({ feature: 'cv' }).entries;
    const block = renderPlatformKnowledge(entries);
    assert.match(block, /VERIFIED FACTS ABOUT AIONVIA/);
    assert.ok(block.includes(entries[0].title));
    assert.ok(block.includes(entries[0].facts[0]));
    assert.equal(renderPlatformKnowledge([]), '');
  });

  test('questions are reduced to the words that can match', () => {
    assert.deepEqual(knowledgeTerms('How do I get a CV?'), ['get', 'cv']);
  });
});

describe('the instruction composer', () => {
  test('every feature receives the honesty and scope rules and the language', () => {
    const instruction = composeSystemInstruction({
      feature: 'cover_letter',
      language: 'ar',
      knowledgeBlock: 'KNOWLEDGE-BLOCK',
      contextBlock: 'CONTEXT-BLOCK',
    });
    assert.ok(instruction.startsWith(FEATURE_DEFINITIONS.cover_letter.role));
    assert.ok(instruction.includes('KNOWLEDGE-BLOCK'));
    assert.ok(instruction.includes('CONTEXT-BLOCK'));
    for (const rule of HONESTY_RULES) assert.ok(instruction.includes(rule), `missing rule: ${rule}`);
    for (const rule of SCOPE_RULES) assert.ok(instruction.includes(rule), `missing scope rule: ${rule}`);
    for (const rule of PRODUCT_RULES) assert.ok(instruction.includes(rule), `missing product rule: ${rule}`);
    // The Arabic instruction is present, so a French or Arabic answer cannot
    // drift into English.
    assert.match(instruction, /Arabic/);
  });

  test('the honesty rules are stated after the facts, so they override them', () => {
    const instruction = composeSystemInstruction({
      feature: 'copilot',
      language: 'en',
      knowledgeBlock: 'KNOWLEDGE-BLOCK',
      contextBlock: 'CONTEXT-BLOCK',
    });
    assert.ok(instruction.indexOf('CONTEXT-BLOCK') < instruction.indexOf('HONESTY RULES'));
  });

  test('a question about the product is answered from the product facts', () => {
    const instruction = composeSystemInstruction({
      feature: 'copilot',
      language: 'en',
      knowledgeBlock: 'VERIFIED FACTS ABOUT AIONVIA\n- A CV audit costs one token.',
      contextBlock: 'CONTEXT',
    });
    // The rule that a market answer is the wrong answer, and that a plan
    // price is never quoted by the model.
    assert.match(instruction, /is a question about those facts/);
    assert.match(instruction, /Never state what an Aionvia plan costs/);
    // The product rules come after the facts they govern.
    assert.ok(
      instruction.indexOf('VERIFIED FACTS ABOUT AIONVIA') < instruction.indexOf('THE PRODUCT')
    );
  });

  test('a JSON answer gets the JSON rules instead of the prose ones', () => {
    const json = composeSystemInstruction({
      feature: 'cv_ats',
      language: 'en',
      knowledgeBlock: '',
      contextBlock: 'CONTEXT',
      json: true,
    });
    assert.match(json, /Return a single JSON object and nothing else/);
    assert.doesNotMatch(json, /simple "-" lines/);
  });

  test('an empty block leaves no stray heading', () => {
    const instruction = composeSystemInstruction({
      feature: 'copilot',
      language: 'en',
      knowledgeBlock: '',
      contextBlock: '',
    });
    assert.doesNotMatch(instruction, /\n{3,}/);
  });
});

describe('the feature registry', () => {
  test('every feature is defined and has its own persona', () => {
    for (const feature of AI_FEATURES) {
      const definition = FEATURE_DEFINITIONS[feature];
      assert.ok(definition, `no definition for ${feature}`);
      assert.ok(definition.role.trim().length > 0);
      assert.ok(definition.sections.length > 0);
      assert.ok(definition.knowledge.length > 0);
      assert.ok(definition.knowledgeLimit >= 1);
    }
  });

  test('no feature declares a section the loader does not know', () => {
    for (const feature of AI_FEATURES) {
      for (const section of FEATURE_DEFINITIONS[feature].sections) {
        assert.ok(ALL_CONTEXT_SECTIONS.includes(section), `${feature} asks for ${section}`);
      }
    }
  });

  test('a focused task reads less of the record than the copilot', () => {
    const copilot = FEATURE_DEFINITIONS.copilot.sections.length;
    assert.equal(copilot, ALL_CONTEXT_SECTIONS.length);
    for (const feature of ['cv_assist', 'interview_mock', 'project_analysis'] as const) {
      assert.ok(FEATURE_DEFINITIONS[feature].sections.length < copilot, `${feature} reads everything`);
    }
  });
});

describe('the context block', () => {
  const context = {
    language: 'en',
    careerState: 'student',
    careerGoal: 'first_job',
    targetRoleTitle: 'Data Analyst',
    experienceLevel: 'entry',
    skillGaps: [{ name: 'SQL', current: 2, target: 4 }],
    currentSkills: [{ name: 'SQL', level: 2, selfReportedLevel: 2, assessedLevel: null, evidenceSources: [] }],
    strengths: [],
    experience: ['Analyst intern at Acme'],
    education: ['BSc Statistics'],
    projects: ['Sales dashboard'],
    volunteering: [],
    certifications: ['Google Data Analytics'],
    roadmapSummary: ['Phase 1: foundations'],
    learningSummary: ['SQL for data analysis (in progress)'],
    applicationsCount: 3,
    evidenceCount: 1,
    evidenceSummary: ['Portfolio link (verified)'],
    targetRole: null,
    targetRoleId: null,
    targetRoleDomain: null,
  } as unknown as AiCareerContext;

  test('a narrowed block leaves out what the feature did not ask for', () => {
    const block = buildAiContextBlock(context, { sections: ['identity', 'skills'] });
    assert.match(block, /Persona: student/);
    assert.match(block, /SQL/);
    assert.doesNotMatch(block, /Analyst intern at Acme/);
    assert.doesNotMatch(block, /Phase 1: foundations/);
    assert.doesNotMatch(block, /BSc Statistics/);
  });

  test('a full block carries every area, and always the rules and language', () => {
    const block = buildAiContextBlock(context);
    for (const expected of ['Analyst intern at Acme', 'BSc Statistics', 'Sales dashboard', 'Phase 1', 'Job applications tracked: 3']) {
      assert.ok(block.includes(expected), `missing ${expected}`);
    }
    assert.match(block, /Use ONLY the facts above/);
  });
});

describe('the verified user gate', () => {
  test('a missing or placeholder id is refused', async () => {
    for (const value of ['', '   ', 'undefined', 'null', 'anon', 'guest', 'user-1']) {
      assert.equal(isVerifiedUserId(value), false, `accepted: ${value}`);
    }
    await assert.rejects(
      () =>
        runAiTask({
          feature: 'copilot',
          userId: '',
          prompt: 'hello',
        }),
      (error: unknown) => error instanceof UnverifiedUserError
    );
  });

  test('a real profile id is accepted', () => {
    assert.equal(isVerifiedUserId('3f0f2c1e-9a4b-4f77-8c2d-1a2b3c4d5e6f'), true);
  });
});

describe('the scope hint', () => {
  test('a career question is never flagged', () => {
    for (const question of [
      'review my cv for a data analyst role',
      'which course should I take next?',
      'how do I answer "tell me about a time you failed"?',
      'how many tokens does the ats audit cost?',
      'what is the difference between a CV and a resume?',
    ]) {
      assert.equal(scopeHint(question).offTopic, false, question);
    }
  });

  test('a clearly unrelated message is flagged, with a note but no refusal', () => {
    const hint = scopeHint('write me a poem about the sea');
    assert.equal(hint.offTopic, true);
    const note = scopeHintInstruction(hint);
    assert.ok(note && note.includes('SCOPE NOTE'));
    assert.equal(scopeHintInstruction({ offTopic: false, reason: null }), null);
  });
});

describe('conversation memory', () => {
  const turns = [
    { role: 'user' as const, content: 'I want to become a data analyst.' },
    { role: 'assistant' as const, content: 'Start with SQL and one dashboard project.' },
    { role: 'user' as const, content: 'How long will that take?' },
  ];

  test('nothing is rendered for a first message', () => {
    assert.equal(renderConversationMemory({ messages: [] }), '');
    assert.equal(renderConversationMemory({ messages: [], summary: '   ' }), '');
  });

  test('the recent turns and the summary are both included, in order', () => {
    const block = renderConversationMemory({
      summary: 'Asked: which role suits me?',
      messages: turns,
      limit: 2,
    });
    assert.ok(block.includes('Asked: which role suits me?'));
    assert.ok(block.includes('How long will that take?'));
    assert.ok(!block.includes('I want to become a data analyst.'), 'the window was not applied');
    assert.ok(block.includes('source of truth'));
  });

  test('the summary is deterministic and bounded', () => {
    const long = Array.from({ length: 40 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${index} `.repeat(40),
    }));
    const summary = summarizeConversationTurns(long);
    assert.ok(summary.length <= MEMORY_SUMMARY_CHARS);
    // The most recent exchange survives, the oldest does not.
    assert.ok(summary.includes('message 39'));
    assert.ok(!summary.includes('message 0 '));
    assert.equal(summarizeConversationTurns([...turns, ...turns]), summarizeConversationTurns([...turns, ...turns]));
  });

  test('a thread is only summarised once it outgrows the window', () => {
    assert.equal(shouldSummarize(MEMORY_VERBATIM_TURNS), false);
    assert.equal(shouldSummarize(MEMORY_VERBATIM_TURNS * 2), false);
    assert.equal(shouldSummarize(MEMORY_VERBATIM_TURNS * 2 + 1), true);
  });
});
