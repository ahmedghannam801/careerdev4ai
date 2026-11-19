/**
 * What the studio's autosave is doing, in words.
 *
 * The editor applies a change to the paper immediately and writes it back a
 * moment later. Before this, a failed write was only a console line: the
 * candidate saw their sentence on the page and had no way to know it was not
 * in their account. The status is deliberately small and only speaks when
 * there is something to say.
 */

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useCareer } from '../../../context/CareerContext';

export interface CvSaveStatusIndicatorProps {
  className?: string;
}

export const CvSaveStatusIndicator: React.FC<CvSaveStatusIndicatorProps> = ({
  className = '',
}) => {
  const { t, cvSaveStatus, cvSaveError, saveActiveCvDocument } = useCareer();
  const [retrying, setRetrying] = useState(false);

  if (cvSaveStatus === 'idle') return null;

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await saveActiveCvDocument();
    } finally {
      setRetrying(false);
    }
  };

  if (cvSaveStatus === 'error') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 ${className}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-[var(--color-danger)]" />
        <span className="min-w-0 flex-1 text-xs font-semibold text-[var(--text-primary)]">
          {t('Could not save your latest changes.')}
        </span>
        {cvSaveError && (
          <span className="order-last w-full text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {cvSaveError}
          </span>
        )}
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-50"
        >
          {retrying ? t('Retrying…') : t('Retry')}
        </button>
      </div>
    );
  }

  const saving = cvSaveStatus === 'saving';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 text-[11px] font-medium ${
        saving ? 'text-[var(--text-muted)]' : 'text-[var(--color-success-strong)]'
      } ${className}`}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>{saving ? t('Saving…') : t('Saved to your account')}</span>
    </div>
  );
};

export default CvSaveStatusIndicator;
