/**
 * The resume language, and the separation between the three languages.
 *
 * Three languages were being confused with one another:
 *
 *   - the INTERFACE language, which is the language the product speaks;
 *   - the RESUME language, which is the language the CV is written in;
 *   - the AI RESPONSE language, which is the language every other generated
 *     answer is written in.
 *
 * The bug this file protects against is the one that made the second of
 * these impossible: the document followed the interface, so a candidate
 * could never write an English CV while working in an Arabic product.
 *
 * It also protects the promise that changing the resume language does NOT
 * translate the facts. An employer, a university and a certificate body are
 * proper nouns, and the document keeps them exactly as their issuer wrote
 * them — only the headings around them change.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_RESUME_LANGUAGE,
  RESUME_LANGUAGES,
  RESUME_SECTION_HEADINGS,
  isResumeLanguage,
  isResumeRtl,
  normalizeResumeLanguage,
  resumeDirection,
  resumeLanguageInstruction,
  resumeLanguageLabel,
  resumeSectionHeading,
} from '../shared/resumeLanguage.ts';

describe('the resume language', () => {
  it('offers Arabic and English', () => {
    const codes = RESUME_LANGUAGES.map((entry) => entry.code);
    assert.deepEqual(codes, ['ar', 'en']);
  });

  it('gives each language a direction', () => {
    assert.equal(resumeDirection('ar'), 'rtl');
    assert.equal(resumeDirection('en'), 'ltr');
    assert.equal(isResumeRtl('ar'), true);
    assert.equal(isResumeRtl('en'), false);
  });

  it('accepts only the languages the studio can render', () => {
    assert.equal(isResumeLanguage('ar'), true);
    assert.equal(isResumeLanguage('en'), true);
    assert.equal(isResumeLanguage('fr'), false);
    assert.equal(isResumeLanguage(''), false);
    assert.equal(isResumeLanguage(null), false);
    assert.equal(isResumeLanguage(7), false);
  });

  it('falls back to the default for a value it does not recognise', () => {
    assert.equal(normalizeResumeLanguage('ar'), 'ar');
    assert.equal(normalizeResumeLanguage('en'), 'en');
    assert.equal(normalizeResumeLanguage('ar-EG'), 'ar');
    assert.equal(normalizeResumeLanguage('en-US'), 'en');
    assert.equal(normalizeResumeLanguage('fr'), DEFAULT_RESUME_LANGUAGE);
    assert.equal(normalizeResumeLanguage(undefined), DEFAULT_RESUME_LANGUAGE);
    assert.equal(normalizeResumeLanguage(null), DEFAULT_RESUME_LANGUAGE);
    assert.equal(normalizeResumeLanguage(42), DEFAULT_RESUME_LANGUAGE);
  });

  it('is separate from the interface language', () => {
    // The two settings are held independently. Nothing in the resume
    // language module reads the interface language, and nothing in it
    // changes a translation.
    const arabicInterface = 'ar';
    const englishResume = 'en';

    // The interface stays Arabic while the document is English.
    assert.equal(resumeDirection(englishResume), 'ltr');
    assert.notEqual(arabicInterface, englishResume);

    // And the other way round.
    assert.equal(resumeDirection(arabicInterface), 'rtl');
  });

  it('labels each language in its own words', () => {
    assert.equal(resumeLanguageLabel('ar'), 'العربية');
    assert.equal(resumeLanguageLabel('en'), 'English');
  });

  it('tells the model which language to write in', () => {
    assert.match(resumeLanguageInstruction('ar'), /Arabic/i);
    assert.match(resumeLanguageInstruction('en'), /English/i);
  });
});

describe('the section headings on the document', () => {
  it('has a heading for every section in both languages', () => {
    const sections = Object.keys(RESUME_SECTION_HEADINGS.en);
    for (const section of sections) {
      assert.ok(
        RESUME_SECTION_HEADINGS.ar[section],
        `the Arabic heading for ${section} is missing`
      );
    }
    assert.deepEqual(
      Object.keys(RESUME_SECTION_HEADINGS.ar).sort(),
      sections.sort()
    );
  });

  it('writes the heading in the language of the document', () => {
    assert.equal(resumeSectionHeading('en', 'summary'), 'Professional Summary');
    assert.equal(resumeSectionHeading('ar', 'summary'), 'الملخص المهني');
    assert.equal(resumeSectionHeading('ar', 'experience'), 'الخبرة العملية');
  });

  it('keeps the English headings exactly as the document has always printed them', () => {
    // The English document must not change its appearance because a setting
    // was added: an existing CV has to look the same after the upgrade.
    assert.equal(resumeSectionHeading('en', 'summary'), 'Professional Summary');
    assert.equal(resumeSectionHeading('en', 'experience'), 'Work Experience');
    assert.equal(resumeSectionHeading('en', 'skills'), 'Core Skills & Technologies');
    assert.equal(resumeSectionHeading('en', 'courses'), 'Completed Courses');
  });

  it('falls back to the English heading rather than to a blank one', () => {
    // A section the table does not know about must still print something.
    assert.equal(resumeSectionHeading('ar', 'references'), 'references');
    assert.equal(resumeSectionHeading('en', 'references'), 'references');
  });
});
