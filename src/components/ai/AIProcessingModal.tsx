import React, { useRef } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useDismissOnEscape, useFocusTrap, useScrollLock } from '../../lib/overlay';
import { useCareer } from '../../context/CareerContext';

export type AIProcessingStatus = 'processing' | 'success' | 'error' | 'cancelled';

export interface AIProcessingModalProps {
  open: boolean;
  status: AIProcessingStatus;
  title: string;
  /** A truthful current action, not an estimated percent or simulated step. */
  stage: string;
  message?: string;
  error?: string | null;
  onCancel: () => void;
  canCancel?: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

/**
 * Shared, accessible status surface for a long-running AI request.
 *
 * Progress is intentionally indeterminate: callers report a real action and
 * the actual result, rather than displaying a percentage that the server does
 * not provide. The in-flight state cannot be dismissed with Escape; the
 * explicit Cancel action is wired to the request's AbortController.
 */
export const AIProcessingModal: React.FC<AIProcessingModalProps> = ({
  open,
  status,
  title,
  stage,
  message,
  error,
  onCancel,
  canCancel = true,
  onClose,
  onRetry,
}) => {
  const { t } = useCareer();
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);
  useFocusTrap(open, panelRef);
  useDismissOnEscape(open && status !== 'processing', onClose);

  if (!open) return null;

  const busy = status === 'processing';
  const titleId = 'ai-processing-modal-title';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        className="w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-surface)] text-[var(--color-primary-text)]">
              {busy ? <Sparkles className="h-4 w-4" /> : status === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{message ?? stage}</p>
            </div>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('Close')}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {busy ? (
          <div className="mt-6 space-y-3" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-primary-text)]">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              <span>{stage}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
              <div className="h-full w-2/5 animate-pulse rounded-full bg-[var(--accent-primary)] motion-reduce:animate-none" />
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              {canCancel
                ? t('Stopping waiting discards late results; the AI service may continue processing.')
                : t('A completed result is being saved. Please wait.')}
            </p>
          </div>
        ) : status === 'success' ? (
          <div className="mt-6 rounded-xl border border-[var(--color-success-strong)]/20 bg-[var(--color-success-strong)]/5 p-3 text-xs text-[var(--text-secondary)]" role="status" aria-live="polite">
            <div className="flex items-center gap-2 font-semibold text-[var(--color-success-strong)]">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t(message ?? 'Done.')}</span>
            </div>
          </div>
        ) : status === 'cancelled' ? (
          <div className="mt-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-xs text-[var(--text-secondary)]" role="status" aria-live="polite">
            {t('Stopped waiting. Late results are discarded and will not be saved. The AI service may still be processing.')}
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/5 p-3 text-xs text-[var(--text-secondary)]" role="alert" aria-live="assertive">
              {t(error ?? 'The request could not be completed. Please try again.')}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">
                {t('Close')}
              </button>
              {onRetry && (
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-on-primary)] hover:bg-[var(--accent-secondary)]">
                  <RefreshCw className="h-3.5 w-3.5" /> {t('Retry')}
                </button>
              )}
            </div>
          </div>
        )}

        {busy && canCancel && (
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">
              {t('Stop waiting')}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
