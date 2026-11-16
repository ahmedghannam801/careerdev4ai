/**
 * The signal that a request may have changed the token balance.
 *
 * The API client is the one place every request passes through, so it is the
 * one place that can notice a credit-consuming call without every feature
 * remembering to tell the balance store. It does not refetch anything itself:
 * it raises an event, and the credit store decides what to do with it. Keeping
 * the two apart is what stops `apiClient` from importing the store (and the
 * store from importing the client) in a cycle.
 *
 * A request is announced in two cases:
 *
 *   1. It succeeded, so it may have spent a token. The store re-reads the
 *      authoritative balance from the server rather than guessing a new one.
 *   2. It was refused with `INSUFFICIENT_CREDITS`, so the client's idea of the
 *      balance is known to be wrong and must be corrected even though nothing
 *      was spent.
 *
 * Free AI operations are deliberately absent: they cost nothing, so refetching
 * after them would only add traffic.
 */

export type CreditActivityReason =
  | 'ai-operation'
  | 'template-unlock'
  | 'daily-claim'
  | 'manual-refresh'
  | 'realtime'
  | 'focus'
  | 'poll'
  | 'cross-tab';

export interface CreditActivityDetail {
  reason: CreditActivityReason;
  path?: string;
}

type Listener = (detail: CreditActivityDetail) => void;

const listeners = new Set<Listener>();

/** Subscribes to credit activity. Returns the unsubscribe function. */
export function onCreditActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Announces that the balance may have moved.
 *
 * A listener that throws must not break the request that raised the event, so
 * every listener is isolated.
 */
export function emitCreditActivity(detail: CreditActivityDetail): void {
  for (const listener of [...listeners]) {
    try {
      listener(detail);
    } catch (error) {
      console.warn('A credit activity listener failed:', error);
    }
  }
}

/**
 * The paths that spend a token.
 *
 * They mirror the server's `requireCredits(...)` routes. The list is grouped
 * by the action it charges for, so adding a paid route means adding one line
 * here as well as the middleware on the server.
 */
const CREDIT_CONSUMING_PATHS: readonly string[] = [
  '/api/optimize-cv',
  '/api/cv/job-description/generate',
  '/api/projects/recommendations',
  '/api/projects/analyze',
];

/** `/api/cv-templates/<id>/unlock` is the premium-template purchase. */
const TEMPLATE_UNLOCK = /^\/api\/cv-templates\/[^/]+\/unlock$/;

/** The path of a request, without the query string or a trailing slash. */
export function normalizeRequestPath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? path;
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function creditActivityForPath(path: string): CreditActivityReason | null {
  const normalized = normalizeRequestPath(path);
  if (TEMPLATE_UNLOCK.test(normalized)) return 'template-unlock';
  if (CREDIT_CONSUMING_PATHS.includes(normalized)) return 'ai-operation';
  return null;
}
