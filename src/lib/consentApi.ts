/**
 * The client's view of the legal consent state.
 *
 * The server owns the contract: it decides which versions are current, it
 * records the acceptance, and it refuses every protected route until a current
 * acceptance exists. This module is only the transport.
 *
 * Two rules shape it:
 *
 *   - The client never names a version. It says "I accept" and the server
 *     records the versions that are current at that moment. A client that
 *     could name its own version could also name a version it has not read.
 *
 *   - `/api/consent` is the one route that answers for a user who has not
 *     accepted yet, so this module can always be called — including by the
 *     screen that asks for the acceptance in the first place.
 */

import { apiRequest } from './apiClient';
import {
  PRIVACY_PATH,
  TERMS_PATH,
  emptyConsentState,
  type ConsentSource,
  type ConsentState,
} from '../../shared/legal';

interface ConsentResponse {
  success: boolean;
  consent: ConsentState;
}

/**
 * Reads the current consent state.
 *
 * A failure is not turned into an empty state that looks like an answer: the
 * caller has to be able to tell "the user has not accepted" from "the check
 * itself failed", because only the first one may be answered with a prompt.
 */
export async function fetchConsentState(): Promise<ConsentState> {
  const response = await apiRequest<ConsentResponse>('/api/consent');
  return response.consent ?? emptyConsentState();
}

/**
 * Records an acceptance of the versions that are current right now.
 *
 * The versions are sent back deliberately. The client reads them from
 * `GET /api/consent`, shows the person the text at those versions, and echoes
 * them here. The server compares them with the versions it currently
 * publishes and refuses the acceptance if either has changed in between —
 * which is what makes the record proof that the person was shown the text
 * that is now in force, rather than merely some text.
 */
export async function acceptConsent(
  versions: { termsVersion: string; privacyVersion: string },
  source: ConsentSource = 'reconsent'
): Promise<ConsentState> {
  const response = await apiRequest<ConsentResponse>('/api/consent', {
    method: 'POST',
    body: JSON.stringify({
      accepted: true,
      termsVersion: versions.termsVersion,
      privacyVersion: versions.privacyVersion,
      source,
    }),
  });
  return response.consent ?? emptyConsentState();
}

/** The public paths the consent screen links to. */
export const CONSENT_PATHS = {
  terms: TERMS_PATH,
  privacy: PRIVACY_PATH,
} as const;
