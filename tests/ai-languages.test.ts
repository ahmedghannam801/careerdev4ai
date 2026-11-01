/**
 * The explicit AI response language.
 *
 * The interface language and the AI response language are separate settings.
 * These tests lock the contract the client and the server share:
 *
 *   - the five supported languages are the only codes accepted;
 *   - a locale such as `fr-FR` normalises to its base language;
 *   - an unknown value falls back instead of failing a request;
 *   - every language produces a direct instruction, so the model never has to
 *     infer the language from the prompt.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AI_LANGUAGES,
  aiLanguageInstruction,
  aiLanguageLabel,
  normalizeAiLanguage,
} from '../shared/aiLanguages.ts';

describe('AI response languages', () => {
  it('supports English, Arabic, French, German and Spanish', () => {
    assert.deepEqual(
      AI_LANGUAGES.map((language) => language.code),
      ['en', 'ar', 'fr', 'de', 'es']
    );
  });

  it('normalises codes, locales and language names', () => {
    assert.equal(normalizeAiLanguage('fr'), 'fr');
    assert.equal(normalizeAiLanguage('fr-FR'), 'fr');
    assert.equal(normalizeAiLanguage('ar_EG'), 'ar');
    assert.equal(normalizeAiLanguage('German'), 'de');
    assert.equal(normalizeAiLanguage('Español'), 'es');
  });

  it('falls back instead of refusing an unknown language', () => {
    assert.equal(normalizeAiLanguage('it'), 'en');
    assert.equal(normalizeAiLanguage(''), 'en');
    assert.equal(normalizeAiLanguage(null), 'en');
    assert.equal(normalizeAiLanguage('it', 'fr'), 'fr');
  });

  it('writes a direct instruction for every language', () => {
    for (const language of AI_LANGUAGES) {
      const instruction = aiLanguageInstruction(language.code);
      assert.ok(instruction.length > 20, `${language.code} needs an instruction`);
      assert.match(instruction, /entirely in/i);
      assert.match(instruction, /SQL, React, CV, ATS/);
    }
  });

  it('names each language in its own script or spelling', () => {
    assert.equal(aiLanguageLabel('en'), 'English');
    assert.equal(aiLanguageLabel('fr'), 'Français (French)');
    assert.equal(aiLanguageLabel('de'), 'Deutsch (German)');
    assert.equal(aiLanguageLabel('es'), 'Español (Spanish)');
  });
});
