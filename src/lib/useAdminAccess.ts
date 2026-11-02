import { useCallback, useEffect, useRef, useState } from 'react';
import { useCareer } from '../context/CareerContext';
import { fetchAdminMe, type AdminDTO } from './adminApi';

/**
 * The signed-in caller's admin identity.
 *
 * The shell uses this to decide whether to render the Admin Center entry, and
 * the Admin Center uses it to choose which tabs to offer. It is only a UI hint:
 * the API re-checks every action against the verified token.
 */
let cache: { userId: string; admin: AdminDTO | null; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

export function useAdminAccess() {
  const { currentUser } = useCareer();
  const userId = currentUser?.id ?? null;
  const [admin, setAdmin] = useState<AdminDTO | null>(
    cache && cache.userId === userId ? cache.admin : null
  );
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) {
      setAdmin(null);
      return null;
    }
    if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL_MS) {
      setAdmin(cache.admin);
      return cache.admin;
    }
    setLoading(true);
    try {
      const next = await fetchAdminMe();
      cache = { userId, admin: next, at: Date.now() };
      if (mounted.current) setAdmin(next);
      return next;
    } catch {
      // A normal user is not an administrator. The endpoint returns
      // `admin: null` for them; a network failure is treated the same way so
      // the shell never blocks on an optional capability.
      if (mounted.current) setAdmin(null);
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { admin, loading, refresh };
}
