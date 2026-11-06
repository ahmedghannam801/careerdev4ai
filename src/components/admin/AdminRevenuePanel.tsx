/**
 * AdminRevenuePanel — Financial Metrics & Manual Credit Grants.
 * Aggregates verified Egyptian revenue from Vodafone Cash and InstaPay,
 * displays plan breakdown, and provides an audited administrative credit grant tool.
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
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  fetchAdminRevenue,
  grantAdminCredits,
  type AdminRevenueMetrics,
} from '../../lib/adminApi';
import { formatEgpPrice } from '../../../shared/subscriptions';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

export const AdminRevenuePanel: React.FC = () => {
  const { t, settings } = useCareer();
  const isAr = settings.language === 'ar';

  const [metrics, setMetrics] = useState<AdminRevenueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual grant state
  const [grantProfileId, setGrantProfileId] = useState('');
  const [grantAmount, setGrantAmount] = useState<number>(10);
  const [grantReason, setGrantReason] = useState('');
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantNotice, setGrantNotice] = useState<string | null>(null);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminRevenue();
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

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[var(--color-primary)]" />
            <span>{t('Revenue & Finance')}</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            إحصائيات الإيرادات المحصلة بالجنيه المصري وأدوات منح الرصيد
          </p>
        </div>

        <button
          type="button"
          onClick={loadMetrics}
          disabled={loading}
          className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={`${CARD} p-5 space-y-1`}>
          <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {t('Total Collected Revenue')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {metrics ? formatEgpPrice(metrics.totalCollectedPiasters) : '—'}
          </div>
          <div className="text-[11px] text-emerald-600 font-bold">
            مؤكد ومحصل بالكامل في الحسابات
          </div>
        </div>

        <div className={`${CARD} p-5 space-y-1`}>
          <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            {t('Transactions')}
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {metrics?.transactionCount ?? 0}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">عملية دفع ناجحة ومفعلة</div>
        </div>

        <div className={`${CARD} p-5 space-y-1`}>
          <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            متوسط قيمة المعاملة
          </div>
          <div className="text-3xl font-black text-[var(--text-primary)]">
            {metrics && metrics.transactionCount > 0
              ? formatEgpPrice(Math.round(metrics.totalCollectedPiasters / metrics.transactionCount))
              : '0 EGP'}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">لكل معاملة اشتراك أو شحن</div>
        </div>
      </div>

      {/* Method Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`${CARD} p-5 space-y-4`}>
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-red-600" />
            <span>الإيرادات حسب طريقة الدفع</span>
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
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-bold text-[var(--text-primary)]">InstaPay</span>
              </div>
              <span className="font-mono font-extrabold text-sm text-[var(--text-primary)]">
                {formatEgpPrice(instaPayPiasters)}
              </span>
            </div>
          </div>
        </div>

        {/* Manual Credit Grant Tool */}
        <div className={`${CARD} p-5 space-y-4`}>
          <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t('Manual Credit Grant')}</span>
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
                  الكمية (Credits) *
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
              <span>{grantBusy ? 'جاري المنح...' : t('Grant Credits')}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
