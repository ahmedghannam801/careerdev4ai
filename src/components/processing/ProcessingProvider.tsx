/**
 * The global processing provider.
 * ---------------------------------------------------------------------------
 * One layer that any flow can trigger, so the product does not grow a second
 * loading dialog for every new feature.
 *
 * What it guarantees:
 *
 *   * The lifecycle is explicit — `pending`, `processing`, `completed`,
 *     `failed`, `cancelled`, `timed_out` — and it is reported honestly.
 *   * A second request for an operation that is already running does not
 *     start a second request: it joins the running one. An accidental double
 *     click therefore costs one request, not two.
 *   * A timeout is a timeout. The work is raced against the abort, so an
 *     operation that ignores its signal can still never be reported as
 *     finished after it was stopped.
 *   * The candidate can stop waiting, and the work that is given an
 *     `AbortSignal` is actually aborted.
 *   * Nothing is ever shown as successful before the server confirmed it.
 *
 * The provider does not replace the backend's own error handling: it reports
 * what the caller reported. The caller's own error handling still decides what
 * happens to the data.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ProcessingOverlay } from './ProcessingOverlay';
import type {
  ProcessingOperationView,
  ProcessingRunContext,
  ProcessingRunResult,
  ProcessingStatus,
  RunOperationOptions,
} from './processingTypes';

/**
 * How long an operation may run before it is reported as a timeout.
 *
 * It is a limit, not an estimate: the work is not slowed down to reach it.
 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * How long an operation is expected to take.
 *
 * It only changes the wording. After this the interface says that the work is
 * taking longer than usual — it never shows an error for being slow.
 */
const DEFAULT_EXPECTED_DURATION_MS = 20_000;

/** How long a finished operation stays on screen before it closes itself. */
const COMPLETED_DISMISS_MS = 2_000;

/** What every flow gets from the processing layer. */
export interface ProcessingContextValue {
  /**
   * Runs an operation and reports its lifecycle.
   *
   * While an operation with the same id is running, the call joins the running
   * operation instead of sending a second request.
   */
  runOperation: <T>(options: RunOperationOptions<T>) => Promise<ProcessingRunResult<T>>;
  /** Stops waiting for an operation. The work is aborted when it can be. */
  cancel: (id: string) => void;
  /** Runs a failed or timed-out operation again. */
  retry: (id: string) => void;
  /** Removes a finished operation from the surface. */
  dismiss: (id: string) => void;
  /** The state of one operation, or `null` when it is not running. */
  getOperation: (id: string) => ProcessingOperationView | null;
  /** The operation the global overlay is showing, if any. */
  currentOperation: ProcessingOperationView | null;
  /** The operation the global overlay is showing, if any. */
  operation: ProcessingOperationView | null;
}

const ProcessingContext = createContext<ProcessingContextValue | null>(null);

/**
 * Keeps a reported fraction inside the range a progress bar can show.
 */
const clampProgress = (fraction: number): number => {
  if (!Number.isFinite(fraction)) return 0;
  return Math.max(0, Math.min(1, fraction));
};

/** Whether a failure is the abort that a cancellation or a timeout caused. */
const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError');

/** One operation that is running, with everything needed to finish it. */
interface ActiveOperation {
  controller: AbortController;
  promise: Promise<ProcessingRunResult<unknown>>;
  options: RunOperationOptions<unknown>;
  timedOut: boolean;
  cancelled: boolean;
  /** The last progress the work really reported. */
  progress: number | null;
  timeoutTimer: number | null;
  slowTimer: number | null;
  dismissTimer: number | null;
}

export interface ProcessingProviderProps {
  children: ReactNode;
}

export const ProcessingProvider: React.FC<ProcessingProviderProps> = ({ children }) => {
  const activeRef = useRef<Map<string, ActiveOperation>>(new Map());
  const optionsRef = useRef<Map<string, RunOperationOptions<unknown>>>(new Map());
  const mountedRef = useRef(true);
  const [views, setViews] = useState<Record<string, ProcessingOperationView>>({});
  const [order, setOrder] = useState<string[]>([]);

  useEffect(
    () => () => {
      mountedRef.current = false;
      for (const entry of activeRef.current.values()) {
        if (entry.timeoutTimer !== null) window.clearTimeout(entry.timeoutTimer);
        if (entry.slowTimer !== null) window.clearTimeout(entry.slowTimer);
        if (entry.dismissTimer !== null) window.clearTimeout(entry.dismissTimer);
        entry.controller.abort(new DOMException('The view was closed', 'AbortError'));
      }
      activeRef.current.clear();
    },
    []
  );

  /** Merges a change into one operation's state. */
  const updateView = useCallback((id: string, patch: Partial<ProcessingOperationView>) => {
    if (!mountedRef.current) return;
    setViews((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }, []);

  /** Removes a finished operation from the surface. */
  const dismiss = useCallback((id: string) => {
    setViews((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setOrder((prev) => prev.filter((item) => item !== id));
  }, []);

  const runOperation = useCallback(
    <T,>(options: RunOperationOptions<T>): Promise<ProcessingRunResult<T>> => {
      const existing = activeRef.current.get(options.id);
      if (existing) {
        // The same work is already running. Joining it is what stops an
        // accidental double click from sending a second request.
        return existing.promise as Promise<ProcessingRunResult<T>>;
      }

      const controller = new AbortController();
      const stages = options.stages ?? [];

      const entry: ActiveOperation = {
        controller,
        promise: undefined as unknown as Promise<ProcessingRunResult<unknown>>,
        options: options as unknown as RunOperationOptions<unknown>,
        timedOut: false,
        cancelled: false,
        progress: null,
        timeoutTimer: null,
        slowTimer: null,
        dismissTimer: null,
      };
      activeRef.current.set(options.id, entry);
      optionsRef.current.set(options.id, entry.options);

      if (mountedRef.current) {
        setViews((prev) => ({
          ...prev,
          [options.id]: {
            id: options.id,
            title: options.title,
            stages,
            status: 'pending',
            currentStageId: stages[0]?.id ?? null,
            progress: null,
            error: null,
            cancellable: options.cancellable !== false,
            startedAt: Date.now(),
            slow: false,
          },
        }));
        setOrder((prev) => [...prev.filter((id) => id !== options.id), options.id]);
      }

      const promise = (async (): Promise<ProcessingRunResult<T>> => {
        // The work starts on the next tick, so the operation is already
        // registered when it begins: a re-entrant call with the same id
        // joins this run instead of starting a second one.
        await Promise.resolve();

        updateView(options.id, { status: 'processing' });

        entry.slowTimer = window.setTimeout(() => {
          updateView(options.id, { slow: true });
        }, options.expectedDurationMs ?? DEFAULT_EXPECTED_DURATION_MS);

        entry.timeoutTimer = window.setTimeout(() => {
          entry.timedOut = true;
          controller.abort(new DOMException('The request timed out', 'TimeoutError'));
        }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

        const aborted = new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(controller.signal.reason ?? new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        });

        try {
          const value = await Promise.race([
            options.operation({
              signal: controller.signal,
              reportProgress: (fraction) => {
                const clamped = clampProgress(fraction);
                entry.progress = clamped;
                updateView(options.id, { progress: clamped });
              },
              setStage: (stageId) => updateView(options.id, { currentStageId: stageId }),
            }),
            aborted,
          ]);

          // The server confirmed the result, so — and only now — the work is
          // shown as finished.
          updateView(options.id, {
            status: 'completed',
            progress: entry.progress,
            cancellable: false,
          });
          options.onSuccess?.(value);

          // A finished operation closes itself after a moment: the candidate
          // has seen the confirmation and the interface must not stay blocked.
          entry.dismissTimer = window.setTimeout(
            () => dismiss(options.id),
            COMPLETED_DISMISS_MS
          );

          return { status: 'completed', value };
        } catch (error) {
          if (entry.timedOut) {
            updateView(options.id, { status: 'timed_out', cancellable: false });
            return { status: 'timed_out' };
          }
          if (entry.cancelled || isAbortError(error)) {
            updateView(options.id, { status: 'cancelled', cancellable: false });
            return { status: 'cancelled' };
          }
          updateView(options.id, {
            status: 'failed',
            error: error instanceof Error && error.message ? error.message : null,
            cancellable: false,
          });
          options.onError?.(error);
          return { status: 'failed', error };
        } finally {
          if (entry.timeoutTimer !== null) window.clearTimeout(entry.timeoutTimer);
          if (entry.slowTimer !== null) window.clearTimeout(entry.slowTimer);
          entry.timeoutTimer = null;
          entry.slowTimer = null;
          if (activeRef.current.get(options.id) === entry) activeRef.current.delete(options.id);
        }
      })();

      entry.promise = promise as Promise<ProcessingRunResult<unknown>>;
      return promise;
    },
    [dismiss, updateView]
  );

  const cancel = useCallback((id: string) => {
    const entry = activeRef.current.get(id);
    if (!entry) return;
    entry.cancelled = true;
    entry.controller.abort(new DOMException('Stopped by the user', 'AbortError'));
  }, []);

  const retry = useCallback(
    (id: string) => {
      // A running operation is never retried: it is already the same work.
      if (activeRef.current.has(id)) return;
      const options = optionsRef.current.get(id);
      if (!options) return;
      void runOperation(options);
    },
    [runOperation]
  );

  /**
   * The operation the global overlay shows.
   *
   * An operation that asked to be shown inline belongs to the section that
   * started it, so it is skipped here.
   */
  const currentOperation = useMemo(() => {
    for (let index = order.length - 1; index >= 0; index -= 1) {
      const id = order[index];
      const view = views[id];
      if (!view) continue;
      if (optionsRef.current.get(id)?.presentation === 'inline') continue;
      return view;
    }
    return null;
  }, [order, views]);

  const contextValue = useMemo<ProcessingContextValue>(
    () => ({
      runOperation,
      cancel,
      retry,
      dismiss,
      getOperation: (id: string) => views[id] ?? null,
      currentOperation,
      operation: currentOperation,
    }),
    [cancel, currentOperation, dismiss, retry, runOperation, views]
  );

  return (
    <ProcessingContext.Provider value={contextValue}>
      {children}
      <ProcessingOverlay
        operation={currentOperation}
        onCancel={currentOperation ? () => cancel(currentOperation.id) : undefined}
        onRetry={currentOperation ? () => retry(currentOperation.id) : undefined}
        onDismiss={currentOperation ? () => dismiss(currentOperation.id) : undefined}
      />
    </ProcessingContext.Provider>
  );
};

/**
 * The processing layer.
 *
 * It is always available: outside the provider it falls back to running the
 * work without an overlay, so a component that is used on its own still
 * works.
 */
export function useProcessing(): ProcessingContextValue {
  const context = useContext(ProcessingContext);

  const fallback = useMemo<ProcessingContextValue>(
    () => ({
      runOperation: async <T,>(options: RunOperationOptions<T>): Promise<ProcessingRunResult<T>> => {
        const controller = new AbortController();
        const runContext: ProcessingRunContext = {
          signal: controller.signal,
          reportProgress: () => undefined,
          setStage: () => undefined,
        };
        try {
          const value = await options.operation(runContext);
          options.onSuccess?.(value);
          return { status: 'completed', value };
        } catch (error) {
          options.onError?.(error);
          return { status: 'failed', error };
        }
      },
      cancel: () => undefined,
      retry: () => undefined,
      dismiss: () => undefined,
      getOperation: () => null,
      currentOperation: null,
      operation: null,
    }),
    []
  );

  return context ?? fallback;
}

export type {
  ProcessingOperationView,
  ProcessingRunContext,
  ProcessingRunResult,
  ProcessingStatus,
};
export default ProcessingProvider;
