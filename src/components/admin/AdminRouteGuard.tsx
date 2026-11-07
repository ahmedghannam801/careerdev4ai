/**
 * The guard on the administrative route.
 *
 * The Admin Center is the one part of the application that is not for
 * everybody, so it is not mounted for somebody who is not an administrator.
 * The guard asks the server who the caller is — `GET /api/admin/me`, which the
 * server answers from the verified token — and only then lets the Admin
 * Center exist.
 *
 * There are three states, and they are told apart honestly:
 *
 *   checking     the answer has not arrived yet. Nothing is shown and nothing
 *                is refused; the interface waits.
 *   authorised   the server says the caller is an administrator, so the Admin
 *                Center is mounted.
 *   refused      the server says the caller is not an administrator (or the
 *                account is disabled). The Admin Center is never mounted.
 *
 * Nothing is decided in the browser: there is no role in local storage, no
 * role in the URL and no role in the state of the page. The answer comes from
 * the same request the Admin Center itself would make.
 */

import React from 'react';
import { Loader2, Shield } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useAdminAccess } from '../../lib/useAdminAccess';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

/**
 * The page a caller who is not an administrator is shown.
 *
 * It is shared with the Admin Center, so a caller who reaches the page by a
 * link and a caller who is refused by the route guard see the same answer.
 */
export const AdminAccessDenied: React.FC = () => {
  const { t } = useCareer();
  return (
    <div className={`${CARD} p-10 text-center`}>
      <Shield className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
      <h1 className="text-base font-bold text-[var(--text-primary)]">
        {t('Administrator access required')}
      </h1>
      <p className="mx-auto mt-1 max-w-md text-xs text-[var(--text-secondary)]">
        {t(
          'This area is available to authorised administrators only. Ask a Super Admin if you believe you should have access.'
        )}
      </p>
    </div>
  );
};

export interface AdminRouteGuardProps {
  /** The administrative surface. It is only mounted for an administrator. */
  children: React.ReactNode;
}

export const AdminRouteGuard: React.FC<AdminRouteGuardProps> = ({ children }) => {
  const { t } = useCareer();
  const { admin, loading } = useAdminAccess();

  // The answer has not arrived. The administrative surface is not mounted and
  // the caller is not refused either: the interface waits for the server.
  if (loading) {
    return (
      <div
        className={`${CARD} flex items-center justify-center gap-2 p-10 text-sm text-[var(--text-secondary)]`}
      >
        <Loader2 className="h-4 w-4 animate-spin" /> {t('Checking administrator access…')}
      </div>
    );
  }

  // The server says this caller is not an administrator. The administrative
  // surface is never created.
  if (!admin || admin.status === 'disabled') {
    return <AdminAccessDenied />;
  }

  return <>{children}</>;
};
