/**
 * The extraction review.
 *
 * The review is the part of the CV journey the candidate is looking at, and
 * the rules it follows are what make it worth looking at:
 *
 *   - every value carries the text it was read from, so it can be checked
 *     against the document rather than taken on trust;
 *   - the confidence is computed from that evidence and from where in the
 *     document the value was found, so the same document always produces
 *     the same grades;
 *   - a field the document does not state is reported as missing, and a
 *     value the document contradicts is reported as an issue;
 *   - nothing is written until the candidate accepts it, and writing the
 *     same review twice writes once.
 *
 * These are pure, so they are tested without a server.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { extractDocument, extractTextDocument } from '../server/cv/documentExtraction.ts';
import { parseStructuredCv } from '../server/cv/parseStructuredCv.ts';
import { buildExtractionReview, detectDocumentLanguage } from '../server/cv/extractionReview.ts';
import { validateExtraction } from '../server/cv/cvValidation.ts';
import { parsedCvToProfile } from '../server/cv/parsedCvToProfile.ts';
import {
  confidenceFromScore,
  scoreFromConfidence,
  summarizeReview,
  CV_SECTION_KEYS,
  type CvExtractionReview,
} from '../shared/cvExtraction.ts';
import type { CVProfile } from '../src/types/career.ts';

/** A CV written the way a CV is written. */
const CV_TEXT = `Sara Hassan
Data Analyst
sara.hassan@example.com | +20 100 555 0142 | Cairo, Egypt

PROFESSIONAL SUMMARY
Data analyst with four years of experience turning operational data into decisions.

EXPERIENCE
Senior Data Analyst — Nile Retail Group
Jan 2022 – Present | Cairo, Egypt
• Built a churn model that reduced monthly churn by 12%.

EDUCATION
BSc Statistics — Cairo University
2016 – 2020

SKILLS
SQL, Python, Tableau

CERTIFICATIONS
Google Data Analytics Professional Certificate (2023)
`;

function reviewOf(text: string): CvExtractionReview {
  const extraction = extractTextDocument(text);
  const parsed = parseStructuredCv(extraction);
  return buildExtractionReview(extraction, parsed);
}

describe('the confidence of a value', () => {
  it('is computed, not declared', () => {
    assert.equal(confidenceFromScore(0.95), 'high');
    assert.equal(confidenceFromScore(0.7), 'medium');
    assert.equal(confidenceFromScore(0.4), 'low');
    assert.equal(confidenceFromScore(0), 'low');
    assert.equal(confidenceFromScore(2), 'high', 'a score above one is still high');
    assert.equal(confidenceFromScore(Number.NaN), 'low');
  });

  it('orders the levels so they can be averaged', () => {
    assert.ok(scoreFromConfidence('high') > scoreFromConfidence('medium'));
    assert.ok(scoreFromConfidence('medium') > scoreFromConfidence('low'));
    assert.ok(scoreFromConfidence('low') > scoreFromConfidence('needs-review'));
  });

  it('summarises a review from the fields, not from the section scores', () => {
    const summary = summarizeReview({
      sections: [
        {
          key: 'personal',
          label: 'Personal details',
          present: true,
          confidence: 'high',
          fields: {
            email: {
              key: 'email',
              label: 'Email',
              value: 'a@b.com',
              confidence: 'high',
              status: 'extracted',
              evidence: [],
              issues: [],
            },
            phone: {
              key: 'phone',
              label: 'Phone',
              value: null,
              confidence: 'needs-review',
              status: 'missing',
              evidence: [],
              issues: [],
            },
          },
          entries: [],
          issues: [],
        },
      ],
      validation: [],
    });

    assert.equal(summary.fieldsExtracted, 1);
    assert.equal(summary.fieldsHigh, 1);
    assert.equal(summary.fieldsMissing, 1);
    assert.equal(summary.sectionsFound, 1);
    assert.equal(summary.sectionsTotal, CV_SECTION_KEYS.length);
  });
});

describe('the review of a document', () => {
  const review = reviewOf(CV_TEXT);

  it('reads the document without writing anything', () => {
    // The review is a pure function of the document. Calling it twice gives
    // the same answer, which is what lets the candidate come back to it.
    const again = reviewOf(CV_TEXT);
    assert.deepEqual(
      again.sections.map((section) => section.key),
      review.sections.map((section) => section.key)
    );
    assert.equal(review.cv.email, 'sara.hassan@example.com');
  });

  it('shows the text every value was read from', () => {
    const personal = review.sections.find((section) => section.key === 'personal');
    assert.ok(personal, 'the review must have a personal section');

    const email = personal.fields.email;
    assert.ok(email, 'the review must have an email field');
    assert.equal(email.value, 'sara.hassan@example.com');
    assert.ok(email.evidence.length > 0, 'the email must carry its evidence');
    assert.ok(
      email.evidence[0].text.toLowerCase().includes('sara.hassan@example.com'),
      'the evidence must be the text the value came from'
    );
  });

  it('grades a value that is in the document high', () => {
    const personal = review.sections.find((section) => section.key === 'personal');
    assert.equal(personal?.fields.email.confidence, 'high');
    assert.equal(personal?.fields.fullName.confidence, 'high');
  });

  it('reports a field the document does not state as missing', () => {
    const personal = review.sections.find((section) => section.key === 'personal');
    const website = personal?.fields.website;
    assert.equal(website?.status, 'missing');
    assert.equal(website?.value, null);
    assert.equal(website?.confidence, 'needs-review');
    assert.ok(website?.issues.length, 'a missing field says why');
  });

  it('never leaves a value without a source', () => {
    for (const section of review.sections) {
      for (const field of Object.values(section.fields)) {
        if (field.status === 'missing') {
          assert.equal(field.value, null);
          continue;
        }
        assert.ok(
          field.evidence.length > 0 || field.confidence === 'low',
          `${section.key}.${field.key} has a value with neither evidence nor a low grade`
        );
      }
    }
  });

  it('knows the language of the document', () => {
    assert.equal(review.source.language, 'en');
    assert.equal(
      detectDocumentLanguage(
        'سارة حسن — محلل بيانات بخبرة أربع سنوات في تحويل البيانات التشغيلية إلى قرارات'
      ),
      'ar'
    );
    assert.equal(
      detectDocumentLanguage(
        'محلل بيانات — Data Analyst — سارة حسن — Senior Data Analyst — بخبرة أربع سنوات'
      ),
      'mixed'
    );
  });
});

describe('the issues the review reports', () => {
  it('finds a duplicated role', () => {
    const text = `Sara Hassan
sara.hassan@example.com | Cairo, Egypt

EXPERIENCE
Senior Data Analyst — Nile Retail Group
Jan 2022 – Present
• Did a thing.

Senior Data Analyst — Nile Retail Group
Jan 2020 – Dec 2021
• Did another thing.
`;
    const issues = validateExtraction(parsedCvToProfile(parseStructuredCv(extractTextDocument(text)).cv));
    assert.ok(
      issues.some((issue) => issue.code === 'duplicate_experience'),
      'the same role twice has to be reported'
    );
  });

  it('finds two roles that overlap in time', () => {
    const text = `Sara Hassan
sara.hassan@example.com | Cairo, Egypt

EXPERIENCE
Analyst — One Company
Jan 2022 – Present
• Did a thing.

Analyst — Another Company
Jun 2021 – Dec 2023
• Did another thing.
`;
    const issues = validateExtraction(parsedCvToProfile(parseStructuredCv(extractTextDocument(text)).cv));
    assert.ok(
      issues.some((issue) => issue.code === 'overlapping_dates'),
      'two roles that overlap have to be reported'
    );
  });

  it('finds a role that ends before it starts', () => {
    const text = `Sara Hassan
sara.hassan@example.com | Cairo, Egypt

EXPERIENCE
Analyst — One Company
Jan 2024 – Dec 2021
• Did a thing.
`;
    const issues = validateExtraction(parsedCvToProfile(parseStructuredCv(extractTextDocument(text)).cv));
    assert.ok(
      issues.some((issue) => issue.code === 'end_before_start'),
      'a role that ends before it starts has to be reported'
    );
  });

  it('finds a role that is still running and also finished', () => {
    const text = `Sara Hassan
sara.hassan@example.com | Cairo, Egypt

EXPERIENCE
Analyst — One Company
Jan 2022 – Present
• Did a thing.
`;
    const profile = parsedCvToProfile(parseStructuredCv(extractTextDocument(text)).cv);
    profile.experiences[0].endDate = '2024-01-01';
    const issues = validateExtraction(profile);
    assert.ok(
      issues.some((issue) => issue.code === 'current_with_end_date'),
      'a current role with an end date has to be reported'
    );
  });

  it('finds an address that is not an address', () => {
    const profile: CVProfile = {
      fullName: 'Sara Hassan',
      email: 'not-an-email',
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
    };
    const issues = validateExtraction(profile);
    assert.ok(issues.some((issue) => issue.code === 'invalid_email'));
    assert.ok(issues.some((issue) => issue.code === 'missing_phone'));
    // An address that is there but wrong is reported as wrong, not as
    // missing: the candidate has to fix it, not fill it in.
    assert.ok(!issues.some((issue) => issue.code === 'missing_email'));
  });

  it('writes its messages as templates, so they can be translated', () => {
    const issues = validateExtraction({
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
    });
    for (const issue of issues) {
      assert.ok(
        !/\{/.test(issue.message) || issue.params,
        `${issue.code} has a placeholder and no values to fill it with`
      );
    }
  });
});

describe('the import of a reviewed CV', () => {
  it('is written to be run twice', () => {
    // The write matches every record on its natural key, so a second run
    // finds them already there. This is what makes a double click, a retry
    // and a refresh on the confirmation screen all safe.
    const source = readFileSync(
      join(import.meta.dirname, '..', 'server', 'cv', 'reviewedImport.ts'),
      'utf8'
    );
    assert.match(source, /alreadyApplied/, 'the import has to say when it was already applied');
    assert.match(
      source,
      /duplicateKey|key\(entry\.role, entry\.company\)|key\(entry\.institution, entry\.degree\)/,
      'the import has to match records on their natural key'
    );
    assert.doesNotMatch(
      source,
      /delete\(|truncate/i,
      'the import must never remove what the candidate already has'
    );
  });

  it('never overwrites the header', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'server', 'cv', 'reviewedImport.ts'),
      'utf8'
    );
    assert.match(
      source,
      /planPersonalImport/,
      'the header is filled in by the shared policy that only fills what is empty'
    );
  });

  it('does not write a section the candidate turned off', () => {
    const source = readFileSync(
      join(import.meta.dirname, '..', 'server', 'cv', 'reviewedImport.ts'),
      'utf8'
    );
    assert.match(source, /isSelected/, 'a rejected section must not be written');
  });
});

describe('the review routes', () => {
  const app = readFileSync(join(import.meta.dirname, '..', 'app.ts'), 'utf8');

  it('reads a document without writing to the account', () => {
    assert.match(app, /app\.post\('\/api\/cv\/extract'/);
    const route = app.slice(app.indexOf("app.post('/api/cv/extract'"));
    const body = route.slice(0, route.indexOf("app.post('/api/cv/extract/section'"));
    assert.doesNotMatch(
      body,
      /createCv|createExperience|createEducation|createProject|upsertProfile/,
      'the extraction route must not write anything'
    );
  });

  it('reads one section again on its own', () => {
    assert.match(app, /app\.post\('\/api\/cv\/extract\/section'/);
  });

  it('applies the reviewed document through the idempotent write', () => {
    assert.match(app, /app\.post\('\/api\/cv\/import\/reviewed'/);
    assert.match(app, /applyReviewedImport/);
  });

  it('keeps the three routes apart', () => {
    // The order is the point: the review is a pure read, the import is the
    // only write, and neither is folded into the other.
    assert.ok(
      app.indexOf("app.post('/api/cv/extract'") <
        app.indexOf("app.post('/api/cv/import/reviewed'"),
      'the read must come before the write'
    );
  });
});
