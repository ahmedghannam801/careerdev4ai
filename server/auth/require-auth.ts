import type { Request, Response, NextFunction } from 'express';
import { verifySupabaseToken } from './supabase-auth';
import { hasCurrentConsent, resolveConsentState } from '../db/consents';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../shared/legal.ts';
import { hasServerTermsApproval } from '../legal.ts';

export interface AuthedRequest extends Request {
  authUser?: { id: string; email?: string };
}

/**
 * The only authenticated routes reachable without a current consent.
 *
 * The consent screen itself has to be callable to discover what is missing,
 * and a user who declines must still be able to delete their account. Nothing
 * else is exempt: a protected route cannot be reached by guessing its path,
 * because the check lives in the middleware every protected route shares.
 */
const CONSENT_EXEMPT_PATHS = new Set(['/api/consent', '/api/account/delete']);

/**
 * Express middleware that requires a valid Supabase Auth session, without the
 * legal acceptance.
 *
 * The measured CV analysis is the one feature that is exempt from the legal
 * gate, and it is exempt for a reason: the measurement is counted on the
 * platform from the candidate's own document. No model is called, nothing is
 * sent to a third party, and the answer reads only the caller's own record.
 * The terms and the privacy policy govern what the platform does with a
 * candidate's data *on their behalf* — a local measurement does none of that,
 * so a candidate who has not accepted them yet can still see how their own CV
 * measures.
 *
 * The session is still required: an anonymous caller never gets in. Only the
 * legal acceptance is skipped, and only for the two routes that use this.
 */
export async function requireSession(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  // Authenticated payloads are private and change as the user works.
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await verifySupabaseToken(req.headers.authorization);
    if (result.status !== 'valid') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.authUser = { id: result.userId, email: result.email };

    // The service as a whole stays closed while the approved legal text is
    // missing, exactly as it is for every other route.
    if (!hasServerTermsApproval()) {
      return res.status(503).json({
        error: 'Approved Terms content is not available. The service is not open for production use.',
        code: 'LEGAL_CONTENT_UNAVAILABLE',
      });
    }

    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

/**
 * Express middleware that requires a valid Supabase Auth access token and a
 * current acceptance of the Terms & Conditions and Privacy Policy.
 *
 * The verified Supabase user id is the ONLY identity source. A client-supplied
 * user id in the body, query, or route params is never used for authorization.
 *
 * Consent is enforced here rather than in the browser for two reasons: a
 * client-side gate is only a suggestion, and every protected route already
 * goes through this function. A caller without a current acceptance receives
 * `403 CONSENT_REQUIRED` with the versions that must be accepted, which the
 * client uses to show the dedicated consent screen.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  // Authenticated payloads are private and change as the user works. Without
  // an explicit directive a browser may reuse a heuristically cached response
  // and show a stale list (for example, a CV version created after the cache
  // entry was written) even though the database already has the new row.
  res.setHeader('Cache-Control', 'no-store');
  try {
    const result = await verifySupabaseToken(req.headers.authorization);
    if (result.status !== 'valid') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.authUser = { id: result.userId, email: result.email };

    if (!CONSENT_EXEMPT_PATHS.has(req.path)) {
      if (!hasServerTermsApproval()) {
        return res.status(503).json({
          error: 'Approved Terms content is not available. The service is not open for production use.',
          code: 'LEGAL_CONTENT_UNAVAILABLE',
        });
      }

      // `hasCurrentConsent` is cached briefly and answers the common case.
      // When it answers no, the full resolver also honours an acceptance that
      // was carried in the user's metadata by a registration that required
      // email confirmation.
      const accepted = (await hasCurrentConsent(result.userId))
        ? true
        : (await resolveConsentState(result.userId)).accepted;

      if (!accepted) {
        return res.status(403).json({
          error: 'Consent required',
          code: 'CONSENT_REQUIRED',
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
        });
      }
    }

    return next();
  } catch {
    // A failure while checking consent must not be reported as "Unauthorized":
    // the session was valid and the user needs to know the check itself failed.
    if (req.authUser) {
      return res.status(503).json({
        error: 'Could not verify your consent status. Please try again.',
        code: 'CONSENT_CHECK_FAILED',
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
