/**
 * PricingView — the published subscription catalogue.
 *
 * Four plans in Egyptian pounds. The prices rendered here come from the
 * catalogue API, and these constants are only the fallback for a page that
 * cannot reach it: a browser must never be the thing that decides what a plan
 * costs. Checkout is the single XPay hosted page, and the methods it offers are
 * the ones the merchant account has actually enabled — never a method this
 * page promised on the account's behalf.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Check,
  Sparkles,
  Zap,
  Shield,
  Crown,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Lock,
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { CheckoutModal } from '../subscription/CheckoutModal';
import { resolvePaymentAvailability } from '../../lib/paymentAvailability';
import { DailyTokenClaim } from '../subscription/DailyTokenClaim';
import { PlanIdentityBadge } from '../subscription/PlanIdentityBadge';
import {
  annualSavingsPiasters,
  formatEgpPrice,
  isPlanEntitled,
  PLAN_RANK,
  type EntitlementFeature,
  type SubscriptionPlanCode,
  type SubscriptionPlanDTO,
} from '../../../shared/subscriptions';
import { fetchPublicPlans } from '../../lib/subscriptionApi';
import { PUBLIC_PATHS } from '../../../shared/contact.ts';
import { CREDIT_PACKS } from '../../../shared/credits';
import { CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS } from '../../../shared/cvTemplates';
import { fetchXPayStatus, type XPayStatus } from '../../lib/xpayApi';
import { isXPaySessionId, syncXPaySession } from '../../lib/xpayApi';
import { useRoute } from '../../lib/useRouteParams';
import { buildRouteHash } from '../../lib/routing';

interface PlanDefinition {
  code: string;
  nameEn: string;
  nameAr: string;
  taglineEn: string;
  taglineAr: string;
  monthlyPiasters: number;
  annualPiasters: number;
  monthlyAiCredits: number;
  /** The free plan's welcome grant. Paid plans use their monthly allowance. */
  oneTimeCredits?: number;
  featuresEn: string[];
  featuresAr: string[];
  isPopular?: boolean;
  isBestValue?: boolean;
}

const PLANS: PlanDefinition[] = [
  {
    code: 'free',
    nameEn: 'Free Explorer',
    nameAr: 'المستكشف المجاني',
    taglineEn: 'For students and job seekers exploring career pathways',
    taglineAr: 'للطلاب والباحثين عن عمل لاستكشاف المسارات المهنية',
    monthlyPiasters: 0,
    annualPiasters: 0,
    // The free plan has no monthly allowance: its five tokens are a one-time
    // welcome, and the daily claim is the recurring free allowance.
    monthlyAiCredits: 0,
    oneTimeCredits: 5,
    featuresEn: [
      'Basic account & career profile',
      'Explore live jobs & save up to 5',
      'Browse complete role skill catalogues',
      'Basic career milestone tracker',
      '5 one-time trial tokens',
      'Core platform free forever',
    ],
    featuresAr: [
      'حساب شخصي وملف مهني مجاني بالكامل',
      'استكشاف الوظائف وحفظ حتى ٥ وظائف',
      'تصفح كتالوج المهارات والأدوار الوظيفية',
      'تتبع خطوات المسار المهني الأساسية',
      '٥ توكنات تجريبية لمرة واحدة',
      'المنصة الأساسية مجانية بالكامل للأبد',
    ],
  },
  {
    code: 'student',
    nameEn: 'Student & Early Career',
    nameAr: 'الطلاب والبدايات المهنية',
    taglineEn: 'ATS-ready CVs, tailored applications and a learning plan that fits your target role',
    taglineAr: 'سيرة جاهزة لأنظمة التوظيف، طلبات مخصصة، وخطة تعلم تناسب وظيفتك المستهدفة',
    monthlyPiasters: 4900,
    annualPiasters: 49000,
    monthlyAiCredits: 15,
    featuresEn: [
      'Complete CV Builder & PDF export',
      'AI ATS score & gap analysis',
      'JD keyword extraction & job matching',
      'AI-tailored CVs for each vacancy',
      'AI cover letter generator',
      'Personalized learning roadmaps',
      '15 tokens every month',
    ],
    featuresAr: [
      'منشئ السيرة الذاتية وتصدير PDF احترافي',
      'تقييم ATS وتحليل الفجوات المهارية',
      'استخراج كلمات الوظيفة ومطابقة الفرص',
      'تخصيص السيرة الذاتية لكل فرصة عمل',
      'توليد خطابات التقديم المخصصة',
      'خرائط تعلم وتطوير مهارات مخصصة',
      '١٥ توكن كل شهر',
    ],
  },
  {
    code: 'pro',
    nameEn: 'Professional',
    nameAr: 'المحترف',
    taglineEn: 'For professionals aiming for promotion, specialization and senior roles',
    taglineAr: 'للمحترفين الساعين للترقي والتخصص والوظائف القيادية',
    monthlyPiasters: 9900,
    annualPiasters: 99000,
    monthlyAiCredits: 40,
    isPopular: true,
    featuresEn: [
      'Everything in Student & Early Career',
      'Unlimited CV versions & storage',
      'AI mock interviews & scoring',
      'AI career mentor & strategic guidance',
      'Advanced portfolio & evidence showcase',
      'Career progress reports',
      '40 tokens every month',
    ],
    featuresAr: [
      'كل ما في خطة الطلاب والبدايات المهنية',
      'نسخ سيرة ذاتية وتخزين غير محدود',
      'مقابلات تجريبية بالذكاء الاصطناعي مع تقييم',
      'مرشد مهني ذكي وإرشاد استراتيجي',
      'معرض أعمال وإثباتات مهارية متقدم',
      'تقارير تقدم مهني تفصيلية',
      '٤٠ توكن كل شهر',
    ],
  },
  {
    code: 'career_plus',
    nameEn: 'Career Plus',
    nameAr: 'المسار المتقدم (Plus)',
    taglineEn: 'For career switchers and leaders who need the deepest analysis and priority processing',
    taglineAr: 'لمن يغيّر مساره المهني أو يقود فريقاً ويحتاج أعمق تحليل وأولوية معالجة',
    monthlyPiasters: 17900,
    annualPiasters: 179000,
    monthlyAiCredits: 85,
    isBestValue: true,
    featuresEn: [
      'Everything in Professional',
      'Career transition engine',
      'Multi-role comparative fit analysis',
      'Deep scenario interview simulations',
      'Executive career reports',
      'Priority AI processing',
      '85 tokens every month',
    ],
    featuresAr: [
      'كل ما في خطة المحترف',
      'محرك التحول المهني',
      'تحليل مقارن للملاءمة بين عدة أدوار',
      'محاكاة مقابلات سيناريو متعمقة',
      'تقارير مهنية تنفيذية',
      'أولوية في معالجة الذكاء الاصطناعي',
      '٨٥ توكن كل شهر',
    ],
  },
];

const FAQ_ITEMS: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'Are the core features of the platform actually free?',
    answer:
      'Yes — the core platform is completely free: job discovery, goal tracking and the basic learning maps. Paid plans exist to cover the running cost of the advanced AI models (Gemini), document processing and interview simulation.',
  },
  {
    question: 'Which payment methods can I use?',
    answer:
      'Payment goes through XPay, Egypt’s payment provider. The methods listed on the checkout are the ones enabled on our merchant account at the moment you pay — nothing else is promised. Your plan activates only when XPay confirms the payment; a cash reference such as Fawry activates it when the money actually arrives.',
  },
  {
    question: 'What happens if the AI call fails? Do I lose my tokens?',
    answer:
      'Never. The platform runs a secure double-entry ledger. If there is any network interruption or a model error, the tokens that were held are automatically refunded to your account straight away.',
  },
];

/** The label for a payment method XPay reports. */
const paymentMethodLabel = (method: string): string => {
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

/**
 * The comparison table.
 *
 * It is built from the same entitlement matrix the server enforces, so a row
 * cannot claim a feature the plan does not actually grant. The token row is the
 * only value that is not a yes/no.
 */
const COMPARISON_ROWS: ReadonlyArray<{ label: string; feature?: EntitlementFeature }> = [
  { label: 'Monthly AI tokens' },
  { label: 'Complete CV builder', feature: 'cv.builder' },
  { label: 'PDF export', feature: 'cv.export_pdf' },
  { label: 'AI-tailored CVs', feature: 'cv.tailoring' },
  { label: 'ATS score & gap analysis', feature: 'ats.analysis' },
  { label: 'Detailed ATS breakdown', feature: 'ats.detailed_breakdown' },
  { label: 'JD keyword extraction', feature: 'job_description.analysis' },
  { label: 'AI cover letters', feature: 'cover_letter.generate' },
  { label: 'Full learning roadmaps', feature: 'roadmap.full_stages' },
  { label: 'Unlimited CV versions & storage', feature: 'cv.multiple_versions' },
  { label: 'AI mock interviews', feature: 'interview.mock_simulation' },
  { label: 'AI career mentor', feature: 'ai_mentor.session' },
  { label: 'Advanced portfolio & evidence', feature: 'portfolio.advanced' },
  { label: 'Career progress reports', feature: 'career.reports' },
  { label: 'Career transition engine', feature: 'career.transition_plan' },
  { label: 'Multi-role comparative fit', feature: 'career.comparative_fit' },
  { label: 'Deep scenario interviews', feature: 'interview.deep_simulation' },
  { label: 'Priority AI processing', feature: 'ai.priority_processing' },
];

/** The per-month equivalent of an annual price, exact to the piaster. */
const formatMonthlyEquivalent = (annualPiasters: number): string => {
  const egp = annualPiasters / 1200;
  return `${Number.isInteger(egp) ? egp.toFixed(0) : egp.toFixed(2)} EGP`;
};

/** A date a candidate can read, in their own language. */
const formatDate = (value: string | null | undefined, isAr: boolean): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const PricingView: React.FC = () => {
  const { t, settings, subscription, creditBalance, refreshSubscription, refreshCredits } =
    useCareer();
  const isAr = settings.language === 'ar';
  const { params } = useRoute();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // The hosted-checkout redirect lands on
  // `#/pricing?xpay=success&session_id=cs_test_...`. The result is copied into
  // local state and stripped from the URL so a refresh does not replay the
  // banner.
  const [checkoutNotice, setCheckoutNotice] = useState<
    'success' | 'cancelled' | 'pending' | 'failed' | 'expired' | null
  >(null);
  // A Fawry payment is complete before it is paid. Until XPay says `paid`, the
  // page says so instead of claiming the plan is active.
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  // What this merchant account can actually charge. Read from the server,
  // which reads it from XPay: a method the account was not provisioned for is
  // never advertised here.
  const [xpayStatus, setXpayStatus] = useState<XPayStatus | null>(null);
  // True until the first answer arrives. "We have not asked yet" and "we asked
  // and there is no answer" are different states and read differently.
  const [xpayLoading, setXpayLoading] = useState(true);
  // The live catalogue. The page draws these prices when they arrive; a failed
  // read falls back to the constants above, and checkout still charges the
  // server's own catalogue price either way.
  const [catalog, setCatalog] = useState<Record<string, SubscriptionPlanDTO>>({});

  const currentPlanCode = subscription?.planCode ?? 'free';
  const currentRank = PLAN_RANK[currentPlanCode as SubscriptionPlanCode] ?? 0;
  const lastPayment = xpayStatus?.sessions?.[0] ?? null;

  const loadXPayStatus = useCallback(async () => {
    setXpayLoading(true);
    try {
      setXpayStatus(await fetchXPayStatus());
    } catch {
      // Payments being unavailable must not break the pricing page: the page
      // still shows the plans, and the notice says checkout is paused.
      setXpayStatus(null);
    } finally {
      setXpayLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadXPayStatus();
  }, [loadXPayStatus]);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicPlans()
      .then((plans) => {
        if (cancelled) return;
        setCatalog(Object.fromEntries(plans.map((plan) => [plan.code, plan])));
      })
      .catch(() => {
        // The fallback constants are already on screen; a catalogue outage
        // must not hide the plans.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One place that answers "what does this plan cost and grant right now".
  const pricingFor = (plan: PlanDefinition) => {
    const live = catalog[plan.code];
    return {
      monthlyPiasters: live?.priceMonthlyPiasters ?? plan.monthlyPiasters,
      annualPiasters: live?.priceAnnualPiasters ?? plan.annualPiasters,
      monthlyAiCredits: live?.monthlyAiCredits ?? plan.monthlyAiCredits,
      nameEn: live?.nameEn ?? plan.nameEn,
      nameAr: live?.nameAr ?? plan.nameAr,
    };
  };

  // "Upgrade" and "downgrade" are different promises, so they are different
  // words. The rank comes from the shared catalogue order, not from a second
  // list that could drift.
  const actionLabelFor = (plan: PlanDefinition, name: string): string => {
    if (plan.code === 'free') return t('Free forever');
    const rank = PLAN_RANK[plan.code as SubscriptionPlanCode] ?? 0;
    if (rank > currentRank) return `${t('Upgrade to')} ${name}`;
    if (rank < currentRank) return `${t('Downgrade to')} ${name}`;
    return t('Choose plan');
  };

  /**
   * The XPay return.
   *
   * `?xpay=success` proves only that the browser came back. The session is
   * reconciled with XPay before anything is claimed, and a payment that is
   * still unpaid — a Fawry reference waiting at an outlet — is reported as
   * waiting rather than as received.
   */
  useEffect(() => {
    const result = params.xpay;
    if (
      result !== 'success' &&
      result !== 'cancelled' &&
      result !== 'failed' &&
      result !== 'expired'
    ) {
      return;
    }

    const sessionId = params.session_id;
    setCheckoutNotice(result);
    window.history.replaceState(null, '', buildRouteHash('pricing'));

    if (result !== 'success' || !isXPaySessionId(sessionId)) {
      if (result === 'success') {
        // A return without a session id cannot be checked, so it is reported
        // as unconfirmed rather than assumed.
        setCheckoutNotice('pending');
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const synced = await syncXPaySession(sessionId);
        if (cancelled) return;
        if (synced.paid) {
          setCheckoutNotice('success');
          setPendingReference(null);
        } else if (synced.status === 'expired') {
          // The checkout closed before the money arrived. Nothing was granted.
          setCheckoutNotice('expired');
          setPendingReference(null);
        } else {
          setCheckoutNotice('pending');
          setPendingReference(synced.voucher.reference ?? null);
        }
        await refreshSubscription();
        await refreshCredits();
      } catch {
        if (!cancelled) setCheckoutNotice('pending');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.xpay, params.session_id, refreshSubscription, refreshCredits]);

  // XPay is the only gateway, so this one answer decides every payment control
  // on the page: the plan buttons, the pack buttons and the methods banner.
  // The rules live in `lib/paymentAvailability.ts` and are tested there.
  const availability = resolvePaymentAvailability(xpayStatus, xpayLoading);
  const canPay = availability.canStartCheckout;
  const paymentMethods = availability.methods;

  const handleSelectPlan = (plan: PlanDefinition) => {
    if (plan.code === 'free') return;
    // Nothing opens while checkout is paused: no dialog, no error, no fake
    // payment. The notice on the page is the answer.
    if (!canPay) return;
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  // What the return banner says, in one place, so five states cannot drift.
  const noticeTone =
    checkoutNotice === 'success'
      ? 'success'
      : checkoutNotice === 'failed' || checkoutNotice === 'expired'
        ? 'danger'
        : 'warning';
  const noticeTitle =
    checkoutNotice === 'success'
      ? t('Payment received')
      : checkoutNotice === 'pending'
        ? t('Waiting for your payment')
        : checkoutNotice === 'failed'
          ? t('Payment not completed')
          : checkoutNotice === 'expired'
            ? t('Checkout expired')
            : t('Card checkout cancelled');
  const noticeBody =
    checkoutNotice === 'success'
      ? t('Your plan is active. Your token allowance and expiration date are shown below.')
      : checkoutNotice === 'pending'
        ? pendingReference
          ? t(
              'Your payment is not confirmed yet. Pay the reference from your receipt at any Fawry outlet or in the Fawry app, and the plan unlocks the moment the money arrives.'
            )
          : t(
              'This payment is not confirmed yet. If you were charged, the plan unlocks as soon as the provider confirms it — refresh this page in a moment.'
            )
        : checkoutNotice === 'failed'
          ? t('The payment was not confirmed, so nothing was charged and no plan changed. You can try again.')
          : checkoutNotice === 'expired'
            ? t('This checkout expired before the payment was confirmed. Nothing was charged and no plan changed.')
            : t('Nothing was charged. You can try again whenever you are ready.');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16 animate-fadeIn" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Hero Header */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-4 h-4" />
          <span>{t('Subscriptions & Pricing')} — مصممة لمصر والعالم العربي</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {t('Choose the plan that fits your career ambitions')}
        </h1>
        <p className="text-base sm:text-lg text-muted leading-relaxed">
          {isAr
            ? 'خطط واضحة بالجنيه المصري، بدفع آمن عبر XPay. تُعرض في صفحة الدفع طرق الدفع المفعّلة لحسابنا فقط.'
            : 'Clear plans in Egyptian pounds, paid securely through XPay. Checkout shows only the methods actually enabled on our account.'}
        </p>

        {/* Billing Cycle Switcher */}
        <div className="pt-4 flex items-center justify-center">
          <div className="inline-flex p-1.5 rounded-2xl bg-surface-raised border border-border">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {t('Monthly')}
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('annual')}
              className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all ${
                billingCycle === 'annual'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              <span>{t('Annual')}</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold">
                {t('2 months free')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* The Token Hub.
          *
          * The page is called "Pricing", but the first question a candidate
          * arrives with is not "which plan" — it is "what can I spend right
          * now, and what else can I get for free". So the token balance, the
          * daily claim and the price of the one thing tokens buy — the premium
          * CV template — come before the plans.
          *
          * The daily widget here is the SAME component the dashboard shows. One
          * widget, one state, one button; it cannot disagree with itself. */}
      <div className="max-w-3xl mx-auto w-full rounded-3xl border border-border bg-surface-raised overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-7 w-7" aria-hidden="true" />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted">
                {t('Tokens')}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-foreground tabular-nums">
                  {creditBalance?.balance ?? 0}
                </span>
                <span className="text-xs font-semibold text-muted">
                  {t('Your balance')}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                <span>
                  {t('Monthly Allowance')}: {creditBalance?.monthlyAllocation ?? 0}
                </span>
                <span>
                  {t('Used this cycle')}: {creditBalance?.consumedThisMonth ?? 0}
                </span>
                <span>
                  {t('Plan')}:{' '}
                  <PlanIdentityBadge
                    planCode={subscription?.planCode ?? 'free'}
                    status={subscription?.status}
                    expiresAt={subscription?.expiresAt}
                    size="xs"
                    language={settings.language}
                    className="align-middle"
                  />
                </span>
              </div>
            </div>
          </div>

          {/* What tokens buy, said plainly and before anything is spent. */}
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-accent-strong)]/25 bg-[var(--accent-surface)] px-4 py-3">
            <Crown className="h-4 w-4 shrink-0 text-[var(--color-primary-text)]" aria-hidden="true" />
            <div className="text-[11px] leading-snug">
              <div className="font-bold text-[var(--color-primary-text)]">
                {t('Premium CV template')}
              </div>
              <div className="text-[var(--color-primary-text)]/80">
                {CV_TEMPLATE_PREMIUM_UNLOCK_CREDITS} {t('Tokens')}
              </div>
            </div>
          </div>
        </div>

        {/* The daily claim. The same widget the dashboard shows. */}
        <div className="border-t border-border p-5 sm:p-6">
          <DailyTokenClaim />
        </div>
      </div>

      {/* Post-checkout banner: success, waiting, failed, expired, cancelled. */}
      {checkoutNotice && (
        <div
          className={`max-w-3xl mx-auto w-full rounded-2xl border p-4 flex items-start gap-3 ${
            noticeTone === 'success'
              ? 'border-emerald-500/25 bg-emerald-500/10'
              : noticeTone === 'danger'
                ? 'border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10'
                : 'border-amber-500/25 bg-amber-500/10'
          }`}
          role="status"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              noticeTone === 'success'
                ? 'bg-emerald-500/15 text-emerald-600'
                : noticeTone === 'danger'
                  ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
                  : 'bg-amber-500/15 text-amber-600'
            }`}
          >
            {noticeTone === 'success' ? (
              <Check className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0 text-sm leading-relaxed">
            <div className="font-bold text-foreground">{noticeTitle}</div>
            <p className="text-xs text-muted mt-0.5">{noticeBody}</p>
            {pendingReference && checkoutNotice === 'pending' && (
              <p className="mt-1 font-mono text-xs font-semibold text-foreground" dir="ltr">
                {pendingReference}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCheckoutNotice(null)}
            className="p-1 rounded-lg text-muted hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Payments paused.

          XPay is the only gateway, and it is not ready yet: no key, no signing
          secret, or no method enabled on the merchant account. The plans stay
          on the page — a candidate can still read what they cost — but no
          control here can start a checkout, so nobody can be charged by a
          payment that would not be verified. The sentence says that in the
          candidate's language, and it says nothing was charged. */}
      {availability.state !== 'ready' && (
        <div
          role="status"
          aria-live="polite"
          id="payments-paused-notice"
          data-payments-paused={availability.reason}
          className="mx-auto flex w-full max-w-3xl items-start gap-3 rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
          <div className="min-w-0 text-sm leading-relaxed">
            <p className="font-bold text-[var(--text-primary)]">{t(availability.titleKey)}</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{t(availability.messageKey)}</p>
          </div>
        </div>
      )}

      {/* The candidate's own plan, not just the catalogue.
          *
          * An active plan answers three questions without opening a menu: what
          * it is, when it ends, and whether the last payment went through. The
          * plan is one fixed period, so a new period is a purchase the
          * candidate makes, never a charge that happens on its own. */}
      {subscription && subscription.planCode !== 'free' && (
        <div
          className="mx-auto w-full max-w-3xl rounded-3xl border border-border bg-surface-raised p-5 sm:p-6"
          data-current-subscription={subscription.planCode}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
                {t('Your current plan')}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">
                  {isAr ? subscription.planNameAr : subscription.planNameEn}
                </h2>
                <PlanIdentityBadge
                  planCode={subscription.planCode}
                  status={subscription.status}
                  expiresAt={subscription.expiresAt}
                  size="xs"
                  language={settings.language}
                />
              </div>
              <p className="text-xs text-muted">
                {subscription.billingCycle === 'annual' ? t('Annual') : t('Monthly')}
                {' · '}
                {t('Expires')}:{' '}
                <span className="font-semibold text-foreground">
                  {formatDate(subscription.expiresAt, isAr)}
                </span>
              </p>
              <p className="max-w-md text-[11px] leading-relaxed text-muted">
                {t('Auto-renewal is off. Your access continues until the expiration date. When it ends, buy the same plan again to renew it.')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                document.getElementById('pricing-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              {t('Change plan')}
            </button>
          </div>

          {lastPayment && (
            <dl className="mt-4 grid gap-x-6 gap-y-2 rounded-2xl border border-border bg-surface p-3.5 text-[11px] sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-2 sm:justify-start">
                <dt className="text-muted">{t('Last payment')}</dt>
                <dd className="font-semibold text-foreground">
                  {formatEgpPrice(lastPayment.amountTotal)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 sm:justify-start">
                <dt className="text-muted">{t('Payment status')}</dt>
                <dd className="font-semibold text-foreground">
                  {lastPayment.paymentStatus === 'paid'
                    ? t('Paid')
                    : lastPayment.status === 'expired'
                      ? t('Expired')
                      : t('Awaiting payment')}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 sm:justify-start">
                <dt className="text-muted">{t('Method')}</dt>
                <dd className="text-foreground">
                  {lastPayment.paymentMethodType
                    ? paymentMethodLabel(lastPayment.paymentMethodType)
                    : '—'}
                </dd>
              </div>
              <div className="flex min-w-0 items-baseline justify-between gap-2 sm:justify-start">
                <dt className="shrink-0 text-muted">{t('Order')}</dt>
                <dd className="truncate font-mono text-foreground" dir="ltr">
                  {lastPayment.orderId ?? lastPayment.id}
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {/* Pricing Cards Grid */}
      <div
        id="pricing-plans"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch"
      >
        {PLANS.map((plan) => {
          const isCurrent = currentPlanCode === plan.code;
          const live = pricingFor(plan);
          const isFree = plan.code === 'free';
          const piasters =
            billingCycle === 'annual' ? live.annualPiasters : live.monthlyPiasters;
          const priceDisplay = isFree ? '0 EGP' : formatEgpPrice(piasters);
          const periodLabel = isFree
            ? ''
            : billingCycle === 'annual'
              ? `/ ${t('year')}`
              : `/ ${t('month')}`;
          const savings = annualSavingsPiasters({
            priceMonthlyPiasters: live.monthlyPiasters,
            priceAnnualPiasters: live.annualPiasters,
          });
          const name = isAr ? live.nameAr : live.nameEn;

          return (
            <div
              key={plan.code}
              className={`relative rounded-3xl p-6 flex flex-col justify-between border transition-all duration-200 ${
                plan.isPopular
                  ? 'border-primary bg-primary/[0.03] shadow-xl ring-2 ring-primary/20'
                  : plan.isBestValue
                  ? 'border-purple-500/40 bg-purple-500/[0.03] shadow-lg'
                  : 'border-border bg-surface hover:border-border/80 shadow-sm'
              }`}
            >
              {/* Badges */}
              {plan.isPopular && (
                <div className="absolute -top-3.5 start-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-white text-xs font-extrabold shadow">
                  {t('Most popular')}
                </div>
              )}
              {plan.isBestValue && (
                <div className="absolute -top-3.5 start-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-extrabold shadow">
                  {t('Best value')}
                </div>
              )}

              <div>
                {/* Plan Header */}
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    {name}
                  </h3>
                  <p className="text-xs text-muted min-h-[32px] leading-relaxed">
                    {isAr ? plan.taglineAr : plan.taglineEn}
                  </p>
                </div>

                {/* Price Display */}
                <div className="my-6 pb-6 border-b border-border/60">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl sm:text-4xl font-black text-foreground">
                      {priceDisplay}
                    </span>
                    <span className="text-xs font-semibold text-muted">{periodLabel}</span>
                  </div>
                  {!isFree && billingCycle === 'annual' && (
                    <div className="mt-1 space-y-0.5">
                      <div className="text-[11px] text-emerald-600 font-bold">
                        {formatMonthlyEquivalent(live.annualPiasters)} / {t('per month')}{' '}
                        ({t('Billed annually')})
                      </div>
                      <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                        {t('Save')} {formatEgpPrice(savings)} · {t('2 months free')}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-raised border border-border text-xs font-bold text-primary">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {isFree ? (
                        <>
                          {plan.oneTimeCredits ?? 5} {t('Tokens')}{' '}
                          <span className="font-semibold">({t('one-time')})</span>
                        </>
                      ) : (
                        <>
                          {live.monthlyAiCredits} {t('Tokens')} / {t('per month')}
                        </>
                      )}
                    </span>
                  </div>
                  {!isFree && billingCycle === 'annual' && (
                    <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                      {t('Tokens are granted monthly across the 12 months — not all at once.')}
                    </p>
                  )}
                </div>

                {/* Features List */}
                <ul className="space-y-3 mb-6">
                  {(isAr ? plan.featuresAr : plan.featuresEn).map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-foreground/90 leading-relaxed">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <div>
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-2xl bg-surface-raised border border-border text-muted text-xs font-bold cursor-default"
                  >
                    {t('Current plan')}
                  </button>
                ) : isFree ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-2xl bg-surface-raised border border-border text-foreground text-xs font-bold"
                  >
                    {currentPlanCode === 'free' ? t('Included') : t('Free forever')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan)}
                    disabled={!canPay}
                    aria-disabled={!canPay}
                    aria-describedby={!canPay ? 'payments-paused-notice' : undefined}
                    title={!canPay ? t(availability.actionLabelKey) : undefined}
                    className={`w-full py-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all ${
                      !canPay
                        ? 'cursor-not-allowed border border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                        : plan.isPopular
                          ? 'bg-primary text-white hover:bg-primary-hover shadow-md shadow-primary/20'
                          : plan.isBestValue
                            ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-600/20'
                            : 'bg-foreground text-surface shadow-md hover:opacity-90'
                    }`}
                  >
                    <span>
                      {canPay ? actionLabelFor(plan, name) : t(availability.actionLabelKey)}
                    </span>
                    {canPay ? (
                      isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />
                    ) : (
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full comparison. The cards say what each plan adds; this table answers
          * the question the cards cannot: "is this specific feature in my plan?" */}
      <div className="space-y-4">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {t('Compare plans in detail')}
          </h2>
          <p className="text-xs text-muted">
            {t('Every feature, plan by plan — the same entitlements the platform enforces.')}
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-3 text-start font-bold text-muted">
                  {t('Feature')}
                </th>
                {PLANS.map((plan) => {
                  const live = pricingFor(plan);
                  const price =
                    plan.code === 'free'
                      ? t('Free')
                      : formatEgpPrice(
                          billingCycle === 'annual' ? live.annualPiasters : live.monthlyPiasters
                        );
                  return (
                    <th key={plan.code} scope="col" className="p-3 text-center font-bold text-foreground">
                      <div>{isAr ? live.nameAr : live.nameEn}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-primary">{price}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-border/60 last:border-b-0">
                  <th scope="row" className="p-3 text-start font-medium text-foreground">
                    {t(row.label)}
                  </th>
                  {PLANS.map((plan) => {
                    const live = pricingFor(plan);
                    let value: React.ReactNode;
                    if (row.label === 'Monthly AI tokens') {
                      value =
                        plan.code === 'free' ? (
                          <span className="text-muted">
                            {plan.oneTimeCredits ?? 5} {t('one-time')}
                          </span>
                        ) : (
                          <span className="font-bold text-foreground">{live.monthlyAiCredits}</span>
                        );
                    } else if (row.feature === 'cv.builder' && plan.code === 'free') {
                      // The free tier has the builder, not the complete one.
                      value = <span className="text-muted">{t('Basic')}</span>;
                    } else if (row.feature) {
                      value = isPlanEntitled(plan.code as SubscriptionPlanCode, row.feature) ? (
                        <Check className="mx-auto h-4 w-4 text-emerald-500" aria-label={t('Included')} />
                      ) : (
                        <span className="text-muted" aria-label={t('Not included')}>
                          —
                        </span>
                      );
                    } else {
                      value = '—';
                    }
                    return (
                      <td key={plan.code} className="p-3 text-center text-foreground">
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Token Booster Packs */}
      <div className="p-8 rounded-3xl bg-surface-raised border border-border space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            <span>{t('Top up tokens')}</span>
          </div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('Token Packs')}</h2>
          <p className="text-xs text-muted">
            {t('Top up extra tokens without changing your current plan. Extra tokens never expire and stay in your wallet.')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              className="p-5 rounded-2xl bg-surface border border-border flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-base text-foreground">
                  {isAr ? pack.nameAr : pack.nameEn}
                </div>
                <div className="text-xs text-primary font-extrabold flex items-center gap-1 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{pack.credits} {t('Tokens')}</span>
                </div>
              </div>
              <button
                type="button"
                disabled={!canPay}
                aria-disabled={!canPay}
                title={!canPay ? t(availability.actionLabelKey) : undefined}
                onClick={() => {
                  if (!canPay) return;
                  setSelectedPlan({
                    code: pack.id,
                    nameEn: pack.nameEn,
                    nameAr: pack.nameAr,
                    taglineEn: `${pack.credits} Tokens`,
                    taglineAr: `${pack.credits} توكن`,
                    monthlyPiasters: pack.pricePiasters,
                    annualPiasters: pack.pricePiasters,
                    monthlyAiCredits: pack.credits,
                    featuresEn: [`${pack.credits} tokens`, 'Never expires'],
                    featuresAr: [`${pack.credits} توكن`, 'بدون تاريخ انتهاء'],
                  });
                  setCheckoutOpen(true);
                }}
                className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all ${
                  canPay
                    ? 'bg-primary/10 border-primary/20 text-primary hover:bg-primary hover:text-white'
                    : 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                }`}
              >
                {formatEgpPrice(pack.pricePiasters)}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Payment methods, as this merchant account actually enables them. */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-primary/5 via-surface to-primary/5 border border-primary/20 flex flex-col flex-wrap md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-start">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary shrink-0" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              {t('Secure payments through XPay')}
            </h3>
          </div>
          <p className="text-xs text-muted max-w-xl leading-relaxed">
            {canPay
              ? t(
                  'You pay on XPay’s secure page; Aionvia never sees or stores your card number. Your plan activates as soon as the payment is confirmed, and a Fawry reference activates it when the money arrives.'
                )
              : t(availability.messageKey)}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-3">
          {paymentMethods.length === 0 ? (
            <span className="text-[11px] text-muted">
              {availability.state === 'checking'
                ? t('Checking available payment methods…')
                : t('No payment method is available right now.')}
            </span>
          ) : (
            paymentMethods.map((method) => (
              <div
                key={method}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border shadow-sm"
              >
                <span className="text-xs font-bold text-foreground">{paymentMethodLabel(method)}</span>
              </div>
            ))
          )}
          {xpayStatus?.testMode && (
            <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 text-[10px] font-extrabold uppercase tracking-wider">
              {t('Test mode')}
            </span>
          )}
        </div>
      </div>

      {/* The legal documents a buyer needs before they pay.
          *
          * A plan is one charge for one fixed period and is not renewed
          * automatically, and the Refund Policy is where the conditions for a
          * refund and the cancellation route are written down. Both are linked
          * from the page the purchase is made on. */}
      <p className="text-xs text-muted text-center leading-relaxed">
        {t('Subscriptions are sold for one fixed period and are not renewed automatically.')}
        {' · '}
        <a
          href={PUBLIC_PATHS.refundPolicy}
          className="font-semibold text-[var(--color-primary-text)] hover:underline"
        >
          {t('Refund Policy')}
        </a>
        {' · '}
        <a
          href={PUBLIC_PATHS.terms}
          className="font-semibold text-[var(--color-primary-text)] hover:underline"
        >
          {t('Terms of Service')}
        </a>
      </p>

      {/* FAQ Accordion
          *
          * The questions are DATA, and every string goes through the
          * translation function. The FAQ used to be hard-coded Arabic inside
          * an otherwise bilingual page, which meant every English speaker saw
          * Arabic here — the one place on the Token Hub that did not speak the
          * reader's language. */}
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center space-y-1 mb-6">
          <h3 className="text-lg font-bold text-[var(--text-primary)]">
            {t('Frequently asked questions about plans and payments')}
          </h3>
          <p className="text-xs text-muted">
            {t('Everything you need to know about pricing and how a subscription is activated in Egypt.')}
          </p>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item) => (
            <div key={item.question} className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
              <h4 className="font-bold text-sm text-foreground">{t(item.question)}</h4>
              <p className="text-xs text-muted leading-relaxed">{t(item.answer)}</p>
            </div>
          ))}

          {canPay && (
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
              <h4 className="font-bold text-sm text-foreground">
                {t('How do I pay?')}
              </h4>
              <p className="text-xs text-muted leading-relaxed">
                {t(
                  'Choose a plan and you are taken to XPay’s secure page. The payment methods offered there are the ones enabled on our merchant account; Aionvia never sees or stores your card number, and the plan activates only when the payment is confirmed.'
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Checkout Modal */}
      {selectedPlan && (
        <CheckoutModal
          isOpen={checkoutOpen}
          onClose={() => {
            setCheckoutOpen(false);
            setSelectedPlan(null);
          }}
          planCode={selectedPlan.code}
          planNameEn={selectedPlan.nameEn}
          planNameAr={selectedPlan.nameAr}
          monthlyPiasters={
            catalog[selectedPlan.code]?.priceMonthlyPiasters ?? selectedPlan.monthlyPiasters
          }
          annualPiasters={
            catalog[selectedPlan.code]?.priceAnnualPiasters ?? selectedPlan.annualPiasters
          }
          aiCredits={
            catalog[selectedPlan.code]?.monthlyAiCredits ?? selectedPlan.monthlyAiCredits
          }
          isDowngrade={PLAN_RANK[selectedPlan.code as SubscriptionPlanCode] < currentRank}
        />
      )}
    </div>
  );
};