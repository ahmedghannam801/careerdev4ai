/**
 * PricingView — Production SaaS Pricing & Subscription Center.
 * Comprehensive Egyptian-pound tier catalog (Student, Pro, Career Plus), credit packs,
 * billing cycle toggles, and checkout over XPay's hosted page — cards, Apple Pay,
 * Fawry and ValU — where every method shown is one the merchant account has
 * enabled.
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
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { CheckoutModal } from '../subscription/CheckoutModal';
import { DailyTokenClaim } from '../subscription/DailyTokenClaim';
import { PlanIdentityBadge } from '../subscription/PlanIdentityBadge';
import { formatEgpPrice } from '../../../shared/subscriptions';
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
    monthlyAiCredits: 5, // One-time trial credits
    featuresEn: [
      'Basic account & career profile',
      'Explore live job market & save up to 5 jobs',
      'Browse complete role skill catalogues',
      'Basic career milestone tracker',
      '5 one-time trial tokens',
      '100% free core platform forever',
    ],
    featuresAr: [
      'حساب شخصي وملف مهني مجاني بالكامل',
      'استكشاف الوظائف وحفظ حتى ٥ وظائف',
      'تصفح كتالوج المهارات والأدوار الوظيفية',
      'تتبع خطوات المسار المهني الأساسية',
      '٥ توكنات تجريبية مجانية لمرة واحدة',
      'المنصة الأساسية مجانية بالكامل للأبد',
    ],
  },
  {
    code: 'student',
    nameEn: 'Student & Early Career',
    nameAr: 'الطلاب والبدايات المهنية',
    taglineEn: 'Kickstart your career with ATS-ready CVs and targeted job applications',
    taglineAr: 'انطلاقة قوية لسيرتك الذاتية واجتياز أنظمة التوظيف ATS',
    monthlyPiasters: 9900, // 99 EGP
    annualPiasters: 99900, // 999 EGP
    monthlyAiCredits: 25,
    featuresEn: [
      'Complete CV Builder & PDF export',
      'AI ATS CV score & gap analysis',
      'Job description keyword extraction & matching',
      'AI-tailored CVs for specific vacancies',
      'AI cover letter generator',
      'Personalized learning roadmaps',
      '25 monthly tokens',
    ],
    featuresAr: [
      'منشئ السيرة الذاتية وتصدير PDF احترافي',
      'تحليل توافق السيرة الذاتية مع أنظمة ATS',
      'استخراج الكلمات المفتاحية من إعلانات الوظائف',
      'تخصيص السيرة الذاتية لكل فرصة عمل بالذكاء الاصطناعي',
      'توليد خطابات التقديم (Cover Letter) مخصصة',
      'خرائط تعلم وتطوير مهارات مخصصة',
      '٢٥ توكن شهرياً',
    ],
  },
  {
    code: 'pro',
    nameEn: 'Professional',
    nameAr: 'المحترف',
    taglineEn: 'For professionals aiming for promotion, specialization, and top-tier roles',
    taglineAr: 'للمحترفين الساعين للترقي والتخصص والمقابلات رفيعة المستوى',
    monthlyPiasters: 17900, // 179 EGP
    annualPiasters: 179000, // 1,790 EGP
    monthlyAiCredits: 60,
    isPopular: true,
    featuresEn: [
      'Everything in Student tier',
      'Unlimited CV versions & tailoring',
      'AI Mock Interview simulation & scoring',
      '24/7 AI Career Mentor & strategic consultation',
      'Advanced portfolio & evidence showcase',
      'Detailed career progress & health reports',
      '60 monthly tokens',
    ],
    featuresAr: [
      'كل مميزات خطة الطلاب',
      'إصدارات متعددة وغير محدودة من السيرة الذاتية',
      'محاكاة المقابلات الشخصية بالذكاء الاصطناعي وتقييم الإجابات',
      'مستشار مهني ذكي على مدار الساعة للإرشاد والتوجيه',
      'معرض متقدم للمشاريع والإثباتات المهارية',
      'تقارير تفصيلية للجاهزية والنمو المهني',
      '٦٠ توكن شهرياً',
    ],
  },
  {
    code: 'career_plus',
    nameEn: 'Career Plus',
    nameAr: 'المسار المتقدم (Plus)',
    taglineEn: 'For ambitious switchers and leaders wanting maximum career acceleration',
    taglineAr: 'للقيادات والراغبين في تغيير المسار المهني بأقصى سرعة وثقة',
    monthlyPiasters: 29900, // 299 EGP
    annualPiasters: 299000, // 2,990 EGP
    monthlyAiCredits: 120,
    isBestValue: true,
    featuresEn: [
      'Everything in Professional tier',
      'Career Transition & Switch Roadmap Engine',
      'Multi-role comparative fit analysis',
      'Deep scenario interview simulations',
      'Executive career review reports',
      'Highest priority processing',
      '120 monthly tokens',
    ],
    featuresAr: [
      'كل مميزات خطة المحترف',
      'محرك تغيير المسار المهني وسد الفجوات المتقدم',
      'تحليل مقارن للملاءمة بين عدة وظائف ومجالات',
      'محاكاة متقدمة للمقابلات القيادية والتقنية العميقة',
      'تقارير تنفيذية شاملة للمسار والنمو',
      'أولوية معالجة قصوى لكافة النماذج',
      '١٢٠ توكن شهرياً',
    ],
  },
];

/**
 * The pricing FAQ.
 *
 * The questions are data, and each string is a translation key. The FAQ was
 * once hard-coded Arabic, which left every English speaker on this page
 * reading Arabic in the one section that should have spoken their language.
 */
const FAQ_ITEMS: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: 'Are the core features of the platform actually free?',
    answer:
      'Yes — the core platform is completely free: job discovery, goal tracking and the basic learning maps. Paid plans exist to cover the running cost of the advanced AI models (Gemini), document processing and interview simulation.',
  },
  {
    question: 'Which payment methods can I use?',
    answer:
      'Payment goes through XPay, Egypt’s payment provider. The methods offered are the ones enabled on our merchant account — cards, Apple Pay, Fawry and ValU — and the checkout shows exactly what is available when you pay. Your plan activates the moment the payment is confirmed, and a Fawry reference activates it the moment the money arrives.',
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
  const [checkoutNotice, setCheckoutNotice] = useState<'success' | 'cancelled' | 'pending' | null>(null);
  // A Fawry payment is complete before it is paid. Until XPay says `paid`, the
  // page says so instead of claiming the plan is active.
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  // What this merchant account can actually charge. Read from the server,
  // which reads it from XPay: a method the account was not provisioned for is
  // never advertised here.
  const [xpayStatus, setXpayStatus] = useState<XPayStatus | null>(null);

  const currentPlanCode = subscription?.planCode ?? 'free';

  const loadXPayStatus = useCallback(async () => {
    try {
      setXpayStatus(await fetchXPayStatus());
    } catch {
      // Payments being unavailable must not break the pricing page.
    }
  }, []);

  useEffect(() => {
    void loadXPayStatus();
  }, [loadXPayStatus]);

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
    if (result !== 'success' && result !== 'cancelled') return;

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

  const handleSelectPlan = (plan: PlanDefinition) => {
    if (plan.code === 'free') return;
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  // Payments are offered only when the server says the merchant account can
  // take them: a key, a webhook secret, and EGP provisioned.
  const xpayReady = Boolean(xpayStatus?.checkoutReady);
  const paymentMethods = xpayStatus?.paymentMethods?.methodsForEgp ?? [];

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
            ? 'خطط عادلة وبسيطة بالجنيه المصري، بدفع آمن عبر XPay: البطاقات وآبل باي وفوري وفاليو.'
            : 'Fair, simple plans in Egyptian pounds, paid securely through XPay: cards, Apple Pay, Fawry and ValU.'}
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
                {t('Save up to 17% with annual billing')}
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

      {/* Post-checkout banner */}
      {checkoutNotice && (
        <div
          className={`max-w-3xl mx-auto w-full rounded-2xl border p-4 flex items-start gap-3 ${
            checkoutNotice === 'success'
              ? 'border-emerald-500/25 bg-emerald-500/10'
              : 'border-amber-500/25 bg-amber-500/10'
          }`}
          role="status"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              checkoutNotice === 'success'
                ? 'bg-emerald-500/15 text-emerald-600'
                : 'bg-amber-500/15 text-amber-600'
            }`}
          >
            {checkoutNotice === 'success' ? (
              <Check className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 min-w-0 text-sm leading-relaxed">
            <div className="font-bold text-foreground">
              {checkoutNotice === 'success'
                ? t('Payment received')
                : checkoutNotice === 'pending'
                  ? t('Waiting for your payment')
                  : t('Card checkout cancelled')}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {checkoutNotice === 'success'
                ? t(
                    'Your plan and credits activate as soon as the payment is confirmed — usually within a few seconds.'
                  )
                : checkoutNotice === 'pending'
                  ? pendingReference
                    ? t(
                        'Your payment is not confirmed yet. Pay the reference from your receipt at any Fawry outlet or in the Fawry app, and the plan unlocks the moment the money arrives.'
                      )
                    : t(
                        'This payment is not confirmed yet. If you were charged, the plan unlocks as soon as the provider confirms it — refresh this page in a moment.'
                      )
                  : t('Nothing was charged. You can try again whenever you are ready.')}
            </p>
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

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {PLANS.map((plan) => {
          const isCurrent = currentPlanCode === plan.code;
          const piasters = billingCycle === 'annual' ? plan.annualPiasters : plan.monthlyPiasters;
          const priceDisplay = plan.monthlyPiasters === 0 ? '0 EGP' : formatEgpPrice(piasters);
          const periodLabel = plan.monthlyPiasters === 0 ? '' : billingCycle === 'annual' ? `/ ${t('year')}` : `/ ${t('month')}`;

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
                  {t('Popular')}
                </div>
              )}
              {plan.isBestValue && (
                <div className="absolute -top-3.5 start-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-extrabold shadow">
                  {t('Best Value')}
                </div>
              )}

              <div>
                {/* Plan Header */}
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">
                    {isAr ? plan.nameAr : plan.nameEn}
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
                  {plan.monthlyPiasters > 0 && billingCycle === 'annual' && (
                    <div className="text-[11px] text-emerald-600 font-bold mt-1">
                      {formatEgpPrice(Math.round(plan.annualPiasters / 12))} / {t('per month')} ({t('Billed annually')})
                    </div>
                  )}

                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-raised border border-border text-xs font-bold text-primary">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {plan.monthlyAiCredits} {t('Tokens')}{' '}
                      {plan.code === 'free' ? '(مرة واحدة)' : `/ ${t('per month')}`}
                    </span>
                  </div>
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
                    {t('Current Plan')}
                  </button>
                ) : plan.code === 'free' ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-2xl bg-surface-raised border border-border text-foreground text-xs font-bold"
                  >
                    {t('Default Account')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(plan)}
                    className={`w-full py-3 rounded-2xl text-xs font-extrabold shadow-md flex items-center justify-center gap-1.5 transition-all ${
                      plan.isPopular
                        ? 'bg-primary text-white hover:bg-primary-hover shadow-primary/20'
                        : plan.isBestValue
                        ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-600/20'
                        : 'bg-foreground text-surface hover:opacity-90'
                    }`}
                  >
                    <span>{t('Upgrade Now')}</span>
                    {isAr ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
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
                onClick={() => {
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
                className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold text-xs hover:bg-primary hover:text-white transition-all"
              >
                {formatEgpPrice(pack.pricePiasters)}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Payment methods, as this merchant account actually enables them. */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-primary/5 via-surface to-primary/5 border border-primary/20 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-start">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary shrink-0" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              {t('Secure payments through XPay')}
            </h3>
          </div>
          <p className="text-xs text-muted max-w-xl leading-relaxed">
            {xpayStatus?.paymentMethods?.egpSupported === false
              ? t(
                  'Card payment is not enabled for this account yet, so checkout is unavailable. Nothing is charged and no plan changes.'
                )
              : t(
                  'You pay on XPay’s secure page; Aionvia never sees or stores your card number. Your plan activates as soon as the payment is confirmed, and a Fawry reference activates it when the money arrives.'
                )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {paymentMethods.length === 0 ? (
            <span className="text-[11px] text-muted">
              {xpayStatus ? t('No payment method is enabled yet.') : t('Checking available payment methods…')}
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

          {xpayReady && (
            <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
              <h4 className="font-bold text-sm text-foreground">
                {t('Can I pay by bank card?')}
              </h4>
              <p className="text-xs text-muted leading-relaxed">
                {t(
                  'Yes. Choose a plan and you are taken to XPay’s secure page to pay by card, Apple Pay, Fawry or ValU. Aionvia never sees or stores your card number, and the plan activates as soon as the payment is confirmed.'
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
          monthlyPiasters={selectedPlan.monthlyPiasters}
          annualPiasters={selectedPlan.annualPiasters}
          aiCredits={selectedPlan.monthlyAiCredits}
        />
      )}
    </div>
  );
};
