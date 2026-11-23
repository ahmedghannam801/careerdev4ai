-- Persistent email delivery for Aionvia.
--
-- Everything the platform promises to send is written down before anything is
-- sent. A row in `email_queue` is the promise; the worker that drains it runs
-- on the Cloudflare cron and in Node, never in a browser, so a candidate who
-- closes the site still receives the mail.
--
-- The tables are additive. Nothing that exists is replaced:
--
--   email_preferences      per-account consent, categories and digest choices.
--   email_queue            one durable row per message, with retries,
--                          idempotency, locking and dead-letter state.
--   email_events           the delivery ledger written by the Resend webhook.
--   email_suppressions     addresses that must not be mailed again (hard
--                          bounce, complaint, unsubscribe).
--
-- `announcements` gains two columns so an administrative announcement can also
-- be delivered by email, with its own send timestamp.
--
-- Ownership model: user_id = auth.users.id, exactly like every other
-- account-owned table. The queue and the ledger are service-role only: a
-- candidate reads their preferences through the API, never the queue.

-- ---------------------------------------------------------------------------
-- 1. email_preferences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The master switch for non-transactional email. Account security and
  -- receipts are sent regardless: they are part of the service, not marketing.
  email_enabled boolean NOT NULL DEFAULT true,
  security_alerts boolean NOT NULL DEFAULT true,
  billing_updates boolean NOT NULL DEFAULT true,
  application_updates boolean NOT NULL DEFAULT true,
  interview_updates boolean NOT NULL DEFAULT true,
  roadmap_updates boolean NOT NULL DEFAULT true,
  job_alerts boolean NOT NULL DEFAULT true,
  opportunity_alerts boolean NOT NULL DEFAULT true,
  learning_updates boolean NOT NULL DEFAULT true,
  volunteering_updates boolean NOT NULL DEFAULT true,
  project_updates boolean NOT NULL DEFAULT true,
  assessment_updates boolean NOT NULL DEFAULT true,
  career_recommendations boolean NOT NULL DEFAULT true,
  announcements boolean NOT NULL DEFAULT true,
  -- Digests are opt-in for the daily one and on by default for the weekly
  -- one, so a new account is informed without being mailed every day.
  daily_digest boolean NOT NULL DEFAULT false,
  weekly_digest boolean NOT NULL DEFAULT true,
  -- The hour (UTC) the digest is queued. Every account is processed by the
  -- same sweep, so this is a preference for the delivery window, not a
  -- separate timer.
  digest_hour integer NOT NULL DEFAULT 7,
  -- The signed token in every unsubscribe link. It is opaque and unguessable;
  -- the public unsubscribe route accepts only this value.
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  -- Set when the reader follows an unsubscribe link. It disables all
  -- non-transactional mail and is the record that the request was honoured.
  unsubscribed_all boolean NOT NULL DEFAULT false,
  unsubscribed_at timestamptz,
  -- Consent history. The first row is created with the account; a change of
  -- preferences updates `consent_updated_at`.
  consent_granted_at timestamptz NOT NULL DEFAULT now(),
  consent_updated_at timestamptz NOT NULL DEFAULT now(),
  consent_source text NOT NULL DEFAULT 'signup',
  last_daily_digest_at timestamptz,
  last_weekly_digest_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_preferences_digest_hour_check
    CHECK (digest_hour >= 0 AND digest_hour <= 23)
);

CREATE INDEX IF NOT EXISTS idx_email_preferences_digest
  ON public.email_preferences(daily_digest, weekly_digest)
  WHERE email_enabled = true AND unsubscribed_all = false;

ALTER TABLE public.email_preferences ENABLE ROW LEVEL SECURITY;

-- A candidate may read their own row. Writes go through the permission-checked
-- API (which uses the service role), so a direct PostgREST call cannot set a
-- flag the interface would not set.
DROP POLICY IF EXISTS email_preferences_select_own ON public.email_preferences;
CREATE POLICY email_preferences_select_own ON public.email_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.email_preferences FROM anon, authenticated;
GRANT SELECT ON public.email_preferences TO authenticated;
GRANT ALL ON public.email_preferences TO service_role;

-- One row for every existing account. Re-running is safe.
INSERT INTO public.email_preferences (user_id)
SELECT p.id FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. email_queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  template text NOT NULL,
  category text NOT NULL,
  -- The values the template needs. HTML is rendered at send time so the
  -- recipient's language and unsubscribe token are the ones in force when the
  -- message actually leaves.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- The value sent to the provider as its idempotency key. It is unique here,
  -- so the same event enqueued twice produces one row and one message.
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  lock_expires_at timestamptz,
  provider_message_id text,
  last_error text,
  announcement_id uuid REFERENCES public.announcements(id) ON DELETE SET NULL,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_queue_status_check CHECK (status IN (
    'pending', 'processing', 'sent', 'delivered', 'failed', 'dead_letter',
    'suppressed', 'blocked', 'bounced', 'complained'
  )),
  CONSTRAINT email_queue_attempt_check CHECK (attempt >= 0),
  CONSTRAINT email_queue_max_attempts_check CHECK (max_attempts >= 1)
);

CREATE INDEX IF NOT EXISTS idx_email_queue_due
  ON public.email_queue(next_attempt_at, scheduled_for)
  WHERE status IN ('pending', 'failed', 'processing');
CREATE INDEX IF NOT EXISTS idx_email_queue_status_created
  ON public.email_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_queue_user
  ON public.email_queue(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_queue_provider_message
  ON public.email_queue(provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_queue_announcement
  ON public.email_queue(announcement_id)
  WHERE announcement_id IS NOT NULL;

ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
-- No client policy at all. The queue is operational data and is read only by
-- the service role through the administrator API.
REVOKE ALL ON public.email_queue FROM anon, authenticated;
GRANT ALL ON public.email_queue TO service_role;

-- ---------------------------------------------------------------------------
-- 3. email_events (the Resend webhook ledger)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_queue_id uuid REFERENCES public.email_queue(id) ON DELETE SET NULL,
  provider_message_id text,
  recipient text,
  event_type text NOT NULL,
  -- The Svix delivery id from the webhook. A retried webhook keeps its id, so
  -- this is what makes handling idempotent.
  provider_event_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_provider_event
  ON public.email_events(provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_message_type
  ON public.email_events(provider_message_id, event_type)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_events_created
  ON public.email_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type
  ON public.email_events(event_type, created_at DESC);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_events FROM anon, authenticated;
GRANT ALL ON public.email_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. email_suppressions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email text PRIMARY KEY,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'resend_webhook',
  provider_message_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_suppressions FROM anon, authenticated;
GRANT ALL ON public.email_suppressions TO service_role;

-- ---------------------------------------------------------------------------
-- 5. announcements: an announcement may also be an email campaign
-- ---------------------------------------------------------------------------

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_announcements_email_campaign
  ON public.announcements(email_enabled, published_at DESC)
  WHERE email_enabled = true;

-- ---------------------------------------------------------------------------
-- 6. updated_at handling
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.email_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'email_preferences_set_updated_at'
      AND tgrelid = 'public.email_preferences'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER email_preferences_set_updated_at
             BEFORE UPDATE ON public.email_preferences
             FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'email_queue_set_updated_at'
      AND tgrelid = 'public.email_queue'::regclass
  ) THEN
    EXECUTE 'CREATE TRIGGER email_queue_set_updated_at
             BEFORE UPDATE ON public.email_queue
             FOR EACH ROW EXECUTE FUNCTION public.email_set_updated_at()';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Enqueue one message for one account
-- ---------------------------------------------------------------------------
--
-- The recipient address is read from auth.users, which the browser cannot
-- reach. A message is never enqueued for an address the caller supplied.
-- The unique idempotency key makes every call safe to repeat.

CREATE OR REPLACE FUNCTION public.enqueue_email_for_user(
  p_user_id uuid,
  p_template text,
  p_category text,
  p_payload jsonb,
  p_idempotency_key text,
  p_scheduled_for timestamptz DEFAULT now(),
  p_announcement_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_template IS NULL OR p_category IS NULL OR p_idempotency_key IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.email_queue (
    user_id, recipient, template, category, payload, idempotency_key,
    scheduled_for, next_attempt_at, announcement_id
  )
  VALUES (
    p_user_id, v_email, p_template, p_category, coalesce(p_payload, '{}'::jsonb),
    p_idempotency_key, coalesce(p_scheduled_for, now()), coalesce(p_scheduled_for, now()),
    p_announcement_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.email_queue WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_email_for_user(uuid, text, text, jsonb, text, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email_for_user(uuid, text, text, jsonb, text, timestamptz, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Atomic claim
-- ---------------------------------------------------------------------------
--
-- `FOR UPDATE SKIP LOCKED` is what stops two workers, or two runs of the same
-- cron, from sending the same message. A row that was left `processing` by a
-- worker that died is claimable once its lease has expired.

CREATE OR REPLACE FUNCTION public.claim_due_emails(p_limit integer DEFAULT 20)
RETURNS SETOF public.email_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT q.id
    FROM public.email_queue q
    WHERE (
        q.status IN ('pending', 'failed')
        AND q.next_attempt_at <= now()
        AND q.scheduled_for <= now()
      )
      OR (
        q.status = 'processing'
        AND q.lock_expires_at IS NOT NULL
        AND q.lock_expires_at < now()
      )
    ORDER BY q.next_attempt_at ASC, q.created_at ASC
    LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_queue q
  SET status = 'processing',
      attempt = q.attempt + 1,
      locked_at = now(),
      lock_expires_at = now() + interval '10 minutes',
      updated_at = now()
  FROM due
  WHERE q.id = due.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_emails(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Welcome email on signup
-- ---------------------------------------------------------------------------
--
-- A trigger rather than a request from the browser: the account exists the
-- moment Supabase creates it, whether or not the visitor stays on the page.

CREATE OR REPLACE FUNCTION public.enqueue_welcome_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT coalesce(p.preferred_name, p.full_name) INTO v_name
  FROM public.profiles p WHERE p.id = NEW.id;

  PERFORM public.enqueue_email_for_user(
    NEW.id,
    'welcome',
    'transactional',
    jsonb_build_object('name', coalesce(v_name, '')),
    'welcome:' || NEW.id::text,
    now(),
    NULL
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_on_profile_created ON public.profiles;
CREATE TRIGGER email_on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_welcome_email();

-- ---------------------------------------------------------------------------
-- 10. Instant opportunity and announcement email from the notification inbox
-- ---------------------------------------------------------------------------
--
-- The notification pass already establishes who should be told and refuses to
-- tell them twice. The email is derived from the same row, with the
-- notification id as the idempotency key, so an inbox notice and its email can
-- never disagree or double-send.

CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_category text;
  v_template text;
BEGIN
  IF NEW.type = 'opportunity' THEN
    v_category := 'opportunity_alerts';
    v_template := 'opportunity_alert';
  ELSIF NEW.type = 'announcement' THEN
    v_category := 'announcements';
    v_template := 'announcement';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.enqueue_email_for_user(
    NEW.profile_id,
    v_template,
    v_category,
    jsonb_build_object(
      'title', NEW.title,
      'message', NEW.message,
      'linkView', NEW.link_view,
      'notificationId', NEW.id,
      'announcementId', NEW.announcement_id,
      'params', coalesce(NEW.params, '{}'::jsonb)
    ),
    'notification:' || NEW.id::text,
    now(),
    NEW.announcement_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_on_notification_created ON public.notifications;
CREATE TRIGGER email_on_notification_created
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_notification_email();

-- ---------------------------------------------------------------------------
-- 11. Announcement email campaign
-- ---------------------------------------------------------------------------
--
-- The recipients are already in the delivery ledger. This function joins that
-- ledger to auth.users once, so an announcement to 10,000 people is one
-- statement rather than 10,000 API calls.

CREATE OR REPLACE FUNCTION public.enqueue_announcement_emails(p_announcement_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO public.email_queue (
    user_id, recipient, template, category, payload, idempotency_key,
    scheduled_for, next_attempt_at, announcement_id
  )
  SELECT
    d.profile_id,
    lower(u.email),
    'announcement',
    'announcements',
    jsonb_build_object(
      'title', a.title,
      'message', a.body,
      'linkView', a.link_view,
      'ctaText', a.cta_text,
      'ctaUrl', a.cta_url,
      'imageUrl', a.image_url,
      'announcementId', a.id
    ),
    'announcement:' || a.id::text || ':' || d.profile_id::text,
    now(),
    now(),
    a.id
  FROM public.announcement_deliveries d
  JOIN public.announcements a ON a.id = d.announcement_id
  JOIN auth.users u ON u.id = d.profile_id
  WHERE d.announcement_id = p_announcement_id
    AND a.email_enabled = true
    AND u.email IS NOT NULL
    AND length(u.email) > 3
  ON CONFLICT (idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_announcement_emails(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_announcement_emails(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 12. Sending an announcement email is recorded on the announcement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_announcement_email_queued(p_announcement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.announcements
  SET email_sent_at = coalesce(email_sent_at, now()),
      updated_at = now()
  WHERE id = p_announcement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_announcement_email_queued(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_announcement_email_queued(uuid) TO service_role;
