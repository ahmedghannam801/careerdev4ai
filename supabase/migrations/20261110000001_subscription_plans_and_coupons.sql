-- Migration: 20261110000001_subscription_plans_and_coupons.sql
-- Description: Core Catalogs for Subscription Plans and Coupon Definitions
--
-- Tables:
-- 1. public.subscription_plans (Plan Catalog: Free, Student, Pro, Career Plus)
-- 2. public.coupon_definitions (Promotions & Discounts engine)

-- ---------------------------------------------------------------------------
-- 1. subscription_plans
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  description_en text,
  description_ar text,
  price_monthly_piasters integer NOT NULL DEFAULT 0,
  price_annual_piasters integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EGP',
  monthly_ai_credits integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT subscription_plans_code_key UNIQUE (code),
  CONSTRAINT subscription_plans_currency_check CHECK (currency = 'EGP'),
  CONSTRAINT subscription_plans_price_monthly_check CHECK (price_monthly_piasters >= 0),
  CONSTRAINT subscription_plans_price_annual_check CHECK (price_annual_piasters >= 0),
  CONSTRAINT subscription_plans_credits_check CHECK (monthly_ai_credits >= 0),
  CONSTRAINT subscription_plans_code_vocab_check CHECK (
    code IN ('free', 'student', 'pro', 'career_plus')
  )
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_sort 
  ON public.subscription_plans (is_active, sort_order ASC);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_plans_select_active ON public.subscription_plans;
CREATE POLICY subscription_plans_select_active ON public.subscription_plans
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS subscription_plans_admin_select ON public.subscription_plans;
CREATE POLICY subscription_plans_admin_select ON public.subscription_plans
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

DROP POLICY IF EXISTS subscription_plans_admin_manage ON public.subscription_plans;
CREATE POLICY subscription_plans_admin_manage ON public.subscription_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() 
        AND au.status = 'active' 
        AND au.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() 
        AND au.status = 'active' 
        AND au.role = 'super_admin'
    )
  );

GRANT SELECT ON public.subscription_plans TO anon, authenticated;
GRANT ALL ON public.subscription_plans TO service_role;

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

-- Seed initial plans with approved commercial pricing in integer piasters (1 EGP = 100 piasters)
INSERT INTO public.subscription_plans (
  code, name_en, name_ar, description_en, description_ar,
  price_monthly_piasters, price_annual_piasters, monthly_ai_credits, features, sort_order
) VALUES 
('free', 'Free Explorer', 'المستكشف المجاني',
 'Basic account with career path previews and limited AI trial',
 'حساب أساسي مع استكشاف المسارات المهنية وتجربة ذكاء اصطناعي محدودة',
 0, 0, 0,
 '{"save_jobs_limit": 5, "cv_tailoring": false, "mock_interviews": false, "one_time_trial_credits": 5}'::jsonb, 1),

('student', 'Student Booster', 'داعم الطلاب',
 'Essential career tools for university students and fresh graduates',
 'الأدوات المهنية الأساسية لطلاب الجامعات وحديثي التخرج',
 9900, 99900, 25,
 '{"save_jobs_limit": 50, "cv_builder": true, "ats_analysis": true, "cv_tailoring": true, "cover_letter": true, "roadmap": true, "skill_gap": true, "cv_export": true}'::jsonb, 2),

('pro', 'Professional Accelerator', 'المتسارع المهني',
 'Advanced intelligence for working professionals and career switchers',
 'ذكاء متقدم للمهنيين والمتحولين وظيفياً',
 17900, 179000, 60,
 '{"save_jobs_limit": 200, "multiple_cv_versions": true, "interview_simulation": true, "ai_career_mentor": true, "advanced_portfolio": true, "progress_reports": true}'::jsonb, 3),

('career_plus', 'Career Plus Elite', 'النخبة بلس',
 'Complete executive career supercharging with maximum AI capacity',
 'تعزيز مهني شامل مع أقصى سعة من الذكاء الاصطناعي',
 29900, 299000, 120,
 '{"save_jobs_limit": 1000, "advanced_interview_simulation": true, "career_transition_plans": true, "job_comparisons": true, "extended_reports": true}'::jsonb, 4)
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
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. coupon_definitions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupon_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  discount_type text NOT NULL,
  discount_value integer NOT NULL,
  max_discount_piasters integer,
  min_order_piasters integer NOT NULL DEFAULT 0,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  max_total_redemptions integer,
  max_redemptions_per_user integer NOT NULL DEFAULT 1,
  times_redeemed integer NOT NULL DEFAULT 0,
  applicable_plan_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  is_combinable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT coupon_definitions_discount_type_check CHECK (
    discount_type IN ('percentage', 'fixed_amount')
  ),
  CONSTRAINT coupon_definitions_discount_value_check CHECK (
    discount_value > 0 AND
    (discount_type <> 'percentage' OR discount_value <= 100)
  ),
  CONSTRAINT coupon_definitions_max_discount_check CHECK (
    max_discount_piasters IS NULL OR max_discount_piasters > 0
  ),
  CONSTRAINT coupon_definitions_min_order_check CHECK (
    min_order_piasters >= 0
  ),
  CONSTRAINT coupon_definitions_validity_window CHECK (
    valid_until > valid_from
  ),
  CONSTRAINT coupon_definitions_redemptions_check CHECK (
    (max_total_redemptions IS NULL OR max_total_redemptions > 0) AND
    max_redemptions_per_user > 0 AND
    times_redeemed >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_definitions_code_upper
  ON public.coupon_definitions (upper(trim(code)));

CREATE INDEX IF NOT EXISTS idx_coupon_definitions_valid_window
  ON public.coupon_definitions (is_active, valid_from, valid_until);

ALTER TABLE public.coupon_definitions ENABLE ROW LEVEL SECURITY;

-- BLK-11: Direct client SELECT removed to prevent scraping of promotional coupons.
-- Coupon validation is performed exclusively server-side via validateCoupon().
DROP POLICY IF EXISTS coupon_definitions_select_active ON public.coupon_definitions;

DROP POLICY IF EXISTS coupon_definitions_admin_all ON public.coupon_definitions;
CREATE POLICY coupon_definitions_admin_all ON public.coupon_definitions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au 
      WHERE au.profile_id = auth.uid() AND au.status = 'active'
    )
  );

-- Client direct SELECT revoked
-- GRANT SELECT ON public.coupon_definitions TO authenticated;
GRANT ALL ON public.coupon_definitions TO service_role;

DROP TRIGGER IF EXISTS trg_coupon_definitions_updated_at ON public.coupon_definitions;
CREATE TRIGGER trg_coupon_definitions_updated_at
  BEFORE UPDATE ON public.coupon_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

