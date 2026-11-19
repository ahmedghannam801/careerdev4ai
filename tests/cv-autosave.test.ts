/**
 * The rules behind the studio's autosave.
 *
 * These are the two defects that lose a CV: a slow write landing after a fast
 * one and putting older words back, and a "Saved" label while a newer edit is
 * still only on the screen. Both are decided by plain values, so they are
 * tested without a browser.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CvSaveQueue,
  CV_DRAFT_PREFIX,
  CV_SAVED_AT_PREFIX,
  clearAllCvDrafts,
  clearCvDraft,
  cvDraftKey,
  cvSavedAtKey,
  markCvSavedAt,
  readCvDraft,
  readCvSavedAt,
  writeCvDraft,
  type CvDraftRecord,
  type StorageLike,
} from '../src/lib/cvAutosave';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
}

class FullStorage extends MemoryStorage {
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

const draftFor = (overrides: Partial<CvDraftRecord<{ summary: string }>> = {}) => ({
  userId: 'user-1',
  cvId: 'cv-1',
  document: { summary: 'Built analytics dashboards for a retail team.' },
  revision: 4,
  updatedAt: '2026-11-18T10:00:00.000Z',
  ...overrides,
});

describe('CV draft storage', () => {
  it('scopes a draft to the account and the CV', () => {
    assert.equal(cvDraftKey('user-1', 'cv-1'), `${CV_DRAFT_PREFIX}user-1:cv-1`);
    assert.equal(cvDraftKey('user-1', ''), `${CV_DRAFT_PREFIX}user-1:new`);
    assert.equal(cvSavedAtKey('user-1', 'cv-1'), `${CV_SAVED_AT_PREFIX}user-1:cv-1`);
  });

  it('round-trips a draft', () => {
    const storage = new MemoryStorage();
    const draft = draftFor();
    assert.equal(writeCvDraft(storage, draft), true);
    const read = readCvDraft<{ summary: string }>(storage, 'user-1', 'cv-1');
    assert.ok(read);
    assert.equal(read.document.summary, draft.document.summary);
    assert.equal(read.revision, 4);
  });

  it('never returns another account\'s draft even if the key is copied', () => {
    const storage = new MemoryStorage();
    storage.setItem(cvDraftKey('user-2', 'cv-1'), JSON.stringify(draftFor()));
    assert.equal(readCvDraft(storage, 'user-1', 'cv-1'), null);
  });

  it('ignores malformed JSON instead of breaking the studio', () => {
    const storage = new MemoryStorage();
    storage.setItem(cvDraftKey('user-1', 'cv-1'), '{not json');
    assert.equal(readCvDraft(storage, 'user-1', 'cv-1'), null);
  });

  it('reports a storage that refuses the write without throwing', () => {
    const storage = new FullStorage();
    assert.equal(writeCvDraft(storage, draftFor()), false);
    assert.equal(readCvDraft(storage, 'user-1', 'cv-1'), null);
  });

  it('clears the real CV slot and the first-save slot together', () => {
    const storage = new MemoryStorage();
    storage.setItem(cvDraftKey('user-1', ''), JSON.stringify(draftFor({ cvId: '' })));
    storage.setItem(cvDraftKey('user-1', 'cv-1'), JSON.stringify(draftFor()));
    clearCvDraft(storage, 'user-1', 'cv-1');
    assert.equal(storage.getItem(cvDraftKey('user-1', 'cv-1')), null);
    assert.equal(storage.getItem(cvDraftKey('user-1', '')), null);
  });

  it('keeps the saved-at marker and clears only CV keys on sign-out', () => {
    const storage = new MemoryStorage();
    storage.setItem('careerpilot_profile', '{"name":"Ahmed"}');
    storage.setItem(cvDraftKey('user-1', 'cv-1'), JSON.stringify(draftFor()));
    markCvSavedAt(storage, 'user-1', 'cv-1', '2026-11-18T10:05:00.000Z');

    assert.equal(readCvSavedAt(storage, 'user-1', 'cv-1'), '2026-11-18T10:05:00.000Z');

    clearAllCvDrafts(storage);
    assert.equal(storage.getItem(cvDraftKey('user-1', 'cv-1')), null);
    assert.equal(storage.getItem(cvSavedAtKey('user-1', 'cv-1')), null);
    assert.equal(storage.getItem('careerpilot_profile'), '{"name":"Ahmed"}');
  });
});

describe('CV save queue', () => {
  it('does not hand out a claim without an edit', () => {
    const queue = new CvSaveQueue();
    assert.equal(queue.hasUnsavedChanges(), false);
    assert.equal(queue.claim(), null);
    assert.equal(queue.isSaving, false);
  });

  it('allows exactly one write in flight, for the newest revision', () => {
    const queue = new CvSaveQueue();
    queue.markEdited();
    queue.markEdited();
    queue.markEdited();

    const first = queue.claim();
    assert.deepEqual(first, { revision: 3 });
    assert.equal(queue.isSaving, true);
    // A second flush while the first is on its way must not start a competing
    // request; the first one is carrying the newest document anyway.
    assert.equal(queue.claim(), null);

    queue.complete(3);
    assert.equal(queue.isSaving, false);
    assert.equal(queue.hasUnsavedChanges(), false);
  });

  it('keeps a newer edit unsaved when an older write completes', () => {
    const queue = new CvSaveQueue();
    queue.markEdited();
    const claim = queue.claim();
    assert.deepEqual(claim, { revision: 1 });

    // The candidate types while revision 1 is in flight.
    queue.markEdited();
    queue.complete(1);

    assert.equal(queue.savedRevision, 1);
    assert.equal(queue.latestRevision, 2);
    assert.equal(queue.hasUnsavedChanges(), true);

    const next = queue.claim();
    assert.deepEqual(next, { revision: 2 });
  });

  it('releases the queue after a failure and keeps the edits unsaved', () => {
    const queue = new CvSaveQueue();
    queue.markEdited();
    queue.claim();
    queue.fail();

    assert.equal(queue.isSaving, false);
    assert.equal(queue.hasUnsavedChanges(), true);
    assert.deepEqual(queue.claim(), { revision: 1 });
  });

  it('does not move the saved revision backwards', () => {
    const queue = new CvSaveQueue();
    queue.markEdited();
    queue.markEdited();
    const claim = queue.claim();
    queue.complete(claim!.revision);
    queue.complete(1);
    assert.equal(queue.savedRevision, 2);
  });

  it('forgets everything on sign-out', () => {
    const queue = new CvSaveQueue();
    queue.markEdited();
    queue.claim();
    queue.reset();
    assert.equal(queue.latestRevision, 0);
    assert.equal(queue.savedRevision, 0);
    assert.equal(queue.isSaving, false);
    assert.equal(queue.claim(), null);
  });
});
