import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { generateCvFixtures } from './fixtures/generate-cv-fixtures.mjs';
import { api, createTestUser, deleteTestUser, type TestUser } from './helpers.ts';

const FIXTURE_DIR = resolve(import.meta.dirname, '.tmp-job-description-upload');
const API_BASE = process.env.TEST_API_BASE_URL ?? 'http://127.0.0.1:3111';

async function uploadJobDescription(token: string | undefined, name: string, type: string, bytes: Uint8Array) {
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(bytes).buffer], { type }), name);
  const response = await fetch(`${API_BASE}/api/job-descriptions/extract`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  let body: any = null;
  try { body = await response.json(); } catch { /* non-JSON error */ }
  return { status: response.status, body };
}

let owner: TestUser;
let other: TestUser;
let packageId: string;

before(async () => {
  await generateCvFixtures(FIXTURE_DIR);
  owner = await createTestUser('application-package-owner');
  other = await createTestUser('application-package-other');
});

after(async () => {
  await deleteTestUser(owner);
  await deleteTestUser(other);
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

const payload = {
  jobTitle: 'Frontend Engineer',
  company: 'Example Co',
  jobDescription: 'We are looking for a frontend engineer with React experience.',
  analysis: { jobTitle: 'Frontend Engineer', requiredSkills: ['React'] },
  matchAnalysis: { matched: [], missing: ['React'] },
  matchScore: 0,
  language: 'en',
};

describe('job description file extraction', () => {
  test('extracts readable TXT, PDF and DOCX files', async () => {
    const text = 'We are looking for a product designer with user research and prototyping skills.';
    const textResult = await uploadJobDescription(owner.token, 'role.txt', 'text/plain', new TextEncoder().encode(text));
    assert.equal(textResult.status, 200);
    assert.equal(textResult.body.text, text);

    const pdf = readFileSync(join(FIXTURE_DIR, 'modern-two-column.pdf'));
    const pdfResult = await uploadJobDescription(owner.token, 'role.pdf', 'application/pdf', new Uint8Array(pdf));
    assert.equal(pdfResult.status, 200);
    assert.match(pdfResult.body.text, /SARA HASSAN/);

    const docx = readFileSync(join(FIXTURE_DIR, 'modern-two-column.docx'));
    const docxResult = await uploadJobDescription(
      owner.token,
      'role.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      new Uint8Array(docx)
    );
    assert.equal(docxResult.status, 200);
    assert.match(docxResult.body.text, /SARA HASSAN/);
  });

  test('rejects mismatched types, oversized files and unauthenticated uploads', async () => {
    const mismatch = await uploadJobDescription(owner.token, 'role.txt', 'application/pdf', new TextEncoder().encode('A sufficiently long job ad description.'));
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.code, 'UNSUPPORTED_FILE_TYPE');

    const tooLarge = await uploadJobDescription(
      owner.token,
      'large.txt',
      'text/plain',
      new Uint8Array(5 * 1024 * 1024 + 1)
    );
    assert.equal(tooLarge.status, 413);
    assert.equal(tooLarge.body.code, 'FILE_TOO_LARGE');

    const unauthenticated = await uploadJobDescription(undefined, 'role.txt', 'text/plain', new TextEncoder().encode('This should not be read as an authenticated upload.'));
    assert.equal(unauthenticated.status, 401);
  });
});

describe('saved application packages', () => {
  test('creates and lists an application package under the authenticated profile', async () => {
    const created = await api('POST', '/api/application-packages', {
      token: owner.token,
      body: { ...payload, profileId: other.id },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.package.profileId, owner.id);
    assert.equal(created.body.package.company, payload.company);
    packageId = created.body.package.id;

    const listed = await api('GET', '/api/application-packages', { token: owner.token });
    assert.equal(listed.status, 200);
    assert.ok(listed.body.packages.some((item: { id: string }) => item.id === packageId));
  });

  test('updates remain owner-scoped', async () => {
    const forbidden = await api('PATCH', `/api/application-packages/${packageId}`, {
      token: other.token,
      body: { company: 'Wrong owner' },
    });
    assert.equal(forbidden.status, 404);

    const updated = await api('PATCH', `/api/application-packages/${packageId}`, {
      token: owner.token,
      body: { company: 'Updated Co' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.package.company, 'Updated Co');
  });

  test('rejects an invalid score or too-short job description', async () => {
    const short = await api('POST', '/api/application-packages', {
      token: owner.token,
      body: { ...payload, jobDescription: 'short' },
    });
    assert.equal(short.status, 400);
    const badScore = await api('POST', '/api/application-packages', {
      token: owner.token,
      body: { ...payload, matchScore: 101 },
    });
    assert.equal(badScore.status, 400);
  });
});
