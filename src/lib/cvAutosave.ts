/**
 * The parts of CV autosave that do not need React.
 *
 * They live here so the two rules that matter can be tested directly:
 *
 *   1. only one write is in flight, so an older request cannot land after a
 *      newer one;
 *   2. the revision that was written is remembered, so the interface never
 *      says "Saved" while a newer edit is still unsaved.
 *
 * The draft functions take the storage object rather than reaching for
 * `window.localStorage`, which keeps them testable and lets the context pass a
 * browser storage that may legally throw (private mode, full quota).
 */

/** How the studio's autosave is doing. */
export type CvSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** A locally kept document that has not reached the server yet. */
export interface CvDraftRecord<TDocument = unknown> {
  userId: string;
  cvId: string;
  document: TDocument;
  revision: number;
  updatedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export const CV_DRAFT_PREFIX = 'careerdev4ai:cv-draft:';
export const CV_SAVED_AT_PREFIX = 'careerdev4ai:cv-saved-at:';
export const CV_AUTOSAVE_DEBOUNCE_MS = 1200;
export const CV_DRAFT_WRITE_DEBOUNCE_MS = 350;

const slot = (cvId: string): string => cvId || 'new';

export function cvDraftKey(userId: string, cvId: string): string {
  return `${CV_DRAFT_PREFIX}${userId}:${slot(cvId)}`;
}

export function cvSavedAtKey(userId: string, cvId: string): string {
  return `${CV_SAVED_AT_PREFIX}${userId}:${slot(cvId)}`;
}

export function readCvDraft<TDocument>(
  storage: StorageLike,
  userId: string,
  cvId: string
): CvDraftRecord<TDocument> | null {
  try {
    const raw = storage.getItem(cvDraftKey(userId, cvId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as CvDraftRecord<TDocument>;
    if (!draft || typeof draft !== 'object') return null;
    if (!draft.document || typeof draft.document !== 'object') return null;
    if (draft.userId !== userId) return null;
    return draft;
  } catch {
    return null;
  }
}

export function writeCvDraft<TDocument>(
  storage: StorageLike,
  draft: CvDraftRecord<TDocument>
): boolean {
  try {
    storage.setItem(cvDraftKey(draft.userId, draft.cvId), JSON.stringify(draft));
    return true;
  } catch {
    // A full quota or a browser that forbids storage must not break editing:
    // the server copy is still written on the next successful save.
    return false;
  }
}

export function clearCvDraft(storage: StorageLike, userId: string, cvId: string): void {
  try {
    storage.removeItem(cvDraftKey(userId, cvId));
    // A document saved for the first time moved from the `new` slot to its
    // real id; neither copy is a draft any more.
    if (cvId) storage.removeItem(cvDraftKey(userId, ''));
  } catch {
    // The draft is a convenience, never the source of truth.
  }
}

export function readCvSavedAt(storage: StorageLike, userId: string, cvId: string): string | null {
  try {
    return storage.getItem(cvSavedAtKey(userId, cvId));
  } catch {
    return null;
  }
}

export function markCvSavedAt(
  storage: StorageLike,
  userId: string,
  cvId: string,
  at: string
): void {
  try {
    storage.setItem(cvSavedAtKey(userId, cvId), at);
  } catch {
    // Same reasoning as the draft: this marker is only used to avoid offering
    // an already-saved draft back to the candidate.
  }
}

export function clearAllCvDrafts(storage: StorageLike): void {
  try {
    const doomed: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && (key.startsWith(CV_DRAFT_PREFIX) || key.startsWith(CV_SAVED_AT_PREFIX))) {
        doomed.push(key);
      }
    }
    doomed.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage can be unavailable; signing out still clears the in-memory copy.
  }
}

export interface CvSaveClaim {
  revision: number;
}

/**
 * Serialises writes and remembers which revision reached the server.
 *
 * A claim is the only way to start a write. If one is already in flight no
 * second claim is handed out, so the server sees the revisions in order even
 * when the candidate types faster than the network answers.
 */
export class CvSaveQueue {
  private revision = 0;
  private saved = 0;
  private inFlight = false;

  /** Counts one edit and returns the revision it produced. */
  markEdited(): number {
    this.revision += 1;
    return this.revision;
  }

  get latestRevision(): number {
    return this.revision;
  }

  get savedRevision(): number {
    return this.saved;
  }

  get isSaving(): boolean {
    return this.inFlight;
  }

  hasUnsavedChanges(): boolean {
    return this.revision > this.saved;
  }

  /** Reserves the queue for the newest revision, or returns null. */
  claim(): CvSaveClaim | null {
    if (this.inFlight || !this.hasUnsavedChanges()) return null;
    this.inFlight = true;
    return { revision: this.revision };
  }

  /** Records a successful write of `revision`. */
  complete(revision: number): void {
    this.inFlight = false;
    this.saved = Math.max(this.saved, revision);
  }

  /** Releases the queue after a failed write; nothing was saved. */
  fail(): void {
    this.inFlight = false;
  }

  reset(): void {
    this.revision = 0;
    this.saved = 0;
    this.inFlight = false;
  }
}
