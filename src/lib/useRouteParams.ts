import { useCallback, useEffect, useState } from 'react';
import { buildRouteHash, parseRouteHash, readRouteParam, type ParsedRoute } from './routing';

/**
 * The route state the application is currently showing.
 *
 * The hash is the source of truth, so the state lives in one place and every
 * subscriber reads the same snapshot. A view that changes a tab or a filter
 * writes it back to the hash, which is what makes the state survive a
 * refresh, a shared link and the browser's Back button.
 */

type RouteListener = (state: ParsedRoute) => void;

const listeners = new Set<RouteListener>();

/** The snapshot as it stands right now. */
let snapshot: ParsedRoute = readHash();

let hashListenerInstalled = false;

function readHash(): ParsedRoute {
  if (typeof window === 'undefined') return { route: '', params: {}, publicUsername: null };
  return parseRouteHash(window.location.hash);
}

/** Re-reads the hash and tells every subscriber. */
function refresh(): ParsedRoute {
  snapshot = readHash();
  for (const listener of listeners) listener(snapshot);
  return snapshot;
}

function ensureHashListener(): void {
  if (hashListenerInstalled || typeof window === 'undefined') return;
  hashListenerInstalled = true;
  window.addEventListener('hashchange', () => {
    refresh();
  });
}

/**
 * The route the application is currently showing.
 *
 * Subscribing happens on mount, so a view that is opened after the hash was
 * already set still reads the right route.
 */
export function useRoute(): ParsedRoute {
  const [state, setState] = useState<ParsedRoute>(snapshot);

  useEffect(() => {
    ensureHashListener();
    // The hash may have changed between the first render and this effect.
    const current = refresh();
    setState(current);

    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}

/**
 * Reads and writes one sub-page value — a tab, a category, a filter — as part
 * of the URL.
 *
 * The value is checked against the list the page understands, so a stale link
 * falls back to the page's own default instead of putting it in a state it
 * cannot render.
 *
 * Writing replaces the current history entry rather than pushing a new one:
 * a filter the user tried twice should not leave two entries for the Back
 * button to walk through.
 */
export function useRouteParam<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): [T, (value: T) => void] {
  const { params } = useRoute();
  const value = readRouteParam(params, key, allowed, fallback);

  const setValue = useCallback(
    (next: T) => {
      if (typeof window === 'undefined') return;
      const current = readHash();
      // Without a route there is nothing to attach the parameter to, and
      // writing `#/` would erase the page the user is on.
      if (!current.route) return;
      const merged: Record<string, string> = { ...current.params };
      if (next === fallback) {
        // The default is not worth carrying in the URL.
        delete merged[key];
      } else {
        merged[key] = next;
      }
      window.history.replaceState(null, '', buildRouteHash(current.route, merged));
      refresh();
    },
    [key, fallback]
  );

  return [value, setValue];
}
