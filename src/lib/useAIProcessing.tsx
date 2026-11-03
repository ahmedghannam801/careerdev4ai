import { useCallback, useEffect, useRef, useState } from 'react';
import { AIProcessingModal, type AIProcessingStatus } from '../components/ai/AIProcessingModal';
import { useCareer } from '../context/CareerContext';

export interface AIProcessingTask<T> {
  title: string;
  stage: string;
  failureMessage?: string;
  timeoutMessage?: string;
  timeoutMs?: number;
  run: (
    signal: AbortSignal,
    setPhase: (stage: string, cancellable?: boolean) => void
  ) => Promise<T>;
  onSuccess: (result: T) => void;
}

interface TaskView {
  title: string;
  stage: string;
  status: AIProcessingStatus;
  error: string | null;
  canCancel: boolean;
}

/**
 * Shared request lifecycle for AI actions: duplicate prevention, a real timeout,
 * an AbortSignal, preserved caller state, a success/error/cancel surface, and a
 * retry that repeats both the request and its original state update.
 */
export function useAIProcessing() {
  const { t } = useCareer();
  const [taskView, setTaskView] = useState<TaskView | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const retryRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const timedOutRef = useRef(false);
  const canCancelRef = useRef(false);
  const mountedRef = useRef(true);

  const run = useCallback(async <T,>(task: AIProcessingTask<T>): Promise<void> => {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    canCancelRef.current = true;
    timedOutRef.current = false;
    retryRef.current = () => { void run(task); };
    if (mountedRef.current) {
      setTaskView({ title: task.title, stage: task.stage, status: 'processing', error: null, canCancel: true });
    }

    const setPhase = (stage: string, cancellable = true) => {
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      canCancelRef.current = cancellable;
      if (!cancellable && timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (mountedRef.current) {
        setTaskView((current) => current?.status === 'processing'
          ? { ...current, stage, canCancel: cancellable }
          : current);
      }
    };

    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(controller.signal.reason ?? new DOMException('Aborted', 'AbortError')),
        { once: true }
      );
    });

    timeoutRef.current = window.setTimeout(() => {
      if (!canCancelRef.current) return;
      timedOutRef.current = true;
      controller.abort(new DOMException('AI request timed out', 'TimeoutError'));
    }, task.timeoutMs ?? 90_000);

    try {
      const result = await Promise.race([task.run(controller.signal, setPhase), aborted]);
      if (controller.signal.aborted) return;
      if (mountedRef.current) task.onSuccess(result);
      if (mountedRef.current) {
        setTaskView({ title: task.title, stage: task.stage, status: 'success', error: null, canCancel: false });
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (timedOutRef.current) {
        const message = task.timeoutMessage ?? t('The AI request timed out. The service may continue processing; late results will be ignored.');
        setTaskView({ title: task.title, stage: task.stage, status: 'error', error: message, canCancel: false });
      } else if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        setTaskView({ title: task.title, stage: task.stage, status: 'cancelled', error: null, canCancel: false });
      } else {
        const message = error instanceof Error && error.message
          ? error.message
          : task.failureMessage ?? t('The AI request failed. Please retry.');
        setTaskView({ title: task.title, stage: task.stage, status: 'error', error: message, canCancel: false });
      }
    } finally {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      canCancelRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [t]);

  const cancel = useCallback(() => {
    if (canCancelRef.current) {
      controllerRef.current?.abort(new DOMException('Stopped waiting by user', 'AbortError'));
    }
  }, []);

  const close = useCallback(() => {
    if (!controllerRef.current) setTaskView(null);
  }, []);

  const retry = useCallback(() => {
    if (taskView?.status !== 'error') return;
    retryRef.current?.();
  }, [taskView?.status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (canCancelRef.current) {
        controllerRef.current?.abort(new DOMException('View closed', 'AbortError'));
      }
    };
  }, []);

  const modal = taskView ? (
    <AIProcessingModal
      open
      status={taskView.status}
      title={taskView.title}
      stage={taskView.stage}
      error={taskView.error}
      canCancel={taskView.canCancel}
      onCancel={cancel}
      onClose={close}
      onRetry={taskView.status === 'error' ? retry : undefined}
    />
  ) : null;

  return { run, isRunning: !!controllerRef.current, modal };
}
