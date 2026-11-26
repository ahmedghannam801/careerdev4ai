/**
 * The CV Studio AI edit allowance, shown in the studio's own header.
 *
 * WHY THIS IS IN THE HEADER
 * -------------------------
 * The studio is where the platform spends the most AI capacity per candidate,
 * so the allowance is metered: three AI writes in a twenty-four hour window
 * for a free account, and no limit at all for a paid plan. A limit the
 * candidate cannot see is a limit they meet as a refusal, so the allowance is
 * stated before it is reached, and the state it is in is stated plainly.
 *
 * WHAT IT SHOWS
 * -------------
 *   * A paid plan: the allowance is unlimited, and the badge says so.
 *   * A free account with edits left: how many are left.
 *   * A free account with none left: a live countdown to the moment the
 *     allowance comes back, and the way to stop needing it.
 *
 * WHAT IT DOES NOT TOUCH
 * ----------------------
 * Typing by hand and deleting items are never limited, and never disabled by
 * this. Only the AI writes are.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Timer, Zap } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { MagnetButton } from '../react-bits/MagnetButton';
import {
  cvAiResetMillisecondsRemaining,
  formatCvAiResetCountdown,
} from '../../../shared/cvAiQuota';

interface CvStudioAiQuotaBadgeProps {
  /** Takes the candidate to the page where the plan can be chosen. */
  onUpgrade?: () => void;
}

/** How often the countdown is redrawn. */
const TICK_MS = 1000;

export const CvStudioAiQuotaBadge: React.FC<CvStudioAiQuotaBadgeProps> = ({ onUpgrade }) => {
  const { t, cvAiQuota, refreshCvAiQuota } = useCareer();

  // The clock the countdown is read against. It is state rather than a value
  // read during render, so the countdown actually moves.
  const [now, setNow] = useState(() => Date.now());

  // The allowance is read once, when the studio opens. A failure to read it
  // leaves it unknown, and an unknown allowance never locks anything.
  useEffect(() => {
    if (!cvAiQuota) void refreshCvAiQuota();
  }, [cvAiQuota, refreshCvAiQuota]);

  const locked = cvAiQuota !== null && cvAiQuota.locked;

  // The countdown only runs while there is something to count down to.
  useEffect(() => {
    if (!locked) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [locked]);

  const millisecondsLeft = useMemo(
    () => (cvAiQuota ? cvAiResetMillisecondsRemaining(cvAiQuota, now) : 0),
    [cvAiQuota, now]
  );

  // The moment the allowance comes back has passed. The server resets the
  // counter on the next edit, so the badge simply asks again.
  useEffect(() => {
    if (!locked || millisecondsLeft > 0) return;
    void refreshCvAiQuota();
  }, [locked, millisecondsLeft, refreshCvAiQuota]);

  // Nothing is known yet, so there is nothing to state.
  if (!cvAiQuota) return null;

  if (cvAiQuota.unlimited) {
    return (
      <span
        data-testid="cv-ai-quota-badge"
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-ai)]/30 bg-[var(--color-ai-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ai)]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>{t('Unlimited CV AI edits')}</span>
      </span>
    );
  }

  const limit = cvAiQuota.limit ?? 0;

  if (!locked) {
    return (
      <span
        data-testid="cv-ai-quota-badge"
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-primary)]"
      >
        <Zap className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
        <span>
          {t('AI edits today: {remaining}/{limit} remaining').replace('{remaining}', String(cvAiQuota.remaining ?? 0)).replace('{limit}', String(limit))}
        </span>
      </span>
    );
  }

  return (
    <div
      data-testid="cv-ai-quota-locked"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--surface-secondary)] px-3 py-1.5"
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-warning)]">
        <Timer className="h-3.5 w-3.5" />
        <span>{t('Resets in {time}').replace('{time}', formatCvAiResetCountdown(millisecondsLeft))}</span>
      </span>
      {onUpgrade && (
        <MagnetButton
          type="button"
          onClick={onUpgrade}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
        >
          <Sparkles className="h-3 w-3" />
          <span>{t('Upgrade to Pro for unlimited CV edits')}</span>
        </MagnetButton>
      )}
    </div>
  );
};

export default CvStudioAiQuotaBadge;
