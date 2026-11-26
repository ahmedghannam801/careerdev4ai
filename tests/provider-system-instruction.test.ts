// The provider request shape, and the instruction that must survive it.
//
// The context engine sends the system instruction as its own field; the
// Gemini SDK only reads the copy inside `config`. For a while the two
// disagreed and the instruction was dropped on the way out, so the model
// answered as a bare chatbot: no persona, no career record, no honesty
// rules. These tests pin the reconciliation that fixed it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { resolveGeminiConfig } from '../server/ai/provider.ts';

describe('the Gemini request carries the system instruction', () => {
  test('an instruction sent as its own field reaches the SDK config', () => {
    const config = resolveGeminiConfig({ contents: 'q', systemInstruction: 'RULES' });
    assert.equal(config?.systemInstruction, 'RULES');
  });

  test('the other fields in config are preserved', () => {
    const config = resolveGeminiConfig({
      contents: 'q',
      systemInstruction: 'RULES',
      config: { temperature: 0.4, responseMimeType: 'application/json' },
    });
    assert.equal(config?.temperature, 0.4);
    assert.equal(config?.responseMimeType, 'application/json');
    assert.equal(config?.systemInstruction, 'RULES');
  });

  test('an instruction already in config is not overwritten', () => {
    const config = resolveGeminiConfig({
      contents: 'q',
      config: { systemInstruction: 'INLINE' },
    });
    assert.equal(config?.systemInstruction, 'INLINE');
  });

  test('a request without an instruction is left alone', () => {
    assert.deepEqual(resolveGeminiConfig({ contents: 'q' }), undefined);
    assert.deepEqual(
      resolveGeminiConfig({ contents: 'q', config: { temperature: 0.1 } }),
      { temperature: 0.1 }
    );
  });
});
