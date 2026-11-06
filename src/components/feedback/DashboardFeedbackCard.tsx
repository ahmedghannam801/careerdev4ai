/**
 * The compact feedback card on the dashboard.
 *
 * It is a permanent entry point while it is visible: dismissing it hides the
 * card for a period, but the account menu and Settings keep a route to the
 * same form. The form itself opens on Google's domain in a new tab, so the
 * card says so instead of implying that anything is submitted inside the app.
 */
import React, { useEffect } from 'react';
import { ExternalLink, MessageSquare, X } from 'lucide-react';
import { FEEDBACK_FORM_URL } from '../../../shared/feedback';
import { useFeedback } from '../../context/FeedbackContext';
import { useCareer } from '../../context/CareerContext';

export const DashboardFeedbackCard: React.FC = () => {
  const { t } = useCareer();
  const { isCardVisible, markCardImpression, markOpened, dismissCard } = useFeedback();

  // One impression per browser session. The provider's synchronous guard makes
  // this safe under React's development-mode double invocation.
  useEffect(() => {
    if (isCardVisible) markCardImpression();
  }, [isCardVisible, markCardImpression]);

  if (!isCardVisible) return null;

  return (
    <section
      aria-labelledby="dashboard-feedback-title"
      data-testid="dashboard-feedback-card"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-surface)] p-2 text-[var(--color-primary-text)]">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <h2
            id="dashboard-feedback-title"
            className="text-sm font-semibold text-[var(--text-primary)]"
          >
            {t('Help shape CareerDev4AI')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {t('Tell us what works and what gets in your way. It takes about three minutes.')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <a
              href={FEEDBACK_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => markOpened('dashboard_card')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
            >
              {t('Share feedback')}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            <span className="text-[10px] leading-snug text-[var(--text-muted)]">
              {t('Opens the Google Form in a new tab. A Google account is required.')}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissCard}
          aria-label={t('Dismiss feedback card')}
          title={t('Dismiss feedback card')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
};
