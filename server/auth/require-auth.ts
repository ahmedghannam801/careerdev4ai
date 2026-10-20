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
