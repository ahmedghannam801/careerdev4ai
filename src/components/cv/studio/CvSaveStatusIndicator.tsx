/**
 * What the studio's autosave is doing, in words.
 *
 * The editor applies a change to the paper immediately and writes it back a
 * moment later. Before this, a failed write was only a console line: the
 * candidate saw their sentence on the page and had no way to know it was not
 * in their account. The status is deliberately small and only speaks when
 * there is something to say.
 *
 * The shape carries the state. While the write is running the status is a
 * rounded mark with a ring turning inside it; when the write has genuinely
 * landed, the mark opens out into a filled disc with a tick in it and the
 * status settles into a full pill. The change is the shape, not a colour: a
 * candidate who is not looking directly at the corner still sees the corner
 * change.
 *
 * The status is the width of its widest wording from the first frame, so it
 * never nudges the studio's editor when the write lands.
 *
 * A failed write is not a shape. It is a problem the candidate has to read,
 * so it keeps the panel it has always had, with the reason and a way to try
 * again.
 */

import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCareer } from '../../../context/CareerContext';
import { MorphingChip, MorphingMark } from '../../motion/Morph';

export interface CvSaveStatusIndicatorProps {
  className?: string;
}

export const CvSaveStatusIndicator: React.FC<CvSaveStatusIndicatorProps> = ({
  className = '',
}) => {
  const { t, cvSaveStatus, cvSaveError, saveActiveCvDocument } = useCareer();
  const [retrying, setRetrying] = useState(false);
  const reduced = useReducedMotion() ?? false;

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
      <motion.div
        role="status"
        aria-live="polite"
        initial={reduced ? false : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
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
      </motion.div>
    );
  }

  const saving = cvSaveStatus === 'saving';

  /*
   * The chip's corner radius travels while the write is running and settles
   * into a full pill once the write has landed, and the ring in front of the
   * text opens out into a filled disc with a tick in it. The chip is the
   * width of its widest label from the first frame, so nothing beside it in
   * the studio moves when the state changes.
   */
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 ${className}`}
    >
      <MorphingChip
        state={saving ? 'working' : 'done'}
        tone={saving ? 'neutral' : 'success'}
        size={24}
        icon={<MorphingMark state={saving ? 'working' : 'done'} size={14} />}
        labels={{
          working: t('Saving…'),
          done: t('Saved to your account'),
        }}
      />
    </div>
  );
};

export default CvSaveStatusIndicator;
