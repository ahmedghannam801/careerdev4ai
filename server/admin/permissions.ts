/**
 * Server-side admin authorization.
 *
 * `requireAuth` establishes who the caller is. This middleware then loads the
 * caller's admin row and checks the role's permission set. The client never
 * sends a role or a permission, and hiding a button in the UI is never the
 * boundary: every administrative route passes through here.
 */

import type { Response, NextFunction } from 'express';
import type { AuthedRequest } from '../auth/require-auth.ts';
import { getAdminByProfileId, touchAdmin, type AdminDTO } from '../db/admin.ts';
import type { AdminPermission } from '../../shared/admin.ts';

export interface AdminRequest extends AuthedRequest {
  admin?: AdminDTO;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminDTO;
    }
  }
}

/**
 * Loads the caller's admin row. A disabled administrator is authenticated but
 * not authorized: the response is deliberately the same 403 as a missing role
 * so the endpoint does not disclose the roster.
 */
export async function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
) {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const admin = await getAdminByProfileId(req.authUser.id);
    if (!admin || admin.status !== 'active') {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    req.admin = admin;
    void touchAdmin(admin.id);
    return next();
  } catch (error) {
    console.error('Failed to load administrator:', error);
    return res.status(500).json({ error: 'Failed to verify administrator access' });
  }
}

/** Requires one permission from the effective set loaded by `requireAdmin`. */
export function requirePermission(permission: AdminPermission) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    const permissions = req.admin?.permissions ?? [];
    if (!permissions.includes(permission)) {
      return res.status(403).json({
        error: `This action requires the ${permission} permission`,
      });
    }
    return next();
  };
}

/** Requires at least one of the listed permissions (for shared read screens). */
export function requireAnyPermission(permissions: AdminPermission[]) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    const granted = req.admin?.permissions ?? [];
    if (!permissions.some((permission) => granted.includes(permission))) {
      return res.status(403).json({ error: 'Administrator access required' });
    }
    return next();
  };
}
