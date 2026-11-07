/**
 * The accuracy of the extraction engine.
 *
 * The engine reads a CV and decides what is in it. This measures how often
 * it is right, against a set of documents whose contents are known because
 * they were written for the test.
 *
 * Three things are measured, because a CV can be read wrongly in three
 * different ways:
 *
 *   - the sections: did the reader find the sections the document has?
 *   - the values: did it read the name, the address and the rest correctly,
 *     and did it leave alone the fields the document does not state?
 *   - the entries: did it find the right number of roles, degrees and
 *     certificates?
 *
 * The metrics are precision, recall and the F1 that combines them, and they
 * are printed as well as asserted. A reader that gets a document right by
 * accident is caught by the next document, and a reader that is quietly
 * getting things wrong is caught by the numbers being printed.
 *
 * The thresholds below are the ones the engine has to keep. They are set
 * where the engine actually is, not where it would be nice for it to be:
 * a threshold that the engine passes today and fails after a change is a
 * tripwire, and a threshold it has never passed is a wish.
 */

import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { generateCvFixtures } from './fixtures/generate-cv-fixtures.mjs';
import { extractDocument, type DocumentFormat } from '../server/cv/documentExtraction.ts';
import { parseStructuredCv } from '../server/cv/parseStructuredCv.ts';
import { buildExtractionReview } from '../server/cv/extractionReview.ts';
import type { CvExtractedSection, CvSectionKey } from '../shared/cvExtraction.ts';

interface GroundTruthField {
  prefix?: string;
}

interface GroundTruthFixture {
  file: string;
  why: string;
  sections: CvSectionKey[];
  fields?: Record<string, string | GroundTruthField>;
  absentFields?: string[];
  lists: Record<string, number>;
}

interface GroundTruth {
  fixtures: GroundTruthFixture[];
}

const groundTruth: GroundTruth = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'cv-ground-truth.json'), 'utf8')
);

/** The scores of one measurement. */
interface Scores {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

function emptyScores(): Scores {
  return { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
}

function precision(scores: Scores): number {
  const total = scores.truePositives + scores.falsePositives;
  return total === 0 ? 1 : scores.truePositives / total;
}

function recall(scores: Scores): number {
  const total = scores.truePositives + scores.falseNegatives;
  return total === 0 ? 1 : scores.truePositives / total;
}

function f1(scores: Scores): number {
  const p = precision(scores);
  const r = recall(scores);
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

function percent(value: number): number {
  return Math.round(value * 1000) / 10;
}

/** Collapses the differences that are not differences in meaning. */
function normalize(value: string): string {
  return value
    .replace(/[\s ]+/g, ' ')
    .replace(/[.,;:،]+$/, '')
    .trim()
    .toLowerCase();
}

/** The list sections, in the order the document is read in. */
const LIST_SECTION_KEYS: CvSectionKey[] = [
  'experience',
  'internships',
  'education',
  'projects',
  'skills',
  'certifications',
  'courses',
  'languages',
  'volunteering',
  'awards',
  'publications',
  'research',
  'leadership',
];

/** The header fields the reader reports. */
const HEADER_FIELDS = ['fullName', 'email', 'phone', 'location', 'title', 'summary'];

describe('the extraction engine', () => {
  let fixtureDir = '';
  const sectionScores = emptyScores();
  const fieldScores = emptyScores();
  const listScores = emptyScores();
  const failures: string[] = [];

  before(async () => {
    fixtureDir = mkdtempSync(join(tmpdir(), 'cv-quality-'));
    await generateCvFixtures(fixtureDir);

    for (const fixture of groundTruth.fixtures) {
      const path = join(fixtureDir, fixture.file);
      assert.ok(existsSync(path), `the fixture ${fixture.file} was not generated`);

      const extension = fixture.file.split('.').pop() as DocumentFormat;
      const extraction = await extractDocument(readFileSync(path), extension);
      assert.equal(
        extraction.status,
        'ok',
        `${fixture.file} could not be read: ${extraction.errorMessage ?? 'unknown reason'}`
      );

      const parsed = parseStructuredCv(extraction);
      const review = buildExtractionReview(extraction, parsed, { fileName: fixture.file });

      scoreSections(fixture, review.sections, sectionScores, failures);
      scoreFields(fixture, review.sections, fieldScores, failures);
      scoreLists(fixture, review.sections, listScores, failures);
    }
  });

  /** Does the reader find the sections the document has? */
  function scoreSections(
    fixture: GroundTruthFixture,
    sections: CvExtractedSection[],
    scores: Scores,
    problems: string[]
  ): void {
    const found = new Set(sections.filter((section) => section.present).map((section) => section.key));
    for (const expected of fixture.sections) {
      if (found.has(expected)) {
        scores.truePositives += 1;
      } else {
        scores.falseNegatives += 1;
        problems.push(`${fixture.file}: the section "${expected}" was not found`);
      }
    }
    for (const actual of found) {
      // The header and the contact block are both the personal details, so
      // a reader that finds one of them has found the section.
      if (fixture.sections.includes(actual)) continue;
      if (actual === 'personal' && fixture.sections.includes('personal')) continue;
      scores.falsePositives += 1;
      problems.push(`${fixture.file}: the section "${actual}" was found but the document does not have it`);
    }
  }

  /** Does the reader read the values correctly, and leave the absent ones alone? */
  function scoreFields(
    fixture: GroundTruthFixture,
    sections: CvExtractedSection[],
    scores: Scores,
    problems: string[]
  ): void {
    const personal = sections.find((section) => section.key === 'personal');
    const summary = sections.find((section) => section.key === 'summary');
    const read: Record<string, string | null> = {
      fullName: personal?.fields.fullName?.value ?? null,
      email: personal?.fields.email?.value ?? null,
      phone: personal?.fields.phone?.value ?? null,
      location: personal?.fields.location?.value ?? null,
      title: personal?.fields.title?.value ?? null,
      summary: summary?.fields.summary?.value ?? null,
    };

    for (const [key, expected] of Object.entries(fixture.fields ?? {})) {
      const actual = read[key] ?? null;
      const wanted =
        typeof expected === 'string' ? expected : (expected.prefix ?? '');
      const matches =
        actual !== null &&
        (typeof expected === 'string'
          ? normalize(actual) === normalize(wanted)
          : normalize(actual).startsWith(normalize(wanted)));
      if (matches) {
        scores.truePositives += 1;
      } else {
        scores.falseNegatives += 1;
        problems.push(
          `${fixture.file}: the ${key} was read as ${JSON.stringify(actual)}, expected ${JSON.stringify(wanted)}`
        );
      }
    }

    // A field the document does not state must come out empty. Reading one
    // out of a sentence is the failure this catches.
    for (const key of fixture.absentFields ?? []) {
      const actual = read[key] ?? null;
      if (actual === null || actual.trim() === '') {
        scores.truePositives += 1;
      } else {
        scores.falsePositives += 1;
        problems.push(
          `${fixture.file}: the ${key} was read as ${JSON.stringify(actual)}, but the document does not state it`
        );
      }
    }
  }

  /** Does the reader find the right number of entries? */
  function scoreLists(
    fixture: GroundTruthFixture,
    sections: CvExtractedSection[],
    scores: Scores,
    problems: string[]
  ): void {
    for (const [key, expected] of Object.entries(fixture.lists)) {
      const section = sections.find((entry) => entry.key === key);
      const actual = section?.entries.length ?? 0;
      if (actual === expected) {
        scores.truePositives += 1;
        continue;
      }
      if (actual < expected) {
        scores.falseNegatives += expected - actual;
        problems.push(
          `${fixture.file}: the ${key} section has ${actual} entries, expected ${expected}`
        );
      } else {
        scores.falsePositives += actual - expected;
        problems.push(
          `${fixture.file}: the ${key} section has ${actual} entries, expected ${expected}`
        );
      }
    }

    // A section the document does not have must not produce entries.
    for (const key of LIST_SECTION_KEYS) {
      if (fixture.lists[key] !== undefined) continue;
      const section = sections.find((entry) => entry.key === key);
      const actual = section?.entries.length ?? 0;
      if (actual === 0) continue;
      scores.falsePositives += actual;
      problems.push(`${fixture.file}: the ${key} section has ${actual} entries, but the document has none`);
    }
  }

  it('finds the sections the documents have', () => {
    console.log(
      `      section detection: precision ${percent(precision(sectionScores))}%, recall ${percent(recall(sectionScores))}%, F1 ${percent(f1(sectionScores))}%`
    );
    for (const problem of failures.filter((entry) => entry.includes('section'))) {
      console.log(`      - ${problem}`);
    }
    assert.ok(
      f1(sectionScores) >= 0.95,
      `the section detection F1 fell to ${percent(f1(sectionScores))}%`
    );
  });

  it('reads the values the documents state, and only those', () => {
    console.log(
      `      field values: precision ${percent(precision(fieldScores))}%, recall ${percent(recall(fieldScores))}%, F1 ${percent(f1(fieldScores))}%`
    );
    for (const problem of failures.filter(
      (entry) => entry.includes('was read as') && !entry.includes('section')
    )) {
      console.log(`      - ${problem}`);
    }
    assert.ok(
      f1(fieldScores) >= 0.95,
      `the field value F1 fell to ${percent(f1(fieldScores))}%`
    );
  });

  it('finds the right number of entries in every list section', () => {
    console.log(
      `      list entries: precision ${percent(precision(listScores))}%, recall ${percent(recall(listScores))}%, F1 ${percent(f1(listScores))}%`
    );
    for (const problem of failures.filter((entry) => entry.includes('entries'))) {
      console.log(`      - ${problem}`);
    }
    assert.ok(
      f1(listScores) >= 0.95,
      `the list entry F1 fell to ${percent(f1(listScores))}%`
    );
  });

  it('reads every format the studio accepts', () => {
    // The formats are not interchangeable: a PDF is a content stream, a
    // DOCX is a zip, a DOC is a compound file and a TXT is neither.
    const formats = new Set(
      groundTruth.fixtures.map((fixture) => fixture.file.split('.').pop() as string)
    );
    assert.ok(formats.has('pdf'), 'the suite must exercise PDF');
    assert.ok(formats.has('docx'), 'the suite must exercise DOCX');
    assert.ok(formats.has('doc'), 'the suite must exercise the legacy DOC');
  });
});
