/**
 * The hand-off from a live vacancy to the CV Studio.
 *
 * When a candidate reads a posting and presses "Create Tailored CV", the
 * studio should open on that posting — the description already in the box,
 * the employer already named — instead of asking for all of it again.
 *
 * The vacancy description is long and is not something that belongs in an
 * address bar, so it is staged here instead. The application is a single
 * document that changes its view without reloading, so a staged request
 * survives the trip from the jobs page to the studio.
 *
 * The request is taken, not peeked at: once the studio has read it, it is
 * gone. A candidate who opens the studio later is not handed a posting they
 * did not ask for, and the studio does not have to guess whether the request
 * is still fresh.
 */

/** A vacancy that is being turned into a tailored CV. */
export interface TailoredCvRequest {
  /** The provider's identifier for the vacancy. */
  jobId: string;
  /** The role the posting is for. */
  title: string;
  /** The employer the posting is from. */
  company: string;
  /** The posting's own description, used to tailor the CV. */
  description: string;
  /** Where the role is based, when the posting says. */
  location?: string | null;
  /** The employer's own page for the vacancy. */
  applyUrl?: string | null;
  /** The original posting, when it differs from the application page. */
  url?: string | null;
  /** When the request was staged. */
  requestedAt: number;
}

/**
 * A staged request waits for a short while only.
 *
 * A candidate may press the button, change their mind and come back an hour
 * later. The posting may have been closed by then. An hour is long enough for
 * the trip across the application and short enough that the studio never
 * opens on a posting that is no longer relevant.
 */
const REQUEST_TTL_MS = 60 * 60 * 1000;

let staged: TailoredCvRequest | null = null;

/** Stages a vacancy for the studio to pick up. */
export function stageTailoredCv(request: Omit<TailoredCvRequest, 'requestedAt'>): void {
  staged = { ...request, requestedAt: Date.now() };
}

/**
 * Reads the staged request without taking it.
 *
 * The studio uses this to decide whether to show the "we have brought this
 * posting across" notice, and the take below to fill the panel.
 */
export function peekTailoredCv(): TailoredCvRequest | null {
  if (!staged) return null;
  if (Date.now() - staged.requestedAt > REQUEST_TTL_MS) {
    staged = null;
    return null;
  }
  return staged;
}

/**
 * Reads the staged request and clears it.
 *
 * Returns `null` when there is nothing staged, when what is staged has gone
 * stale, or when it has already been taken.
 */
export function takeTailoredCv(): TailoredCvRequest | null {
  const request = peekTailoredCv();
  staged = null;
  return request;
}

/** Discards a staged request without taking it. */
export function clearTailoredCv(): void {
  staged = null;
}
