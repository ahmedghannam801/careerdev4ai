/**
 * The CV Studio used to lose what the candidate was typing.
 *
 * The document the editor works on is a projection of the platform's records,
 * and the projection ran while the candidate was typing. It resolved the
 * header with `profile.fullName?.trim() || previous.fullName?.trim()`, so the
 * candidate's text was trimmed on every pass; and it let the record win
 * outright, so the record — a copy of what was typed, written back a moment
 * later and sometimes a keystroke behind — could put the older words back on
 * the screen.
 *
 * The two symptoms were the same defect seen twice: a space that vanished
 * from the middle of a name, and a sentence that vanished from the summary.
 *
 * These tests are the reproduction. They type a name and a summary one
 * character at a time, and they put the projection between every keystroke,
 * exactly as the record round-trip does.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  mergeCanonicalCvDocument,
  type CvHeaderHistory,
} from '../shared/cvProjection.ts';
import { buildCvTemplateDocument } from '../shared/cvTemplateDocument.ts';
import type { CvSourceData } from '../shared/cvDocument.ts';
import type { CVProfile } from '../src/types/career.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

/** A document with only the fields the projection resolves. */
const documentWith = (fields: Partial<CVProfile>): CVProfile =>
  ({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    title: '',
    summary: '',
    experiences: [],
    education: [],
    projects: [],
    skillsList: [],
    certifications: [],
    certificationDetails: [],
    links: [],
    ...fields,
  }) as CVProfile;

/** The records, as the platform holds them after a header write. */
const sourceWith = (profile: Record<string, string>): CvSourceData => ({
  profile: {
    fullName: '',
    email: '',
    phone: '',
    location: '',
    title: '',
    summary: '',
    ...profile,
  },
});

describe('the CV header while it is being typed', () => {
  it('keeps the space the candidate typed between two words', () => {
    // The candidate has typed "Ahmed " and the record has caught up with it.
    const document = documentWith({ fullName: 'Ahmed ' });
    const source = sourceWith({ fullName: 'Ahmed ' });

    const projected = mergeCanonicalCvDocument(source, document, {
      history: { fullName: ['Ahmed '] },
    });

    assert.equal(
      projected.fullName,
      'Ahmed ',
      'the trailing space the candidate typed must survive the projection'
    );
  });

  it('keeps every character of a name while it is typed one character at a time', () => {
    // The whole name, one keystroke at a time. The studio writes the text to
    // the profile after a pause, so the records always lag a keystroke or
    // two behind the document — and the projection runs in between, exactly
    // as it does when the write lands.
    const typed = 'Ahmed Ghanam';
    const history: string[] = [];
    let document = documentWith({ fullName: '' });
    // What the records hold: the value of the last write that has landed.
    let record = '';

    for (let length = 1; length <= typed.length; length += 1) {
      const soFar = typed.slice(0, length);
      document = documentWith({ fullName: soFar });

      // The projection runs while the write for `soFar` is still on its way.
      const projected = mergeCanonicalCvDocument(
        sourceWith({ fullName: record }),
        document,
        { history: { fullName: history } }
      );

      assert.equal(
        projected.fullName,
        soFar,
        `the name was "${projected.fullName}" after typing "${soFar}"`
      );

      // The write goes out, and the records catch up with it.
      history.push(soFar);
      record = soFar;
    }
  });

  it('does not let a lagging record put older words back', () => {
    // The candidate has typed "Ahmed G"; the record still holds "Ahmed",
    // because the write is debounced and the network is slow.
    const document = documentWith({ fullName: 'Ahmed G' });

    const projected = mergeCanonicalCvDocument(
      sourceWith({ fullName: 'Ahmed' }),
      document,
      { history: { fullName: ['Ahmed'] } }
    );

    assert.equal(
      projected.fullName,
      'Ahmed G',
      'a record that is one keystroke behind must not overwrite the newer edit'
    );
  });

  it('still lets a record that was changed somewhere else win', () => {
    // The candidate changed their name in the Profile screen, not here.
    const document = documentWith({ fullName: 'Ahmed' });

    const projected = mergeCanonicalCvDocument(
      sourceWith({ fullName: 'Ahmed Smith' }),
      document,
      { history: { fullName: ['Ahmed'] } }
    );

    assert.equal(projected.fullName, 'Ahmed Smith');
  });

  it('seeds an empty field from the records', () => {
    const document = documentWith({ fullName: '' });

    const projected = mergeCanonicalCvDocument(
      sourceWith({ fullName: 'Ahmed Ghanam' }),
      document,
      { history: {} }
    );

    assert.equal(projected.fullName, 'Ahmed Ghanam');
  });

  it('keeps the candidate\'s text when the records know nothing', () => {
    const document = documentWith({ fullName: 'Ahmed Ghanam' });

    const projected = mergeCanonicalCvDocument(sourceWith({}), document, {
      history: {},
    });

    assert.equal(projected.fullName, 'Ahmed Ghanam');
  });

  it('applies the same rule to every header field', () => {
    const fields = ['title', 'email', 'phone', 'location'] as const;
    for (const field of fields) {
      const document = documentWith({ [field]: 'value with a trailing space ' });
      const projected = mergeCanonicalCvDocument(
        sourceWith({ [field]: 'value with a trailing space ' }),
        document,
        { history: { [field]: ['value with a trailing space '] } }
      );
      assert.equal(
        (projected as unknown as Record<string, string>)[field],
        'value with a trailing space ',
        `the ${field} field lost its trailing space`
      );
    }
  });
});

describe('the executive summary while it is being typed', () => {
  it('does not trim the summary', () => {
    const document = documentWith({ summary: 'A frontend developer. ' });

    const projected = mergeCanonicalCvDocument(sourceWith({}), document);

    assert.equal(projected.summary, 'A frontend developer. ');
  });

  it('does not fold a paragraph the candidate is still writing', () => {
    // The candidate is typing a second paragraph that begins like the first
    // one. The projection used to decide the two said the same thing and
    // delete the one being written.
    const summary = 'I am a frontend developer.\n\nI am a frontend developer with five years of it.';
    const document = documentWith({ summary });

    const projected = mergeCanonicalCvDocument(sourceWith({}), document);

    assert.equal(projected.summary, summary);
  });

  it('keeps the line breaks the candidate typed', () => {
    const summary = 'First line.\n\nSecond paragraph.';
    const document = documentWith({ summary });

    const projected = mergeCanonicalCvDocument(sourceWith({}), document);

    assert.equal(projected.summary, summary);
  });

  it('keeps a summary the candidate hid empty', () => {
    // The "Clear" button hides the summary, and a hidden summary stays empty
    // even when the profile still holds one.
    const document = documentWith({ summary: '', hiddenSummary: true });

    const projected = mergeCanonicalCvDocument(
      sourceWith({ summary: 'A summary from the profile.' }),
      document
    );

    assert.equal(projected.summary, '');
  });

  it('folds a repeated paragraph in a summary that comes from the records', () => {
    // The records hold a summary the candidate pasted twice. Folding it is
    // safe there: nobody is typing it.
    const document = documentWith({ summary: '' });

    const projected = mergeCanonicalCvDocument(
      sourceWith({ summary: 'Frontend engineer.\n\nFrontend engineer.' }),
      document
    );

    assert.equal(projected.summary, 'Frontend engineer.');
  });
});

describe('the printed CV', () => {
  it('still folds a paragraph that repeats another one', () => {
    // The cleanup moved to the output, where it belongs: it was never taken
    // away, only taken out of the editor.
    const summary =
      'I am a frontend developer with five years of experience.\n\nI am a frontend developer with five years of experience.';
    const document = documentWith({ summary });

    const built = buildCvTemplateDocument(document, 'en');
    const summarySection = built.sections.find((section) => section.key === 'summary');

    assert.ok(summarySection, 'the summary must be in the printed CV');
    const text = summarySection.text ?? '';
    assert.equal(
      (text.match(/frontend developer/gi) ?? []).length,
      1,
      'the repeated paragraph must be folded away in the printed CV'
    );
  });

  it('prints the summary the candidate wrote', () => {
    const document = documentWith({ summary: 'A frontend developer.' });

    const built = buildCvTemplateDocument(document, 'en');
    const summarySection = built.sections.find((section) => section.key === 'summary');

    assert.ok(summarySection);
    assert.match(summarySection.text ?? '', /A frontend developer\./);
  });
});

describe('the wiring', () => {
  const context = readFileSync(
    join(REPO_ROOT, 'src', 'context', 'CareerContext.tsx'),
    'utf-8'
  );

  it('passes the header history to the projection', () => {
    // Without these values the projection cannot tell the studio's own copy
    // of the records from a record that was changed somewhere else, and the
    // typing bug comes back.
    assert.match(
      context,
      /mergeCanonicalCvDocument\(\s*cvSource,\s*previous,\s*\{[\s\S]*?history:/,
      'the projection must be given the header values the studio wrote'
    );
  });

  it('never trims the candidate\'s text inside the projection', () => {
    const projection = readFileSync(
      join(REPO_ROOT, 'shared', 'cvProjection.ts'),
      'utf-8'
    );
    assert.doesNotMatch(
      projection,
      /previous\.fullName\?\.trim\(\)/,
      'the projection must not trim the name the candidate typed'
    );
    assert.doesNotMatch(
      projection,
      /previous\.summary\?\.trim\(\)/,
      'the projection must not trim the summary the candidate typed'
    );
  });
});
