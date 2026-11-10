/**
 * AdminRevenuePanel — Financial Metrics & Manual Credit Grants.
 *
 * Aggregates verified Egyptian revenue from Vodafone Cash, InstaPay and card
 * payments via Stripe. Card figures are read from the webhook-written mirror;
 * test-mode invoices are listed and labelled but are never added to revenue.
 * Refunds are subtracted once and shown separately, and offline transactions
 * keep the reference an admin needs to reconcile the wallet.
 */

import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  Smartphone,
  CreditCard,
  Sparkles,
  RefreshCw,
  Plus,
  Check,
  ExternalLink,
  Landmark,
  Calendar,
  RotateCcw,
  AlertTriangle,
  ReceiptText,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  fetchAdminRevenue,
  grantAdminCredits,
  type AdminRevenueMetrics,
} from '../../lib/adminApi';
import { formatEgpPrice } from '../../../shared/subscriptions';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

function formatDate(value: string | null, isAr: boolean): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const AdminRevenuePanel: React.FC = () => {
  const { t, settings } = useCareer();
  const isAr = settings.language === 'ar';

  const [metrics, setMetrics] = useState<AdminRevenueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Manual grant state
  const [grantProfileId, setGrantProfileId] = useState('');
  const [grantAmount, setGrantAmount] = useState<number>(10);
  const [grantReason, setGrantReason] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantNotice, setGrantNotice] = useState<string | null>(null);

  const loadMetrics = async (filter?: { from?: string; to?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminRevenue(filter);
      setMetrics(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load revenue metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMetrics();
  }, []);

  const applyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    void loadMetrics({ from: fromDate || undefined, to: toDate || undefined });
  };

  const clearFilter = () => {
    setFromDate('');
    setToDate('');
    void loadMetrics();
  };

  const handleGrantCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantProfileId.trim()) return;
    setGrantBusy(true);
    setGrantNotice(null);
    try {
      const res = await grantAdminCredits(
        grantProfileId.trim(),
        grantAmount,
        grantReason.trim() || 'Manual administrative bonus'
      );
      if (res.success) {
        setGrantNotice(`تم منح ${res.grantedCredits} نقطة بنجاح إلى حساب المرشح.`);
        setGrantProfileId('');
        setGrantReason('');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to grant credits');
    } finally {
      setGrantBusy(false);
    }
  };

  const vfCashPiasters = metrics?.breakdownByMethodPiasters?.['vodafone_cash'] ?? 0;
  const instaPayPiasters = metrics?.breakdownByMethodPiasters?.['instapay'] ?? 0;
  const stripePiasters = metrics?.breakdownByMethodPiasters?.['stripe'] ?? 0;
  const stripeRevenue = metrics?.stripe;
  const stripeInvoices = stripeRevenue?.recentInvoices ?? [];
  const stripeRefunds = stripeRevenue?.recentRefunds ?? [];
  const offline = metrics?.offline;
  const offlineTransactions = offline?.recentTransactions ?? [];
  const subscriptionRevenue = metrics?.breakdownBySourcePiasters?.['subscription'] ?? 0;
  const packRevenue = metrics?.breakdownBySourcePiasters?.['credit_pack'] ?? 0;
  const filterActive = Boolean(metrics?.dateRange?.from || metrics?.dateRange?.to);

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[var(--color-primary)]" />
            <span>{t('Revenue & Finance')}</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            إحصائيات الإيرادات المحصلة بالجنيه المصري (فودافون كاش، إنستاباي، والبطاقات عبر Stripe)، مع استبعاد وضع الاختبار من الإيرادات الفعلية.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadMetrics({ from: fromDate || undefined, to: toDate || undefined })}
          disabled={loading}
          className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label={t('Refresh')}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Date filter */}
      <form
        onSubmit={applyFilter}
        className={`${CARD} p-4 flex flex-col sm:flex-row sm:items-end gap-3`}
      >
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
            {t('From date')}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
            {t('To date')}
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>{t('Apply')}</span>
          </button>
          <button
            type="button"
            onClick={clearFilter}
            disabled={loading && !filterActive}
            className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--border-subtle)]/40 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('All time')}</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${CARD} p-5 space-y-1`}>
          <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {t('Net collected revenue')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {metrics ? formatEgpPrice(metrics.totalCollectedPiasters) : '—'}
          </div>
          <div className="text-[11px] text-emerald-600 font-bold">
            {t('After refunds')}
          </div>
        </div>

        <div className={`${CARD} p-5 space-y-1`}>
          <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {t('Gross collected')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {metrics ? formatEgpPrice(metrics.grossCollectedPiasters) : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {t('Before refunds')}
          </div>
        </div>

        <div className={`${CARD} p-5 space-y-1`}>
          <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {t('Refunds')}
          </div>
          <div className="text-3xl font-black text-amber-600">
            {metrics ? formatEgpPrice(metrics.refundedPiasters) : '—'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {metrics?.refundCount ?? 0} {t('refunds')}
          </div>
        </div>

        <div className={`${CARD} p-5 space-y-1`}>
          <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {t('Transactions')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {metrics?.transactionCount ?? 0}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {metrics?.pendingPaymentCount ?? 0} {t('pending')} · {metrics?.failedPaymentCount ?? 0} {t('failed')}
          </div>
        </div>
      </div>

      {/* Method + source breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`${CARD} p-5 space-y-4`}>
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-red-600" />
            <span>{t('Revenue by payment method')}</span>
          </h3>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-red-600" />
                <span className="text-xs font-bold text-[var(--text-primary)]">Vodafone Cash</span>
              </div>
              <span className="font-mono font-extrabold text-sm text-[var(--text-primary)]">
                {formatEgpPrice(vfCashPiasters)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-bold text-[var(--text-primary)]">InstaPay</span>
              </div>
              <span className="font-mono font-extrabold text-sm text-[var(--text-primary)]">
                {formatEgpPrice(instaPayPiasters)}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-[var(--text-primary)]">Card (Stripe)</span>
                {stripeRevenue?.testMode && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 text-[9px] font-extrabold uppercase">
                    {t('Test')}
                  </span>
                )}
              </div>
              <span className="font-mono font-extrabold text-sm text-[var(--text-primary)]">
                {formatEgpPrice(stripePiasters)}
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-muted)]">{t('Subscription revenue')}</span>
              <span className="font-mono font-bold text-[var(--text-primary)]">
                {formatEgpPrice(subscriptionRevenue)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-muted)]">{t('Credit pack revenue')}</span>
              <span className="font-mono font-bold text-[var(--text-primary)]">
                {formatEgpPrice(packRevenue)}
              </span>
            </div>
          </div>
        </div>

        {/* Manual Token Grant Tool */}
        <div className={`${CARD} p-5 space-y-4`}>
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t('Manual Token Grant')}</span>
          </h3>

          {grantNotice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 flex items-center gap-2 font-medium">
              <Check className="w-4 h-4" />
              <span>{grantNotice}</span>
            </div>
          )}

          <form onSubmit={handleGrantCredits} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                معرف المرشح (Profile UUID) *
              </label>
              <input
                type="text"
                required
                value={grantProfileId}
                onChange={(e) => setGrantProfileId(e.target.value)}
                placeholder="UUID: 00000000-0000-0000-0000-000000000000"
                className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {t('Amount (Tokens)')} *
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  required
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] font-bold focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  سبب المنح (Audit Note)
                </label>
                <input
                  type="text"
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  placeholder="مكافأة مسابقة، تعويض..."
                  className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={grantBusy}
              className="w-full py-2 rounded-xl bg-[var(--color-primary)] text-white text-xs font-bold hover:bg-[var(--color-primary-hover)] shadow-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{grantBusy ? 'جاري المنح...' : t('Grant Tokens')}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Stripe card invoices and refunds */}
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            <span>{t('Card invoices (Stripe)')}</span>
            {stripeRevenue?.testMode && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 text-[10px] font-extrabold uppercase tracking-wider">
                {t('Test mode')}
              </span>
            )}
          </h3>
          <div className="text-[11px] text-[var(--text-muted)] font-semibold flex flex-wrap items-center gap-2">
            <span>
              {stripeRevenue
                ? `${stripeRevenue.paidInvoiceCount} ${t('paid invoices')} · ${formatEgpPrice(
                    stripeRevenue.paidGrossPiasters
                  )}`
                : '—'}
            </span>
            {stripeRevenue && stripeRevenue.refundedPiasters > 0 && (
              <span className="text-amber-600">
                −{formatEgpPrice(stripeRevenue.refundedPiasters)} {t('refunded')}
              </span>
            )}
          </div>
        </div>

        {stripeRevenue && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
              {t('Subscriptions')}: <strong>{formatEgpPrice(stripeRevenue.subscriptionRevenuePiasters)}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
              {t('Credit packs')}: <strong>{formatEgpPrice(stripeRevenue.packRevenuePiasters)}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700">
              {t('Pending')}: <strong>{stripeRevenue.pendingInvoiceCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600">
              {t('Failed')}: <strong>{stripeRevenue.failedInvoiceCount}</strong>
            </span>
            {stripeRevenue.disputeCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t('Disputes')}: <strong>{stripeRevenue.disputeCount}</strong> ({formatEgpPrice(stripeRevenue.disputedPiasters)})
              </span>
            )}
          </div>
        )}

        {stripeRevenue && stripeRevenue.testInvoiceCount > 0 && (
          <p className="text-[11px] text-amber-600 font-medium">
            {stripeRevenue.testInvoiceCount} {t('test-mode invoices are excluded from revenue')}
          </p>
        )}

        {stripeRevenue && !stripeRevenue.available ? (
          <p className="text-xs text-amber-600">
            {t('Stripe invoice history is not available on this deployment.')}
          </p>
        ) : stripeInvoices.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t('No card invoices yet. Test-mode invoices are listed here but excluded from revenue.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {stripeInvoices.map((invoice) => (
              <li
                key={invoice.id}
                className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] font-mono truncate">
                    {invoice.number ?? invoice.id}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{formatDate(invoice.paidAt, isAr)}</span>
                    <span>·</span>
                    <span>{invoice.status ?? (invoice.paid ? 'paid' : 'open')}</span>
                    {invoice.planCode && (
                      <>
                        <span>·</span>
                        <span className="font-mono">{invoice.planCode}</span>
                      </>
                    )}
                    {invoice.purchaseKind === 'credit_pack' && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">
                        {t('Credit pack')}
                      </span>
                    )}
                    {!invoice.livemode && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 text-[10px] font-bold">
                        {t('Test')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-extrabold text-xs text-[var(--text-primary)]">
                    {formatEgpPrice(invoice.amountPaidPiasters)}
                  </span>
                  {invoice.hostedInvoiceUrl && (
                    <a
                      href={invoice.hostedInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      aria-label={t('Open invoice')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {stripeRefunds.length > 0 && (
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
              <span>{t('Recent card refunds')}</span>
            </h4>
            <ul className="space-y-1.5">
              {stripeRefunds.map((refund) => (
                <li key={refund.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-[var(--text-muted)] truncate">{refund.id}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[var(--text-muted)]">{refund.status ?? '—'}</span>
                    <span className="font-mono font-bold text-amber-600">
                      {formatEgpPrice(refund.amountPiasters)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Offline wallet transactions */}
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-emerald-600" />
            <span>{t('Wallet transactions (Vodafone Cash / InstaPay)')}</span>
          </h3>
          <div className="text-[11px] text-[var(--text-muted)] font-semibold">
            {offline
              ? `${offline.pendingCount} ${t('pending')} · ${offline.failedCount} ${t('failed')} · ${formatEgpPrice(
                  offline.refundedPiasters
                )} ${t('refunded')}`
              : '—'}
          </div>
        </div>

        {offlineTransactions.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">{t('No wallet transactions in this period.')}</p>
        ) : (
          <ul className="space-y-2">
            {offlineTransactions.map((transaction, index) => (
              <li
                key={`${transaction.reference ?? 'ref'}-${index}`}
                className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--text-primary)] font-mono truncate">
                    {transaction.reference || t('No reference')}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>{transaction.method === 'instapay' ? 'InstaPay' : 'Vodafone Cash'}</span>
                    <span>·</span>
                    <span>{formatDate(transaction.paidAt ?? transaction.createdAt, isAr)}</span>
                    <span>·</span>
                    <span>{transaction.status}</span>
                  </div>
                </div>
                <span className="font-mono font-extrabold text-xs text-[var(--text-primary)] shrink-0">
                  {formatEgpPrice(transaction.amountPiasters)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
