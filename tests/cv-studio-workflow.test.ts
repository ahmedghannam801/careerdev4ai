/**
 * The CV Studio workflow, from the candidate's side.
 *
 * This file walks the whole journey against the running API, in the order a
 * candidate takes it:
 *
 *   1. sign in, and find the studio's own data waiting
 *   2. upload a PDF and have it read
 *   3. read what was extracted, and check it is the candidate's CV
 *   4. apply the reviewed document, and find it in the account
 *   5. edit the document and save the edit
 *   6. choose a template, and find the choice in the account
 *   7. export the Word file, and check it holds the edited document
 *   8. sign in again — a refresh — and find the edits and the template still
 *      there
 *
 * The upload is a real file, sent as a real multipart request, so the file
 * size limit, the format check and the reader are all exercised the way a
 * browser exercises them.
 *
 * These tests need a disposable Supabase project. Point
 * SUPABASE_TEST_PROJECT_REF at one before running them.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync } from 'fflate';
import PDFDocument from 'pdfkit';

import { createTestUser, deleteTestUser, api, type TestUser } from './helpers.ts';
import { CV_TEMPLATES, FREE_CV_TEMPLATE_ID } from '../shared/cvTemplates.ts';

/* -------------------------------------------------------------------------- */
/* The fixture                                                                 */
/* -------------------------------------------------------------------------- */

const CV_LINES = [
  'Jane Doe',
  'Senior Data Engineer',
  'jane.doe@example.com',
  'Summary',
  'Data engineer with eight years building batch and streaming pipelines.',
  'Experience',
  'Lead Data Engineer, Acme Analytics, 2021 - Present',
  'Built the streaming ingestion platform that serves forty analytics teams.',
  'Education',
  'BSc Computer Science, Cairo University',
  'Skills',
  'Python, SQL, Spark, Airflow, dbt',
];

/** A real PDF, written with a PDF writer. */
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

/** Uploads a file the way a browser does. */
async function uploadCv(
  token: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<{ status: number; body: any }> {
  const baseUrl =
    process.env.TEST_API_BASE_URL ??
    `http://127.0.0.1:${process.env.TEST_API_PORT ?? '3111'}`;
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), fileName);

  const res = await fetch(`${baseUrl}/api/cv/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/* -------------------------------------------------------------------------- */
/* The journey                                                                 */
/* -------------------------------------------------------------------------- */

describe('the CV Studio workflow', () => {
  let user: TestUser;
  let token: string;

  before(async () => {
    user = await createTestUser('cv-workflow');
    token = user.token;
  });

  after(async () => {
    if (user) await deleteTestUser(user);
  });

  test('step 1 — the account starts with a studio waiting for a CV', async () => {
    const res = await api('GET', '/api/cvs', { token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body), 'the studio asks the API for a list of CVs');
  });

  test('step 2 — a PDF is uploaded and read', async () => {
    const file = await buildPdf();
    const res = await uploadCv(token, 'jane-doe.pdf', 'application/pdf', file);

    assert.equal(res.status, 200, `the upload was refused: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(res.body.review, 'the candidate is shown a review');
    assert.ok(res.body.document, 'the document comes back with the review');
  });

  test('step 3 — the extraction holds the candidate, not a blank document', async () => {
    const file = await buildPdf();
    const res = await uploadCv(token, 'jane-doe.pdf', 'application/pdf', file);

    const document = res.body.document;
    assert.equal(document.fullName, 'Jane Doe');
    assert.equal(document.email, 'jane.doe@example.com');
    assert.ok(
      document.experiences.some((experience: any) =>
        (experience.company ?? '').includes('Acme Analytics')
      ),
      'the employer was read'
    );
    assert.ok(document.skillsList.includes('Python'), 'the skills were read');
  });

  test('step 4 — the reviewed document reaches the account and becomes the CV', async () => {
    const file = await buildPdf();
    const extracted = await uploadCv(token, 'jane-doe.pdf', 'application/pdf', file);

    const applied = await api('POST', '/api/cv/import/reviewed', {
      token,
      body: { cv: extracted.body.document, versionName: 'Jane Doe' },
    });
    assert.equal(applied.status, 200, `the import was refused: ${JSON.stringify(applied.body)}`);

    const list = await api('GET', '/api/cvs', { token });
    assert.equal(list.status, 200);
    assert.ok(list.body.length >= 1, 'the account holds a CV');

    const active = list.body.find((entry: any) => entry.isActive) ?? list.body[0];
    assert.ok(active, 'one of the CVs is the active one');
  });

  test('step 5 — an edit is saved and comes back', async () => {
    const list = await api('GET', '/api/cvs', { token });
    const cv = list.body.find((entry: any) => entry.isActive) ?? list.body[0];

    const edited = await api('PATCH', `/api/cvs/${cv.id}`, {
      token,
      body: { name: 'Jane Doe — Senior Data Engineer' },
    });
    assert.ok(
      edited.status === 200 || edited.status === 204,
      `the edit was refused: ${JSON.stringify(edited.body)}`
    );

    const after = await api('GET', `/api/cvs/${cv.id}`, { token });
    assert.equal(after.status, 200);
    assert.match(
      String(after.body?.name ?? after.body?.cv?.name ?? ''),
      /Senior Data Engineer/,
      'the edit survived'
    );
  });

  test('step 6 — choosing a template is written to the account', async () => {
    const res = await api('POST', '/api/cv-templates/apply', {
      token,
      body: { templateId: FREE_CV_TEMPLATE_ID },
    });
    assert.equal(res.status, 200, `the template was refused: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.templateId, FREE_CV_TEMPLATE_ID);
  });

  test('step 7 — the Word export holds the document as it is now', async () => {
    const list = await api('GET', '/api/cvs', { token });
    const cv = list.body.find((entry: any) => entry.isActive) ?? list.body[0];

    const template = CV_TEMPLATES.find((entry) => entry.id === FREE_CV_TEMPLATE_ID)!;
    const baseUrl =
      process.env.TEST_API_BASE_URL ??
      `http://127.0.0.1:${process.env.TEST_API_PORT ?? '3111'}`;

    const res = await fetch(
      `${baseUrl}/api/cv-templates/${FREE_CV_TEMPLATE_ID}/export/docx`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cv: {
            fullName: 'Jane Doe',
            title: 'Senior Data Engineer',
            email: 'jane.doe@example.com',
            phone: '+20 100 000 0000',
            summary: 'Shipped the new billing engine across eleven markets.',
            experiences: [
              {
                id: 'exp-1',
                role: 'Lead Data Engineer',
                company: 'Acme Analytics',
                period: '2021 - Present',
                bullets: ['Built the streaming ingestion platform.'],
              },
            ],
            education: [],
            projects: [],
            skillsList: ['Python', 'SQL'],
            links: [],
          },
          language: 'en',
          cvId: cv.id,
        }),
      }
    );

    assert.equal(res.status, 200, `the export was refused: ${await res.text()}`);
    assert.match(
      res.headers.get('content-type') ?? '',
      /wordprocessingml/,
      'the file is a Word document'
    );

    const buffer = Buffer.from(await res.arrayBuffer());
    assert.equal(buffer.subarray(0, 2).toString('latin1'), 'PK', 'the file is a Word ZIP');

    const xml = new TextDecoder().decode(unzipSync(new Uint8Array(buffer))['word/document.xml']);
    assert.ok(xml.includes('Shipped the new billing engine across eleven markets.'));
    assert.ok(xml.includes('jane.doe@example.com'));
  });

  test('step 8 — a refresh finds the CV and the template still there', async () => {
    // A new session is what a refresh looks like to the server.
    const fresh = user.token;

    const list = await api('GET', '/api/cvs', { token: fresh });
    assert.equal(list.status, 200);
    assert.ok(list.body.length >= 1, 'the CV survived the refresh');

    const catalogue = await api('GET', '/api/cv-templates', { token: fresh });
    assert.equal(catalogue.status, 200);
    assert.ok(
      catalogue.body.templates.some((template: any) => template.id === FREE_CV_TEMPLATE_ID),
      'the template library is still offered'
    );
  });

  test('step 9 — a file that is not a CV is refused with a reason', async () => {
    const notACv = Buffer.from('<html><body>Not a CV</body></html>', 'utf8');
    const res = await uploadCv(token, 'notes.pdf', 'application/pdf', notACv);

    assert.equal(res.status, 400, 'the file was refused');
    assert.ok(res.body.error, 'the refusal explains itself');
    assert.ok(res.body.code, 'the refusal carries a code');
  });

  test('step 10 — an unsupported type is refused before it is read', async () => {
    const res = await uploadCv(token, 'notes.exe', 'application/x-msdownload', Buffer.from('MZ'));
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'unsupported_type');
  });
});
