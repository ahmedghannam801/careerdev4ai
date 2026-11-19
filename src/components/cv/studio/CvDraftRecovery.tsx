/**
 * Offers back a document that did not reach the server.
 *
 * The draft exists for the gap between an edit and its debounced write —
 * a closed tab, a dropped connection, a browser that could not write. It is
 * never applied automatically: the screen already shows the saved document,
 * and replacing it without asking would be a second surprise. The candidate
 * chooses; the database copy is in the studio already either way.
 */

import React from 'react';
import { AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useCareer } from '../../../context/CareerContext';

const formatDraftTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
};

export const CvDraftRecovery: React.FC = () => {
  const { t, cvDraft, recoverCvDraft, discardCvDraft } = useCareer();
  if (!cvDraft) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4 sm:flex-row sm:items-start"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-[var(--text-primary)]">
          {t('An unsaved draft of this CV was found on this device.')}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {t('It was last changed {time}. Recover it to put those changes back in the editor and save them; discard it to keep the version in your account.').replace(
            '{time}',
            formatDraftTime(cvDraft.updatedAt)
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={recoverCvDraft}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('Recover draft')}
        </button>
        <button
          type="button"
          onClick={discardCvDraft}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('Discard')}
        </button>
      </div>
    </div>
  );
};

export default CvDraftRecovery;
