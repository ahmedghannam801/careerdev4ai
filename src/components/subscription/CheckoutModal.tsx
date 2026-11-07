/**
 * Checkout & Payment Modal.
 * ------------------------------------------------------------------
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
 *
 * The screen is a consequence of one explicit state (`CheckoutState`, see
 * `src/components/payment/checkoutState.ts`) and never of a loose step
 * string, so the interface can never show one screen while the code
 * believes it is on another. The recipient account is never written here:
 * it is read from the checkout instructions the server sends.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  X,
  Check,
  Upload,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  createPaymentCheckout,
  submitPaymentEvidenceForm,
  type CheckoutResponse,
} from '../../lib/paymentApi';
import { validateCoupon } from '../../lib/creditsApi';
import { beginCardCheckout, fetchStripeBillingStatus } from '../../lib/stripeApi';
import type { PaymentMethod, PaymentStatus } from '../../../shared/payments';
import { formatEgpPrice } from '../../../shared/subscriptions';
import { backdropVariants, dialogVariants, MOTION_EASE } from '../../lib/motion';
import { CopyField } from '../payment/CopyField';
import { PaymentMethodCard } from '../payment/PaymentMethodCard';
import { PaymentSpinner } from '../payment/PaymentSpinner';
import { PaymentStateSteps } from '../payment/PaymentStateSteps';
import { PaymentStatusCard } from '../payment/PaymentStatusCard';
import {
  isMethodStep,
  mapPaymentStatus,
  type CheckoutState,
} from '../payment/checkoutState';
import {
  InstaPayMark,
  StripeMark,
  CardNetworkMarks,
  VodafoneCashMark,
} from '../payment/PaymentBrandMarks';

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

/** The variant set used for the transition between two checkout phases. */
const stepVariants = (reduced: boolean) => ({
  hidden: { opacity: 0, y: reduced ? 0 : 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: reduced ? 0.01 : 0.22, ease: MOTION_EASE.out },
  },
  exit: {
    opacity: 0,
    y: reduced ? 0 : -6,
    transition: { duration: reduced ? 0.01 : 0.16, ease: MOTION_EASE.out },
  },
});

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
  const reduced = useReducedMotion() ?? false;

  // The single source of truth for "where are we in the checkout".
  const [state, setState] = useState<CheckoutState>('idle');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [paymentRail, setPaymentRail] = useState<PaymentRail | null>(null);
  // Fail closed. The card rail is shown only after the server confirms both a
  // key and a webhook signing secret; a deployment that cannot activate a
  // payment must not offer to take one.
  const [cardAvailable, setCardAvailable] = useState(false);
  // Starts as "loading" so the method grid reserves the third column from
  // the first paint and never jumps when the Stripe status arrives.
  const [cardStatusLoading, setCardStatusLoading] = useState(true);

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
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [failureKind, setFailureKind] = useState<'submission' | 'server' | null>(null);

  // Evidence fields
  const [transactionReference, setTransactionReference] = useState('');
  const [senderPhoneOrHandle, setSenderPhoneOrHandle] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [provisionalGranted, setProvisionalGranted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // A ref, not a state: two clicks in the same tick must not both reach
  // the server, and a state update is not visible until the next render.
  const submittingRef = useRef(false);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setState('idle');
      setPaymentRail(null);
      setCouponCode('');
      setCouponDiscountPiasters(0);
      setCouponMessage(null);
      setApplyBirthdayReward(false);
      setCheckoutData(null);
      setError(null);
      setPaymentStatus(null);
      setFailureKind(null);
      setTransactionReference('');
      setSenderPhoneOrHandle('');
      setReceiptFile(null);
      setReceiptPreview(null);
      setProvisionalGranted(false);
      submittingRef.current = false;
    }
  }, [isOpen, planCode]);

  // The card option only exists when this deployment has a Stripe key. Asking
  // the authenticated status endpoint beats offering a button that always
  // answers 503.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCardStatusLoading(true);
    void fetchStripeBillingStatus()
      .then((status) => {
        if (cancelled) return;
        const ready = Boolean(status.configured && status.checkoutReady);
        setCardAvailable(ready);
        if (!ready) {
          setPaymentRail((rail) => (rail === 'card' ? null : rail));
          setState((current) => (current === 'method_selected' ? 'idle' : current));
        }
      })
      .catch(() => {
        // Fail closed: keep the card rail hidden and let the wallet rails work.
        setCardAvailable(false);
        setPaymentRail((rail) => (rail === 'card' ? null : rail));
        setState((current) => (current === 'method_selected' ? 'idle' : current));
      })
      .finally(() => {
        if (!cancelled) setCardStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Escape closes the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const isCard = paymentRail === 'card';
  const walletRail: PaymentMethod | null =
    paymentRail === 'vodafone_cash' || paymentRail === 'instapay' ? paymentRail : null;

  const originalAmountPiasters = billingCycle === 'annual' ? annualPiasters : monthlyPiasters;
  const currentFinalPiasters = Math.max(0, originalAmountPiasters - couponDiscountPiasters);

  const selectRail = useCallback((rail: PaymentRail) => {
    setPaymentRail(rail);
    setState((current) => (current === 'idle' ? 'method_selected' : current));
    if (rail === 'card') {
      // Application coupons and Stripe promotion codes are different systems;
      // carrying one over would silently quote a discount the card page
      // cannot honour.
      setCouponDiscountPiasters(0);
      setCouponMessage(null);
    }
  }, []);

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
        setCouponMessage({ type: 'error', text: res.reason || t('Invalid coupon') });
      }
    } catch (err: any) {
      setCouponMessage({ type: 'error', text: err.message || t('Validation failed') });
    } finally {
      setCouponLoading(false);
    }
  };

  const handleCreateCheckout = async () => {
    if (!paymentRail) return;

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

    if (!walletRail) return;

    setLoading(true);
    setError(null);
    try {
      const data = await createPaymentCheckout({
        planCode,
        billingCycle,
        paymentMethod: walletRail,
        couponCode: couponDiscountPiasters > 0 ? couponCode : undefined,
        applyBirthdayReward,
      });
      setCheckoutData(data);
      setPaymentStatus(data.paymentRequest.status);
      setState('instructions');
    } catch (err: any) {
      setError(err.message || t('Failed to initialize payment'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError(t('Receipt file size must be less than 5 MB'));
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
    if (submittingRef.current) return;
    if (!transactionReference.trim()) {
      setError(t('Transaction reference is required'));
      return;
    }
    if (!senderPhoneOrHandle.trim()) {
      setError(t('Sender phone or handle is required'));
      return;
    }
    if (!receiptFile) {
      setError(t('Please upload a screenshot or photo of your transfer receipt'));
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);
    setState('processing');

    try {
      const formData = new FormData();
      formData.append('paymentRequestId', checkoutData.paymentRequest.id);
      formData.append('transactionReference', transactionReference.trim());
      formData.append('senderPhoneOrHandle', senderPhoneOrHandle.trim());
      formData.append('receipt', receiptFile);

      const res = await submitPaymentEvidenceForm(formData);
      setProvisionalGranted(res.provisionalAccessGranted);
      setPaymentStatus(res.paymentRequest.status);
      setFailureKind(res.paymentRequest.status === 'rejected' || res.paymentRequest.status === 'refunded' ? 'server' : null);
      // The server decides what happened. A receipt that was uploaded is
      // evidence for a review, not proof that money arrived.
      setState(mapPaymentStatus(res.paymentRequest.status));
      await refreshSubscription();
      await refreshCredits();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setFailureKind('submission');
      setState('failed');
      setError(err.message || t('Failed to submit payment evidence'));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  /** Starts the checkout over from a failed or expired attempt. */
  const restartCheckout = () => {
    setState('idle');
    setPaymentRail(null);
    setCheckoutData(null);
    setError(null);
    setPaymentStatus(null);
    setFailureKind(null);
    setTransactionReference('');
    setSenderPhoneOrHandle('');
    setReceiptFile(null);
    setReceiptPreview(null);
    setProvisionalGranted(false);
  };

  const viewKey = isMethodStep(state)
    ? 'config'
    : state === 'instructions'
      ? 'instructions'
      : state === 'awaiting_submission' || state === 'processing'
        ? 'evidence'
        : 'outcome';

  const renderConfig = () => (
    <div className="space-y-5">
      {/* Billing Cycle Picker */}
      <div>
        <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
          {t('Billing Cycle')}
        </span>
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-1">
          <button
            type="button"
            aria-pressed={billingCycle === 'monthly'}
            onClick={() => {
              setBillingCycle('monthly');
              setCouponDiscountPiasters(0);
            }}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200 ${
              billingCycle === 'monthly'
                ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('Monthly')} ({formatEgpPrice(monthlyPiasters)} / {t('month')})
          </button>
          <button
            type="button"
            aria-pressed={billingCycle === 'annual'}
            onClick={() => {
              setBillingCycle('annual');
              setCouponDiscountPiasters(0);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200 ${
              billingCycle === 'annual'
                ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>{t('Annual')}</span>
            <span className="rounded bg-[var(--color-success-surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-success-strong)]">
              -17%
            </span>
          </button>
        </div>
      </div>

      {/* Payment Method Selector */}
      <div>
        <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
          {t('Select Payment Method')}
        </span>
        <div
          role="group"
          aria-label={t('Select Payment Method')}
          className={`grid grid-cols-1 gap-2.5 ${
            cardAvailable || cardStatusLoading ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          }`}
        >
          <PaymentMethodCard
            mark={<VodafoneCashMark className="h-6 w-6" />}
            title={t('Vodafone Cash')}
            subtitle="فودافون كاش"
            selected={paymentRail === 'vodafone_cash'}
            onSelect={() => selectRail('vodafone_cash')}
          />

          <PaymentMethodCard
            mark={<InstaPayMark className="h-auto w-full max-w-32 shrink-0" />}
            title={t('InstaPay')}
            subtitle="إنستاباي مصر"
            selected={paymentRail === 'instapay'}
            onSelect={() => selectRail('instapay')}
          />

          {cardAvailable ? (
            <PaymentMethodCard
              mark={<StripeMark className="h-6 w-6" />}
              title={t('Card')}
              subtitle={<CardNetworkMarks className="h-3.5 w-auto" />}
              selected={isCard}
              onSelect={() => selectRail('card')}
            />
          ) : cardStatusLoading ? (
            <div
              aria-hidden="true"
              className="flex h-[74px] animate-pulse items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3"
            >
              <span className="h-10 w-10 shrink-0 rounded-xl bg-[var(--border-subtle)]" />
              <span className="h-3 w-24 rounded-full bg-[var(--border-subtle)]" />
            </div>
          ) : null}
        </div>
        {!paymentRail && (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            {t('Select a payment method to continue')}
          </p>
        )}
      </div>

      {/* Coupon Code Input (wallet rails only) */}
      {isCard ? (
        <div className="flex items-start gap-2 border-t border-[var(--border-subtle)] pt-3 text-[11px] leading-relaxed text-[var(--text-muted)]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
          <span>
            {t(
              'You will enter your card details and any promotion code on Stripe’s secure page. We never see or store your card number.'
            )}
          </span>
        </div>
      ) : (
        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-3">
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]">
              {t('Have a promo coupon?')}
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="E.g. EGYPT2026"
                aria-label={t('Have a promo coupon?')}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-sm uppercase tracking-wider text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={couponLoading || !couponCode.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--border-strong)] disabled:opacity-50"
              >
                {couponLoading ? <PaymentSpinner /> : null}
                {couponLoading ? t('Checking…') : t('Apply Coupon')}
              </button>
            </div>
            {couponMessage && (
              <p
                role="status"
                aria-live="polite"
                className={`mt-1.5 text-xs font-semibold ${
                  couponMessage.type === 'success'
                    ? 'text-[var(--color-success-strong)]'
                    : 'text-[var(--color-danger)]'
                }`}
              >
                {couponMessage.text}
              </p>
            )}
          </div>

          {/* Birthday reward */}
          <button
            type="button"
            role="switch"
            aria-checked={applyBirthdayReward}
            onClick={() => setApplyBirthdayReward((value) => !value)}
            className="flex w-full items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-start transition-colors duration-200 hover:border-[var(--border-strong)]"
          >
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                applyBirthdayReward ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-subtle)]'
              }`}
            >
              <motion.span
                className="absolute top-0.5 h-4 w-4 rounded-full bg-[var(--surface-main)] shadow-sm"
                style={{ insetInlineStart: 2 }}
                animate={{ x: applyBirthdayReward ? (isAr ? -16 : 16) : 0 }}
                transition={{ duration: reduced ? 0.01 : 0.2, ease: MOTION_EASE.out }}
              />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-[var(--text-primary)]">
                {t('Birthday Reward')}
              </span>
              <span className="block text-[11px] text-[var(--text-muted)]">
                {t('Claim 30% Birthday Discount')}
              </span>
            </span>
          </button>
        </div>
      )}

      {/* Pricing Summary Card */}
      <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4">
        <div className="flex justify-between text-sm text-[var(--text-secondary)]">
          <span>{t('Plan')}</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {isAr ? planNameAr : planNameEn}
          </span>
        </div>
        <div className="flex justify-between text-sm text-[var(--text-secondary)]">
          <span>{t('AI Credits included')}</span>
          <span className="font-bold text-[var(--accent-primary)]">
            {aiCredits} {t('Credits')} / {t('month')}
          </span>
        </div>
        {couponDiscountPiasters > 0 && (
          <div className="flex justify-between text-sm font-semibold text-[var(--color-success-strong)]">
            <span>{t('Discount')}</span>
            <span>-{formatEgpPrice(couponDiscountPiasters)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
          <span className="font-bold text-[var(--text-primary)]">{t('Total Amount')}</span>
          <span className="text-xl font-extrabold text-[var(--accent-primary)]">
            {formatEgpPrice(currentFinalPiasters)}
          </span>
        </div>
        {isCard && (
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            {t(
              'Charged in Egyptian pounds on Stripe. Your bank may add a cross-border or currency-conversion fee.'
            )}
          </p>
        )}
      </div>
    </div>
  );

  const renderInstructions = () => {
    if (!checkoutData) return null;
    const instructions = isAr
      ? checkoutData.instructions.instructionsAr
      : checkoutData.instructions.instructionsEn;

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--accent-primary)]/25 bg-[var(--accent-primary)]/10 p-4 text-center">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--accent-primary)]">
            {t('Amount to Transfer')}
          </div>
          <div className="mt-1 text-3xl font-extrabold text-[var(--text-primary)]">
            {checkoutData.instructions.amountFormatted}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {walletRail === 'vodafone_cash' ? t('Vodafone Cash') : t('InstaPay')}
          </div>
        </div>

        <CopyField
          label={walletRail === 'vodafone_cash' ? t('Wallet number') : t('InstaPay address')}
          value={checkoutData.instructions.recipientAccount}
          hint={t('Copy the account details and complete the transfer from your banking app.')}
          copyLabel={t('Copy')}
          copiedLabel={t('Copied!')}
        />

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-3 text-xs text-[var(--text-muted)]">
          <span>{t('Account holder')}: </span>
          <span className="font-semibold text-[var(--text-primary)]">
            {checkoutData.instructions.accountHolderName}
          </span>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-bold text-[var(--text-primary)]">
            {t('Transfer Instructions')}
          </h4>
          <ol className="list-inside list-decimal space-y-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            {instructions.map((inst, idx) => (
              <li key={idx} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] p-2">
                {inst}
              </li>
            ))}
          </ol>
        </div>
      </div>
    );
  };

  const renderEvidence = () => (
    <form onSubmit={handleSubmitEvidence} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--text-primary)]">
          {t('Transaction Reference ID')} *
        </label>
        <input
          type="text"
          required
          value={transactionReference}
          onChange={(e) => setTransactionReference(e.target.value)}
          placeholder={walletRail === 'instapay' ? 'E.g. IPN2611061234' : 'E.g. 1234567890'}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
        />
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          {t('The reference number shown in the confirmation message or the transfer receipt')}
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--text-primary)]">
          {t('Sender Phone Number / Handle')} *
        </label>
        <input
          type="text"
          required
          value={senderPhoneOrHandle}
          onChange={(e) => setSenderPhoneOrHandle(e.target.value)}
          placeholder={walletRail === 'instapay' ? 'username@instapay' : '010XXXXXXXX'}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
        />
      </div>

      {/* Receipt File Upload */}
      <div>
        <span className="mb-1 block text-xs font-semibold text-[var(--text-primary)]">
          {t('Upload Transfer Receipt / Screenshot')} *
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`w-full rounded-xl border-2 border-dashed p-4 text-center transition-colors duration-200 ${
            receiptFile
              ? 'border-[var(--color-success-strong)] bg-[var(--color-success-surface)]'
              : 'border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)]'
          }`}
        >
          {receiptPreview ? (
            <span className="flex items-center gap-3 text-start">
              <img
                src={receiptPreview}
                alt={t('Receipt preview')}
                className="h-16 w-16 rounded-lg border border-[var(--border-subtle)] object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">
                  {receiptFile?.name}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[var(--color-success-strong)]">
                  <Check className="h-3.5 w-3.5" />
                  <span>{t('Receipt image uploaded')}</span>
                </span>
              </span>
            </span>
          ) : (
            <span className="block space-y-1 py-4">
              <Upload className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
              <span className="block text-xs font-medium text-[var(--text-primary)]">
                {t('Drag and drop receipt here, or click to browse')}
              </span>
              <span className="block text-[10px] text-[var(--text-muted)]">
                {t('PNG, JPG up to 5 MB')}
              </span>
            </span>
          )}
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-xs text-[var(--text-muted)]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
        <span>
          {t(
            'Submitting the receipt unlocks provisional access for 24 hours while the team confirms the transfer.'
          )}
        </span>
      </div>

      <div className="pt-1">
        <button
          type="submit"
          disabled={loading || state === 'processing'}
          aria-busy={loading || state === 'processing'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] py-3 text-sm font-bold text-[var(--color-on-primary)] shadow-md transition-all duration-200 hover:bg-[var(--accent-secondary)] disabled:opacity-60"
        >
          {loading || state === 'processing' ? <PaymentSpinner /> : null}
          {loading || state === 'processing'
            ? t('Submitting your payment evidence…')
            : t('Confirm and Submit Evidence')}
        </button>
      </div>
    </form>
  );

  const renderOutcome = () => (
    <div className="space-y-4">
      <PaymentStatusCard
        state={state}
        status={paymentStatus}
        provisionalGranted={provisionalGranted}
        message={failureKind === 'submission' ? error : null}
        t={t}
      />
      {state === 'failed' && failureKind === 'submission' && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setFailureKind(null);
            setState('awaiting_submission');
          }}
          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] py-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--border-strong)]"
        >
          {t('Try again')}
        </button>
      )}
    </div>
  );

  const body =
    viewKey === 'config'
      ? renderConfig()
      : viewKey === 'instructions'
        ? renderInstructions()
        : viewKey === 'evidence'
          ? state === 'processing'
            ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex flex-col items-center justify-center gap-3 py-10 text-center"
                >
                  <PaymentSpinner className="h-8 w-8 text-[var(--accent-primary)]" />
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    {t('Submitting your payment evidence…')}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t('Please keep this window open for a moment.')}
                  </p>
                </div>
              )
            : renderEvidence()
          : renderOutcome();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            variants={backdropVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-modal-title"
            className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-2xl sm:rounded-2xl"
            variants={dialogVariants(reduced)}
            initial="hidden"
            animate="visible"
            exit="exit"
            dir={isAr ? 'rtl' : 'ltr'}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2">
                <Sparkles className="h-5 w-5 shrink-0 text-[var(--accent-primary)]" />
                <div className="min-w-0">
                  <h3
                    id="checkout-modal-title"
                    className="truncate text-base font-bold text-[var(--text-primary)] sm:text-lg"
                  >
                    {t('Complete Your Subscription')} — {isAr ? planNameAr : planNameEn}
                  </h3>
                  <p className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                    <ShieldCheck className="h-3 w-3" />
                    {t('Secure checkout')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('Close')}
                className="shrink-0 rounded-lg p-1 text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body Content */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {viewKey !== 'outcome' && <PaymentStateSteps state={state} t={t} />}

              {error && viewKey !== 'outcome' && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/25 bg-[var(--danger-surface)] p-3 text-sm text-[var(--color-danger)]"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={viewKey}
                  variants={stepVariants(reduced)}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  {body}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer Navigation Buttons */}
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-4 py-3 sm:px-6 sm:py-4">
              {isMethodStep(state) && (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors duration-200 hover:text-[var(--text-primary)]"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCheckout}
                    disabled={loading || !paymentRail}
                    aria-busy={loading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-bold text-[var(--color-on-primary)] shadow transition-all duration-200 hover:bg-[var(--accent-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? <PaymentSpinner /> : null}
                    <span>
                      {loading
                        ? t('Preparing checkout…')
                        : isCard
                          ? t('Continue to secure card payment')
                          : t('Next')}
                    </span>
                    {!loading && (isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />)}
                  </button>
                </>
              )}

              {state === 'instructions' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setState('method_selected');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors duration-200 hover:text-[var(--text-primary)]"
                  >
                    {isAr ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                    <span>{t('Back')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setState('awaiting_submission');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-bold text-[var(--color-on-primary)] shadow transition-all duration-200 hover:bg-[var(--accent-secondary)]"
                  >
                    <span>{t('I Have Transferred the Money')}</span>
                    {isAr ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                  </button>
                </>
              )}

              {state === 'awaiting_submission' && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setState('instructions');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors duration-200 hover:text-[var(--text-primary)]"
                >
                  {isAr ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                  <span>{t('Back')}</span>
                </button>
              )}

              {state === 'processing' && (
                <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <PaymentSpinner />
                  {t('Please wait…')}
                </span>
              )}

              {(state === 'pending_verification' || state === 'verified') && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl bg-[var(--accent-primary)] py-2.5 text-sm font-bold text-[var(--color-on-primary)] shadow transition-all duration-200 hover:bg-[var(--accent-secondary)]"
                >
                  {t('Done')}
                </button>
              )}

              {(state === 'failed' || state === 'expired') &&
                (failureKind === 'submission' ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] py-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--border-strong)]"
                  >
                    {t('Cancel')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={restartCheckout}
                    className="w-full rounded-xl bg-[var(--accent-primary)] py-2.5 text-sm font-bold text-[var(--color-on-primary)] shadow transition-all duration-200 hover:bg-[var(--accent-secondary)]"
                  >
                    {t('Start a new checkout')}
                  </button>
                ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
