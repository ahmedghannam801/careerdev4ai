/**
 * The consent screen.
 *
 * A user who has not accepted the current Terms & Conditions and Privacy
 * Policy cannot use the platform, and the server enforces that on every
 * protected route. This screen is what they are shown instead, and it is the
 * only thing they can do until they accept.
 *
 * Three decisions shape it.
 *
 * It does not pretend to be the whole application. The screen replaces the
 * application rather than sitting over it, because an application the user
 * cannot use is worse than no application: every action behind it would fail
 * with a message the user cannot act on.
 *
 * The acceptance is an explicit act. The checkbox is unticked by default, and
 * the versions the server published are sent back with the acceptance, so the
 * record proves the person was shown the text that is in force now.
 *
 * It never blocks the way out. A user who does not want to accept can still
 * sign out, and the screen says so. That is the difference between a gate and
 * a trap, and it is also what the server agrees with: the account deletion
 * route is exempt from the consent check for exactly this reason.
 */

import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useFocusTrap, useScrollLock } from '../../lib/overlay';

export const ConsentGate: React.FC = () => {
  const { consentState, consentError, acceptConsent, refreshConsent, logout, t } = useCareer();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // The screen is not dismissible: there is nothing behind it to go back to.
  // The scroll is locked so the whole screen stays in view, and the focus is
  // trapped so a keyboard user cannot tab into the application underneath.
  useScrollLock(true);
  useFocusTrap(true, panelRef);

  const error = localError ?? consentError;
  const termsPath = consentState?.termsPath ?? '/terms';
  const privacyPath = consentState?.privacyPath ?? '/privacy';
  const termsAvailable = consentState?.termsAvailable === true;

  const handleAccept = async () => {
    if (busy || !accepted) return;
    setBusy(true);
    setLocalError(null);
    try {
      await acceptConsent('reconsent');
    } catch (acceptError) {
      setLocalError(
        acceptError instanceof Error
          ? acceptError.message
          : t('Your acceptance could not be recorded. Please try again.')
      );
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    setLocalError(null);
    await refreshConsent();
    setRetrying(false);
  };

  // The versions could not be read. The screen cannot ask for an acceptance
  // of text it has not read, so it offers to try again instead.
  const versionsUnknown = consentState === null;

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex items-center justify-center p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-gate-title"
        className="w-full max-w-lg space-y-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary-text)]" />
          <div>
            <h1 id="consent-gate-title" className="text-lg font-bold text-[var(--text-primary)]">
              {t('Before you start')}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              {t(
                'CareerDev4AI keeps your career record, your CVs and your applications on your own account. To use it, please accept the Terms & Conditions and the Privacy Policy.'
              )}
            </p>
          </div>
        </div>

        <ul className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-4 text-xs text-[var(--text-secondary)]">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success-strong)]" />
            <span>
              {t('Your records stay in your account, and you can delete them at any time.')}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success-strong)]" />
            <span>
              {t('The AI only works from what you have entered. It never invents your experience.')}
            </span>
          </li>
        </ul>

        {!versionsUnknown && !termsAvailable && (
          <div
            role="status"
            className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-xs leading-relaxed text-[var(--text-secondary)]"
          >
            {t('Approved Terms are not published yet. Consent and protected access are disabled until the operator provides the approved document.')}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--text-secondary)]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {versionsUnknown ? (
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={retrying}
            className="w-full rounded-lg bg-[var(--accent-primary)] py-2.5 text-sm font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:opacity-60"
          >
            {retrying ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('Checking…')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                {t('Try again')}
              </span>
            )}
          </button>
        ) : (
          <>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
              <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={accepted}
                  disabled={!termsAvailable}
                  onChange={(event) => setAccepted(event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent-primary)] disabled:cursor-not-allowed"
                />
                <span>
                  {t('I have read and accept the')}{' '}
                  <a
                    href={termsPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="font-semibold text-[var(--color-primary-text)] hover:underline"
                  >
                    {t('Terms & Conditions')}
                  </a>{' '}
                  {t('and the')}{' '}
                  <a
                    href={privacyPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="font-semibold text-[var(--color-primary-text)] hover:underline"
                  >
                    {t('Privacy Policy')}
                  </a>
                  .
                </span>
              </label>
              {consentState && (
                <p className="mt-2 ps-6 text-[11px] text-[var(--text-muted)]">
                  {t('Version')} {consentState.termsVersion} / {consentState.privacyVersion}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void handleAccept()}
              disabled={busy || !accepted || !termsAvailable}
              className="w-full rounded-lg bg-[var(--accent-primary)] py-2.5 text-sm font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('Recording your acceptance…')}
                </span>
              ) : (
                t('Accept and continue')
              )}
            </button>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
          <p className="text-[11px] text-[var(--text-muted)]">
            {t('Read the')}{' '}
            <a
              href={termsPath}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--color-primary-text)] hover:underline"
            >
              {t('Terms & Conditions')}
            </a>{' '}
            {t('and the')}{' '}
            <a
              href={privacyPath}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--color-primary-text)] hover:underline"
            >
              {t('Privacy Policy')}
            </a>
            .
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)]"
          >
            {t('Sign out')}
          </button>
        </div>
      </div>
    </div>
  );
};
