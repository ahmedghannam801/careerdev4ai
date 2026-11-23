/**
 * Email notification settings.
 *
 * The switches are server-backed, not localStorage: a change is written
 * immediately and the response is the state that was stored. A candidate who
 * turns a category off on a phone therefore does not receive it on a laptop.
 *
 * Account, security and payment receipts are shown as permanently on. That is
 * not a UI choice: the server sends them regardless of these switches, and
 * saying otherwise would be a lie about what the product does.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Check,
  Clock,
  Loader2,
  Mail,
  MailX,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  fetchEmailPreferences,
  patchEmailPreferences,
  type EmailPreferenceKey,
  type EmailPreferences,
} from '../../lib/emailPreferencesApi';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[1.35rem]' : 'translate-x-0.5'
        } ${checked ? 'rtl:-translate-x-[1.35rem]' : 'rtl:-translate-x-0.5'}`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export const EmailNotificationSettings: React.FC = () => {
  const { t } = useCareer();
  const [preferences, setPreferences] = useState<EmailPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmUnsubscribe, setConfirmUnsubscribe] = useState(false);

  const read = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreferences(await fetchEmailPreferences());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t('Your email preferences could not be loaded.'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void read();
  }, [read]);

  const save = useCallback(
    async (
      key: string,
      updates: Partial<Record<EmailPreferenceKey, boolean>> & {
        digestHour?: number;
        unsubscribeAll?: boolean;
      },
    ) => {
      setSavingKey(key);
      setError(null);
      try {
        const next = await patchEmailPreferences(updates);
        setPreferences(next);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1800);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : t('The change could not be saved.'),
        );
      } finally {
        setSavingKey(null);
      }
    },
    [t],
  );

  const categories = useMemo(
    () =>
      [
        ['opportunityAlerts', t('New opportunities'), t('Jobs, programmes and opportunities that match your target role.')],
        ['jobAlerts', t('Job alerts'), t('New vacancies relevant to your role and skills.')],
        ['learningUpdates', t('Learning updates'), t('New courses and resources, and course completions.')],
        ['volunteeringUpdates', t('Volunteering'), t('New volunteering opportunities.')],
        ['projectUpdates', t('Projects & challenges'), t('New projects, challenges and experience programmes.')],
        ['assessmentUpdates', t('Assessment results'), t('When a skill assessment result is recorded.')],
        ['careerRecommendations', t('Career recommendations'), t('Recommendations for your roadmap and next step.')],
        ['applicationUpdates', t('Application updates'), t('When an application moves to a new stage.')],
        ['interviewUpdates', t('Interview feedback'), t('When interview feedback or a report is ready.')],
        ['roadmapUpdates', t('Roadmap milestones'), t('Roadmap tasks, milestones and generated plans.')],
        ['announcements', t('Platform announcements'), t('Important product news and service updates.')],
        ['billingUpdates', t('Subscription reminders'), t('Plan changes and renewal notices. Receipts are always sent.')],
      ] as Array<[EmailPreferenceKey, string, string]>,
    [t],
  );

  const disabled = !preferences || preferences.unsubscribedAll || !preferences.emailEnabled;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <Mail className="h-4 w-4 text-[var(--color-primary-text)]" />
              {t('Email notifications')}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
              {t(
                'Choose what Aionvia emails you about. Your choices are saved to your account and apply immediately on every device.',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savingKey && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('Saving…')}
              </span>
            )}
            {saved && !savingKey && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-success-strong)]">
                <Check className="h-3 w-3" />
                {t('Saved')}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 text-xs text-[var(--color-danger)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading || !preferences ? (
          <div className="mt-5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('Loading your email preferences…')}
          </div>
        ) : (
          <>
            {preferences.unsubscribedAll && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3">
                <div className="flex items-start gap-2 text-xs text-[var(--text-primary)]">
                  <MailX className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {t('You are unsubscribed from opportunity, digest and announcement email.')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void save('resubscribe', { unsubscribeAll: false })}
                  disabled={savingKey === 'resubscribe'}
                  className="min-h-9 rounded-lg bg-[var(--accent-primary)] px-3 text-xs font-semibold text-[var(--color-on-primary)] disabled:opacity-60"
                >
                  {t('Turn email back on')}
                </button>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3 sm:p-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                  <BellRing className="h-4 w-4 text-[var(--color-primary-text)]" />
                  {t('All optional email')}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {t('The master switch for everything except account, security and payment email.')}
                </p>
              </div>
              <Toggle
                checked={preferences.emailEnabled}
                label={t('All optional email')}
                onChange={(next) => void save('emailEnabled', { emailEnabled: next })}
              />
            </div>

            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
              {categories.map(([key, label, description], index) => (
                <div
                  key={key}
                  className={`flex items-start justify-between gap-3 p-3 sm:p-3.5 ${
                    index > 0 ? 'border-t border-[var(--border-subtle)]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--text-primary)]">{label}</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {description}
                    </p>
                  </div>
                  <Toggle
                    checked={preferences[key]}
                    disabled={disabled && key !== 'emailEnabled'}
                    label={label}
                    onChange={(next) => void save(key, { [key]: next })}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] p-3.5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                <Clock className="h-4 w-4 text-[var(--color-primary-text)]" />
                {t('Digests')}
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                {t('A short summary of what is new and relevant. Sent even when you are not signed in.')}
              </p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{t('Daily digest')}</div>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {t('One email a day, only when there is something relevant.')}
                    </p>
                  </div>
                  <Toggle
                    checked={preferences.dailyDigest}
                    disabled={disabled}
                    label={t('Daily digest')}
                    onChange={(next) => void save('dailyDigest', { dailyDigest: next })}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">{t('Weekly digest')}</div>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {t('A weekly career summary with progress and next recommendations.')}
                    </p>
                  </div>
                  <Toggle
                    checked={preferences.weeklyDigest}
                    disabled={disabled}
                    label={t('Weekly digest')}
                    onChange={(next) => void save('weeklyDigest', { weeklyDigest: next })}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
                  <label htmlFor="digest-hour" className="text-xs font-semibold text-[var(--text-primary)]">
                    {t('Delivery hour (UTC)')}
                  </label>
                  <select
                    id="digest-hour"
                    value={preferences.digestHour}
                    disabled={disabled}
                    onChange={(event) =>
                      void save('digestHour', { digestHour: Number(event.target.value) })
                    }
                    className="min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 text-xs text-[var(--text-primary)]"
                  >
                    {Array.from({ length: 24 }).map((_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                <ShieldCheck className="h-4 w-4 text-[var(--color-success-strong)]" />
                {t('Account, security and payment email')}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {t(
                  'Password changes, sign-in email changes, security alerts, subscription status and payment receipts are part of your account and cannot be turned off. They never contain marketing.',
                )}
              </p>
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                {t('Consent recorded')}:{' '}
                {new Date(preferences.consentGrantedAt).toLocaleDateString()} ·{' '}
                {t('Last updated')}: {new Date(preferences.consentUpdatedAt).toLocaleDateString()}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-4">
              <p className="max-w-md text-[11px] leading-relaxed text-[var(--text-muted)]">
                {t(
                  'Unsubscribing stops opportunity, digest and announcement email immediately. Account and security email continues.',
                )}
              </p>
              {!preferences.unsubscribedAll && (
                confirmUnsubscribe ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmUnsubscribe(false);
                        void save('unsubscribeAll', { unsubscribeAll: true });
                      }}
                      className="min-h-9 rounded-lg bg-[var(--color-danger)] px-3 text-xs font-semibold text-white"
                    >
                      {t('Confirm unsubscribe')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmUnsubscribe(false)}
                      className="min-h-9 rounded-lg border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-secondary)]"
                    >
                      {t('Cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmUnsubscribe(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-danger)]/40 px-3 text-xs font-semibold text-[var(--color-danger)]"
                  >
                    <MailX className="h-3.5 w-3.5" />
                    {t('Unsubscribe')}
                  </button>
                )
              )}
            </div>
          </>
        )}
      </div>

      <div className={`${CARD} flex items-start gap-2 p-3.5`}>
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary-text)]" />
        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {t(
            'We only email you when the event actually happens. A digest with nothing new is not sent, and the same event never produces two messages.',
          )}
        </p>
      </div>
    </div>
  );
};
