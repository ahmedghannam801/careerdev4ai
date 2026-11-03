import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasServerTermsApproval } from '../server/legal.ts';
import { resolvePublicPage } from '../server/seo/publicPages.ts';
import {
  emptyConsentState,
  hasApprovedTerms,
  isCurrentConsent,
  PRIVACY_PATH,
  PRIVACY_VERSION,
  TERMS_DOCUMENT,
  TERMS_PATH,
  TERMS_VERSION,
} from '../shared/legal.ts';

describe('consent contract', () => {
  it('publishes explicit document paths and version identifiers', () => {
    assert.equal(TERMS_PATH, '/terms');
    assert.equal(PRIVACY_PATH, '/privacy');
    assert.ok(TERMS_VERSION.length > 0);
    assert.ok(PRIVACY_VERSION.length > 0);
  });

  it('starts with no accepted record', () => {
    const state = emptyConsentState();
    assert.equal(state.accepted, false);
    assert.equal(state.current, null);
    assert.equal(state.termsVersion, TERMS_VERSION);
    assert.equal(state.privacyVersion, PRIVACY_VERSION);
  });

  it('requires accepted status and both current document versions', () => {
    const current = {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      status: 'accepted' as const,
    };
    assert.equal(isCurrentConsent(current), true);
    assert.equal(isCurrentConsent({ ...current, termsVersion: 'older' }), false);
    assert.equal(isCurrentConsent({ ...current, privacyVersion: 'older' }), false);
    assert.equal(isCurrentConsent({ ...current, status: 'withdrawn' }), false);
    assert.equal(isCurrentConsent(null), false);
  });

  it('keeps the approval switch and the document content in step', () => {
    // The version identifier on its own never approves anything: the document
    // has to be both switched on and populated.
    const previousApproved = TERMS_DOCUMENT.approved;
    const previousSections = TERMS_DOCUMENT.sections;
    try {
      TERMS_DOCUMENT.approved = false;
      assert.equal(hasApprovedTerms(), false);
      assert.equal(emptyConsentState().termsAvailable, false);

      TERMS_DOCUMENT.approved = true;
      TERMS_DOCUMENT.sections = [];
      assert.equal(hasApprovedTerms(), false, 'an empty document is not an approved document');

      TERMS_DOCUMENT.sections = [{ heading: 'Heading', body: '   ' }];
      assert.equal(hasApprovedTerms(), false, 'a section without content is not an approved document');
    } finally {
      TERMS_DOCUMENT.approved = previousApproved;
      TERMS_DOCUMENT.sections = previousSections;
    }

    assert.equal(hasApprovedTerms(), true, 'the operator supplied and approved the document');
    assert.equal(emptyConsentState().termsAvailable, true);
  });

  it('does not let the test fixture open the gate on its own', () => {
    const previousFixture = process.env.CAREERDEV_TEST_TERMS_FIXTURE;
    const previousMarker = process.env.CAREERDEV_TEST_SERVER;
    try {
      delete process.env.CAREERDEV_TEST_TERMS_FIXTURE;
      delete process.env.CAREERDEV_TEST_SERVER;
      // The approved document alone already opens the gate.
      assert.equal(hasServerTermsApproval(), true);
    } finally {
      if (previousFixture === undefined) delete process.env.CAREERDEV_TEST_TERMS_FIXTURE;
      else process.env.CAREERDEV_TEST_TERMS_FIXTURE = previousFixture;
      if (previousMarker === undefined) delete process.env.CAREERDEV_TEST_SERVER;
      else process.env.CAREERDEV_TEST_SERVER = previousMarker;
    }
  });

  it('publishes the approved document at the public path', async () => {
    const page = await resolvePublicPage('/terms');
    assert.ok(page);
    assert.equal(page.status, 200);
    assert.match(page.html, /Terms &amp; Conditions/);
    assert.match(page.html, /Acceptance of Terms/);
    assert.match(page.html, /Governing Law/);
    // A published document must be indexable.
    assert.doesNotMatch(page.html, /noindex, nofollow/);
    // The unpublished shell is gone.
    assert.doesNotMatch(page.html, /have not been published/);
  });

  it('escapes the operator-supplied document when it renders', async () => {
    // The operator's own content is not invented here: this is a fixture that
    // proves the rendering path escapes, and that a replaced document is
    // published as it stands.
    const previousApproved = TERMS_DOCUMENT.approved;
    const previousSections = TERMS_DOCUMENT.sections;
    try {
      TERMS_DOCUMENT.approved = true;
      TERMS_DOCUMENT.sections = [
        { heading: 'Fixture heading <script>', body: 'Fixture body & more' },
        { heading: 'Second heading', body: 'Second body' },
      ];

      assert.equal(hasApprovedTerms(), true);
      assert.equal(emptyConsentState().termsAvailable, true);

      const page = await resolvePublicPage('/terms');
      assert.ok(page);
      assert.equal(page.status, 200);
      assert.match(page.html, /Fixture heading &lt;script&gt;/);
      assert.match(page.html, /Fixture body &amp; more/);
      assert.doesNotMatch(page.html, /<script>/);
      assert.doesNotMatch(page.html, /noindex, nofollow/);
    } finally {
      TERMS_DOCUMENT.approved = previousApproved;
      TERMS_DOCUMENT.sections = previousSections;
    }

    assert.equal(hasApprovedTerms(), true);
  });
});
