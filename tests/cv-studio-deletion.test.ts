/** Regression coverage for CV Studio deletions and the main navigation. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeCanonicalCvDocument } from '../shared/cvProjection.ts';
import type { CVProfile } from '../src/types/career.ts';

const root = process.cwd();
const sourceFile = (path: string) => readFileSync(join(root, path), 'utf8');

const emptyCv: CVProfile = {
  fullName: 'Candidate', email: '', phone: '', location: '', title: '', summary: '',
  experiences: [], education: [], projects: [], skillsList: [], certifications: [],
};

describe('CV Studio deletion regression', () => {
  it('omits a deleted canonical item from the projected document and preview input', () => {
    const job = {
      id: '11111111-1111-4111-8111-111111111111',
      role: 'Engineer', company: 'Example', startDate: '2022-01-01',
      endDate: '2023-01-01', isCurrent: false, description: 'Built systems',
    };
    const source = {
      profile: { fullName: 'Candidate', email: 'candidate@example.test', summary: 'Profile summary' },
      experiences: [job], education: [], projects: [], volunteering: [],
      certifications: [], courses: [], skills: [], links: [],
    };
    const before = mergeCanonicalCvDocument(source, emptyCv);
    assert.equal(before.experiences.length, 1);

    const deleted = {
      ...before,
      experiences: before.experiences.filter((entry) => entry.id !== job.id),
      hiddenRecordIds: [job.id],
      hiddenContactFields: ['email'],
      hiddenSummary: true,
      summary: '',
    };
    const afterRefreshProjection = mergeCanonicalCvDocument(source, deleted);
    assert.deepEqual(afterRefreshProjection.experiences, []);
    assert.deepEqual(afterRefreshProjection.experiences, deleted.experiences);
    assert.equal(afterRefreshProjection.email, '');
    assert.equal(afterRefreshProjection.summary, '');

    const editor = sourceFile('src/components/cv/CvSectionEditor.tsx');
    const preview = sourceFile('src/components/views/CVStudioView.tsx');
    assert.match(editor, /hideRecord\(exp\.id, \{ experiences:/);
    assert.match(preview, /<CvPreview[\s\S]*?cv=\{activeCV\}/);
  });

  it('does not expose a standalone Certifications destination while preserving its old profile alias', () => {
    const shell = sourceFile('src/components/layout/AppShell.tsx');
    const routing = sourceFile('src/lib/routing.ts');
    const app = sourceFile('src/App.tsx');
    assert.doesNotMatch(shell, /id:\s*'profile-certifications'/);
    assert.match(routing, /'profile-certifications':\s*\{ route: 'profile', params: \{ section: 'certifications' \} \}/);
    assert.match(app, /getElementById\('profile-certifications'\).*scrollIntoView/);
  });
});
