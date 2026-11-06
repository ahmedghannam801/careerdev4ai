/**
 * AdminSubscriptionsPanel — Super Admin Subscription Management.
 * Real-time inspection of active and past candidate subscriptions, plan tiers,
 * renewal statuses, and auto-renew control.
 */

import React, { useEffect, useState } from 'react';
import { CreditCard, RefreshCw, Search, CheckCircle2, XCircle } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  fetchAdminSubscriptions,
  type AdminSubscriptionRow,
} from '../../lib/adminApi';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

export const AdminSubscriptionsPanel: React.FC = () => {
  const { t, settings } = useCareer();
  const isAr = settings.language === 'ar';

  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const loadSubscriptions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminSubscriptions();
      setSubscriptions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptions();
  }, []);

  const filtered = subscriptions.filter((sub) => {
    const term = searchTerm.toLowerCase();
    const name = sub.profiles?.full_name?.toLowerCase() ?? '';
    const username = sub.profiles?.username?.toLowerCase() ?? '';
    const plan = sub.subscription_plans?.code?.toLowerCase() ?? '';
    return name.includes(term) || username.includes(term) || plan.includes(term);
  });

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[var(--color-primary)]" />
            <span>{t('Subscription Management')}</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            متابعة الاشتراكات النشطة والتجديدات وتفاصيل باقات المرشحين
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث بالاسم أو الباقة..."
              className="w-full ps-9 pe-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>
          <button
            type="button"
            onClick={loadSubscriptions}
            disabled={loading}
            className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Subscriptions Table */}
      <div className={`${CARD} overflow-hidden shadow-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              <tr>
                <th className="p-3 font-semibold text-start">المرشح / Candidate</th>
                <th className="p-3 font-semibold text-start">الباقة / Plan</th>
                <th className="p-3 font-semibold text-start">دورة الدفع / Cycle</th>
                <th className="p-3 font-semibold text-start">الحالة / Status</th>
                <th className="p-3 font-semibold text-start">بداية الفترة / Started</th>
                <th className="p-3 font-semibold text-start">تاريخ الانتهاء / Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
              {loading && subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-[var(--text-muted)]">
                    جاري تحميل بيانات الاشتراكات...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-xs text-[var(--text-muted)]">
                    لا توجد اشتراكات مسجلة مطابقة للبحث
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => {
                  const isActive = sub.status === 'active';
                  const planName = isAr
                    ? sub.subscription_plans?.name_ar ?? 'خطة'
                    : sub.subscription_plans?.name_en ?? 'Plan';

                  return (
                    <tr key={sub.id} className="hover:bg-[var(--surface-raised)]/50 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {sub.profiles?.full_name || 'بدون اسم'}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">
                          @{sub.profiles?.username || sub.profile_id.slice(0, 8)}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 font-bold text-[var(--color-primary)]">
                          {planName}
                        </span>
                        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-mono">
                          {sub.subscription_plans?.code}
                        </div>
                      </td>

                      <td className="p-3 capitalize font-medium">
                        {sub.billing_cycle === 'annual' ? (
                          <span className="text-emerald-600 font-bold">سنوي (Annual)</span>
                        ) : (
                          <span>شهري (Monthly)</span>
                        )}
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isActive
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : 'bg-slate-500/10 text-[var(--text-muted)] border border-slate-500/20'
                          }`}
                        >
                          {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          <span className="capitalize">{sub.status}</span>
                        </span>
                      </td>

                      <td className="p-3 text-[var(--text-muted)]">
                        {new Date(sub.current_period_starts_at).toLocaleDateString()}
                      </td>

                      <td className="p-3 font-medium">
                        {new Date(sub.current_period_ends_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
