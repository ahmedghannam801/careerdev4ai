/**
 * AdminPaymentsPanel — Super Admin Egyptian Payment Verification Center.
 * Handles review of Vodafone Cash & InstaPay transfer receipts, risk analysis,
 * and atomic subscription confirmation / rejection.
 */

import React, { useEffect, useState } from 'react';
import {
  Smartphone,
  CreditCard,
  RefreshCw,
  Search,
  Check,
  X,
  Eye,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  fetchAdminPayments,
  confirmAdminPayment,
  rejectAdminPayment,
  restoreAdminPayment,
  type AdminPaymentRow,
} from '../../lib/adminApi';
import { formatEgpPrice } from '../../../shared/subscriptions';
import { getBrowserSupabase } from '../../lib/supabase';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

export const AdminPaymentsPanel: React.FC = () => {
  const { t, settings } = useCareer();
  const isAr = settings.language === 'ar';

  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Receipt Modal preview
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadPayments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminPayments(statusFilter === 'all' ? undefined : statusFilter);
      setPayments(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, [statusFilter]);

  const handleConfirm = async (paymentId: string) => {
    if (!window.confirm('هل أنت متأكد من تأكيد استلام التحويل وتفعيل الاشتراك رسمياً؟')) return;
    setActionBusy(paymentId);
    setError(null);
    try {
      const outcome = await confirmAdminPayment(paymentId, 'Approved by Administrator');
      if (outcome.success) {
        await loadPayments();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to confirm payment');
    } finally {
      setActionBusy(null);
    }
  };

  const handleReject = async (paymentId: string) => {
    const reason = window.prompt('سبب الرفض (سيتم تسجيله وإرساله للمرشح):', 'الإيصال غير واضح أو لم يتم استلام المبلغ');
    if (!reason) return;
    setActionBusy(paymentId);
    setError(null);
    try {
      const outcome = await rejectAdminPayment(paymentId, reason);
      if (outcome.success) {
        await loadPayments();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reject payment');
    } finally {
      setActionBusy(null);
    }
  };

  const handleRestore = async (paymentId: string) => {
    if (!window.confirm('استعادة وتفعيل هذا الدفع المتأخر؟')) return;
    setActionBusy(paymentId);
    setError(null);
    try {
      const outcome = await restoreAdminPayment(paymentId, 'Restored late payment');
      if (outcome.success) {
        await loadPayments();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to restore payment');
    } finally {
      setActionBusy(null);
    }
  };

  const handleViewReceipt = async (storagePath: string | null) => {
    if (!storagePath) {
      alert('لا يوجد إيصال مرفق لهذه المعاملة');
      return;
    }
    try {
      const { data, error: signErr } = await getBrowserSupabase()
        .storage.from('payment-receipts')
        .createSignedUrl(storagePath, 3600);

      if (signErr || !data?.signedUrl) {
        alert('تعذر فتح صورة الإيصال أو انتهت صلاحية الرابط');
        return;
      }
      setReceiptUrl(data.signedUrl);
      setPreviewOpen(true);
    } catch (err) {
      console.error('Failed to create signed receipt URL:', err);
      alert('خطأ في استرجاع الإيصال');
    }
  };

  const filtered = payments.filter((p) => {
    const term = searchTerm.toLowerCase();
    const name = p.profiles?.full_name?.toLowerCase() ?? '';
    const username = p.profiles?.username?.toLowerCase() ?? '';
    const ref = p.transaction_reference?.toLowerCase() ?? '';
    const phone = p.sender_phone_or_handle?.toLowerCase() ?? '';
    return name.includes(term) || username.includes(term) || ref.includes(term) || phone.includes(term);
  });

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-[var(--color-primary)]" />
            <span>{t('Payment Requests')} (Vodafone Cash & InstaPay)</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            مراجعة وتأكيد عمليات الدفع وإيصالات التحويل بالجنيه المصري
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث بالرقم المرجعي أو الهاتف أو الاسم..."
              className="w-full ps-9 pe-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>
          <button
            type="button"
            onClick={loadPayments}
            disabled={loading}
            className="p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {['all', 'under_review', 'temporary_access', 'paid', 'rejected', 'pending'].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 rounded-xl font-semibold capitalize whitespace-nowrap transition-colors ${
              statusFilter === st
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'bg-[var(--surface-raised)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {st === 'all'
              ? 'الكل (All)'
              : st === 'under_review'
              ? 'قيد المراجعة'
              : st === 'temporary_access'
              ? 'وصول مؤقت (24h)'
              : st === 'paid'
              ? 'مؤكد ومدفوع'
              : st === 'rejected'
              ? 'مرفوض'
              : st}
          </button>
        ))}
      </div>

      {/* Payments Table */}
      <div className={`${CARD} overflow-hidden shadow-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              <tr>
                <th className="p-3 font-semibold text-start">المرشح / Candidate</th>
                <th className="p-3 font-semibold text-start">طريقة الدفع / Method</th>
                <th className="p-3 font-semibold text-start">المبلغ / Amount</th>
                <th className="p-3 font-semibold text-start">بيانات التحويل / Reference</th>
                <th className="p-3 font-semibold text-start">المخاطرة / Risk</th>
                <th className="p-3 font-semibold text-start">الحالة / Status</th>
                <th className="p-3 font-semibold text-start">الإيصال / Receipt</th>
                <th className="p-3 font-semibold text-end">الإجراءات / Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text-primary)]">
              {loading && payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-[var(--text-muted)]">
                    جاري تحميل طلبات الدفع...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-[var(--text-muted)]">
                    لا توجد طلبات دفع مسجلة مطابقة للبحث
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isBusy = actionBusy === p.id;
                  const isProvisional = p.status === 'temporary_access';
                  const isPaid = p.status === 'paid';
                  const isRejected = p.status === 'rejected';

                  return (
                    <tr key={p.id} className="hover:bg-[var(--surface-raised)]/50 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {p.profiles?.full_name || 'بدون اسم'}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] font-mono">
                          @{p.profiles?.username || p.profile_id.slice(0, 8)}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="inline-flex items-center gap-1.5 font-bold">
                          {p.payment_method === 'vodafone_cash' ? (
                            <span className="text-red-600 flex items-center gap-1">
                              <Smartphone className="w-3.5 h-3.5" /> فودافون كاش
                            </span>
                          ) : (
                            <span className="text-purple-600 flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5" /> إنستاباي
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase">
                          {p.subscription_plans?.code} ({p.billing_cycle})
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-extrabold text-sm text-[var(--text-primary)]">
                          {formatEgpPrice(p.amount_piasters)}
                        </div>
                        {p.discount_amount_piasters > 0 && (
                          <div className="text-[10px] text-emerald-600 font-medium">
                            خصم: {formatEgpPrice(p.discount_amount_piasters)}
                          </div>
                        )}
                      </td>

                      <td className="p-3 font-mono">
                        <div className="font-bold text-[var(--text-primary)]">
                          {p.transaction_reference || '—'}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">
                          {p.sender_phone_or_handle || '—'}
                        </div>
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            p.risk_score >= 50
                              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                              : p.risk_score >= 30
                              ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          }`}
                        >
                          {p.risk_score >= 40 && <AlertTriangle className="w-3 h-3" />}
                          <span>{p.risk_score} / 100</span>
                        </span>
                      </td>

                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                            isPaid
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : isProvisional
                              ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                              : isRejected
                              ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                              : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                          }`}
                        >
                          {isPaid ? (
                            <Check className="w-3 h-3" />
                          ) : isProvisional ? (
                            <Clock className="w-3 h-3" />
                          ) : isRejected ? (
                            <X className="w-3 h-3" />
                          ) : null}
                          <span>{p.status}</span>
                        </span>
                      </td>

                      <td className="p-3">
                        {p.receipt_storage_path ? (
                          <button
                            type="button"
                            onClick={() => handleViewReceipt(p.receipt_storage_path)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--color-primary)] transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{t('View Receipt')}</span>
                          </button>
                        ) : (
                          <span className="text-[var(--text-muted)] text-[11px]">بدون إيصال</span>
                        )}
                      </td>

                      <td className="p-3 text-end">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {!isPaid && !isRejected && (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleConfirm(p.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                                title="تأكيد التحويل وتفعيل الاشتراك"
                              >
                                <Check className="w-3 h-3" />
                                <span>تأكيد</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleReject(p.id)}
                                className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                                title="رفض الدفع"
                              >
                                <X className="w-3 h-3" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}
                          {isRejected && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRestore(p.id)}
                              className="px-2.5 py-1 rounded-lg bg-slate-700 text-white text-[11px] font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-1"
                              title="استعادة وتفعيل"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>استعادة</span>
                            </button>
                          )}
                          {isPaid && (
                            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5" /> تم التأكيد
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Image Preview Modal */}
      {previewOpen && receiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="relative max-w-2xl w-full bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              <span className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                <span>إيصال تحويل المرشح</span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--surface-main)] text-[var(--text-muted)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[75vh] overflow-auto flex items-center justify-center bg-black/10">
              <img
                src={receiptUrl}
                alt="Payment Receipt"
                className="max-w-full max-h-[70vh] object-contain rounded-xl shadow border border-[var(--border-subtle)]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

