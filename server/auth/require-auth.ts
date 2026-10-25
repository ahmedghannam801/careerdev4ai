import type { Request, Response, NextFunction } from 'express';
import { verifySupabaseToken } from './supabase-auth';

export interface AuthedRequest extends Request {
  authUser?: { id: string; email?: string };
}

/**
 * Express middleware that requires a valid Supabase Auth access token.
 *
 * The verified Supabase user id is the ONLY identity source. A client-supplied
 * user id in the body, query, or route params is never used for authorization.
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
    return next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
