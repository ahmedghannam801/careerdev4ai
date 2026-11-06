/**
 * PricingView — Production SaaS Pricing & Subscription Center.
 * Comprehensive Egyptian-pound tier catalog (Student, Pro, Career Plus), credit packs,
 * billing cycle toggles, and seamless Vodafone Cash / InstaPay checkout.
 */

import React, { useState } from 'react';
import {
  Check,
  Sparkles,
  Zap,
  Shield,
  Smartphone,
  CreditCard,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { CheckoutModal } from '../subscription/CheckoutModal';
import { formatEgpPrice } from '../../../shared/subscriptions';
import { CREDIT_PACKS } from '../../../shared/credits';

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
      '5 one-time trial AI credits',
      '100% free core platform forever',
    ],
    featuresAr: [
      'حساب شخصي وملف مهني مجاني بالكامل',
      'استكشاف الوظائف وحفظ حتى ٥ وظائف',
      'تصفح كتالوج المهارات والأدوار الوظيفية',
      'تتبع خطوات المسار المهني الأساسية',
      '٥ نقاط تجريبية مجانية لمرة واحدة',
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
      '25 monthly AI credits',
    ],
    featuresAr: [
      'منشئ السيرة الذاتية وتصدير PDF احترافي',
      'تحليل توافق السيرة الذاتية مع أنظمة ATS',
      'استخراج الكلمات المفتاحية من إعلانات الوظائف',
      'تخصيص السيرة الذاتية لكل فرصة عمل بالذكاء الاصطناعي',
      'توليد خطابات التقديم (Cover Letter) مخصصة',
      'خرائط تعلم وتطوير مهارات مخصصة',
      '٢٥ نقطة ذكاء اصطناعي شهرياً',
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
      '60 monthly AI credits',
    ],
    featuresAr: [
      'كل مميزات خطة الطلاب',
      'إصدارات متعددة وغير محدودة من السيرة الذاتية',
      'محاكاة المقابلات الشخصية بالذكاء الاصطناعي وتقييم الإجابات',
      'مستشار مهني ذكي على مدار الساعة للإرشاد والتوجيه',
      'معرض متقدم للمشاريع والإثباتات المهارية',
      'تقارير تفصيلية للجاهزية والنمو المهني',
      '٦٠ نقطة ذكاء اصطناعي شهرياً',
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
      '120 monthly AI credits',
    ],
    featuresAr: [
      'كل مميزات خطة المحترف',
      'محرك تغيير المسار المهني وسد الفجوات المتقدم',
      'تحليل مقارن للملاءمة بين عدة وظائف ومجالات',
      'محاكاة متقدمة للمقابلات القيادية والتقنية العميقة',
      'تقارير تنفيذية شاملة للمسار والنمو',
      'أولوية معالجة قصوى لكافة النماذج',
      '١٢٠ نقطة ذكاء اصطناعي شهرياً',
    ],
  },
];

export const PricingView: React.FC = () => {
  const { t, settings, subscription } = useCareer();
  const isAr = settings.language === 'ar';

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const currentPlanCode = subscription?.planCode ?? 'free';

  const handleSelectPlan = (plan: PlanDefinition) => {
    if (plan.code === 'free') return;
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16 animate-fadeIn" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Hero Header */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-bold uppercase tracking-wider">
          <Sparkles className="w-4 h-4" />
          <span>{t('Subscriptions & Pricing')} — مصممة لمصر والعالم العربي</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
          {t('Choose the plan that fits your career ambitions')}
        </h1>
        <p className="text-base sm:text-lg text-muted leading-relaxed">
          خطط عادلة وبسيطة بالجنيه المصري، تقبل التحويل الفوري عبر فودافون كاش وإنستاباي مع تفعيل فوري بدون بطاقات ائتمان بنكية دولية.
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
                  <h3 className="font-extrabold text-xl text-foreground">
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
                      {formatEgpPrice(Math.round(plan.annualPiasters / 12))} / {t('month')} ({t('Billed annually')})
                    </div>
                  )}

                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-raised border border-border text-xs font-bold text-primary">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {plan.monthlyAiCredits} {t('Credits')}{' '}
                      {plan.code === 'free' ? '(مرة واحدة)' : `/ ${t('month')}`}
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

      {/* Credit Booster Packs */}
      <div className="p-8 rounded-3xl bg-surface-raised border border-border space-y-6">
        <div className="text-center max-w-xl mx-auto space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            <span>{t('Top up credits')}</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground">{t('Credit Packs')}</h2>
          <p className="text-xs text-muted">
            اشحن رصيد ذكاء اصطناعي إضافي دون تغيير خطتك الحالية. الرصيد الإضافي لا تنتهي صلاحيته ويبقى في محفظتك.
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
                  <span>{pack.credits} {t('Credits')}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPlan({
                    code: pack.id,
                    nameEn: pack.nameEn,
                    nameAr: pack.nameAr,
                    taglineEn: `${pack.credits} AI Credits`,
                    taglineAr: `${pack.credits} نقطة ذكاء اصطناعي`,
                    monthlyPiasters: pack.pricePiasters,
                    annualPiasters: pack.pricePiasters,
                    monthlyAiCredits: pack.credits,
                    featuresEn: [`${pack.credits} AI credits`, 'Never expires'],
                    featuresAr: [`${pack.credits} نقطة رصيد`, 'بدون تاريخ انتهاء'],
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

      {/* Egyptian Payment Methods Banner */}
      <div className="p-8 rounded-3xl bg-gradient-to-r from-primary/5 via-surface to-primary/5 border border-primary/20 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-start">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary shrink-0" />
            <h3 className="text-lg font-bold text-foreground">
              طرق دفع محلية آمنة ١٠٠٪ بدون بطاقات ائتمانية دولية
            </h3>
          </div>
          <p className="text-xs text-muted max-w-xl leading-relaxed">
            ادفع مباشرة عبر محفظة فودافون كاش أو تطبيق إنستاباي. يتم تفعيل الوصول المؤقت فور رفع إيصال التحويل مع المراجعة البشرية الدقيقة لضمان أمان كل عملية.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border shadow-sm">
            <Smartphone className="w-5 h-5 text-red-600" />
            <span className="text-xs font-bold text-foreground">Vodafone Cash</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface border border-border shadow-sm">
            <CreditCard className="w-5 h-5 text-purple-600" />
            <span className="text-xs font-bold text-foreground">InstaPay</span>
          </div>
        </div>
      </div>

      {/* FAQ Accordion */}
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center space-y-1 mb-6">
          <h3 className="text-xl font-bold text-foreground">الأسئلة الشائعة حول الاشتراكات والمدفوعات</h3>
          <p className="text-xs text-muted">كل ما تحتاج معرفته عن سياسة الأسعار وتفعيل الاشتراكات في مصر</p>
        </div>

        <div className="space-y-3">
          <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
            <h4 className="font-bold text-sm text-foreground">هل الميزات الأساسية للمنصة مجانية بالفعل؟</h4>
            <p className="text-xs text-muted leading-relaxed">
              نعم، المنصة الأساسية مجانية بالكامل ١٠٠٪، وتشمل استكشاف الوظائف، تتبع الأهداف، وخرائط التعلم الأساسية. باقات الاشتراك مخصصة لتغطية تكاليف نماذج الذكاء الاصطناعي المتقدمة (Gemini) ومعالجة الوثائق ومحاكاة المقابلات.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
            <h4 className="font-bold text-sm text-foreground">كيف يتم تفعيل الحساب بعد التحويل عبر فودافون كاش أو إنستاباي؟</h4>
            <p className="text-xs text-muted leading-relaxed">
              بمجرد إدخال الرقم المرجعي للتحويل ورفع لقطة الشاشة للإيصال، يمنحك النظام وصولاً مؤقتاً لمدة ٢٤ ساعة لمتابعة مهامك على الفور، بينما يقوم المشرف بالتأكيد النهائي خلال ساعات العمل.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-surface border border-border space-y-1.5">
            <h4 className="font-bold text-sm text-foreground">ماذا يحدث إذا فشل استدعاء الذكاء الاصطناعي؟ هل أخسر رصيدي؟</h4>
            <p className="text-xs text-muted leading-relaxed">
              مستحيل! المنصة تطبق نظام دفتر الأستاذ المزدوج الآمن. إذا حدث أي انقطاع للشبكة أو خطأ في النموذج، يتم استرداد الرصيد المخصوم تلقائياً لحسابك فوراً.
            </p>
          </div>
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
