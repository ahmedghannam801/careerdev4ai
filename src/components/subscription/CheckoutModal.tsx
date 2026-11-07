/**
 * Checkout & Payment Modal.
 *
 * Two kinds of rail share one modal:
 *
 *   * the Egyptian wallet rails (Vodafone Cash & InstaPay), which are a
 *     multi-step manual flow — amount, recipient, transfer, receipt upload;
 *   * Stripe-hosted card checkout, which leaves the application entirely.
 *
 * The manual flow keeps its promo-coupon and provisional-access behaviour
 * untouched. A card payment deliberately skips all of it: the coupon rules
 * live in this database while Stripe has its own promotion codes, and card
 * access is granted by the signed webhook, not by a reviewer.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Copy,
  Upload,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Clock,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  CreditCard,
  Landmark,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  createPaymentCheckout,
  submitPaymentEvidenceForm,
  type CheckoutResponse,
} from '../../lib/paymentApi';
import { validateCoupon } from '../../lib/creditsApi';
import { beginCardCheckout, fetchStripeBillingStatus } from '../../lib/stripeApi';
import type { PaymentMethod } from '../../../shared/payments';
import { formatEgpPrice } from '../../../shared/subscriptions';

/** A payment rail is either one of the wallet rails or a card. */
type PaymentRail = PaymentMethod | 'card';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  planCode: string;
  planNameEn: string;
  planNameAr: string;
  monthlyPiasters: number;
  annualPiasters: number;
  aiCredits: number;
  onSuccess?: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  planCode,
  planNameEn,
  planNameAr,
  monthlyPiasters,
  annualPiasters,
  aiCredits,
  onSuccess,
}) => {
  const { t, settings, refreshSubscription, refreshCredits } = useCareer();
  const isAr = settings.language === 'ar';

  const [step, setStep] = useState<'config' | 'instructions' | 'evidence' | 'success'>('config');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [paymentRail, setPaymentRail] = useState<PaymentRail>('vodafone_cash');
  // Fail closed. The card rail is shown only after the server confirms both a
  // key and a webhook signing secret; a deployment that cannot activate a
  // payment must not offer to take one.
  const [cardAvailable, setCardAvailable] = useState(false);

  // Coupons & Promo
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponDiscountPiasters, setCouponDiscountPiasters] = useState(0);
  const [couponMessage, setCouponMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Birthday reward
  const [applyBirthdayReward, setApplyBirthdayReward] = useState(false);

  // Checkout response & evidence
  const [checkoutData, setCheckoutData] = useState<CheckoutResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Evidence fields
  const [transactionReference, setTransactionReference] = useState('');
  const [senderPhoneOrHandle, setSenderPhoneOrHandle] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [provisionalGranted, setProvisionalGranted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setStep('config');
      setPaymentRail('vodafone_cash');
      setCouponCode('');
      setCouponDiscountPiasters(0);
      setCouponMessage(null);
      setApplyBirthdayReward(false);
      setCheckoutData(null);
      setError(null);
      setTransactionReference('');
      setSenderPhoneOrHandle('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setProvisionalGranted(false);
    }
  }, [isOpen, planCode]);

  // The card option only exists when this deployment has a Stripe key. Asking
  // the authenticated status endpoint beats offering a button that always
  // answers 503.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void fetchStripeBillingStatus()
      .then((status) => {
        if (cancelled) return;
        const ready = Boolean(status.configured && status.checkoutReady);
        setCardAvailable(ready);
        if (!ready) {
          setPaymentRail((rail) => (rail === 'card' ? 'vodafone_cash' : rail));
        }
      })
      .catch(() => {
        // Fail closed: keep the card rail hidden and let the wallet rails work.
        setCardAvailable(false);
        setPaymentRail((rail) => (rail === 'card' ? 'vodafone_cash' : rail));
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isCard = paymentRail === 'card';

  const originalAmountPiasters = billingCycle === 'annual' ? annualPiasters : monthlyPiasters;
  const currentFinalPiasters = Math.max(0, originalAmountPiasters - couponDiscountPiasters);

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponMessage(null);
    try {
      const res = await validateCoupon(couponCode, planCode, originalAmountPiasters);
      if (res.valid) {
        setCouponDiscountPiasters(res.discountAmountPiasters);
        setCouponMessage({
          type: 'success',
          text: `${t('Coupon applied successfully!')} (-${formatEgpPrice(res.discountAmountPiasters)})`,
        });
      } else {
        setCouponDiscountPiasters(0);
        setCouponMessage({ type: 'error', text: res.reason || 'Invalid coupon' });
      }
    } catch (err: any) {
      setCouponMessage({ type: 'error', text: err.message || 'Validation failed' });
    } finally {
      setCouponLoading(false);
    }
  };

  const handleCreateCheckout = async () => {
    if (paymentRail === 'card') {
      setLoading(true);
      setError(null);
      try {
        // The browser leaves this document for Stripe's hosted page. The
        // session is created server-side, so the secret key never reaches
        // the client and no card field is ever rendered here.
        await beginCardCheckout({ planCode, billingCycle });
      } catch (err: any) {
        setError(
          err?.code === 'STRIPE_NOT_CONFIGURED'
            ? t('Card payments are not available right now. Please choose Vodafone Cash or InstaPay.')
            : err?.message || t('Failed to start card checkout')
        );
      } finally {
        // In a Capacitor build the system browser returns control here; on
        // the web the document is already navigating away.
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await createPaymentCheckout({
        planCode,
        billingCycle,
        paymentMethod: paymentRail,
        couponCode: couponDiscountPiasters > 0 ? couponCode : undefined,
        applyBirthdayReward,
      });
      setCheckoutData(data);
      setStep('instructions');
    } catch (err: any) {
      setError(err.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Receipt file size must be less than 5 MB');
        return;
      }
      setReceiptFile(file);
      setError(null);
      const reader = new FileReader();
      reader.onload = () => setReceiptPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutData) return;
    if (!transactionReference.trim()) {
      setError('Transaction reference is required');
      return;
    }
    if (!senderPhoneOrHandle.trim()) {
      setError('Sender phone or handle is required');
      return;
    }
    if (!receiptFile) {
      setError('Please upload a screenshot or photo of your transfer receipt');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('paymentRequestId', checkoutData.paymentRequest.id);
      formData.append('transactionReference', transactionReference.trim());
      formData.append('senderPhoneOrHandle', senderPhoneOrHandle.trim());
      formData.append('receipt', receiptFile);

      const res = await submitPaymentEvidenceForm(formData);
      setProvisionalGranted(res.provisionalAccessGranted);
      setStep('success');
      await refreshSubscription();
      await refreshCredits();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to submit payment evidence');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedAccount(true);
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div
        className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-raised">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-lg text-foreground">
              {t('Complete Your Subscription')} — {isAr ? planNameAr : planNameEn}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: CONFIGURATION */}
          {step === 'config' && (
            <div className="space-y-5">
              {/* Billing Cycle Picker */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  {t('Billing Cycle')}
                </label>
                <div className="grid grid-cols-2 gap-3 p-1 rounded-xl bg-surface-raised border border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setBillingCycle('monthly');
                      setCouponDiscountPiasters(0);
                    }}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      billingCycle === 'monthly'
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {t('Monthly')} ({formatEgpPrice(monthlyPiasters)} / {t('month')})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillingCycle('annual');
                      setCouponDiscountPiasters(0);
                    }}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                      billingCycle === 'annual'
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <span>{t('Annual')}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500 text-white font-bold">
                      -17%
                    </span>
                  </button>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  {t('Select Payment Method')}
                </label>
                <div
                  className={`grid grid-cols-1 gap-2.5 ${
                    cardAvailable ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPaymentRail('vodafone_cash')}
                    className={`p-3 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                      paymentRail === 'vodafone_cash'
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border bg-surface hover:border-muted'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-red-600/10 text-red-600 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground">
                        {t('Vodafone Cash')}
                      </div>
                      <div className="text-[11px] text-muted truncate">فودافون كاش</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentRail('instapay')}
                    className={`p-3 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                      paymentRail === 'instapay'
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-border bg-surface hover:border-muted'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-purple-600/10 text-purple-600 flex items-center justify-center shrink-0">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-foreground">
                        {t('InstaPay')}
                      </div>
                      <div className="text-[11px] text-muted truncate">إنستاباي مصر</div>
                    </div>
                  </button>

                  {cardAvailable && (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentRail('card');
                        // Application coupons and Stripe promotion codes are
                        // different systems; carrying one over would silently
                        // quote a discount the card page cannot honour.
                        setCouponDiscountPiasters(0);
                        setCouponMessage(null);
                      }}
                      className={`p-3 rounded-xl border text-start flex items-center gap-2.5 transition-all ${
                        paymentRail === 'card'
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border bg-surface hover:border-muted'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-foreground">
                          {isAr ? 'بطاقة بنكية' : t('Card')}
                        </div>
                        <div className="text-[11px] text-muted truncate">Visa / Mastercard</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Coupon Code Input (wallet rails only) */}
              {isCard ? (
                <div className="pt-2 border-t border-border flex items-start gap-2 text-[11px] text-muted leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    {t(
                      'You will enter your card details and any promotion code on Stripe’s secure page. We never see or store your card number.'
                    )}
                  </span>
                </div>
              ) : (
                <div className="pt-2 border-t border-border">
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    {t('Have a promo coupon?')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      placeholder="E.g. EGYPT2026"
                      className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary uppercase tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponCode.trim()}
                      className="px-4 py-2 rounded-lg bg-surface-raised border border-border text-sm font-medium text-foreground hover:bg-border/60 disabled:opacity-50 transition-colors"
                    >
                      {couponLoading ? '...' : t('Apply Coupon')}
                    </button>
                  </div>
                  {couponMessage && (
                    <p
                      className={`text-xs mt-1.5 font-medium ${
                        couponMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      {couponMessage.text}
                    </p>
                  )}
                </div>
              )}

              {/* Pricing Summary Card */}
              <div className="p-4 rounded-xl bg-surface-raised border border-border space-y-2">
                <div className="flex justify-between text-sm text-muted">
                  <span>{t('Plan')}</span>
                  <span className="font-semibold text-foreground">{isAr ? planNameAr : planNameEn}</span>
                </div>
                <div className="flex justify-between text-sm text-muted">
                  <span>{t('AI Credits included')}</span>
                  <span className="font-bold text-primary">{aiCredits} {t('Credits')} / {t('month')}</span>
                </div>
                {couponDiscountPiasters > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 font-medium">
                    <span>{t('Discount')}</span>
                    <span>-{formatEgpPrice(couponDiscountPiasters)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-border flex justify-between items-center">
                  <span className="font-bold text-foreground">{t('Total Amount')}</span>
                  <span className="text-xl font-extrabold text-primary">
                    {formatEgpPrice(currentFinalPiasters)}
                  </span>
                </div>
                {isCard && (
                  <p className="text-[11px] text-muted leading-relaxed">
                    {t(
                      'Charged in Egyptian pounds on Stripe. Your bank may add a cross-border or currency-conversion fee.'
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: INSTRUCTIONS */}
          {step === 'instructions' && checkoutData && (
            <div className="space-y-5 animate-fadeIn">
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-center">
                <div className="text-xs font-semibold text-primary uppercase tracking-wider">
                  {t('Amount to Transfer')}
                </div>
                <div className="text-3xl font-extrabold text-foreground mt-1">
                  {checkoutData.instructions.amountFormatted}
                </div>
                <div className="text-xs text-muted mt-1">
                  {paymentRail === 'vodafone_cash' ? t('Vodafone Cash') : t('InstaPay')}
                </div>
              </div>

              {/* Recipient Account Details with One-Click Copy */}
              <div className="p-4 rounded-xl bg-surface-raised border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted">
                      {paymentRail === 'vodafone_cash' ? 'Wallet Number / المحفظة' : 'InstaPay IPA / العنوان'}
                    </div>
                    <div className="text-lg font-mono font-bold text-foreground">
                      {checkoutData.instructions.recipientAccount}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(checkoutData.instructions.recipientAccount)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs font-medium text-foreground hover:bg-border/60 transition-colors"
                  >
                    {copiedAccount ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span>{t('Copied!')}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>{t('Copy')}</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-2 border-t border-border/60 text-xs text-muted">
                  <span>اسم المستلم / Holder Name: </span>
                  <span className="font-semibold text-foreground">
                    {checkoutData.instructions.accountHolderName}
                  </span>
                </div>
              </div>

              {/* Step by Step Instructions */}
              <div>
                <h4 className="text-sm font-bold text-foreground mb-2">{t('Transfer Instructions')}</h4>
                <ol className="space-y-2 list-decimal list-inside text-xs text-muted leading-relaxed">
                  {(isAr ? checkoutData.instructions.instructionsAr : checkoutData.instructions.instructionsEn).map(
                    (inst, idx) => (
                      <li key={idx} className="p-2 rounded-lg bg-surface border border-border/40">
                        {inst}
                      </li>
                    )
                  )}
                </ol>
              </div>
            </div>
          )}

          {/* STEP 3: SUBMIT EVIDENCE */}
          {step === 'evidence' && (
            <form onSubmit={handleSubmitEvidence} className="space-y-4 animate-fadeIn">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('Transaction Reference ID')} *
                </label>
                <input
                  type="text"
                  required
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  placeholder={paymentRail === 'vodafone_cash' ? 'E.g. 1234567890' : 'E.g. IPN2611061234'}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <p className="text-[11px] text-muted mt-1">
                  الرقم المرجعي الموضح في رسالة تأكيد العملية أو إيصال التحويل
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('Sender Phone Number / Handle')} *
                </label>
                <input
                  type="text"
                  required
                  value={senderPhoneOrHandle}
                  onChange={(e) => setSenderPhoneOrHandle(e.target.value)}
                  placeholder={paymentRail === 'vodafone_cash' ? '010XXXXXXXX' : 'username@instapay'}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              {/* Receipt File Upload */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  {t('Upload Transfer Receipt / Screenshot')} *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                    receiptFile
                      ? 'border-emerald-500 bg-emerald-500/5'
                      : 'border-border hover:border-primary/50 bg-surface'
                  }`}
                >
                  {receiptPreview ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={receiptPreview}
                        alt="Receipt preview"
                        className="w-16 h-16 object-cover rounded-lg border border-border"
                      />
                      <div className="text-start flex-1 min-w-0">
                        <div className="text-xs font-semibold text-foreground truncate">
                          {receiptFile?.name}
                        </div>
                        <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
                          <Check className="w-3.5 h-3.5" />
                          <span>{t('Receipt image uploaded')}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 space-y-1">
                      <Upload className="w-8 h-8 text-muted mx-auto" />
                      <div className="text-xs font-medium text-foreground">
                        {t('Drag and drop receipt here, or click to browse')}
                      </div>
                      <div className="text-[10px] text-muted">PNG, JPG up to 5 MB</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-raised border border-border flex items-start gap-2 text-xs text-muted">
                <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>
                  بمجرد إرسال الإيصال، يتم تفعيل الوصول المؤقت التلقائي لمدة ٢٤ ساعة لمتابعة نشاطك فوراً بينما يتم
                  التأكيد النهائي من فريق الإدارة.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-md hover:bg-primary-hover disabled:opacity-50 transition-all"
                >
                  {loading ? '...' : t('Confirm and Submit Evidence')}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 'success' && (
            <div className="text-center py-6 space-y-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="text-xl font-bold text-foreground">{t('Payment Proof Submitted!')}</h4>
              <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed">
                {provisionalGranted
                  ? t(
                      'Your payment proof has been submitted. A provisional 24-hour access has been unlocked.'
                    )
                  : t(
                      'Your payment evidence has been submitted and is currently being verified by an administrator.'
                    )}
              </p>
              {provisionalGranted && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-bold">
                  <Clock className="w-4 h-4" />
                  <span>{t('Provisional Access Active')} (24h)</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="px-6 py-4 border-t border-border bg-surface-raised flex items-center justify-between">
          {step === 'config' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-foreground transition-colors"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreateCheckout}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow hover:bg-primary-hover disabled:opacity-50 flex items-center gap-1.5 transition-all"
              >
                <span>
                  {loading
                    ? '...'
                    : isCard
                    ? t('Continue to secure card payment')
                    : t('Next')}
                </span>
                {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </>
          )}

          {step === 'instructions' && (
            <>
              <button
                type="button"
                onClick={() => setStep('config')}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
                <span>{t('Back')}</span>
              </button>
              <button
                type="button"
                onClick={() => setStep('evidence')}
                className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow hover:bg-primary-hover flex items-center gap-1.5 transition-all"
              >
                <span>{t('I Have Transferred the Money')}</span>
                {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </>
          )}

          {step === 'evidence' && (
            <button
              type="button"
              onClick={() => setStep('instructions')}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              <span>{t('Back')}</span>
            </button>
          )}

          {step === 'success' && (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold shadow hover:bg-primary-hover transition-all"
            >
              {t('Done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
