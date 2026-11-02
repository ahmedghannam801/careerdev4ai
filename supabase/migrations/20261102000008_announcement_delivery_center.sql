-- Admin Communication Center, phase 2.
--
-- The first admin migration delivered an announcement by inserting one
-- public.notifications row per recipient. That made the inbox real, but it had
-- no delivery ledger: read/click analytics, scheduling and multi-filter
-- targeting could not be answered truthfully from the data.
--
-- This migration adds the missing durable pieces without replacing anything:
--
--   announcements            richer composition fields (image, category, CTA),
--                            scheduling and expiry columns, and a JSONB
--                            targeting configuration. The legacy
--                            audience_type/audience_values columns stay so old
--                            announcements keep resolving exactly as before.
--   announcement_deliveries  one row per (announcement, recipient), with
--                            delivered_at / read_at / clicked_at. This is the
--                            ledger every analytics figure is computed from.
--   notifications.clicked_at the user-facing notification mirrors the click
--                            state, so the bell and the delivery agree.
--
-- Nothing is deleted. Existing notifications with announcement_id are
-- backfilled into the delivery ledger, so current announcements immediately
-- have real analytics.
--
-- Ownership model is unchanged: delivery.profile_id = auth.users.id and
-- RLS allows a user to read or update only their own delivery. Administration
-- always goes through the permission-checked API, which uses the service role.

-- ---------------------------------------------------------------------------
-- 1. announcements: composition, scheduling, expiry and targeting rules
-- ---------------------------------------------------------------------------

ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS cta_text text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS cta_url text;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS publish_at timestamptz;
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS expires_at timestamptz;
-- Targeting rules:
--   [ { "logic": "and"|"or",
--       "conditions": [ { "field": "...", "values": ["..."] } ] } ]
-- Groups are ANDed; conditions inside a group use the group's logic. An empty
-- array means "use the legacy audience_type/audience_values columns".
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS audience_rules jsonb NOT NULL DEFAULT '[]'::jsonb;
-- A human-readable summary of the targeting, written by the server for history.
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS audience_summary text;

-- Priorities: the product vocabulary is normal / important / critical. The
-- original implementation used 'urgent'; rename the stored value in place.
ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_priority_check;
UPDATE public.announcements SET priority = 'critical' WHERE priority = 'urgent';
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_priority_check
  CHECK (priority IN ('normal', 'important', 'critical'));

-- Statuses now include server-side scheduling and expiry.
ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_status_check;
ALTER TABLE public.announcements
  ADD CONSTRAINT announcements_status_check
  CHECK (status IN ('draft', 'scheduled', 'published', 'expired', 'archived'));

CREATE INDEX IF NOT EXISTS idx_announcements_due
  ON public.announcements(publish_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_announcements_expiry
  ON public.announcements(expires_at)
  WHERE status = 'published' AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_category
  ON public.announcements(category, created_at DESC);

-- Published announcements remain readable by signed-in users. Scheduled,
-- expired and archived rows are administrative history.
DROP POLICY IF EXISTS announcements_select_published ON public.announcements;
CREATE POLICY announcements_select_published ON public.announcements
  FOR SELECT TO authenticated
  USING (status = 'published');

-- ---------------------------------------------------------------------------
-- 2. announcement_deliveries: the real per-user delivery ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.announcement_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  clicked_at timestamptz,
  CONSTRAINT announcement_deliveries_unique_recipient
    UNIQUE (announcement_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_announcement
  ON public.announcement_deliveries(announcement_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_profile
  ON public.announcement_deliveries(profile_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_unread
  ON public.announcement_deliveries(announcement_id)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_clicked
  ON public.announcement_deliveries(announcement_id)
  WHERE clicked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_notification
  ON public.announcement_deliveries(notification_id)
  WHERE notification_id IS NOT NULL;

ALTER TABLE public.announcement_deliveries ENABLE ROW LEVEL SECURITY;

-- A user may see and update only their own delivery. They cannot insert a
-- delivery or touch somebody else's, and administration is never attempted
-- from the client.
DROP POLICY IF EXISTS announcement_deliveries_select_own
  ON public.announcement_deliveries;
CREATE POLICY announcement_deliveries_select_own ON public.announcement_deliveries
  FOR SELECT USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS announcement_deliveries_update_own
  ON public.announcement_deliveries;
CREATE POLICY announcement_deliveries_update_own ON public.announcement_deliveries
  FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 3. notifications: click state
-- ---------------------------------------------------------------------------

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_profile_announcement
  ON public.notifications(profile_id, announcement_id)
  WHERE announcement_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Backfill existing announcements into the delivery ledger
-- ---------------------------------------------------------------------------

INSERT INTO public.announcement_deliveries (
  announcement_id, profile_id, notification_id, delivered_at, read_at
)
SELECT
  n.announcement_id,
  n.profile_id,
  n.id,
  n.created_at,
  n.read_at
FROM public.notifications n
WHERE n.announcement_id IS NOT NULL
ON CONFLICT (announcement_id, profile_id) DO NOTHING;

-- Recompute the stored recipient count from the ledger, keeping it meaningful
-- for announcements that were delivered before this migration.
UPDATE public.announcements a
SET recipient_count = stats.delivered_count
FROM (
  SELECT announcement_id, count(*)::integer AS delivered_count
  FROM public.announcement_deliveries
  GROUP BY announcement_id
) stats
WHERE a.id = stats.announcement_id
  AND a.recipient_count IS DISTINCT FROM stats.delivered_count;

-- ---------------------------------------------------------------------------
-- 5. Aggregate analytics view
--
-- Every rate is computed from delivery rows, never from the announcement's
-- stored count. The view is for the service-role API only: revoking client
-- access avoids exposing platform-wide communication metrics.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.announcement_delivery_stats AS
SELECT
  announcement_id,
  count(*)::integer AS delivered_count,
  count(read_at)::integer AS read_count,
  count(clicked_at)::integer AS clicked_count
FROM public.announcement_deliveries
GROUP BY announcement_id;

REVOKE ALL ON public.announcement_delivery_stats FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Indexes used by the server-side targeting engine
--
-- Targeting resolves sets of profile ids by field. These indexes keep the
-- lookups bounded as the user base grows instead of scanning every profile.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_target_role ON public.profiles(target_role);
CREATE INDEX IF NOT EXISTS idx_profiles_target_industry ON public.profiles(target_industry);
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles(country);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON public.profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles(location);

CREATE INDEX IF NOT EXISTS idx_skills_name_lower ON public.skills(lower(name));

CREATE INDEX IF NOT EXISTS idx_educations_institution
  ON public.educations(lower(institution));
CREATE INDEX IF NOT EXISTS idx_educations_field
  ON public.educations(lower(field_of_study));
CREATE INDEX IF NOT EXISTS idx_educations_degree
  ON public.educations(lower(degree));

CREATE INDEX IF NOT EXISTS idx_roadmaps_target_role
  ON public.roadmaps(target_role_title);

CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_courses_title_lower ON public.courses(lower(title));
