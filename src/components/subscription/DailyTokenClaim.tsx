/**
 * The daily token reward.
 * ---------------------------------------------------------------------------
 * Every candidate may claim a small allowance of tokens each day. This
 * component is the single place that offers it.
 *
 * WHY IT IS A CLAIM AND NOT A GRANT
 * The allowance used to arrive on its own, as a side effect of reading the
 * balance. That made it invisible: the candidate never saw a reward, they
 * just found two tokens already there. A reward that is claimed is a reward
 * the candidate can be reminded of, can come back for tomorrow, and can be
 * seen to arrive.
 *
 * THE TWO STATES
 *   * AVAILABLE — the button is live and says how many tokens the claim is
 *     worth. This is the state that earns attention.
 *   * CLAIMED — the button is spent for the day and the widget counts down
 *     to the next claim. The countdown is the point: it turns "you cannot
 *     claim right now" into "you can claim again in 07:42:11", which is a
 *     reason to come back.
 *
 * THE CLAIM IS IDEMPOTENT
 * The server treats a claim as idempotent per calendar day, so a double
 * press, a retried request or two tabs open at once pay out exactly once.
 * The widget reflects that: a press that granted nothing says so instead of
 * pretending to have paid out.
 *
 * ONE WIDGET, SEVERAL PLACES
 * The same component is the dashboard banner, the token hub's card and the
 * compact control inside the balance badge. They read one state and press one
 * button, so the platform never shows two different opinions about whether
 * today's tokens have been claimed.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, Gift, Loader2, Sparkles } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useToast } from '../toast/ToastProvider';

/**
 * Counts down to a moment.
 *
 * The tick is one second, which is what a countdown that shows seconds needs.
 * The remaining time is recomputed from the target every tick rather than
 * decremented, so a backgrounded tab that skipped a minute does not show a
 * minute of stale time.
 *
 * Returns zero once the moment has passed.
 */
export function useCountdown(target: string | null | undefined): number {
  const compute = useCallback(() => {
    if (!target) return 0;
    const parsed = new Date(target).getTime();
    if (Number.isNaN(parsed)) return 0;
    return Math.max(0, parsed - Date.now());
  }, [target]);

  const [remaining, setRemaining] = useState(compute);

  useEffect(() => {
    setRemaining(compute());

    if (!target) return;

    const timer = setInterval(() => {
      const next = compute();
      setRemaining(next);
      if (next === 0) clearInterval(timer);
    }, 1000);

    return () => clearInterval(timer);
  }, [target, compute]);

  return remaining;
}

/**
 * Formats a remaining duration as `H:MM:SS`.
 *
 * The hours are not padded, so an eight-hour wait reads `8:04:31` rather than
 * `08:04:31`, and the seconds always are, so the digits do not jump about as
 * they change.
 */
export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export type DailyTokenClaimVariant = 'banner' | 'compact';

export interface DailyTokenClaimProps {
  /**
   * `banner` is the full card, for a page that wants the reward to be seen.
   * `compact` is the small control that fits inside a header or a popover.
   */
  variant?: DailyTokenClaimVariant;
  /** Extra classes for the wrapper. */
  className?: string;
  /**
   * Called after a claim that actually paid out, with the number of tokens
   * granted. The widget has already updated the balance in context by then.
   */
  onClaimed?: (granted: number) => void;
}

export const DailyTokenClaim: React.FC<DailyTokenClaimProps> = ({
  variant = 'banner',
  className = '',
  onClaimed,
}) => {
  const { creditBalance, claimDailyTokens, t } = useCareer();
  const { showToast } = useToast();
  const [claiming, setClaiming] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const daily = creditBalance?.daily ?? null;
  const remaining = useCountdown(daily?.resetAt);

  // The allowance the account is PROMISED. The server reports it, so the
  // number on the button is the number that will arrive, not a constant that
  // can drift away from the database.
  const amount = daily?.allowance ?? 0;
  const claimed = daily?.claimedToday === true;

  // The celebration timer is cleared when the widget goes away, so a claim
  // that is still celebrating cannot set state on an unmounted component.
  useEffect(
    () => () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    },
    []
  );

  const handleClaim = useCallback(async () => {
    if (claiming || claimed) return;

    setClaiming(true);
    try {
      const granted = await claimDailyTokens();

      if (granted === null) {
        // The claim did not happen. It says so, and it does not pretend.
        showToast({
          variant: 'error',
          title: t('Could not claim the daily tokens'),
          description: t('Nothing was taken. Please try again.'),
        });
        return;
      }

      if (granted > 0) {
        setCelebrating(true);
        showToast({
          variant: 'celebration',
          title: t('Daily tokens claimed'),
          description: `${t('You received')} ${granted} ${t('tokens')}.`,
          glyph: <Sparkles className="h-5 w-5" aria-hidden="true" />,
        });
        onClaimed?.(granted);

        // The celebration lasts as long as the burst does.
        if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
        celebrationTimer.current = setTimeout(() => setCelebrating(false), 1400);
      } else {
        // The server had already paid out today. The claim was a no-op, and
        // the honest report of a no-op is not a celebration.
        showToast({
          variant: 'info',
          title: t('Already claimed today'),
          description: t('Your daily tokens are already waiting for you.'),
        });
      }
    } finally {
      setClaiming(false);
    }
  }, [claimDailyTokens, claiming, claimed, onClaimed, showToast, t]);

  // Nothing is rendered when the platform reports no allowance at all — the
  // account is not eligible, and an empty reward card is worse than no card.
  if (!daily || amount <= 0) return null;

  if (variant === 'compact') {
    return (
      <div className={className}>
        <CompactClaim
          amount={amount}
          claimed={claimed}
          claiming={claiming}
          remaining={remaining}
          onClaim={handleClaim}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[var(--color-success-strong)]/25 bg-[var(--color-success-surface)] p-4 sm:p-5 ${className}`}
    >
      {celebrating ? (
        <span className="cp-celebration pointer-events-none absolute inset-0" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <span
              key={index}
              className="cp-celebration-particle absolute h-1.5 w-1.5 rounded-full"
              style={{
                left: `${8 + index * 7.4}%`,
                animationDelay: `${(index % 6) * 80}ms`,
                backgroundColor:
                  index % 3 === 0
                    ? 'var(--color-accent-strong)'
                    : index % 3 === 1
                      ? 'var(--color-success-strong)'
                      : 'var(--color-primary)',
              }}
            />
          ))}
        </span>
      ) : null}

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-main)] text-[var(--color-success-strong)] shadow-sm transition-transform ${
              celebrating ? 'scale-110' : ''
            }`}
            aria-hidden="true"
          >
            <Gift className="h-5 w-5" />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-[var(--text-primary)]">{t('Daily tokens')}</p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  claimed
                    ? 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                    : 'bg-[var(--surface-main)] text-[var(--color-success-strong)]'
                }`}
              >
                <span aria-hidden="true">+{amount}</span>
                <span className="sr-only">{t('tokens')}</span>
              </span>
            </div>

            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              {t('Free tokens every day')}
            </p>

            {claimed ? (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t('Next claim in')}</span>
                <span className="font-mono tabular-nums" dir="ltr">
                  {formatCountdown(remaining)}
                </span>
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={handleClaim}
          disabled={claiming || claimed}
          aria-live="polite"
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
            claimed
              ? 'cursor-default border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
              : 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-sm hover:bg-[var(--accent-secondary)] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
          }`}
        >
          {claiming ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : claimed ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Gift className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{claiming ? t('Claiming...') : claimed ? t('Claimed today') : t('Claim daily tokens')}</span>
        </button>
      </div>
    </div>
  );
};

/**
 * The small form of the widget, for a header or a popover.
 */
const CompactClaim: React.FC<{
  amount: number;
  claimed: boolean;
  claiming: boolean;
  remaining: number;
  onClaim: () => void;
}> = ({ amount, claimed, claiming, remaining, onClaim }) => {
  const { t } = useCareer();

  if (claimed) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"
        title={t('Next claim in')}
      >
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{t('Claimed today')}</span>
        <span className="font-mono tabular-nums text-[var(--text-muted)]" dir="ltr">
          {formatCountdown(remaining)}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClaim}
      disabled={claiming}
      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {claiming ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Gift className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span>
        {t('Claim')} +{amount}
      </span>
    </button>
  );
};

export default DailyTokenClaim;
