/**
 * The evidence review queue.
 *
 * A candidate records what they have done — a repository, a certificate, a
 * live demo. The platform does not take the candidate's word for it: the
 * artifact waits here until an administrator has looked at it. Until then it
 * counts as unproven, and the candidate's profile says so.
 *
 * This panel is a convenience over the API, not the security boundary: every
 * decision calls a route that re-checks the verified administrator, and the
 * decision is written to the audit trail by the server.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  fetchAdminEvidenceQueue,
  reviewAdminEvidence,
  type AdminEvidenceQueueItem,
} from '../../lib/adminApi';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';
const FIELD =
  'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--color-accent-strong)] focus:outline-none';

export const EvidenceReviewPanel: React.FC = () => {
  const { t } = useCareer();
  const [items, setItems] = useState<AdminEvidenceQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchAdminEvidenceQueue());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('The review queue could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (
    item: AdminEvidenceQueueItem,
    status: 'verified' | 'rejected'
  ) => {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await reviewAdminEvidence(item.id, status, notes[item.id]?.trim() || undefined);
      // The artifact has left the queue, so it is taken out of the list here
      // rather than waiting for the next load.
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice(
        status === 'verified'
          ? t('The evidence was marked as verified.')
          : t('The evidence was rejected.')
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('The decision could not be recorded.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">{t('Evidence review')}</h2>
            <p className="mt-1 max-w-2xl text-xs text-[var(--text-secondary)]">
              {t(
                'An artifact counts as proven only once an administrator has checked it. The oldest artifact is shown first.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t('Refresh')}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-3 rounded-xl border border-[var(--color-success)]/20 bg-[var(--color-success)]/10 p-3 text-xs text-[var(--color-success-strong)]">
            {notice}
          </div>
        )}
      </div>

      {loading ? (
        <div className={`${CARD} flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-secondary)]`}>
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading the review queue…')}
        </div>
      ) : items.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-xs text-[var(--text-secondary)]`}>
          <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-[var(--color-success-strong)]" />
          {t('Nothing is waiting for a review.')}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className={`${CARD} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</h3>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {item.ownerName ?? item.ownerUsername ?? t('Unknown candidate')}
                    {item.ownerTargetRole ? ` · ${item.ownerTargetRole}` : ''}
                    {item.dateAdded ? ` · ${item.dateAdded}` : ''}
                  </p>
                </div>
                {item.type && (
                  <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                    {item.type}
                  </span>
                )}
              </div>

              {item.description && (
                <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                  {item.description}
                </p>
              )}

              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-primary-text)] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {item.url}
                </a>
              )}

              {item.skillNames.length > 0 && (
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                  {t('Skills')}: {item.skillNames.join(', ')}
                </p>
              )}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={notes[item.id] ?? ''}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                  placeholder={t('A note for the candidate (optional)')}
                  className={FIELD}
                  aria-label={t('A note for the candidate (optional)')}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void decide(item, 'verified')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" /> {t('Verify')}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void decide(item, 'rejected')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-danger)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)] disabled:opacity-60"
                  >
                    <X className="h-3.5 w-3.5" /> {t('Reject')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
