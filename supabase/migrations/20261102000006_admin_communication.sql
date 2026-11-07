-- Admin hierarchy and the Admin Communication Center.
--
-- The platform had no administrative layer at all. This migration adds the
-- minimum durable model behind a real notification/delivery system:
--
--   admin_users            one row per administrator, keyed by the profile
--                          (auth.users.id) that owns the role.
--   announcements          a message a Content/Super Admin writes, targets and
--                          publishes. Drafts are private; publishing delivers.
--   admin_audit_log        what an administrator did, to what, and when.
--
-- Delivery is not a frontend toast. Publishing an announcement inserts one
-- public.notifications row per recipient, tagged with announcement_id, so the
-- existing drawer, unread count and read state keep working unchanged.
--
-- Ownership model: admin_users.profile_id = auth.users.id, exactly like every
-- other domain table. The API checks permissions server-side; RLS only narrows
-- direct client access, which is not used for administration.

-- ---------------------------------------------------------------------------
-- 1. admin_users
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'moderator',
  status text NOT NULL DEFAULT 'active',
  -- Empty means "use the role's default permission set". A non-empty array is
  -- an explicit override, and the server validates every value.
  permissions text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_role_check CHECK (role IN (
    'super_admin', 'content_admin', 'opportunity_admin', 'moderator'
  )),
  CONSTRAINT admin_users_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role ON public.admin_users(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_status ON public.admin_users(status);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- An administrator may read their own row, which is what the client uses to
-- decide whether to show the Admin Center entry. They cannot read the roster,
-- write a role or change a status directly: those go through the API, which
-- re-checks the verified token and the permission set.
DROP POLICY IF EXISTS admin_users_select_self ON public.admin_users;
CREATE POLICY admin_users_select_self ON public.admin_users
  FOR SELECT USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 2. announcements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'draft',
  audience_type text NOT NULL DEFAULT 'all',
  -- Profile ids for `users`; the selected values for the filtered audiences.
  audience_values text[] NOT NULL DEFAULT '{}'::text[],
  -- Where the notification's "Take Action" link should open, when any.
  link_view text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_name text,
  published_at timestamptz,
  archived_at timestamptz,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT announcements_priority_check CHECK (priority IN ('normal', 'important', 'urgent')),
  CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT announcements_audience_check CHECK (audience_type IN (
    'all', 'users', 'target_role', 'target_industry', 'user_type', 'country'
  ))
);

CREATE INDEX IF NOT EXISTS idx_announcements_status_created
  ON public.announcements(status, created_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Published announcements are readable by any signed-in user. Drafts and
-- archived rows are not, even though the recipient already has a notification
-- for a published one.
DROP POLICY IF EXISTS announcements_select_published ON public.announcements;
CREATE POLICY announcements_select_published ON public.announcements
  FOR SELECT TO authenticated
  USING (status = 'published');

-- ---------------------------------------------------------------------------
-- 3. admin_audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  admin_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created
  ON public.admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin
  ON public.admin_audit_log(admin_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
-- No client policy: the audit trail is read through the permission-checked API.

-- ---------------------------------------------------------------------------
-- 4. Notifications: announcements are a real notification type
-- ---------------------------------------------------------------------------

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS announcement_id uuid
    REFERENCES public.announcements(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'interview', 'roadmap', 'application', 'achievement', 'system', 'announcement'
  ));

CREATE INDEX IF NOT EXISTS idx_notifications_announcement
  ON public.notifications(announcement_id) WHERE announcement_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Bootstrap the first Super Admin
--
-- The owner account is identified by its verified auth.users email. If that
-- account does not exist the migration does nothing rather than granting
-- administrative rights to an arbitrary profile. Re-running is safe.
-- ---------------------------------------------------------------------------

INSERT INTO public.admin_users (profile_id, email, full_name, role, status)
SELECT
  p.id,
  u.email,
  coalesce(p.full_name, split_part(u.email, '@', 1)),
  'super_admin',
  'active'
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) = lower('ahdabdalla77@gmail.com')
  -- The account must have a confirmed email. An unconfirmed signup using this
  -- address must never receive administrative rights.
  AND u.email_confirmed_at IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      updated_at = now()
  -- The upsert only ever creates the bootstrap administrator. It never
  -- re-promotes an existing row, so a demoted or disabled account stays
  -- demoted when the migration is replayed.
  WHERE admin_users.role = 'super_admin'
    AND admin_users.status = 'active';
