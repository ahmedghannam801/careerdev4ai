// Deterministic CV extraction and parsing.
//
// Every fixture is a real document generated into a scratch directory before
// the suite runs: a PDF with an embedded font and a genuine two-column layout,
// an image-only PDF, and real OOXML DOCX packages (including a layout table).
// The tests therefore exercise the same bytes an upload would, not hand-built
// XML that could hide a ZIP or PDF-decoding regression.
//
// The pipeline under test is:
//   bytes -> format extraction -> quality gate -> structured parser
// and the contract is that a field is either evidenced in the document or left
// blank. Nothing here may be invented.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessDocumentQuality,
  extractDocument,
  extractTextDocument,
  hasDocxSignature,
  hasPdfSignature,
  normalizeDocumentText,
} from '../server/cv/documentExtraction.ts';
import { parseStructuredCv } from '../server/cv/parseStructuredCv.ts';
import { normalizeDateRange, normalizeDateValue } from '../server/db/dates.ts';
import { normalizeProfileUrl } from '../shared/urls.ts';
import { planPersonalImport } from '../shared/cvImport.ts';
import {
  formatRetryDelay,
  isAtsAnalysisForRole,
  parseAtsAnalysisFailure,
  resolveAtsAnalysisRole,
} from '../shared/atsAnalysis.ts';
import { generateCvFixtures } from './fixtures/generate-cv-fixtures.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = join(REPO_ROOT, '.tmp-qa', 'cv-pipeline-fixtures');

interface PipelineResult {
  extraction: Awaited<ReturnType<typeof extractDocument>>;
  cv: ReturnType<typeof parseStructuredCv>['cv'];
  metadata: ReturnType<typeof parseStructuredCv>['metadata'];
}

let pdf: PipelineResult;
let docx: PipelineResult;
let ambiguous: PipelineResult;
let noContact: PipelineResult;
let scanned: PipelineResult;
let pdfBytes: Uint8Array;
let docxBytes: Uint8Array;

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURE_DIR, name)));
}

async function run(file: string, format: 'pdf' | 'docx'): Promise<PipelineResult> {
  const bytes = readFixture(file);
  const extraction = await extractDocument(bytes, format);
  const parsed = parseStructuredCv(extraction);
  return { extraction, cv: parsed.cv, metadata: parsed.metadata };
}

before(async () => {
  await generateCvFixtures(FIXTURE_DIR);
  pdfBytes = readFixture('modern-two-column.pdf');
  docxBytes = readFixture('modern-two-column.docx');
  pdf = await run('modern-two-column.pdf', 'pdf');
  docx = await run('modern-two-column.docx', 'docx');
  ambiguous = await run('ambiguous-location.docx', 'docx');
  noContact = await run('no-contact.docx', 'docx');
  scanned = await run('scanned-image-only.pdf', 'pdf');
});

describe('PDF extraction', () => {
  test('reads the text layer and reports a two-column page', () => {
    assert.equal(pdf.extraction.format, 'pdf');
    assert.equal(pdf.extraction.status, 'ok');
    assert.equal(pdf.extraction.isScanned, false);
    assert.equal(pdf.extraction.layout, 'two-column');
    assert.equal(pdf.extraction.pageCount, 1);
    assert.ok(
      pdf.extraction.characterCount > 700,
      `expected substantial text, got ${pdf.extraction.characterCount}`
    );
    assert.ok(pdf.extraction.wordCount > 100);
  });

  test('emits the main column before the sidebar', () => {
    const text = pdf.extraction.text;
    assert.ok(text.startsWith('SARA HASSAN'), 'the candidate name must come first');
    assert.ok(
      text.indexOf('SARA HASSAN') < text.indexOf('CONTACT'),
      'the sidebar must not precede the main column'
    );
    assert.ok(text.indexOf('EXPERIENCE') < text.indexOf('CONTACT'));
  });

  test('keeps positioned blocks so later stages can reason about layout', () => {
    assert.ok(pdf.extraction.blocks.length > 10);
    for (const block of pdf.extraction.blocks) {
      assert.equal(block.page, 1);
      assert.ok(block.text.trim().length > 0);
      assert.ok(Number.isFinite(block.x));
      assert.ok(Number.isFinite(block.y));
      assert.ok(block.fontSize > 0);
    }
  });

  test('a real CV is accepted with high quality', () => {
    const quality = assessDocumentQuality(pdf.extraction);
    assert.deepEqual(quality, {
      isAcceptable: true,
      isScannedPdf: false,
      quality: 'high',
    });
  });
});

describe('deterministic PDF parsing', () => {
  test('extracts the candidate header without fabricating fields', () => {
    assert.equal(pdf.cv.fullName, 'Sara Hassan');
    assert.equal(pdf.cv.title, 'Data Analyst');
    assert.equal(pdf.cv.email, 'sara.hassan@example.com');
    assert.equal(pdf.cv.phone, '+20 100 555 0142');
    assert.equal(pdf.cv.location, 'Cairo, Egypt');
    assert.equal(pdf.cv.linkedin, 'https://linkedin.com/in/sarahassan');
    assert.equal(pdf.cv.github, '');
    assert.equal(pdf.cv.website, '');
    assert.match(pdf.cv.summary, /four years of experience/);
  });

  test('builds both roles, their dates, locations and bullets', () => {
    assert.equal(pdf.cv.experiences.length, 2);
    const [current, previous] = pdf.cv.experiences;
    assert.equal(current.role, 'Senior Data Analyst');
    assert.equal(current.company, 'Nile Retail Group');
    assert.equal(current.location, 'Cairo, Egypt');
    assert.equal(current.period, 'Jan 2022 – Present');
    assert.equal(current.startDate, '2022-01-01');
    assert.equal(current.endDate, '');
    assert.equal(current.isCurrent, true);
    assert.equal(current.bullets.length, 3);
    assert.match(current.bullets[0], /churn model/);

    assert.equal(previous.role, 'Data Analyst');
    assert.equal(previous.company, 'Delta Logistics');
    assert.equal(previous.location, 'Alexandria, Egypt');
    assert.equal(previous.startDate, '2020-06-01');
    assert.equal(previous.endDate, '2021-12-01');
    assert.equal(previous.isCurrent, false);
    assert.equal(previous.bullets.length, 2);
  });

  test('extracts education, project, skills and certification from their sections', () => {
    assert.equal(pdf.cv.education.length, 1);
    const education = pdf.cv.education[0];
    assert.equal(education.degree, 'BSc');
    assert.equal(education.field, 'Statistics');
    assert.equal(education.institution, 'Cairo University');
    assert.equal(education.period, '2016 – 2020');
    assert.equal(education.gpa, '3.7/4.0');

    assert.equal(pdf.cv.projects.length, 1);
    assert.equal(pdf.cv.projects[0].title, 'Customer Churn Dashboard');
    assert.deepEqual(pdf.cv.projects[0].technologies, ['Python', 'SQL', 'Power BI']);
    // The fixture is laid out with the host's own font, so the description may
    // occupy one line or wrap into two depending on the platform's metrics.
    // What the contract holds on every platform is that the description is
    // carried as the project's bullet, not that it is one line long.
    assert.ok(pdf.cv.projects[0].bullets.length >= 1);
    assert.match(
      pdf.cv.projects[0].bullets.join(' '),
      /top three churn drivers/i
    );

    assert.ok(pdf.cv.skillsList.includes('SQL'));
    assert.ok(pdf.cv.skillsList.includes('Python'));
    assert.ok(pdf.cv.skillsList.includes('Tableau'));
    assert.ok(pdf.cv.skillsList.includes('Power BI'));
    assert.ok(pdf.cv.skillsList.includes('Excel'));
    // The PDF text layer wraps this skill after "A/B"; the parser must rejoin
    // the known phrase rather than persisting two bogus skills.
    assert.ok(pdf.cv.skillsList.includes('A/B Testing'));
    assert.ok(!pdf.cv.skillsList.includes('A/B'));
    assert.ok(!pdf.cv.skillsList.includes('Testing'));

    assert.deepEqual(pdf.cv.certifications, [
      'Google Data Analytics Professional Certificate (2023)',
    ]);
    // The wording is evidence; the provider and year are not invented from it.
    assert.deepEqual(pdf.cv.certificationDetails, [
      {
        name: 'Google Data Analytics Professional Certificate (2023)',
        issuer: '',
        issueDate: '',
        description: '',
        skills: [],
        credentialId: '',
      },
    ]);
  });

  test('reports confidence, evidence and layout warnings', () => {
    assert.equal(pdf.metadata.method, 'deterministic');
    assert.equal(pdf.metadata.format, 'pdf');
    assert.equal(pdf.metadata.layout, 'two-column');
    assert.ok(pdf.metadata.confidence.overall >= 80);
    assert.ok(pdf.metadata.confidence.experience >= 80);
    assert.ok(pdf.metadata.confidence.personal >= 90);
    const fields = new Set(pdf.metadata.evidence.map((entry) => entry.field));
    for (const field of ['fullName', 'email', 'phone', 'location', 'experience', 'education', 'project', 'skills']) {
      assert.ok(fields.has(field), `missing evidence for ${field}`);
    }
    assert.ok(
      pdf.metadata.warnings.some((warning) => /two-column layout detected/i.test(warning))
    );
    assert.ok(
      !pdf.metadata.warnings.some((warning) => /No (candidate name|email address|work experience)/i.test(warning)),
      'a complete CV must not carry missing-field warnings'
    );
  });
});

describe('scanned / image-only PDFs', () => {
  test('are detected explicitly and never parsed', () => {
    assert.equal(scanned.extraction.format, 'pdf');
    assert.equal(scanned.extraction.status, 'scanned');
    assert.equal(scanned.extraction.isScanned, true);
    assert.equal(scanned.extraction.characterCount, 0);
    assert.equal(scanned.extraction.text, '');
  });

  test('are rejected with an OCR-specific, actionable message', () => {
    const quality = assessDocumentQuality(scanned.extraction);
    assert.equal(quality.isAcceptable, false);
    assert.equal(quality.isScannedPdf, true);
    assert.equal(quality.quality, 'failed');
    assert.match(quality.errorMessage ?? '', /scanned or image-only/i);
    assert.match(quality.errorMessage ?? '', /OCR is not supported for scanned PDFs\./);
  });

  test('produce no fabricated CV fields', () => {
    assert.deepEqual(scanned.cv.experiences, []);
    assert.deepEqual(scanned.cv.education, []);
    assert.deepEqual(scanned.cv.skillsList, []);
    assert.deepEqual(scanned.cv.projects, []);
    assert.deepEqual(scanned.cv.certifications, []);
    assert.equal(scanned.cv.fullName, '');
    assert.equal(scanned.cv.email, '');
    assert.ok(
      scanned.metadata.warnings.some((warning) => /No text layer was found/i.test(warning))
    );
  });
});

describe('DOCX extraction', () => {
  test('opens the real OOXML package and keeps the layout-table order', () => {
    assert.equal(docx.extraction.format, 'docx');
    assert.equal(docx.extraction.status, 'ok');
    assert.equal(docx.extraction.layout, 'two-column');
    assert.ok(docx.extraction.characterCount > 700);
    assert.ok(docx.extraction.text.startsWith('SARA HASSAN'));
    assert.ok(
      docx.extraction.text.indexOf('SARA HASSAN') <
        docx.extraction.text.indexOf('CONTACT')
    );
    assert.ok(docx.extraction.text.includes('sara.hassan@example.com'));
    assert.ok(docx.extraction.text.includes('Cairo University'));
  });

  test('parses the same CV as the PDF, including a full slash skill', () => {
    assert.equal(docx.cv.fullName, 'Sara Hassan');
    assert.equal(docx.cv.title, 'Data Analyst');
    assert.equal(docx.cv.location, 'Cairo, Egypt');
    assert.equal(docx.cv.experiences.length, 2);
    assert.equal(docx.cv.experiences[0].company, 'Nile Retail Group');
    assert.equal(docx.cv.experiences[0].bullets.length, 3);
    assert.equal(docx.cv.education[0].institution, 'Cairo University');
    assert.equal(docx.cv.projects.length, 1);
    assert.ok(docx.cv.skillsList.includes('A/B Testing'));
    assert.ok(!docx.cv.skillsList.includes('A/B'));
    assert.ok(!docx.cv.skillsList.includes('Testing'));
    assert.deepEqual(docx.cv.certifications, [
      'Google Data Analytics Professional Certificate (2023)',
    ]);
    assert.ok(docx.metadata.confidence.overall >= 80);
  });

  test('decodes entities and keeps bullets instead of flattening them', () => {
    const extracted = extractTextDocument(
      'JANE DOE\njane.doe@example.com\n\nEXPERIENCE\nAnalyst — R&D Group\n2020 – 2022\n• Cut costs by 12% & improved reporting\n'
    );
    const parsed = parseStructuredCv(extracted);
    assert.equal(parsed.cv.experiences[0].company, 'R&D Group');
    assert.deepEqual(parsed.cv.experiences[0].bullets, [
      'Cut costs by 12% & improved reporting',
    ]);
  });
});

describe('ambiguous data stays unresolved', () => {
  test('a city in a bullet is not promoted to the candidate location', () => {
    assert.equal(ambiguous.cv.fullName, 'Omar Khaled');
    assert.equal(ambiguous.cv.location, '');
    assert.equal(ambiguous.cv.experiences[0].location, '');
    assert.equal(ambiguous.cv.education[0].institution, 'Cairo University');
    assert.ok(
      ambiguous.cv.experiences[0].bullets.some((bullet) => /Cairo fulfilment centre/.test(bullet)),
      'the city must remain where the document put it'
    );
    assert.ok(
      ambiguous.metadata.warnings.some((warning) =>
        /location was left blank/i.test(warning)
      )
    );
  });

  test('a CV with no contact block still parses and says what is missing', () => {
    assert.equal(noContact.cv.fullName, '');
    assert.equal(noContact.cv.email, '');
    assert.equal(noContact.cv.phone, '');
    assert.equal(noContact.cv.location, '');
    assert.equal(noContact.cv.experiences.length, 1);
    assert.equal(noContact.cv.experiences[0].company, 'Atlas Services');
    assert.equal(noContact.cv.education[0].institution, 'Alexandria University');
    for (const expected of [
      /No candidate name/i,
      /No email address/i,
      /No phone number/i,
      /location was left blank/i,
      /No skills/i,
    ]) {
      assert.ok(
        noContact.metadata.warnings.some((warning) => expected.test(warning)),
        `missing warning ${expected}`
      );
    }
  });
});

describe('project boundaries', () => {
  test('a description under a project is a bullet, not a second project', () => {
    assert.equal(pdf.cv.projects.length, 1);
    assert.equal(docx.cv.projects.length, 1);
    assert.equal(
      docx.cv.projects[0].bullets[0],
      'Published a dashboard and case study identifying the top three churn drivers.'
    );
  });
});

describe('format and quality guards', () => {
  test('signature checks follow the real bytes', () => {
    assert.equal(hasPdfSignature(pdfBytes), true);
    assert.equal(hasPdfSignature(docxBytes), false);
    assert.equal(hasDocxSignature(docxBytes), true);
    assert.equal(hasDocxSignature(pdfBytes), false);
  });

  test('a file whose extension lies is rejected with actionable text', async () => {
    const fakePdf = await extractDocument(
      new Uint8Array(Buffer.from('this is not a PDF')),
      'pdf'
    );
    assert.equal(fakePdf.status, 'unsupported');
    assert.match(fakePdf.errorMessage ?? '', /not a PDF/i);
    assert.equal(assessDocumentQuality(fakePdf).isAcceptable, false);

    const fakeDocx = await extractDocument(
      new Uint8Array(Buffer.from('this is not a ZIP package')),
      'docx'
    );
    assert.equal(fakeDocx.status, 'unsupported');
    assert.match(fakeDocx.errorMessage ?? '', /not a DOCX package/i);
    assert.equal(assessDocumentQuality(fakeDocx).isAcceptable, false);
  });

  test('an unreadable or non-CV text is rejected with its own message', async () => {
    const empty = await extractDocument(new Uint8Array(), 'txt');
    assert.equal(empty.status, 'empty');
    assert.equal(assessDocumentQuality(empty).isAcceptable, false);

    const notCv = extractTextDocument(
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.'
    );
    const quality = assessDocumentQuality(notCv);
    assert.equal(quality.isAcceptable, false);
    assert.match(quality.errorMessage ?? '', /does not appear to be a CV/i);
  });

  test('pasted text follows the same pipeline as a TXT upload', async () => {
    const text = [
      'JANE DOE',
      'jane.doe@example.com',
      'Product Manager',
      'SKILLS',
      'Roadmapping, Analytics, SQL',
      'EXPERIENCE',
      'Senior Product Manager — Acme Corp',
      'Jan 2021 – Present',
      '• Grew activation by 18%.',
    ].join('\n');
    const extraction = extractTextDocument(text);
    assert.equal(extraction.format, 'txt');
    assert.equal(extraction.status, 'ok');
    const parsed = parseStructuredCv(extraction);
    assert.equal(parsed.cv.fullName, 'Jane Doe');
    assert.equal(parsed.cv.title, 'Product Manager');
    assert.equal(parsed.cv.experiences[0].company, 'Acme Corp');
    assert.deepEqual(parsed.cv.skillsList, ['Roadmapping', 'Analytics', 'SQL']);
    assert.equal(assessDocumentQuality(extraction).isAcceptable, true);
  });

  test('normalisation removes control characters without damaging text', () => {
    const normalised = normalizeDocumentText('A\u0000B\r\nC\t \n\n\nD\u200B');
    assert.equal(normalised, 'AB\nC\n\nD');
  });
});

describe('CV import planning', () => {
  test('normalises bare contact links to absolute http(s) URLs', () => {
    assert.equal(normalizeProfileUrl('linkedin.com/in/sarahassan'), 'https://linkedin.com/in/sarahassan');
    assert.equal(normalizeProfileUrl('www.github.com/sara'), 'https://www.github.com/sara');
    assert.equal(normalizeProfileUrl('https://example.com/profile'), 'https://example.com/profile');
    assert.equal(normalizeProfileUrl('javascript:alert(1)'), '');
    assert.equal(normalizeProfileUrl('not a url'), '');
    assert.equal(normalizeProfileUrl(''), '');
  });

  test('counts only the personal fields that will actually be written', () => {
    const plan = planPersonalImport(
      { name: '', currentTitle: '', location: '', phone: '', professionalSummary: '', links: {} },
      {
        fullName: 'Sara Hassan',
        title: 'Data Analyst',
        location: 'Cairo, Egypt',
        phone: '+20 100 555 0142',
        summary: 'Data analyst with four years of experience.',
        linkedin: 'linkedin.com/in/sarahassan',
      }
    );

    assert.equal(plan.imported, 6);
    assert.equal(plan.skipped, 0);
    assert.equal(plan.updates.links?.linkedin, 'https://linkedin.com/in/sarahassan');
    assert.equal(plan.updates.headline, 'Data Analyst');
  });

  test('never overwrites existing personal values or links', () => {
    const plan = planPersonalImport(
      {
        name: 'Existing Name',
        currentTitle: 'Existing Title',
        location: 'Existing Location',
        phone: '+1 555 0100',
        professionalSummary: 'Existing summary',
        links: { linkedin: 'https://linkedin.com/in/existing' },
      },
      {
        fullName: 'Sara Hassan',
        title: 'Data Analyst',
        location: 'Cairo, Egypt',
        phone: '+20 100 555 0142',
        summary: 'New summary',
        linkedin: 'linkedin.com/in/sarahassan',
      }
    );

    assert.deepEqual(plan.updates, {});
    assert.equal(plan.imported, 0);
    assert.equal(plan.skipped, 6);
  });
});

describe('date normalisation at the database boundary', () => {
  test('accepts the formats the UI and parser produce', () => {
    assert.equal(normalizeDateValue('Jan 2022').date, '2022-01-01');
    assert.equal(normalizeDateValue('June 2020').date, '2020-06-01');
    assert.equal(normalizeDateValue('Sep 2021').date, '2021-09-01');
    assert.equal(normalizeDateValue("Jan '22").date, '2022-01-01');
    assert.equal(normalizeDateValue('2021-06').date, '2021-06-01');
    assert.equal(normalizeDateValue('06/2021').date, '2021-06-01');
    assert.equal(normalizeDateValue('2021-06-15').date, '2021-06-15');
    assert.equal(normalizeDateValue('15 June 2021').date, '2021-06-15');
    assert.equal(normalizeDateValue('June 15, 2021').date, '2021-06-15');
    assert.equal(normalizeDateValue('2021').date, '2021-01-01');
    assert.equal(normalizeDateValue('since Jan 2022').date, '2022-01-01');
  });

  test('marks "Present" as current rather than inventing a date', () => {
    assert.deepEqual(normalizeDateValue('Present'), { date: null, isCurrent: true });
    assert.deepEqual(normalizeDateValue('ongoing'), { date: null, isCurrent: true });
  });

  test('unknown or impossible values become null instead of failing the insert', () => {
    assert.deepEqual(normalizeDateValue('2022-02-30'), { date: null, isCurrent: false });
    assert.deepEqual(normalizeDateValue('summer 2022'), { date: null, isCurrent: false });
    assert.deepEqual(normalizeDateValue('13/2021'), { date: null, isCurrent: false });
    assert.deepEqual(normalizeDateValue(''), { date: null, isCurrent: false });
    assert.deepEqual(normalizeDateValue(null), { date: null, isCurrent: false });
    assert.deepEqual(normalizeDateValue(2022), { date: null, isCurrent: false });
  });

  test('a current role clears the end date so the pair cannot disagree', () => {
    assert.deepEqual(normalizeDateRange('Jan 2022', 'Present'), {
      startDate: '2022-01-01',
      endDate: null,
      isCurrent: true,
    });
    assert.deepEqual(normalizeDateRange('Jun 2020', 'Dec 2021', false), {
      startDate: '2020-06-01',
      endDate: '2021-12-01',
      isCurrent: false,
    });
    assert.deepEqual(normalizeDateRange('2020', '', true), {
      startDate: '2020-01-01',
      endDate: null,
      isCurrent: true,
    });
    assert.deepEqual(normalizeDateRange('garbage', 'nonsense'), {
      startDate: null,
      endDate: null,
      isCurrent: false,
    });
  });
});

describe('ATS analysis integrity', () => {
  test('labels an analysis with the role it was generated for', () => {
    const context = resolveAtsAnalysisRole('AI/ML Engineer', 'Business Intelligence Analyst');
    assert.equal(context.roleTitle, 'AI/ML Engineer');
    assert.equal(context.isStale, true);
  });

  test('does not flag the same role in different casing or with whitespace', () => {
    const context = resolveAtsAnalysisRole('  business intelligence analyst ', 'Business Intelligence Analyst');
    assert.equal(context.roleTitle, 'business intelligence analyst');
    assert.equal(context.isStale, false);
  });

  test('never treats an unrecorded analysis role as a current match', () => {
    assert.equal(resolveAtsAnalysisRole(null, 'Business Intelligence Analyst').isStale, false);
    assert.equal(isAtsAnalysisForRole(null, 'Business Intelligence Analyst'), false);
    assert.equal(isAtsAnalysisForRole('', 'Business Intelligence Analyst'), false);
  });

  test('gates current-role ATS scoring on an exact, case-insensitive role match', () => {
    assert.equal(isAtsAnalysisForRole('Business Intelligence Analyst', 'Business Intelligence Analyst'), true);
    assert.equal(isAtsAnalysisForRole('AI/ML Engineer', 'Business Intelligence Analyst'), false);
  });

  test('surfaces the provider quota message, code and retry window', () => {
    const failure = parseAtsAnalysisFailure(
      {
        error: "The AI assistant has reached today's usage limit. Nothing was generated; please try again later.",
        code: 'provider_quota',
        retryAfterSeconds: 19620,
      },
      429
    );
    assert.equal(failure.code, 'provider_quota');
    assert.equal(failure.retryAfterSeconds, 19620);
    assert.match(failure.message, /usage limit/i);
  });

  test('produces a visible message for an unknown error body', () => {
    const failure = parseAtsAnalysisFailure('<html>gateway error</html>', 502);
    assert.match(failure.message, /502/);
    assert.equal(failure.code, null);
    assert.equal(failure.retryAfterSeconds, null);
  });

  test('ignores invalid retry windows instead of showing a bogus wait', () => {
    for (const retry of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, '19620']) {
      const failure = parseAtsAnalysisFailure(
        { error: 'Unavailable', code: 'provider_error', retryAfterSeconds: retry },
        503
      );
      assert.equal(failure.retryAfterSeconds, null);
    }
  });

  test('formats a retry window as human-readable time', () => {
    assert.equal(formatRetryDelay(null), null);
    assert.equal(formatRetryDelay(0), null);
    assert.equal(formatRetryDelay(30), '1 minute');
    assert.equal(formatRetryDelay(90), '2 minutes');
    assert.equal(formatRetryDelay(3600), '1 hour');
    assert.equal(formatRetryDelay(5400), '1 hour 30 minutes');
    assert.equal(formatRetryDelay(19620), '5 hours 27 minutes');
  });

  test('the upload route never substitutes a fabricated ATS score', () => {
    // A deterministic fallback here would be a silent downgrade: the user
    // would see a score that no model produced. The upload must store null
    // and let CV Studio run a real retry through /api/optimize-cv.
    const source = readFileSync(join(REPO_ROOT, 'app.ts'), 'utf8');
    const start = source.indexOf("app.post('/api/resumes/upload'");
    const end = source.indexOf("app.post('/api/analyze-career'", start);
    assert.ok(start >= 0 && end > start, 'the upload route must be present');
    const route = source.slice(start, end);
    assert.match(route, /atsAnalysis\s*=\s*null/);
    assert.doesNotMatch(route, /deterministic ATS diagnostic/i);
    assert.doesNotMatch(route, /overallScore:\s*(?:50|score)\b/);
  });
});
