/**
 * CreditMonitorPanel — the AI-credit economy and the CV activity.
 *
 * The Admin Center could show a subscription and a payment, but not what the
 * platform's own credits did. This panel reads the credit ledger, the daily
 * grant summary and the CV table, and shows what was handed out, what it was
 * spent on, what failed, and how much CV work the platform produced.
 *
 * The panel is read-only. It never grants, consumes or refunds a credit, and
 * the API re-checks the caller's permission on every request.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Coins,
  FileText,
  LayoutTemplate,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { AI_CREDIT_ACTIONS, CREDIT_OPERATIONS } from '../../../shared/credits';
import {
  fetchCreditFailures,
  fetchCreditLedger,
  fetchCreditSummary,
  fetchCvActivity,
  type CreditFailureRow,
  type CreditLedgerEntry,
  type CreditSummary,
  type CvActivity,
} from './creditMonitorApi';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 30, label: 'Last 30 days' },
];

function formatDay(value: string, isAr: boolean): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function formatMoment(value: string, isAr: boolean): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString(isAr ? 'ar-EG' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The candidate behind a credit row, with the shortest useful label. */
function candidateLabel(
  name: string | null,
  username: string | null,
  profileId: string
): string {
  if (name) return name;
  if (username) return `@${username}`;
  return profileId.slice(0, 8);
}

export const CreditMonitorPanel: React.FC = () => {
  const { t, settings } = useCareer();
  const isAr = settings.language === 'ar';

  const [days, setDays] = useState(14);
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [failures, setFailures] = useState<CreditFailureRow[]>([]);
  const [failuresAvailable, setFailuresAvailable] = useState(true);
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);
  const [cvActivity, setCvActivity] = useState<CvActivity | null>(null);
  const [actionFilter, setActionFilter] = useState('');
  const [operationFilter, setOperationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, failureData, ledgerData, cvData] = await Promise.all([
        fetchCreditSummary(days),
        fetchCreditFailures(50),
        fetchCreditLedger({
          limit: 100,
          action: actionFilter || undefined,
          operation: operationFilter || undefined,
        }),
        fetchCvActivity(days),
      ]);
      setSummary(summaryData);
      setFailures(failureData.failures);
      setFailuresAvailable(failureData.available);
      setLedger(ledgerData.entries);
      setCvActivity(cvData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to load the credit monitor.'));
    } finally {
      setLoading(false);
    }
  }, [days, actionFilter, operationFilter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionOptions = useMemo(() => Array.from(AI_CREDIT_ACTIONS), []);
  const operationOptions = useMemo(() => Array.from(CREDIT_OPERATIONS), []);

  const maxActionCredits = useMemo(
    () =>
      summary
        ? Math.max(1, ...summary.consumptionByAction.map((row) => row.credits))
        : 1,
    [summary]
  );

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header and controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
            <Coins className="h-5 w-5 text-[var(--accent-primary)]" />
            <span>{t('AI Credits & CV Activity')}</span>
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t(
              'What the platform granted, what the credits were spent on, and how much CV work they paid for.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-1">
            {WINDOWS.map((option) => (
              <button
                key={option.days}
                type="button"
                onClick={() => setDays(option.days)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  days === option.days
                    ? 'bg-[var(--accent-primary)] text-[var(--color-primary-text)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
            aria-label={t('Refresh')}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <div className={`${CARD} flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-secondary)]`}>
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading the credit monitor…')}
        </div>
      ) : null}

      {/* The state of today */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className={`${CARD} space-y-1 p-5`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t('Credits granted today')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {summary ? summary.today.creditsGranted.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {summary ? `${summary.today.accountsGranted} ${t('Accounts granted')}` : '—'}
          </div>
        </div>

        <div className={`${CARD} space-y-1 p-5`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t('Credits consumed today')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {summary ? summary.today.creditsConsumed.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {t('Consumed')}
          </div>
        </div>

        <div className={`${CARD} space-y-1 p-5`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t('Learning Hub consumption today')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {summary ? summary.today.learningHubConsumed.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {summary ? `${Math.round(summary.learningHub.shareOfConsumption * 100)}% ${t('of consumption')}` : '—'}
          </div>
        </div>

        <div className={`${CARD} space-y-1 p-5`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t('Accounts holding a balance')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {summary ? summary.totals.accountsWithBalance.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {summary?.totals.balanceScanTruncated ? t('Partial view of the ledger') : t('Balance above zero')}
          </div>
        </div>

        <div className={`${CARD} space-y-1 p-5`}>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t('Credits still unused today')}
          </div>
          <div className="text-3xl font-black text-[var(--color-success)]">
            {summary ? summary.today.creditsUnused.toLocaleString() : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {t('Unused')}
          </div>
        </div>
      </div>

      {/* The movement of every day of the window */}
      <div className={`${CARD} overflow-hidden shadow-sm`}>
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] p-4">
          <Activity className="h-4 w-4 text-[var(--accent-primary)]" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Daily credit movement')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[var(--surface-secondary)] text-[var(--text-muted)]">
              <tr>
                <th className="p-3 text-start font-semibold">{t('Day')}</th>
                <th className="p-3 text-start font-semibold">{t('Accounts granted')}</th>
                <th className="p-3 text-start font-semibold">{t('Granted')}</th>
                <th className="p-3 text-start font-semibold">{t('Consumed')}</th>
                <th className="p-3 text-start font-semibold">{t('Refunded')}</th>
                <th className="p-3 text-start font-semibold">{t('Unused')}</th>
                <th className="p-3 text-start font-semibold">{t('Learning Hub consumption')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
              {!summary || summary.daily.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-[var(--text-muted)]">
                    {t('No credit movement in this window.')}
                  </td>
                </tr>
              ) : (
                [...summary.daily].reverse().map((row) => (
                  <tr key={row.day} className="transition-colors hover:bg-[var(--surface-secondary)]/60">
                    <td className="p-3 font-medium">{formatDay(row.day, isAr)}</td>
                    <td className="p-3">{row.accountsGranted}</td>
                    <td className="p-3 font-mono font-bold text-[var(--color-success)]">
                      {row.creditsGranted}
                    </td>
                    <td className="p-3 font-mono font-bold">{row.creditsConsumed}</td>
                    <td className="p-3 font-mono text-[var(--color-warning)]">{row.creditsRefunded}</td>
                    <td className="p-3 font-mono text-[var(--text-secondary)]">{row.creditsUnused}</td>
                    <td className="p-3 font-mono">{row.learningHubConsumed}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* What the credits were spent on */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={`${CARD} space-y-4 p-5`}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Coins className="h-4 w-4 text-[var(--accent-primary)]" />
            <span>{t('Consumption by AI action')}</span>
          </h3>

          {!summary || summary.consumptionByAction.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{t('No credit consumption in this window.')}</p>
          ) : (
            <div className="space-y-2">
              {summary.consumptionByAction.map((row) => (
                <div key={row.action} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[var(--text-primary)]">{row.action}</span>
                    <span className="font-mono text-[var(--text-secondary)]">
                      {row.credits} · {row.operations}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent-primary)]"
                      style={{ width: `${Math.round((row.credits / maxActionCredits) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${CARD} space-y-4 p-5`}>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <LayoutTemplate className="h-4 w-4 text-[var(--accent-primary)]" />
            <span>{t('CV activity')}</span>
          </h3>

          {!cvActivity ? (
            <p className="text-xs text-[var(--text-muted)]">{t('No CV activity in this window.')}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('CVs created')}
                  </div>
                  <div className="mt-1 text-xl font-black text-[var(--text-primary)]">
                    {cvActivity.totals.cvsCreated}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('Free templates')}
                  </div>
                  <div className="mt-1 text-xl font-black text-[var(--text-primary)]">
                    {cvActivity.totals.freeTemplates}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('Premium templates')}
                  </div>
                  <div className="mt-1 text-xl font-black text-[var(--text-primary)]">
                    {cvActivity.totals.premiumTemplates}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  {t('Most used templates')}
                </div>
                {cvActivity.topTemplates.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">{t('No CV was created in this window.')}</p>
                ) : (
                  cvActivity.topTemplates.map((template) => (
                    <div
                      key={template.templateId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2"
                    >
                      <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {isAr && template.nameAr ? template.nameAr : template.nameEn ?? template.templateId}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-muted)]">
                        <span className="font-mono">{template.cvsCreated}</span>
                        <span className="rounded-full border border-[var(--border-subtle)] px-1.5 py-0.5">
                          {template.tier ?? '—'}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">
                  {t('CV credit consumption')}
                </div>
                {cvActivity.creditConsumption.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">{t('No CV credit consumption in this window.')}</p>
                ) : (
                  cvActivity.creditConsumption.map((row) => (
                    <div
                      key={row.action}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="font-medium text-[var(--text-primary)]">{row.action}</span>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {row.credits} · {row.operations}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* The operations that did not produce a result */}
      <div className={`${CARD} overflow-hidden shadow-sm`}>
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] p-4">
          <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            {t('Failed credit operations')}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[var(--surface-secondary)] text-[var(--text-muted)]">
              <tr>
                <th className="p-3 text-start font-semibold">{t('When')}</th>
                <th className="p-3 text-start font-semibold">{t('Candidate')}</th>
                <th className="p-3 text-start font-semibold">{t('Action')}</th>
                <th className="p-3 text-start font-semibold">{t('Credits attempted')}</th>
                <th className="p-3 text-start font-semibold">{t('Refunded')}</th>
                <th className="p-3 text-start font-semibold">{t('Reason')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
              {!failuresAvailable ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-[var(--text-muted)]">
                    {t('The failed operations table is not available on this deployment.')}
                  </td>
                </tr>
              ) : failures.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-[var(--text-muted)]">
                    {t('No failed credit operations.')}
                  </td>
                </tr>
              ) : (
                failures.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-[var(--surface-secondary)]/60">
                    <td className="p-3 text-[var(--text-muted)]">{formatMoment(row.createdAt, isAr)}</td>
                    <td className="p-3 font-medium">
                      {candidateLabel(row.candidateName, row.candidateUsername, row.profileId)}
                    </td>
                    <td className="p-3 font-mono text-[11px]">{row.aiActionType ?? '—'}</td>
                    <td className="p-3 font-mono">{row.creditsAttempted}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          row.refunded
                            ? 'border-[var(--color-success)]/40 bg-[var(--color-success)]/15 text-[var(--color-success)]'
                            : 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
                        }`}
                      >
                        {row.refunded ? t('Yes') : t('No')}
                      </span>
                    </td>
                    <td className="p-3 text-[var(--text-secondary)]">
                      {row.failureReason ?? '—'}
                      {row.httpStatus ? ` (${row.httpStatus})` : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* The ledger itself, for inspection */}
      <div className={`${CARD} overflow-hidden shadow-sm`}>
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <FileText className="h-4 w-4 text-[var(--accent-primary)]" />
            <span>{t('Credit ledger')}</span>
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              aria-label={t('All actions')}
            >
              <option value="">{t('All actions')}</option>
              {actionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={operationFilter}
              onChange={(event) => setOperationFilter(event.target.value)}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              aria-label={t('All operations')}
            >
              <option value="">{t('All operations')}</option>
              {operationOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[var(--surface-secondary)] text-[var(--text-muted)]">
              <tr>
                <th className="p-3 text-start font-semibold">{t('When')}</th>
                <th className="p-3 text-start font-semibold">{t('Candidate')}</th>
                <th className="p-3 text-start font-semibold">{t('Action')}</th>
                <th className="p-3 text-start font-semibold">{t('Operation')}</th>
                <th className="p-3 text-start font-semibold">{t('Amount')}</th>
                <th className="p-3 text-start font-semibold">{t('Balance')}</th>
                <th className="p-3 text-start font-semibold">{t('Description')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-[var(--text-muted)]">
                    {t('No ledger entries match the filters.')}
                  </td>
                </tr>
              ) : (
                ledger.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-[var(--surface-secondary)]/60">
                    <td className="p-3 text-[var(--text-muted)]">{formatMoment(entry.createdAt, isAr)}</td>
                    <td className="p-3 font-medium">
                      {candidateLabel(entry.candidateName, entry.candidateUsername, entry.profileId)}
                    </td>
                    <td className="p-3 font-mono text-[11px]">{entry.aiActionType ?? '—'}</td>
                    <td className="p-3">{entry.operation}</td>
                    <td
                      className={`p-3 font-mono font-bold ${
                        entry.amount > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
                      }`}
                    >
                      {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                    </td>
                    <td className="p-3 font-mono">{entry.runningBalance}</td>
                    <td className="p-3 text-[var(--text-secondary)]">{entry.description ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
