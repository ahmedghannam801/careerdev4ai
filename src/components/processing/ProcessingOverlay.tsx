/**
 * The global processing surface.
 * ---------------------------------------------------------------------------
 * One overlay for every long-running request in the product. It shows what
 * the system is doing, the meaningful stages of the work, and the fact that
 * the request really is being processed.
 *
 * Two rules shape everything here:
 *
 *   * Progress is only ever shown when it is real. A caller that reports a
 *     fraction gets that fraction; a caller that reports nothing gets an
 *     honest indeterminate animation. No percentage is ever invented, and no
 *     timer pretends to know how far along the work is.
 *   * Nothing moves when the visitor asked for reduced motion. The message
 *     and the stages are still shown — only the movement is dropped.
 *
 * The overlay covers the whole screen on a phone and is contained to a panel
 * on a large screen. `InlineProcessingOverlay` places the same surface over
 * one section of a page instead.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { backdropVariants, dialogVariants, useMotionVariants } from '../../lib/motion';
import { useDismissOnEscape, useScrollLock } from '../../lib/overlay';
import type { ProcessingOperationView } from './processingTypes';

export interface ProcessingOverlayProps {
  /** The operation to show. `null` renders nothing. */
  operation: ProcessingOperationView | null;
  /** Called when the candidate stops waiting. */
  onCancel?: () => void;
  /** Called when the candidate asks to run the failed work again. */
  onRetry?: () => void;
  /** Called when the candidate closes a finished, failed or cancelled overlay. */
  onDismiss?: () => void;
}

/**
 * The progress bar.
 *
 * A real fraction is drawn as a real bar. Without one the bar is
 * indeterminate: a segment travels along the track, which says "working"
 * without claiming to know how much is left. Under reduced motion the segment
 * does not travel — a static, dimmed track takes its place.
 */
const ProgressBar: React.FC<{
  progress: number | null;
  reduced: boolean;
}> = ({ progress, reduced }) => {
  if (progress !== null) {
    const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
    return (
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-[var(--surface-secondary)]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    );
  }

  return (
    <div
      className="relative h-1.5 overflow-hidden rounded-full bg-[var(--surface-secondary)]"
      role="progressbar"
    >
      {reduced ? (
        <div className="h-full w-full rounded-full bg-[var(--accent-primary)] opacity-30" />
      ) : (
        <motion.div
          className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-[var(--accent-primary)]"
          initial={{ x: '-120%' }}
          animate={{ x: '320%' }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
};

/**
 * The stages of the work.
 *
 * A stage is only marked as reached when the caller said so; the ones before
 * it are therefore behind the work, and the ones after it have not happened
 * yet.
 */
const StageList: React.FC<{
  operation: ProcessingOperationView;
  t: (source: string) => string;
}> = ({ operation, t }) => {
  if (operation.stages.length === 0) return null;
  const currentIndex = operation.stages.findIndex((stage) => stage.id === operation.currentStageId);

  return (
    <ol className="space-y-1.5" aria-live="polite">
      {operation.stages.map((stage, index) => {
        const reached = currentIndex >= 0 && index <= currentIndex;
        const current = index === currentIndex;
        return (
          <li key={stage.id} className="flex items-center gap-2 text-xs">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                current
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                  : reached
                    ? 'border-[var(--color-success-strong)] bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                    : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
              }`}
            >
              {reached && !current ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : current ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary-text)]" />
              ) : null}
            </span>
            <span
              className={
                current
                  ? 'font-semibold text-[var(--text-primary)]'
                  : reached
                    ? 'text-[var(--text-secondary)]'
                    : 'text-[var(--text-muted)]'
              }
            >
              {t(stage.label)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/**
 * The body of the overlay.
 *
 * It is shared by the screen overlay and the inline one, so both say exactly
 * the same things.
 */
export const ProcessingPanel: React.FC<ProcessingOverlayProps & { modal?: boolean }> = ({
  operation,
  onCancel,
  onRetry,
  onDismiss,
  modal = true,
}) => {
  const { t } = useCareer();
  const { reduced } = useMotionVariants();
  const titleId = 'processing-overlay-title';

  if (!operation) return null;

  const busy = operation.status === 'pending' || operation.status === 'processing';
  const currentStage = operation.stages.find((stage) => stage.id === operation.currentStageId);

  return (
    <section
      role={busy ? (modal ? 'dialog' : 'status') : 'alertdialog'}
      aria-modal={modal ? true : undefined}
      aria-labelledby={titleId}
      aria-busy={busy}
      className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              operation.status === 'failed' || operation.status === 'timed_out'
                ? 'bg-[var(--danger-surface)] text-[var(--color-danger)]'
                : operation.status === 'completed'
                  ? 'bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                  : 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
            }`}
          >
            {busy ? (
              reduced ? (
                <Clock className="h-4 w-4" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              )
            ) : operation.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : operation.status === 'cancelled' ? (
              <X className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-[var(--text-primary)]">
              {t(operation.title)}
            </h2>
            {busy && currentStage ? (
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                {t(currentStage.label)}
              </p>
            ) : null}
          </div>
        </div>

        {!busy && onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('Close')}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {busy ? (
        <div className="mt-6 space-y-4" role="status" aria-live="polite">
          <ProgressBar progress={operation.progress} reduced={reduced} />

          {operation.progress !== null ? (
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">
              {Math.max(0, Math.min(100, Math.round(operation.progress * 100)))}%
            </p>
          ) : null}

          <StageList operation={operation} t={t} />

          <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {t('Your request is being processed. Please keep this page open.')}
          </p>
          <p className="text-[11px] text-[var(--text-muted)]">
            {t('This can take up to about 20 seconds.')}
          </p>
          {operation.slow ? (
            <p className="text-[11px] font-medium text-[var(--color-primary-text)]">
              {t('Still working — this is taking a little longer than usual.')}
            </p>
          ) : null}
        </div>
      ) : operation.status === 'completed' ? (
        <div
          className="mt-6 rounded-xl border border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] p-3 text-xs text-[var(--text-secondary)]"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 font-semibold text-[var(--color-success-strong)]">
            <CheckCircle2 className="h-4 w-4" />
            <span>{t('Done')}</span>
          </div>
        </div>
      ) : operation.status === 'cancelled' ? (
        <div
          className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-xs text-[var(--text-secondary)]"
          role="status"
          aria-live="polite"
        >
          {t('You stopped waiting. The request was cancelled and its result was discarded.')}
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div
            className="rounded-xl border border-[var(--color-danger)]/25 bg-[var(--danger-surface)] p-3 text-xs text-[var(--text-secondary)]"
            role="alert"
            aria-live="assertive"
          >
            {operation.status === 'timed_out'
              ? t('This request took longer than expected and was stopped. You can try again.')
              : operation.error ?? t('The request could not be completed. Please try again.')}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                {t('Close')}
              </button>
            ) : null}
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-on-primary)] hover:bg-[var(--accent-secondary)]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> {t('Retry')}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {busy && operation.cancellable && onCancel ? (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
          >
            {t('Stop waiting')}
          </button>
        </div>
      ) : null}
    </section>
  );
};

/**
 * The screen overlay.
 *
 * It covers the whole screen on a phone and settles into a contained panel on
 * a large screen. The backdrop is always there, so the work underneath cannot
 * be touched while the request is running.
 */
export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = (props) => {
  const { reduced } = useMotionVariants();
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const open = Boolean(props.operation);
  const busy =
    props.operation?.status === 'pending' || props.operation?.status === 'processing';

  useScrollLock(open);
  useDismissOnEscape(open && !busy, () => props.onDismiss?.());

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {props.operation ? (
        <motion.div
          key="processing-overlay"
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0.01 : 0.16 } }}
        >
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            variants={backdropVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
          />
          <motion.div
            ref={panelRef}
            className="relative w-full sm:max-w-md"
            variants={dialogVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <ProcessingPanel {...props} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
};

export default ProcessingOverlay;
