-- CV templates.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The CV Studio ships a catalogue of structurally distinct templates. The
-- catalogue itself is code (shared/cvTemplates.ts), because a template's
-- structure is what the renderer implements and what the uniqueness test
-- protects. What an administrator needs to change without a deploy is the
-- METADATA around a template: its name, category, free/premium tier, whether
-- it is featured, its order, its thumbnail and whether it is enabled.
--
-- WHAT THIS MIGRATION ADDS
-- ------------------------
--   * `public.cv_templates` — the administrator's metadata rows. A row whose
--     `base_template_id` is null overrides a built-in template. A row whose
--     `base_template_id` names a built-in template creates a new template that
--     reuses that structure under its own metadata.
--   * `public.user_preferences.cv_template_id` — the template the candidate
--     chose, stored on the account so it follows them to another device.
--
-- SECURITY
-- --------
-- The browser never reads or writes `cv_templates` directly. Every read and
-- write goes through the API, which uses the service role and enforces
-- `plans.manage` for administration. Row-level security is enabled and all
-- access is revoked from `anon` and `authenticated`; the service role bypasses
-- RLS, so the API keeps working and a signed-in client cannot forge a template
-- row or change its own tier.
--
-- The free template is a code constant (`ats-classic`), not a database flag,
-- so an administrator cannot accidentally lock every candidate out of every
-- template. The column default is that template for existing accounts.

CREATE TABLE IF NOT EXISTS public.cv_templates (
  template_id text PRIMARY KEY,
  name_en text,
  name_ar text,
  category text,
  tier text,
  enabled boolean NOT NULL DEFAULT true,
  featured boolean NOT NULL DEFAULT false,
  sort_order integer,
  thumbnail_url text,
  description_en text,
  description_ar text,
  base_template_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cv_templates_tier_check CHECK (tier IS NULL OR tier IN ('free', 'premium')),
  CONSTRAINT cv_templates_id_check CHECK (template_id ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  CONSTRAINT cv_templates_base_id_check CHECK (
    base_template_id IS NULL OR base_template_id ~ '^[a-z0-9][a-z0-9-]{1,47}$'
  ),
  CONSTRAINT cv_templates_sort_order_check CHECK (
    sort_order IS NULL OR (sort_order >= 0 AND sort_order <= 9999)
  ),
  CONSTRAINT cv_templates_thumbnail_check CHECK (
    thumbnail_url IS NULL OR thumbnail_url ~ '^(https?://|/)'
  )
);

ALTER TABLE public.cv_templates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.cv_templates FROM anon;
REVOKE ALL ON public.cv_templates FROM authenticated;
GRANT ALL ON public.cv_templates TO service_role;

DROP TRIGGER IF EXISTS cv_templates_touch_updated_at ON public.cv_templates;
CREATE TRIGGER cv_templates_touch_updated_at
  BEFORE UPDATE ON public.cv_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.careerpilot_set_updated_at();

COMMENT ON TABLE public.cv_templates IS
  'Administrator metadata for CV templates. The template structure lives in shared/cvTemplates.ts and is never editable from a browser.';
COMMENT ON COLUMN public.cv_templates.base_template_id IS
  'For an administrator-authored template, the built-in structure it reuses. Null means this row overrides a built-in template.';

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS cv_template_id text NOT NULL DEFAULT 'ats-classic';

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_cv_template_id_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_cv_template_id_check
  CHECK (cv_template_id ~ '^[a-z0-9][a-z0-9-]{1,47}$');

COMMENT ON COLUMN public.user_preferences.cv_template_id IS
  'The CV template the candidate chose. Presentation only: changing it never changes the CV facts.';
