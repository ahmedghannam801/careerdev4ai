/**
 * The email delivery check.
 *
 * The platform can send a message through the transactional provider. This
 * panel proves that the deployment is wired to it: it asks the server to send
 * one test message to the owner-configured recipient and reports what the
 * provider said.
 *
 * The recipient is not chosen here. It is a server-side setting, so the
 * endpoint cannot be used to send a message to an address of the caller's
 * choosing — the panel only reports whether delivery works.
 */

import React, { useState } from 'react';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { sendAdminEmailTest } from '../../lib/adminApi';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

export const EmailDeliveryPanel: React.FC = () => {
  const { t } = useCareer();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t('The test message could not be sent.')
      );
    } finally {
      setSending(false);
    }
  };

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
          disabled={sending}
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
