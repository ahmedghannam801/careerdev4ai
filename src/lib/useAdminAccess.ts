import { useCallback, useEffect, useRef, useState } from 'react';
import { useCareer } from '../context/CareerContext';
import { fetchAdminMe, type AdminDTO } from './adminApi';

/**
 * The signed-in caller's admin identity.
 *
 * The shell uses this to decide whether to render the Admin Center entry, and
 * the route guard uses it to decide whether the Admin Center may be mounted at
 * all. It is only a UI hint: the API re-checks every action against the
 * verified token.
 */
let cache: { userId: string; admin: AdminDTO | null; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

/** The cached answer for this very user, while it is still fresh. */
function freshCacheFor(userId: string | null) {
  if (!userId) return null;
  if (!cache || cache.userId !== userId) return null;
  if (Date.now() - cache.at >= CACHE_TTL_MS) return null;
  return cache;
}

export function useAdminAccess() {
  const { currentUser } = useCareer();
  const userId = currentUser?.id ?? null;

  // The answer, and the user it belongs to.
  //
  // The identity of the user the answer belongs to is kept next to the answer
  // itself, because the answer is only ever about the person who is signed in
  // now. A user who signs out and another who signs in must never see the
  // previous answer, and the check must start again for the new one.
  const [admin, setAdmin] = useState<AdminDTO | null>(() => freshCacheFor(userId)?.admin ?? null);
  const [answeredFor, setAnsweredFor] = useState<string | null>(
    () => freshCacheFor(userId)?.userId ?? null
  );
  const mounted = useRef(true);

  // The check is still running while the answer on screen does not yet belong
  // to the person who is signed in. Until it does, nobody is "not an
  // administrator" yet: the answer simply has not arrived, and a real
  // administrator must never see a flash of "access required" because of it.
  const loading = userId !== null && answeredFor !== userId;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      if (mounted.current) {
        setAdmin(null);
        setAnsweredFor(null);
      }
      return null;
    }
    const hit = freshCacheFor(userId);
    if (hit) {
      if (mounted.current) {
        setAdmin(hit.admin);
        setAnsweredFor(hit.userId);
      }
      return hit.admin;
    }
    try {
      const next = await fetchAdminMe();
      cache = { userId, admin: next, at: Date.now() };
      if (mounted.current) {
        setAdmin(next);
        setAnsweredFor(userId);
      }
      return next;
    } catch {
      // A normal user is not an administrator. The endpoint returns
      // `admin: null` for them; a network failure is treated the same way so
      // the shell never blocks on an optional capability. The check is still
      // finished, so the caller is told the answer rather than waiting for a
      // reply that is never coming.
      if (mounted.current) {
        setAdmin(null);
        setAnsweredFor(userId);
      }
      return null;
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { admin, loading, refresh };
}
