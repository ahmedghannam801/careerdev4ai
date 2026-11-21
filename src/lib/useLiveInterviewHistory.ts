/**
 * The candidate's live-voice interview history, shared by the pages that need it.
 *
 * WHY A SHARED LOADER
 * The Progress Dashboard and the Interviews page both need the same list: one
 * counts it, the other shows it. A fetch in each component would send the same
 * authenticated request twice on a page the candidate never sees as two pages,
 * so the list is cached for the session and every subscriber reads the same
 * snapshot. A refresh replaces the snapshot for everyone.
 *
 * WHAT IT IS NOT
 * The history is not optimistic and not invented. It is whatever the server
 * returned, scoped by the row-level security policy on
 * `live_interview_sessions`. A failed load leaves the list empty and reports
 * the failure rather than showing a cached list as if it were current.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  listLiveInterviewSessions,
  type LiveInterviewSession,
} from './liveInterviewApi';

type Listener = (sessions: LiveInterviewSession[]) => void;

/** The last list the server returned in this session. */
let cache: LiveInterviewSession[] | null = null;
/** The request in flight, so two components mounting together share one call. */
let inflight: Promise<LiveInterviewSession[]> | null = null;
const listeners = new Set<Listener>();

function publish(sessions: LiveInterviewSession[]): void {
  cache = sessions;
  for (const listener of listeners) listener(sessions);
}

/** Loads the history once, and returns the same promise to every caller. */
function loadOnce(): Promise<LiveInterviewSession[]> {
  if (!inflight) {
    inflight = listLiveInterviewSessions()
      .then((sessions) => {
        publish(sessions);
        return sessions;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export interface LiveInterviewHistoryState {
  sessions: LiveInterviewSession[];
  isLoading: boolean;
  error: string | null;
  /** Reloads from the server and updates every subscriber. */
  refresh: () => Promise<void>;
}

export function useLiveInterviewHistory(): LiveInterviewHistoryState {
  const [sessions, setSessions] = useState<LiveInterviewSession[]>(cache ?? []);
  const [isLoading, setIsLoading] = useState(cache === null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await listLiveInterviewSessions();
      publish(next);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'The voice interview history could not be loaded.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    listeners.add(setSessions);
    if (cache === null) {
      setIsLoading(true);
      loadOnce()
        .then(() => setError(null))
        .catch((loadError: unknown) => {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'The voice interview history could not be loaded.'
          );
        })
        .finally(() => setIsLoading(false));
    }
    return () => {
      listeners.delete(setSessions);
    };
  }, []);

  return { sessions, isLoading, error, refresh };
}
