/**
 * AdminRevenuePanel — Financial Metrics & Manual Credit Grants.
 *
 * Aggregates the revenue this platform has collected: the card payments made
 * through XPay, plus the historical rows written by rails that no longer exist
 * (the manual wallets and the previous card provider). History is kept and
 * counted; no new payment can be made through those rails, and the labels in
 * the per-method breakdown name the method a past payment actually used.
 * payments, and the card figures are read from the webhook-written mirror;
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
  History,
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

  // The live gateway, and the two historical rails. The names say which is
  // which, because this panel must not read as an offer to pay by any of them.
  const xpayRevenue = metrics?.xpay;
  const xpayPurchases = xpayRevenue?.recentPurchases ?? [];
  const vfCashPiasters = metrics?.breakdownByMethodPiasters?.['vodafone_cash'] ?? 0;
  const instaPayPiasters = metrics?.breakdownByMethodPiasters?.['instapay'] ?? 0;
  const legacyCardPiasters = metrics?.breakdownByMethodPiasters?.['stripe'] ?? 0;
  const legacyCardRevenue = metrics?.legacyCards;
  const legacyCardInvoices = legacyCardRevenue?.recentInvoices ?? [];
  const legacyCardRefunds = legacyCardRevenue?.recentRefunds ?? [];
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
            إحصائيات الإيرادات المحصلة بالجنيه المصري (تحويلات المحافظ اليدوية السابقة، والبطاقات)، مع استبعاد وضع الاختبار من الإيرادات الفعلية.
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

      {/* Method + source breakdown.
          *
          * XPay is the only gateway, so it is the first and largest block. The
          * rails below it were switched off; the money they took is still part
          * of the platform's past, so it is counted — under a heading that says
          * it can no longer be chosen. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`${CARD} p-5 space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[var(--color-success-strong)]" />
              <span>{t('Revenue by payment method')}</span>
            </h3>
            <span className="rounded-full bg-[var(--color-success-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-success-strong)]">
              XPay
            </span>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--color-success-strong)]/25 bg-[var(--surface-raised)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CreditCard className="w-4 h-4 shrink-0 text-[var(--color-success-strong)]" aria-hidden="true" />
                  <span className="truncate text-xs font-bold text-[var(--text-primary)]">
                    {t('XPay (cards, Apple Pay, Fawry, ValU)')}
                  </span>
                </div>
                <span className="font-mono font-extrabold text-sm text-[var(--text-primary)]">
                  {formatEgpPrice(xpayRevenue?.grossPiasters ?? 0)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                <span>
                  {xpayRevenue?.purchaseCount ?? 0} {t('paid purchases')}
                </span>
                {(xpayRevenue?.creditPacksSold ?? 0) > 0 && (
                  <span>
                    {xpayRevenue?.creditPacksSold} {t('credit packs sold')}
                  </span>
                )}
                {(xpayRevenue?.pendingCount ?? 0) > 0 && (
                  <span>
                    {xpayRevenue?.pendingCount} {t('pending')}
                  </span>
                )}
                {xpayRevenue?.available === false && (
                  <span className="font-semibold text-[var(--color-warning)]">
                    {t('XPay figures are unavailable on this deployment.')}
                  </span>
                )}
              </div>
            </div>

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

          <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <History className="w-3 h-3" aria-hidden="true" />
              <span>{t('Collected before XPay (no longer accepted)')}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface-raised)] px-3 py-2">
              <span className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                <Smartphone className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                {t('Wallet transfers (closed)')}
              </span>
              <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                {formatEgpPrice(vfCashPiasters + instaPayPiasters)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[var(--surface-raised)] px-3 py-2">
              <span className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                <CreditCard className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                {t('Card (previous gateway)')}
              </span>
              <span className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                {formatEgpPrice(legacyCardPiasters)}
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

      {/* What XPay collected, newest first. This is the only payment list that
          can grow from here on: it is written by the signed webhook when the
          provider confirms the money. */}
      <div className={`${CARD} p-5 space-y-4`} data-admin-xpay-purchases>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[var(--color-success-strong)]" />
            <span>{t('Recent payments through XPay')}</span>
          </h3>
          <div className="text-[11px] text-[var(--text-muted)] font-semibold">
            {xpayRevenue
              ? `${xpayRevenue.purchaseCount} ${t('paid purchases')} · ${formatEgpPrice(xpayRevenue.grossPiasters)}`
              : '—'}
          </div>
        </div>

        {xpayPurchases.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {xpayRevenue?.available === false
              ? t('XPay purchases could not be read on this deployment.')
              : t('No payment has been completed through XPay yet.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {xpayPurchases.map((purchase) => (
              <li
                key={purchase.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs font-bold text-[var(--text-primary)]">
                    {purchase.sessionId ?? purchase.id}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <span>{formatDate(purchase.paidAt, isAr)}</span>
                    <span>·</span>
                    <span>{purchase.status}</span>
                    {purchase.planCode && (
                      <>
                        <span>·</span>
                        <span className="font-mono">{purchase.planCode}</span>
                      </>
                    )}
                    {purchase.purchaseKind === 'credit_pack' && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {purchase.credits ?? 0} {t('Tokens')}
                      </span>
                    )}
                    {purchase.billingCycle && (
                      <>
                        <span>·</span>
                        <span>{purchase.billingCycle === 'annual' ? t('Annual') : t('Monthly')}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-xs font-extrabold text-[var(--text-primary)]">
                  {formatEgpPrice(purchase.amountPiasters)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Card invoices and refunds, kept as history */}
      <div className={`${CARD} p-5 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-600" />
            <span>{t('Card invoices (previous gateway)')}</span>
            {legacyCardRevenue?.testMode && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 text-[10px] font-extrabold uppercase tracking-wider">
                {t('Test mode')}
              </span>
            )}
          </h3>
          <div className="text-[11px] text-[var(--text-muted)] font-semibold flex flex-wrap items-center gap-2">
            <span>
              {legacyCardRevenue
                ? `${legacyCardRevenue.paidInvoiceCount} ${t('paid invoices')} · ${formatEgpPrice(
                    legacyCardRevenue.paidGrossPiasters
                  )}`
                : '—'}
            </span>
            {legacyCardRevenue && legacyCardRevenue.refundedPiasters > 0 && (
              <span className="text-amber-600">
                −{formatEgpPrice(legacyCardRevenue.refundedPiasters)} {t('refunded')}
              </span>
            )}
          </div>
        </div>

        {legacyCardRevenue && (
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
              {t('Subscriptions')}: <strong>{formatEgpPrice(legacyCardRevenue.subscriptionRevenuePiasters)}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)]">
              {t('Credit packs')}: <strong>{formatEgpPrice(legacyCardRevenue.packRevenuePiasters)}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700">
              {t('Pending')}: <strong>{legacyCardRevenue.pendingInvoiceCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600">
              {t('Failed')}: <strong>{legacyCardRevenue.failedInvoiceCount}</strong>
            </span>
            {legacyCardRevenue.disputeCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t('Disputes')}: <strong>{legacyCardRevenue.disputeCount}</strong> ({formatEgpPrice(legacyCardRevenue.disputedPiasters)})
              </span>
            )}
          </div>
        )}

        {legacyCardRevenue && legacyCardRevenue.testInvoiceCount > 0 && (
          <p className="text-[11px] text-amber-600 font-medium">
            {legacyCardRevenue.testInvoiceCount} {t('test-mode invoices are excluded from revenue')}
          </p>
        )}

        {legacyCardRevenue && !legacyCardRevenue.available ? (
          <p className="text-xs text-amber-600">
            {t('No card invoice history is available on this deployment.')}
          </p>
        ) : legacyCardInvoices.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t('No card invoices yet. Test-mode invoices are listed here but excluded from revenue.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {legacyCardInvoices.map((invoice) => (
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

        {legacyCardRefunds.length > 0 && (
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
              <span>{t('Recent card refunds')}</span>
            </h4>
            <ul className="space-y-1.5">
              {legacyCardRefunds.map((refund) => (
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
            <span>{t('Manual transfers (historical, no longer accepted)')}</span>
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
          <p className="text-xs text-[var(--text-muted)]">{t('No manual transfers in this period.')}</p>
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
                    <span>
                      {transaction.method === 'instapay'
                        ? t('Bank transfer (closed)')
                        : t('Wallet transfer (closed)')}
                    </span>
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
