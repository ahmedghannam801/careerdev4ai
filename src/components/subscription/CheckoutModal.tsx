/**
 * Checkout & Payment Modal.
 *
 * One rail, and only one: XPay's hosted page. The candidate chooses a billing
 * cycle, optionally applies a coupon or the birthday discount, sees exactly
 * what will be charged, and is sent to XPay to pay by whichever methods the
 * merchant account has enabled — cards, Apple Pay, Fawry, ValU.
 *
 * Three rules shape this screen:
 *
 *   * The amount is the server's. A coupon is validated against the catalogue
 *     before it is shown, and the birthday discount is granted by the server
 *     only when today really is the candidate's birthday.
 *   * The methods are the account's. They are read from the server, which reads
 *     them from XPay; a method this merchant cannot charge is never drawn here.
 *   * Payment is never assumed. A Fawry reference completes checkout without
 *     paying, so the confirmation screen says "waiting" until the money lands.
 *
 * No card field is rendered and no secret key reaches the browser.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Cake,
  Check,
  Loader2,
  ShieldCheck,
  Tag,
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { validateCoupon } from '../../lib/creditsApi';
import { goToHostedPage, startXPayCheckout, type XPayStatus } from '../../lib/xpayApi';
import { fetchXPayStatus } from '../../lib/xpayApi';
import { resolvePaymentAvailability } from '../../lib/paymentAvailability';
import { formatEgpPrice } from '../../../shared/subscriptions';
import { backdropVariants, MOTION_EASE } from '../../lib/motion';

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

/** The label for a payment method XPay reports. */
const methodLabel = (method: string): string => {
  switch (method) {
    case 'card':
      return 'Visa / Mastercard';
    case 'apple_pay':
      return 'Apple Pay';
    case 'fawry':
      return 'Fawry';
    case 'valu':
      return 'ValU';
    default:
      return method;
  }
};

const methodNote = (method: string, t: (key: string) => string): string => {
  switch (method) {
    case 'fawry':
      // The one method whose money arrives after checkout ends.
      return t('Pay at any Fawry outlet or in the app. Your plan activates when the payment arrives.');
    case 'valu':
      return t('Split the payment into instalments with ValU.');
    case 'apple_pay':
      return t('Pay with a card saved in your Apple Wallet.');
    default:
      return t('Pay with your Visa or Mastercard, protected by 3-D Secure.');
  }
};

/** A code the server sent, said in the candidate's language. */
const failureMessage = (code: string | undefined, fallback: string, t: (key: string) => string): string => {
  switch (code) {
    case 'not_configured':
    case 'XPAY_NOT_CONFIGURED':
    case 'XPAY_AUTH_FAILED':
      return t('Card payment is not available right now. Nothing was charged.');
    case 'plan_already_active':
      return t('This plan is already active on your account.');
    case 'invalid_coupon':
      return fallback;
    case 'free_plan_not_sellable':
      return t('The free plan needs no payment.');
    default:
      return fallback;
  }
};

/** A stable key for one checkout attempt, so a retry reuses the same cart. */
const newIdempotencyKey = (): string => {
  const random = Math.random().toString(36).slice(2, 10);
  return `aionvia-${Date.now().toString(36)}-${random}`;
};

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  planCode,
  planNameEn,
  planNameAr,
  monthlyPiasters,
  annualPiasters,
  aiCredits,
}) => {
  const { t, settings } = useCareer();
  const isAr = settings.language === 'ar';
  const reduced = useReducedMotion() ?? false;

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [status, setStatus] = useState<XPayStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponDiscountPiasters, setCouponDiscountPiasters] = useState(0);
  const [couponMessage, setCouponMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [applyBirthdayReward, setApplyBirthdayReward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per attempt: a double click cannot open two carts.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // A pack is priced once; a plan has two cycles.
  const isCreditPack = planCode.startsWith('pack_');

  useEffect(() => {
    if (!isOpen) return;
    setBillingCycle('monthly');
    setCouponCode('');
    setCouponDiscountPiasters(0);
    setCouponMessage(null);
    setApplyBirthdayReward(false);
    setError(null);
    setIdempotencyKey(newIdempotencyKey());
  }, [isOpen, planCode]);

  // The methods and the readiness both come from the server, which asks XPay.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setStatusLoading(true);
    void fetchXPayStatus()
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
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

  const originalAmountPiasters = isCreditPack
    ? monthlyPiasters
    : billingCycle === 'annual'
      ? annualPiasters
      : monthlyPiasters;

  // A coupon and the birthday discount are two different discounts, and only
  // one of them can apply: two would be a price nobody agreed to.
  const birthdayEligible = applyBirthdayReward && !couponDiscountPiasters;
  const birthdayDiscountPiasters = birthdayEligible
    ? Math.floor((originalAmountPiasters * 30) / 100)
    : 0;
  const shownDiscountPiasters = couponDiscountPiasters || birthdayDiscountPiasters;
  const totalPiasters = Math.max(0, originalAmountPiasters - shownDiscountPiasters);

  // The same rules the pricing page uses, so the dialog cannot offer a payment
  // the page says is paused. `lib/paymentAvailability.ts` owns the decision.
  const availability = resolvePaymentAvailability(status, statusLoading);
  const methods = availability.methods;
  const ready = availability.canStartCheckout;

  const handleApplyCoupon = useCallback(async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponMessage(null);
    try {
      const result = await validateCoupon(couponCode, planCode, originalAmountPiasters);
      if (result.valid) {
        setCouponDiscountPiasters(result.discountAmountPiasters);
        setApplyBirthdayReward(false);
        setCouponMessage({
          type: 'success',
          text: `${t('Coupon applied successfully!')} (-${formatEgpPrice(result.discountAmountPiasters)})`,
        });
      } else {
        setCouponDiscountPiasters(0);
        setCouponMessage({ type: 'error', text: result.reason || t('Invalid coupon') });
      }
    } catch (caught) {
      setCouponDiscountPiasters(0);
      setCouponMessage({
        type: 'error',
        text: caught instanceof Error ? caught.message : t('Validation failed'),
      });
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode, planCode, originalAmountPiasters, t]);

  const handlePay = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const session = await startXPayCheckout({
        planCode: isCreditPack ? undefined : planCode,
        packId: isCreditPack ? planCode : undefined,
        billingCycle,
        couponCode: couponDiscountPiasters > 0 ? couponCode.trim().toUpperCase() : undefined,
        applyBirthdayReward: birthdayEligible,
        locale: isAr ? 'ar' : 'en',
        idempotencyKey,
      });
      // The browser leaves for the hosted page. Everything after this point is
      // decided by XPay and by the signed webhook, never by this component.
      await goToHostedPage(session.url);
    } catch (caught) {
      const code = (caught as { code?: string }).code;
      const message = caught instanceof Error ? caught.message : t('Failed to start the payment');
      setError(failureMessage(code, message, t));
      // A failed attempt may be retried, but as a new attempt: the first one
      // may still exist at XPay.
      setIdempotencyKey(newIdempotencyKey());
    } finally {
      setLoading(false);
    }
  };

  const planLabel = isAr ? planNameAr : planNameEn;
  const cycleLabel = isCreditPack
    ? t('One-time')
    : billingCycle === 'annual'
      ? t('per year')
      : t('per month');

  const stepVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: reduced ? 0 : 10 },
      visible: { opacity: 1, y: 0, transition: { duration: reduced ? 0.01 : 0.22, ease: MOTION_EASE.out } },
      exit: { opacity: 0, y: reduced ? 0 : -6, transition: { duration: reduced ? 0.01 : 0.16, ease: MOTION_EASE.out } },
    }),
    [reduced]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          variants={backdropVariants(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="xpay-checkout-title"
            variants={stepVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 shadow-2xl sm:rounded-3xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="xpay-checkout-title" className="text-lg font-extrabold text-[var(--text-primary)]">
                  {t('Complete your payment')}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {planLabel} · {cycleLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('Close')}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Billing cycle. A credit pack has no cycle at all. */}
            {!isCreditPack && (
              <div className="mb-4">
                <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
                  {t('Billing Cycle')}
                </span>
                <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-1">
                  {(['monthly', 'annual'] as const).map((cycle) => (
                    <button
                      key={cycle}
                      type="button"
                      aria-pressed={billingCycle === cycle}
                      onClick={() => {
                        setBillingCycle(cycle);
                        setCouponDiscountPiasters(0);
                        setCouponMessage(null);
                      }}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                        billingCycle === cycle
                          ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-sm'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {cycle === 'monthly' ? t('Monthly') : t('Annual')}
                      {cycle === 'annual' && (
                        <span className="ms-1.5 rounded bg-[var(--color-success-surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-success-strong)]">
                          -17%
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* What the candidate can pay with, as the account enables it. */}
            <div className="mb-4">
              <span className="mb-2 block text-sm font-semibold text-[var(--text-primary)]">
                {t('Payment methods')}
              </span>

              {availability.state === 'checking' ? (
                <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4 text-xs text-[var(--text-muted)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('Checking which payment methods are available…')}
                </div>
              ) : !ready ? (
                <div
                  className="flex items-start gap-2 rounded-2xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--text-primary)]"
                  data-payments-paused={availability.reason}
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
                  <span>
                    <span className="block font-bold">{t(availability.titleKey)}</span>
                    <span className="mt-0.5 block">{t(availability.messageKey)}</span>
                  </span>
                </div>
              ) : (
                <ul className="space-y-2">
                  {methods.map((method) => (
                    <li
                      key={method}
                      className="flex items-start gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3"
                    >
                      <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-success-surface)] text-[var(--color-success-strong)]">
                        <Check className="h-3 w-3" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-[var(--text-primary)]">
                          {methodLabel(method)}
                        </span>
                        <span className="block text-[11px] leading-relaxed text-[var(--text-muted)]">
                          {methodNote(method, t)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                {t('You pay on XPay’s secure page. Aionvia never sees your card number.')}
              </p>

              {status?.testMode && (
                <p className="mt-1 text-[11px] font-semibold text-[var(--color-warning)]">
                  {t('Test mode: no real money is charged and a test plan is granted.')}
                </p>
              )}
            </div>

            {/* Coupon */}
            <div className="mb-4">
              <label
                htmlFor="xpay-coupon"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]"
              >
                <Tag className="h-3.5 w-3.5" />
                {t('Promo code')}
              </label>
              <div className="flex gap-2">
                <input
                  id="xpay-coupon"
                  type="text"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  placeholder={t('Enter a promo code')}
                  dir="ltr"
                  className="min-w-0 flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={() => void handleApplyCoupon()}
                  disabled={couponLoading || !couponCode.trim()}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-xs font-bold text-[var(--text-primary)] disabled:opacity-50"
                >
                  {couponLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('Apply')}
                </button>
              </div>
              {couponMessage && (
                <p
                  className={`mt-1 text-[11px] ${
                    couponMessage.type === 'success'
                      ? 'text-[var(--color-success-strong)]'
                      : 'text-[var(--color-danger)]'
                  }`}
                  role="status"
                >
                  {couponMessage.text}
                </p>
              )}
            </div>

            {/* Birthday discount: offered, granted only by the server. */}
            {!isCreditPack && (
              <label className="mb-4 flex items-start gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 text-xs">
                <input
                  type="checkbox"
                  checked={applyBirthdayReward}
                  disabled={couponDiscountPiasters > 0}
                  onChange={(event) => setApplyBirthdayReward(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--border-subtle)]"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
                    <Cake className="h-3.5 w-3.5" />
                    {t('Use my 30% birthday discount')}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {t('Applied only on your birthday. It cannot be combined with a promo code.')}
                  </span>
                </span>
              </label>
            )}

            {/* Summary */}
            <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4">
              <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                <span>{t('Plan')}</span>
                <span className="font-semibold text-[var(--text-primary)]">{planLabel}</span>
              </div>
              {!isCreditPack && (
                <div className="flex justify-between text-sm text-[var(--text-secondary)]">
                  <span>{t('Tokens included')}</span>
                  <span className="font-bold text-[var(--accent-primary)]">
                    {aiCredits} {t('Tokens')} / {t('per month')}
                  </span>
                </div>
              )}
              {shownDiscountPiasters > 0 && (
                <div className="flex justify-between text-sm font-semibold text-[var(--color-success-strong)]">
                  <span>{couponDiscountPiasters > 0 ? t('Discount') : t('Birthday discount')}</span>
                  <span>-{formatEgpPrice(shownDiscountPiasters)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2">
                <span className="font-bold text-[var(--text-primary)]">{t('Total Amount')}</span>
                <span className="text-xl font-extrabold text-[var(--accent-primary)]">
                  {formatEgpPrice(totalPiasters)}
                </span>
              </div>
              {birthdayDiscountPiasters > 0 && (
                <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                  {t('The discount is confirmed by the server when the payment starts, and only if today is your birthday.')}
                </p>
              )}
            </div>

            {error && (
              <div
                className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={loading || !ready}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-4 py-3 text-sm font-extrabold text-[var(--color-on-primary)] shadow-md transition-opacity disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>{t('Pay with XPay')}</span>
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </button>
            <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
              {t('Your plan activates as soon as the payment is confirmed — not before.')}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
