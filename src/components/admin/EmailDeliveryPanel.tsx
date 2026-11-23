/**
 * The email delivery check.
 *
 * The platform can send a message through the transactional provider. This
 * panel proves that the deployment is wired to it: it reads the deployment's
 * own configuration, then asks the server to send one test message to the
 * owner-configured recipient and reports what the provider said.
 *
 * The recipient is not chosen here. It is a server-side setting, so the
 * endpoint cannot be used to send a message to an address of the caller's
 * choosing — the panel only reports whether delivery works.
 *
 * The state is read before the button is offered. A missing key and a rejected
 * key are different problems with different owners, and a panel that only
 * spoke after a failed send made the owner guess which one they had. The
 * sender is shown for the same reason: the shared `@resend.dev` address only
 * delivers to the Resend account owner, so a deployment still on it will fail
 * for every other recipient however healthy the key is.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Mail, RefreshCw } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { fetchAdminEmailStatus, sendAdminEmailTest, type AdminEmailStatus } from '../../lib/adminApi';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

export const EmailDeliveryPanel: React.FC = () => {
  const { t } = useCareer();
  const [status, setStatus] = useState<AdminEmailStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readStatus = useCallback(async () => {
    setStatusError(null);
    try {
      setStatus(await fetchAdminEmailStatus());
    } catch (caught) {
      setStatus(null);
      setStatusError(
        caught instanceof Error ? caught.message : t('The email configuration could not be read.')
      );
    }
  }, [t]);

  useEffect(() => {
    void readStatus();
  }, [readStatus]);

  const send = async () => {
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const outcome = await sendAdminEmailTest();
      setResult(
        outcome.messageId
          ? t('The test message was accepted by the provider.')
          : t('The test message was sent.')
      );
      // A send that worked can still follow a fix to the configuration, so the
      // state is read again rather than assumed.
      void readStatus();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t('The test message could not be sent.')
      );
    } finally {
      setSending(false);
    }
  };

  const ready = Boolean(status?.apiKeyConfigured && status?.recipientConfigured);

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">{t('Email delivery')}</h2>
          <p className="mt-1 max-w-2xl text-xs text-[var(--text-secondary)]">
            {t(
              'Sends one test message to the recipient the owner configured for this deployment. Use it after changing the provider settings.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !ready}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] disabled:opacity-60"
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Mail className="h-3.5 w-3.5" />
          )}
          {t('Send a test message')}
        </button>
      </div>

      {status && (
        <dl className="mt-3 grid gap-2 text-[11px] text-[var(--text-secondary)] sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-secondary)] px-2.5 py-1.5">
            <dt>{t('Provider key')}</dt>
            <dd className="font-semibold text-[var(--text-primary)]">
              {status.apiKeyConfigured ? t('Configured') : t('Not configured')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-secondary)] px-2.5 py-1.5">
            <dt>{t('Test recipient')}</dt>
            <dd className="font-semibold text-[var(--text-primary)]">
              {status.recipientConfigured ? t('Configured') : t('Not configured')}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-secondary)] px-2.5 py-1.5 sm:col-span-2">
            <dt>{t('Sending from')}</dt>
            <dd className="truncate font-mono text-[11px] font-semibold text-[var(--text-primary)]" dir="ltr">
              {status.sender}
            </dd>
          </div>
        </dl>
      )}

      {status && !ready && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
          <span>
            {!status.apiKeyConfigured
              ? t(
                  'This deployment has no provider key, so no message can be sent yet. The owner has to add it to the server’s secrets.'
                )
              : t(
                  'This deployment has no test recipient, so there is nowhere to send the check. The owner has to configure one.'
                )}
          </span>
        </div>
      )}

      {status?.senderIsSharedTestAddress && status.apiKeyConfigured && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--text-primary)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
          <span>
            {t(
              'Messages are sent from the provider’s shared test address, which only delivers to the account owner. Verify a domain and set the sender address before sending to anyone else.'
            )}
          </span>
        </div>
      )}

      {statusError && (
        <div className="mt-3 rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
          {statusError}
        </div>
      )}

      {result && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-success)]/20 bg-[var(--color-success)]/10 p-3 text-xs text-[var(--color-success-strong)]">
          <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{result}</span>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}
    </div>
  );
};
