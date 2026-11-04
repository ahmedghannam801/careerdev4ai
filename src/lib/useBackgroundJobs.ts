// The hook that keeps the interface in step with the background jobs.
//
// The state lives on the server, so this hook does three things:
//
//   1. reads the jobs when the screen opens, which is what makes a finished
//      result survive a refresh — the browser never held it in the first
//      place;
//   2. polls while something is still running, and stops polling when
//      nothing is;
//   3. offers an explicit retry for a job that failed.
//
// The polling interval is short while a job is running and the hook stops
// entirely once everything has settled, so an open screen does not keep the
// server busy for ever.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelBackgroundJob,
  isJobActive,
  listBackgroundJobs,
  retryBackgroundJob,
  startBackgroundJob,
  type BackgroundJob,
  type BackgroundJobAvailability,
  type StartJobInput,
} from './backgroundJobs';

/** How often the jobs are read while something is still running. */
const POLL_INTERVAL_MS = 3000;

export interface UseBackgroundJobs {
  /** The candidate's jobs, newest first. */
  jobs: BackgroundJob[];
  /**
   * What the background-job service can do right now.
   *
   * `null` while it has not been read yet, or when the server could not say.
   */
  availability: BackgroundJobAvailability | null;
  /** True while the first read is in flight. */
  loading: boolean;
  /** The last failure of the list itself, when there was one. */
  error: string | null;
  /** True while a start, retry or cancel is in flight. */
  busy: boolean;
  /** Reads the jobs again. */
  refresh: () => Promise<void>;
  /** Starts a job and returns it. */
  start: (input: StartJobInput) => Promise<BackgroundJob | null>;
  /** Starts a failed job again. */
  retry: (jobId: string) => Promise<void>;
  /** Stops a job that has not finished. */
  cancel: (jobId: string) => Promise<void>;
  /** The jobs that are still running. */
  activeJobs: BackgroundJob[];
}

export function useBackgroundJobs(): UseBackgroundJobs {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [availability, setAvailability] = useState<BackgroundJobAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The poller reads the latest jobs through a ref, so the interval is set up
  // once and never restarted when the list changes.
  const jobsRef = useRef<BackgroundJob[]>([]);
  jobsRef.current = jobs;

  const refresh = useCallback(async () => {
    try {
      const next = await listBackgroundJobs();
      setJobs(next.jobs);
      setAvailability(next.availability);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The background jobs could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The first read, and the poll while something is running.
  //
  // The poll keeps running while a job is queued, because a queued job is
  // exactly the state where something can go wrong: a runner that never picks
  // it up. The server gives up on such a job and says so.
  useEffect(() => {
    void refresh();

    const timer = window.setInterval(() => {
      if (jobsRef.current.some(isJobActive)) {
        void refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [refresh]);

  const start = useCallback(
    async (input: StartJobInput): Promise<BackgroundJob | null> => {
      setBusy(true);
      try {
        const job = await startBackgroundJob(input);
        setJobs((current) => [job, ...current.filter((entry) => entry.id !== job.id)]);
        return job;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The job could not be started.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const retry = useCallback(async (jobId: string) => {
    setBusy(true);
    try {
      const job = await retryBackgroundJob(jobId);
      setJobs((current) => current.map((entry) => (entry.id === job.id ? job : entry)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The job could not be restarted.');
    } finally {
      setBusy(false);
    }
  }, []);

  const cancel = useCallback(async (jobId: string) => {
    setBusy(true);
    try {
      const job = await cancelBackgroundJob(jobId);
      setJobs((current) => current.map((entry) => (entry.id === job.id ? job : entry)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The job could not be cancelled.');
    } finally {
      setBusy(false);
    }
  }, []);

  const activeJobs = jobs.filter(isJobActive);

  return { jobs, availability, loading, error, busy, refresh, start, retry, cancel, activeJobs };
}
