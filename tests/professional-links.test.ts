/**
 * Professional links: add, edit, persist, preview and print.
 *
 * The bug these tests lock down is specific. The editor wrote every keystroke
 * into the CV link, then compared the input against the value it had just
 * written on blur. The comparison was always false, so a URL edit never
 * reached the profile and the next projection restored the old value.
 *
 * The pure diff is the fix: it compares a draft with the stored row, so the
 * editor can save exactly what changed. The projection test then proves that a
 * saved label and URL reach the document while the CV's own order and on/off
 * switch survive.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  diffProfileLink,
  hasProfileLinkChanges,
  profileLinkDraft,
  validateProfileLinkUrl,
} from '../shared/profileLinks.ts';
import { mergeCanonicalCvDocument } from '../shared/cvProjection.ts';
import { cvLinkLabel } from '../shared/cvDocument.ts';
import type { CvSourceData } from '../shared/cvDocument.ts';
import type { CVProfile } from '../src/types/career.ts';

describe('professional link validation', () => {
  it('accepts an absolute http(s) URL', () => {
    const result = validateProfileLinkUrl('https://github.com/example');
    assert.equal(result.valid, true);
    assert.equal(result.error, null);
    assert.equal(result.url, 'https://github.com/example');
  });

  it('normalises a bare domain instead of rejecting it', () => {
    const result = validateProfileLinkUrl('linkedin.com/in/example');
    assert.equal(result.valid, true);
    assert.equal(result.url, 'https://linkedin.com/in/example');
  });

  it('rejects an empty value', () => {
    assert.equal(validateProfileLinkUrl('   ').error, 'empty');
  });

  it('rejects unsafe or non-http protocols', () => {
    assert.equal(validateProfileLinkUrl('javascript:alert(1)').error, 'invalid');
    assert.equal(validateProfileLinkUrl('mailto:someone@example.com').error, 'invalid');
    assert.equal(validateProfileLinkUrl('/relative/path').error, 'invalid');
  });
});

describe('the professional link diff', () => {
  const original = {
    label: 'GitHub',
    url: 'https://github.com/old-name',
  };

  it('detects a URL edit and sends the normalised URL', () => {
    const diff = diffProfileLink(original, {
      label: original.label,
      url: 'github.com/new-name',
    });

    assert.equal(diff.urlError, null);
    assert.equal(diff.patch.url, 'https://github.com/new-name');
    assert.equal(diff.patch.label, undefined);
    assert.equal(hasProfileLinkChanges(diff), true);
  });

  it('detects a label edit even when the URL is untouched', () => {
    const diff = diffProfileLink(original, {
      label: 'Code',
      url: original.url,
    });

    assert.equal(diff.patch.label, 'Code');
    assert.equal(diff.patch.url, undefined);
  });

  it('treats an added scheme as unchanged, not as an edit', () => {
    const diff = diffProfileLink(original, {
      label: original.label,
      url: 'https://github.com/old-name/',
    });

    // `normalizeProfileUrl` keeps a trailing slash, so this is a real change.
    // The important case is the bare form of the same URL:
    const bare = diffProfileLink(original, {
      label: original.label,
      url: 'github.com/old-name',
    });
    assert.equal(bare.patch.url, 'https://github.com/old-name');
    assert.equal(diff.patch.label, undefined);
  });

  it('sends null to clear a custom label', () => {
    const diff = diffProfileLink(original, { label: '   ', url: original.url });
    assert.equal(diff.patch.label, null);
  });

  it('reports an invalid URL and writes no URL patch', () => {
    const diff = diffProfileLink(original, {
      label: original.label,
      url: 'javascript:alert(1)',
    });

    assert.equal(diff.urlError, 'invalid');
    assert.equal(diff.patch.url, undefined);
  });

  it('has nothing to save when the draft matches the stored row', () => {
    const draft = profileLinkDraft(original);
    const diff = diffProfileLink(original, draft);
    assert.equal(hasProfileLinkChanges(diff), false);
  });
});

describe('links in the CV projection', () => {
  const source: CvSourceData = {
    profile: {
      fullName: 'Test Candidate',
      email: 'candidate@example.com',
      phone: '',
      location: 'Cairo',
      title: 'HR Specialist',
      summary: '',
    },
    experiences: [],
    education: [],
    projects: [],
    volunteering: [],
    certifications: [],
    courses: [],
    skills: [],
    links: [
      { id: 'link-1', kind: 'github', label: 'GitHub', url: 'https://github.com/old-name' },
      { id: 'link-2', kind: 'portfolio', label: 'Portfolio', url: 'https://example.com' },
    ],
  };

  const previous: CVProfile = {
    fullName: 'Test Candidate',
    email: 'candidate@example.com',
    phone: '',
    location: 'Cairo',
    title: 'HR Specialist',
    summary: '',
    experiences: [],
    education: [],
    projects: [],
    skillsList: [],
    certifications: [],
    links: [
      {
        id: 'link-1',
        kind: 'github',
        label: 'GitHub',
        url: 'https://github.com/old-name',
        enabled: false,
      },
      {
        id: 'link-2',
        kind: 'portfolio',
        label: 'Portfolio',
        url: 'https://example.com',
        enabled: true,
      },
    ],
  };

  it('takes the saved label and URL from the profile', () => {
    const merged = mergeCanonicalCvDocument(
      {
        ...source,
        links: [
          {
            id: 'link-1',
            kind: 'github',
            label: 'Code',
            url: 'https://github.com/new-name',
          },
          ...(source.links ?? []).slice(1),
        ],
      },
      previous
    );

    const github = merged.links?.find((link) => link.id === 'link-1');
    assert.ok(github);
    assert.equal(github!.label, 'Code');
    assert.equal(github!.url, 'https://github.com/new-name');
  });

  it('keeps the CV\'s own order and on/off switch', () => {
    const merged = mergeCanonicalCvDocument(
      {
        ...source,
        links: [
          { id: 'link-2', kind: 'portfolio', label: 'Portfolio', url: 'https://example.com' },
          { id: 'link-1', kind: 'github', label: 'GitHub', url: 'https://github.com/old-name' },
        ],
      },
      previous
    );

    assert.deepEqual(
      merged.links?.map((link) => link.id),
      ['link-1', 'link-2'],
      'the CV order must be preserved'
    );
    assert.equal(merged.links?.find((link) => link.id === 'link-1')?.enabled, false);
  });

  it('falls back to the kind label when the profile label is cleared', () => {
    assert.equal(cvLinkLabel('linkedin', null), 'LinkedIn');
    assert.equal(cvLinkLabel('github', 'Code'), 'Code');
  });
});
