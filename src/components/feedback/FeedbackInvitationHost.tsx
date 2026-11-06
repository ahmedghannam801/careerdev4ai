/**
 * The contextual feedback invitation.
 *
 * It appears only on calm screens, only after real engagement, and only once
 * the shared policy allows it. It never opens over a dialog (the tour, the
 * copilot, a confirmation), and it does not steal focus: the page underneath
 * stays usable, and the invitation leaves on its own.
 */
import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCareer } from '../../context/CareerContext';

export const FeedbackInvitationHost: React.FC<{ currentView: string }> = ({
  currentView,
}) => {
  const { t } = useCareer();
  const {
    evaluateInvitation,
    markInvitationShown,
    dismissInvitation,
    openForm,
    isInvitedThisSession,
  } = useFeedback();

  const [visible, setVisible] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    if (visible || shownRef.current || isInvitedThisSession) return;

    const eligibility = evaluateInvitation(currentView);
    if (!eligibility.eligible) return;

    // A short delay keeps the invitation from arriving with the page. If the
    // visitor moves on, the timeout is cleared and nothing is recorded.
    const timer = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"]')) return;
      shownRef.current = true;
      markInvitationShown();
      setVisible(true);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [
    currentView,
    visible,
    isInvitedThisSession,
    evaluateInvitation,
    markInvitationShown,
  ]);

  // Leave on its own. This is not a dismissal: the impression has already been
  // recorded, and the thirty-day rule is what keeps it from returning.
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), 15000);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="feedback-invitation"
      className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] end-3 z-40 w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 shadow-lg sm:bottom-6 sm:end-6"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--accent-surface)] p-2 text-[var(--color-primary-text)]">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {t('A quick question')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {t('You have made real progress here. What is working, and what gets in your way?')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                openForm('contextual_invitation');
                setVisible(false);
              }}
              className="inline-flex min-h-9 items-center rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
            >
              {t('Share feedback')}
            </button>
            <button
              type="button"
              onClick={() => {
                dismissInvitation();
                setVisible(false);
              }}
              className="inline-flex min-h-9 items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
            >
              {t('Not now')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            dismissInvitation();
            setVisible(false);
          }}
          aria-label={t('Dismiss feedback invitation')}
          title={t('Dismiss feedback invitation')}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};
