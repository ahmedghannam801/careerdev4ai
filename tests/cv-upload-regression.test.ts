/**
 * The CV upload path.
 *
 * A candidate's CV arrives as a file, is read, and becomes the document they
 * edit. This file proves that path end to end with real files — a real PDF
 * and a real Word file, both written here rather than mocked — and it proves
 * that the three layers which decide what a file *is* agree with each other.
 *
 * The three layers are the API, which refuses a file it cannot read, the
 * storage layer, which decides what to call the stored object, and the
 * bucket, which decides whether the stored object is welcome. They used to
 * keep separate lists, and a `.doc` that a browser reported as a plain byte
 * stream passed the first gate and was refused by the second: the upload was
 * accepted, then rejected, and nothing was saved.
 *
 * Everything here runs without a database, so the path is checked on every
 * run of the suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';

import {
  extractDocument,
  hasDocSignature,
  hasDocxSignature,
  hasPdfSignature,
} from '../server/cv/documentExtraction.ts';
import { parseStructuredCv } from '../server/cv/parseStructuredCv.ts';
import { parsedCvToProfile } from '../server/cv/parsedCvToProfile.ts';
import { extensionForMimeType } from '../server/db/cvStorage.ts';
import {
  CV_UPLOAD_EXTENSIONS,
  CV_UPLOAD_FORMATS,
  CV_UPLOAD_MAX_BYTES,
  cvUploadExtensionForStorageMime,
  cvUploadRejection,
  cvUploadStorageMime,
  isCvUploadAllowed,
} from '../shared/cvUpload.ts';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                     */
/* -------------------------------------------------------------------------- */

const CV_LINES = [
  'Jane Doe',
  'Senior Data Engineer',
  'jane.doe@example.com',
  '+20 100 000 0000',
  'linkedin.com/in/janedoe',
  'Summary',
  'Data engineer with eight years building batch and streaming pipelines.',
  'Experience',
  'Lead Data Engineer, Acme Analytics, 2021 - Present',
  'Built the streaming ingestion platform that serves forty analytics teams.',
  'Data Engineer, Nile Labs, 2018 - 2021',
  'Designed the warehouse model still in production today.',
  'Education',
  'BSc Computer Science, Cairo University',
  'Skills',
  'Python, SQL, Spark, Airflow, dbt',
];

/** A real PDF, written with a PDF writer, not a stub. */
async function buildPdf(lines: readonly string[] = CV_LINES): Promise<Buffer> {
  const document = new PDFDocument({ size: 'A4', margin: 56 });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) =>
    document.on('end', () => resolve(Buffer.concat(chunks)))
  );
  document.font('Helvetica');
  for (const line of lines) document.fontSize(11).text(line);
  document.end();
  return finished;
}

/** A real Word file, written with a Word writer, not a stub. */
async function buildDocx(lines: readonly string[] = CV_LINES): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        children: lines.map((line) => new Paragraph({ children: [new TextRun(line)] })),
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(document));
}

/* -------------------------------------------------------------------------- */
/* The upload                                                                   */
/* -------------------------------------------------------------------------- */

describe('uploading a CV', () => {
  test('a PDF is read, and every line of it survives', async () => {
    const file = await buildPdf();
    assert.equal(hasPdfSignature(new Uint8Array(file)), true, 'the file is a PDF');

    const extraction = await extractDocument(new Uint8Array(file), 'pdf');
    assert.equal(extraction.format, 'pdf');
    assert.equal(extraction.status, 'ok');
    assert.ok(extraction.text.length > 0, 'the document holds text');

    const missing = CV_LINES.filter((line) => !extraction.text.includes(line));
    assert.deepEqual(missing, [], 'every line of the CV was read');
  });

  test('a Word file is read, and every line of it survives', async () => {
    const file = await buildDocx();
    assert.equal(hasDocxSignature(new Uint8Array(file)), true, 'the file is a Word file');

    const extraction = await extractDocument(new Uint8Array(file), 'docx');
    assert.equal(extraction.format, 'docx');
    assert.equal(extraction.status, 'ok');

    const missing = CV_LINES.filter((line) => !extraction.text.includes(line));
    assert.deepEqual(missing, [], 'every line of the CV was read');
  });

  test('the same CV reads the same way as a PDF and as a Word file', async () => {
    const fromPdf = await extractDocument(new Uint8Array(await buildPdf()), 'pdf');
    const fromDocx = await extractDocument(new Uint8Array(await buildDocx()), 'docx');
    for (const line of CV_LINES) {
      assert.ok(fromPdf.text.includes(line), `the PDF holds "${line}"`);
      assert.ok(fromDocx.text.includes(line), `the Word file holds "${line}"`);
    }
  });

  test('a file that is not what it claims to be is refused', async () => {
    // A text file named `.pdf`. The signature check is what stops it.
    const pretending = Buffer.from('Jane Doe\nSenior Data Engineer\n', 'utf8');
    assert.equal(hasPdfSignature(new Uint8Array(pretending)), false);
    assert.equal(hasDocxSignature(new Uint8Array(pretending)), false);
    assert.equal(hasDocSignature(new Uint8Array(pretending)), false);
  });
});

/* -------------------------------------------------------------------------- */
/* The document reaches the editor                                              */
/* -------------------------------------------------------------------------- */

describe('the uploaded CV reaches the editor', () => {
  test('a PDF becomes a CV document with the candidate in it', async () => {
    const extraction = await extractDocument(new Uint8Array(await buildPdf()), 'pdf');
    const parsed = parseStructuredCv(extraction);
    const profile = parsedCvToProfile(parsed.cv);

    assert.equal(profile.fullName, 'Jane Doe');
    assert.equal(profile.email, 'jane.doe@example.com');
    assert.ok(profile.experiences.length >= 1, 'the experience was read');
    assert.ok(
      profile.experiences.some((experience) =>
        (experience.company ?? '').includes('Acme Analytics')
      ),
      'the employer was read'
    );
    assert.ok(
      profile.experiences.some((experience) =>
        (experience.bullets ?? []).some((bullet) => bullet.includes('ingestion platform'))
      ),
      'the bullet was read'
    );
    assert.ok(
      profile.education.some((entry) => (entry.institution ?? '').includes('Cairo University')),
      'the university was read'
    );
    assert.ok(profile.skillsList.includes('Python'), 'the skills were read');
  });

  test('a Word file becomes the same CV document', async () => {
    const extraction = await extractDocument(new Uint8Array(await buildDocx()), 'docx');
    const parsed = parseStructuredCv(extraction);
    const profile = parsedCvToProfile(parsed.cv);

    assert.equal(profile.fullName, 'Jane Doe');
    assert.equal(profile.email, 'jane.doe@example.com');
    assert.ok(profile.experiences.length >= 1, 'the experience was read');
    assert.ok(
      profile.skillsList.includes('Python'),
      'the skills were read from the Word file too'
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The rules the three layers share                                             */
/* -------------------------------------------------------------------------- */

describe('the rules the upload layers share', () => {
  test('every accepted format is accepted by every layer', () => {
    for (const format of CV_UPLOAD_FORMATS) {
      for (const mimeType of format.mimeTypes) {
        assert.equal(
          isCvUploadAllowed({ fileName: `cv${format.extension}`, mimeType }),
          true,
          `${format.extension} declared as ${mimeType} must be allowed`
        );
      }

      // The type a file is stored as is decided by its extension.
      const storageMime = cvUploadStorageMime(`cv${format.extension}`);
      assert.equal(
        storageMime,
        format.storageMime,
        `${format.extension} is stored as ${format.storageMime}`
      );

      // The storage layer must know that type.
      assert.equal(
        extensionForMimeType(storageMime as string),
        format.storageExtension,
        `the storage layer must accept ${storageMime}`
      );
      assert.equal(
        cvUploadExtensionForStorageMime(storageMime as string),
        format.storageExtension,
        `the shared map must accept ${storageMime}`
      );
    }
  });

  test('the bucket welcomes every type the storage layer writes', () => {
    // The bucket's own list of welcome types, read from the migration that
    // creates it. A type the storage layer writes but the bucket refuses is a
    // file that is accepted and then cannot be saved.
    const migration = readFileSync(
      new URL('../supabase/migrations/202510200004_cv_file_storage.sql', import.meta.url),
      'utf8'
    );
    for (const format of CV_UPLOAD_FORMATS) {
      assert.ok(
        migration.includes(`'${format.storageMime}'`),
        `the bucket must welcome ${format.storageMime}`
      );
    }
  });

  test('an unsupported file is refused with a reason', () => {
    assert.equal(
      cvUploadRejection({ fileName: 'cv.exe', mimeType: 'application/x-msdownload' }),
      'unsupported_type'
    );
    assert.equal(
      cvUploadRejection({ fileName: 'cv.pdf', mimeType: 'text/html' }),
      'unsupported_type',
      'a PDF that declares another type is refused'
    );
    assert.equal(
      cvUploadRejection({ fileName: 'cv.pdf', mimeType: 'application/pdf' }),
      null,
      'a real PDF is allowed'
    );
  });

  test('an oversized file is refused before it is sent', () => {
    assert.equal(
      cvUploadRejection({
        fileName: 'cv.pdf',
        mimeType: 'application/pdf',
        size: CV_UPLOAD_MAX_BYTES + 1,
      }),
      'too_large'
    );
    assert.equal(
      cvUploadRejection({
        fileName: 'cv.pdf',
        mimeType: 'application/pdf',
        size: CV_UPLOAD_MAX_BYTES,
      }),
      null,
      'a file exactly at the limit is allowed'
    );
  });

  test('the limit is the same number everywhere', () => {
    assert.equal(CV_UPLOAD_MAX_BYTES, 10 * 1024 * 1024);

    // The API's own limit.
    const app = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');
    assert.ok(
      app.includes('limits: { fileSize: CV_UPLOAD_MAX_BYTES }'),
      'the API must use the shared limit'
    );

    // The storage layer's own limit.
    const storage = readFileSync(new URL('../server/db/cvStorage.ts', import.meta.url), 'utf8');
    assert.ok(
      storage.includes('MAX_CV_FILE_BYTES = CV_UPLOAD_MAX_BYTES'),
      'the storage layer must use the shared limit'
    );
  });

  test('the accepted extensions are the ones the picker offers', () => {
    assert.deepEqual(
      [...CV_UPLOAD_EXTENSIONS],
      ['.pdf', '.docx', '.doc', '.txt', '.json']
    );

    // The studio's picker must offer exactly these.
    const workspace = readFileSync(
      new URL('../src/components/cv/CvReviewWorkspace.tsx', import.meta.url),
      'utf8'
    );
    assert.ok(
      workspace.includes('CV_UPLOAD_EXTENSIONS'),
      'the studio must take its accepted files from the shared list'
    );
  });
});
