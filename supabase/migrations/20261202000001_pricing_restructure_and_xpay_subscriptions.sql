-- Migration: 20261202000001_pricing_restructure_and_xpay_subscriptions.sql
-- Description: The published 2026 pricing structure, and the bridge that makes
-- an XPay purchase a first-class subscription row.
--
-- Why this migration exists
-- -------------------------
-- 1. The plan catalogue still carried the launch pricing (99 / 179 / 299 EGP,
--    25 / 60 / 120 monthly tokens). The published structure is 49 / 99 / 179
--    EGP monthly, 490 / 990 / 1,790 EGP annual, and 15 / 40 / 85 tokens.
--    Every displayed price, checkout amount and token allowance reads this
--    table, so this is the only place the numbers are changed.
--
-- 2. XPay is the only payment rail, but a paid XPay session wrote only to
--    `xpay_purchases`. The daily entitlement, the admin screens and the expiry
--    sweep all read `public.subscriptions`, which therefore still said the
--    candidate was on the free plan. This migration adds an atomic activation
--    function and backfills the periods that were already paid for, so the two
--    records agree without touching any candidate's remaining access.
--
-- What is deliberately NOT changed
-- --------------------------------
--   * Existing subscriptions, users, token balances and ledger rows.
--   * The monthly token grant that fulfilment already performs. Annual plans
--     receive their further monthly installments from the scheduled sweep
--     (server/xpay/installments.ts), never twelve months at once.
--   * Recurring billing. auto_renew stays false: XPay recurring is not enabled
--     for this merchant account, so every plan is a one-time period.

-- ---------------------------------------------------------------------------
-- 1. The published catalogue
-- ---------------------------------------------------------------------------

INSERT INTO public.subscription_plans (
  code, name_en, name_ar, description_en, description_ar,
  price_monthly_piasters, price_annual_piasters, monthly_ai_credits,
  features, sort_order, is_active
) VALUES
(
  'free', 'Free Explorer', 'المستكشف المجاني',
  'A basic account and career profile, live jobs, saved roles and a five-token start.',
  'حساب أساسي وملف مهني، وظائف مباشرة، حفظ الوظائف، وخمسة توكنات للبداية.',
  0, 0, 0,
  '{
    "save_jobs_limit": 5,
    "one_time_trial_credits": 5,
    "cv_builder": true,
    "job_description_analysis": true,
    "roadmap": true,
    "skill_catalogue": true,
    "milestones": true,
    "entitlements": ["cv.builder", "job_description.analysis", "roadmap.generate"]
  }'::jsonb,
  1, true
),
(
  'student', 'Student & Early Career', 'الطلاب والبدايات المهنية',
  'CV builder and PDF export, ATS score and gap analysis, tailored CVs, cover letters and learning roadmaps.',
  'منشئ السيرة الذاتية وتصدير PDF، تحليل ATS والفجوات، تخصيص السيرة، خطابات التقديم، وخرائط التعلم.',
  4900, 49000, 15,
  '{
    "save_jobs_limit": 50,
    "cv_builder": true,
    "ats_analysis": true,
    "cv_tailoring": true,
    "cover_letter": true,
    "roadmap": true,
    "skill_gap": true,
    "cv_export": true,
    "entitlements": [
      "cv.builder", "cv.tailoring", "cv.export_pdf", "ats.analysis",
      "job_description.analysis", "cover_letter.generate", "roadmap.generate",
      "roadmap.full_stages"
    ]
  }'::jsonb,
  2, true
),
(
  'pro', 'Professional', 'المحترف',
  'Everything in Student, plus unlimited CV versions, mock interviews, a career mentor, an advanced portfolio and progress reports.',
  'كل ما في خطة الطلاب، بالإضافة إلى نسخ سيرة غير محدودة، مقابلات تجريبية، مرشد مهني، معرض أعمال متقدم، وتقارير تقدم.',
  9900, 99000, 40,
  '{
    "save_jobs_limit": 200,
    "multiple_cv_versions": true,
    "interview_simulation": true,
    "ai_career_mentor": true,
    "advanced_portfolio": true,
    "progress_reports": true,
    "entitlements": [
      "cv.builder", "cv.tailoring", "cv.multiple_versions", "cv.export_pdf",
      "ats.analysis", "ats.detailed_breakdown", "job_description.analysis",
      "cover_letter.generate", "roadmap.generate", "roadmap.full_stages",
      "interview.mock_simulation", "ai_mentor.session", "portfolio.advanced",
      "career.reports"
    ]
  }'::jsonb,
  3, true
),
(
  'career_plus', 'Career Plus', 'المسار المتقدم (Plus)',
  'Everything in Professional, plus the career transition engine, multi-role comparative fit, deep scenario interviews and priority AI.',
  'كل ما في خطة المحترف، بالإضافة إلى محرك التحول المهني، مقارنة الملاءمة بين الأدوار، مقابلات سيناريو متقدمة، وأولوية في المعالجة.',
  17900, 179000, 85,
  '{
    "save_jobs_limit": 1000,
    "advanced_interview_simulation": true,
    "career_transition_plans": true,
    "job_comparisons": true,
    "extended_reports": true,
    "priority_processing": true,
    "entitlements": [
      "cv.builder", "cv.tailoring", "cv.multiple_versions", "cv.export_pdf",
      "ats.analysis", "ats.detailed_breakdown", "job_description.analysis",
      "cover_letter.generate", "roadmap.generate", "roadmap.full_stages",
      "interview.mock_simulation", "interview.deep_simulation",
      "ai_mentor.session", "ai.priority_processing", "portfolio.advanced",
      "career.reports", "career.transition_plan", "career.comparative_fit"
    ]
  }'::jsonb,
  4, true
)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  description_en = EXCLUDED.description_en,
  description_ar = EXCLUDED.description_ar,
  price_monthly_piasters = EXCLUDED.price_monthly_piasters,
  price_annual_piasters = EXCLUDED.price_annual_piasters,
  monthly_ai_credits = EXCLUDED.monthly_ai_credits,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

-- The catalogue is priced in EGP only, and the annual price is always ten
-- monthly payments: two months free, exactly what the page says.
DO $$
DECLARE
  bad RECORD;
BEGIN
  SELECT code INTO bad
  FROM public.subscription_plans
  WHERE code <> 'free'
    AND price_annual_piasters <> price_monthly_piasters * 10
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'annual price for % is not ten monthly payments', bad.code;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Activating a paid XPay period
-- ---------------------------------------------------------------------------
--
-- Called by the webhook handler only after `paymentStatus = paid`. It is the
-- single writer of an XPay subscription row, and it is idempotent on the XPay
-- session: a retried delivery returns the row it already created instead of
-- opening a second period or double-expiring the previous one.

CREATE OR REPLACE FUNCTION public.activate_xpay_subscription(
  p_profile_id uuid,
  p_plan_code text,
  p_billing_cycle text,
  p_period_starts_at timestamptz,
  p_period_ends_at timestamptz,
  p_xpay_session text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan_id uuid;
  v_existing_id uuid;
  v_previous_id uuid;
  v_subscription_id uuid;
BEGIN
  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_id is required';
  END IF;
  IF p_billing_cycle IS NULL OR p_billing_cycle NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'billing_cycle must be monthly or annual';
  END IF;
  IF p_period_starts_at IS NULL OR p_period_ends_at IS NULL
     OR p_period_ends_at <= p_period_starts_at THEN
    RAISE EXCEPTION 'period_ends_at must be after period_starts_at';
  END IF;

  SELECT id INTO v_plan_id
  FROM public.subscription_plans
  WHERE code = p_plan_code;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'unknown plan code %', p_plan_code;
  END IF;

  -- A redelivery of the same session must not open a second period, and must
  -- not resurrect a period that has since been replaced or has expired. The
  -- session id is the receipt: once a row carries it, that is the answer.
  IF p_xpay_session IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.subscriptions
    WHERE profile_id = p_profile_id
      AND metadata->>'xpay_session' = p_xpay_session
    ORDER BY created_at
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'subscription_id', v_existing_id,
        'previous_id', NULL,
        'created', false
      );
    END IF;
  END IF;

  -- One active subscription per candidate: the unique index enforces it, so
  -- the previous period is closed before the new one is inserted.
  SELECT id INTO v_previous_id
  FROM public.subscriptions
  WHERE profile_id = p_profile_id
    AND status = 'active'
  ORDER BY current_period_ends_at DESC, created_at DESC
  LIMIT 1;

  IF v_previous_id IS NOT NULL THEN
    UPDATE public.subscriptions
    SET status = 'expired',
        ended_at = now(),
        cancelled_at = COALESCE(cancelled_at, now()),
        cancellation_reason = COALESCE(cancellation_reason, 'replaced_by_new_purchase'),
        auto_renew = false,
        updated_at = now()
    WHERE id = v_previous_id;
  END IF;

  INSERT INTO public.subscriptions (
    profile_id, plan_id, billing_cycle, status,
    current_period_starts_at, current_period_ends_at,
    auto_renew, metadata
  ) VALUES (
    p_profile_id, v_plan_id, p_billing_cycle, 'active',
    p_period_starts_at, p_period_ends_at,
    false,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'source', 'xpay',
      'xpay_session', p_xpay_session,
      'recurring', false
    )
  )
  RETURNING id INTO v_subscription_id;

  RETURN jsonb_build_object(
    'subscription_id', v_subscription_id,
    'previous_id', v_previous_id,
    'created', true
  );
END;
$$;

COMMENT ON FUNCTION public.activate_xpay_subscription(uuid, text, text, timestamptz, timestamptz, text, jsonb) IS
  'Opens the one active subscription a confirmed XPay payment buys. Idempotent on the XPay session id.';

REVOKE ALL ON FUNCTION public.activate_xpay_subscription(uuid, text, text, timestamptz, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_xpay_subscription(uuid, text, text, timestamptz, timestamptz, text, jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Backfill the periods that were paid for before the bridge existed
-- ---------------------------------------------------------------------------
--
-- Only candidates with no active subscription row are backfilled. An account
-- that already has an active period keeps it: this migration must never expire
-- a paid period, downgrade a plan or restart a cycle.

DO $$
DECLARE
  purchase RECORD;
  activated integer := 0;
BEGIN
  FOR purchase IN
    SELECT DISTINCT ON (p.profile_id)
      p.profile_id,
      p.plan_code,
      COALESCE(p.billing_cycle, 'monthly') AS billing_cycle,
      p.access_starts_at,
      p.access_ends_at,
      p.session_id
    FROM public.xpay_purchases p
    WHERE p.purchase_kind = 'subscription'
      AND p.plan_code IS NOT NULL
      AND p.status = 'active'
      AND p.access_ends_at IS NOT NULL
      AND p.access_ends_at > now()
      AND NOT EXISTS (
        SELECT 1 FROM public.subscriptions s
        WHERE s.profile_id = p.profile_id AND s.status = 'active'
      )
    ORDER BY p.profile_id, p.access_ends_at DESC, p.created_at DESC
  LOOP
    PERFORM public.activate_xpay_subscription(
      purchase.profile_id,
      purchase.plan_code,
      purchase.billing_cycle,
      purchase.access_starts_at,
      purchase.access_ends_at,
      purchase.session_id,
      jsonb_build_object('backfilled', true)
    );
    activated := activated + 1;
  END LOOP;

  RAISE NOTICE 'XPay subscription backfill: % period(s) linked', activated;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Subscription metadata used by the screens and the sweep
-- ---------------------------------------------------------------------------

-- One row per paid session, in any status. Two concurrent deliveries of the
-- same event cannot both pass the lookup above and insert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_xpay_session
  ON public.subscriptions (profile_id, (metadata->>'xpay_session'))
  WHERE (metadata ? 'xpay_session');

-- The screens also look a period up by session alone.
CREATE INDEX IF NOT EXISTS idx_subscriptions_xpay_session_lookup
  ON public.subscriptions ((metadata->>'xpay_session'))
  WHERE (metadata ? 'xpay_session');
