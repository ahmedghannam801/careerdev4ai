/**
 * The referral panel.
 * ---------------------------------------------------------------------------
 * Every registered account has a personal referral link. The panel shows it,
 * lets the candidate copy it, and says what the referrals have earned.
 *
 * It is deliberately small. The link, the copy button, three numbers and one
 * line of explanation. A referral programme that needs a dashboard is a
 * referral programme nobody uses.
 *
 * Everything shown here comes from the server. The client does not count
 * referrals and it does not decide what one is worth.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, Users } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { fetchReferralSummary, type ReferralSummary } from '../../lib/referralApi';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

export const ReferralPanel: React.FC = () => {
  const { t } = useCareer();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLSpanElement>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSummary(await fetchReferralSummary());
    } catch {
      setError(t('Your referral link could not be loaded'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = useCallback(async () => {
    if (!summary?.link) return;
    const link = summary.link;
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        copied = true;
      }
    } catch {
      // The browser refused the asynchronous clipboard. The fallback is tried
      // before anything is said about the copy.
      copied = false;
    }

    if (!copied) {
      // A browser without the clipboard API still gets the link copied.
      try {
        const field = document.createElement('textarea');
        field.value = link;
        field.setAttribute('readonly', 'true');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        copied = document.execCommand('copy');
        document.body.removeChild(field);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    // The copy was refused. The link is selected, so the candidate can still
    // copy it by hand — the panel never claims a copy it did not make.
    setError(t('Copying was blocked. Select the link and copy it.'));
    const selection = window.getSelection();
    if (selection && linkRef.current) {
      const range = document.createRange();
      range.selectNodeContents(linkRef.current);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [summary?.link, t]);

  if (error && !summary) {
    return (
      <div className={`${CARD} p-6`}>
        <p className="text-sm text-[var(--text-secondary)]">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
        >
          {t('Try again')}
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={`${CARD} p-6`}>
        <p className="text-sm text-[var(--text-muted)]">{t('Loading your referral link…')}</p>
      </div>
    );
  }

  const stats = [
    { label: t('Successful referrals'), value: summary.referrals.successful },
    { label: t('Credits earned'), value: summary.creditsEarned },
    // The pending count only appears when there is something waiting.
    ...(summary.referrals.pending > 0
      ? [{ label: t('Pending referrals'), value: summary.referrals.pending }]
      : []),
  ];

  return (
    <div className={`${CARD} p-5 sm:p-6`}>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-[var(--color-primary-text)]" />
        <h2 className="text-sm font-bold text-[var(--text-primary)]">{t('Referrals')}</h2>
      </div>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {t('Invite a friend and earn credits')}
      </p>

      {/* The link itself, with the one action that goes with it. */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <span
            ref={linkRef}
            className="truncate text-xs text-[var(--text-secondary)]"
            title={summary.link}
            dir="ltr"
          >
            {summary.link}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!summary.link}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:opacity-50"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> {t('Copied')}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> {t('Copy link')}
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>
      )}

      {/* The counts. Three of them, because three is the most a person can
          hold in their head. */}
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-[var(--surface-secondary)] px-3 py-2.5">
            <dt className="text-[11px] leading-tight text-[var(--text-muted)]">{stat.label}</dt>
            <dd className="mt-0.5 text-base font-bold text-[var(--text-primary)]">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-muted)]">
        {summary.referrals.total === 0
          ? t('Share your link to start earning credits.')
          : t('Your friend signs up with your link and completes their registration, and your reward arrives.')}
      </p>
    </div>
  );
};

export default ReferralPanel;
