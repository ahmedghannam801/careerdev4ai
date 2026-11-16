-- Opportunity source registry, synchronization log, and lifecycle vocabulary.
--
-- The opportunity catalogue already exists: public.volunteer_opportunities
-- already carries the ecosystem vocabulary (opportunity_kind,
-- participation_mode, audience, eligibility, source_url, country, deadline)
-- and 72 curated rows. This migration deliberately does NOT create a second
-- opportunity table. It adds the two things the ingestion pipeline needs and
-- the catalogue does not yet have:
--
--   1. a registry of the official sources it reads, with each source's
--      health, so a source that stops answering is visible instead of
--      silently producing nothing;
--   2. a log of every synchronization run, so a failure can be reported and
--      a retry can be proven not to corrupt what was already stored.
--
-- It also adds the lifecycle columns the catalogue needs in order to answer
-- "is this still open?": the status, the publication date, the deadline's own
-- wording and precision, the cohort, the cost, and the link back to the
-- source the record came from.
--
-- Nothing here invents a date. `deadline` stays NULL when the source does
-- not publish one, `deadline_text` keeps the source's own wording so the
-- interface can show exactly what was published, and `deadline_precision`
-- records whether that wording named a day or only a month.

-- ---------------------------------------------------------------------------
-- 1. The source registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.opportunity_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Stable key used by the ingestion adapters. Never renamed once shipped. */
  slug text NOT NULL UNIQUE,
  /** The source's own name, as it publishes it. */
  name text NOT NULL,
  /** The organisation that publishes it. */
  organization text NOT NULL,
  country text NOT NULL DEFAULT 'Egypt',
  /** 'announcements' for a news list, 'programs' for a programme index. */
  kind text NOT NULL DEFAULT 'announcements',
  /** The organisation's home page. */
  base_url text NOT NULL,
  /** The page the adapter reads. */
  list_url text NOT NULL,
  /** The adapter key that knows how to parse this source. */
  adapter text NOT NULL,
  /**
   * Career domains every record from this source belongs to.
   *
   * A ministry of ICT publishes technology programmes, so 'technology' is a
   * fact about the publisher rather than a guess about a particular
   * announcement. Keeping it here means a new source can be registered with
   * its own default domains and no code change.
   */
  default_domain_ids text[] NOT NULL DEFAULT '{}'::text[],
  enabled boolean NOT NULL DEFAULT true,
  /**
   * How much the parser trusts this source, 0-100.
   *
   * A record parsed from a source below the review threshold is stored with
   * review_state = 'needs_review' instead of being published.
   */
  confidence integer NOT NULL DEFAULT 80,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  /** 'never_run' | 'success' | 'partial' | 'failed'. */
  last_status text NOT NULL DEFAULT 'never_run',
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.opportunity_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.opportunity_sources(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  /** 'running' | 'success' | 'partial' | 'failed'. */
  status text NOT NULL DEFAULT 'running',
  discovered integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Lifecycle columns on the existing catalogue
-- ---------------------------------------------------------------------------

ALTER TABLE public.volunteer_opportunities
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS published_at date,
  ADD COLUMN IF NOT EXISTS deadline_text text,
  ADD COLUMN IF NOT EXISTS deadline_precision text,
  ADD COLUMN IF NOT EXISTS cohort text,
  ADD COLUMN IF NOT EXISTS training_hours integer,
  ADD COLUMN IF NOT EXISTS cost_type text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN IF NOT EXISTS cost_note text,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.opportunity_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'approved';

-- A record that is not active has been withdrawn by an administrator.
UPDATE public.volunteer_opportunities
SET status = 'archived'
WHERE NOT is_active;

-- ---------------------------------------------------------------------------
-- 3. Indexes
--
-- The unique index on (source_id, external_id) is what makes a
-- synchronization idempotent: re-reading the same announcement updates the
-- existing row instead of creating a second one.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_source
  ON public.volunteer_opportunities(source_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteer_opportunities_source_external
  ON public.volunteer_opportunities(source_id, external_id)
  WHERE source_id IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_status
  ON public.volunteer_opportunities(status);

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_published
  ON public.volunteer_opportunities(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_status_deadline
  ON public.volunteer_opportunities(status, deadline);

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_domains
  ON public.volunteer_opportunities USING gin (domain_ids);

CREATE INDEX IF NOT EXISTS idx_opportunity_sync_runs_source
  ON public.opportunity_sync_runs(source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunity_sync_runs_status
  ON public.opportunity_sync_runs(status, started_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Vocabulary
--
-- Added NOT VALID so they apply to every future write without failing on
-- historical rows that an older deployment may have written.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- The kind and mode vocabularies grow as the ecosystem widens, so the
  -- existing checks are replaced rather than stacked. They are added NOT
  -- VALID so they apply to every future write without failing on historical
  -- rows that an older deployment may have written.
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'volunteer_opportunities_kind_check'
  ) THEN
    ALTER TABLE public.volunteer_opportunities
      DROP CONSTRAINT volunteer_opportunities_kind_check;
  END IF;

  ALTER TABLE public.volunteer_opportunities
    ADD CONSTRAINT volunteer_opportunities_kind_check
    CHECK (opportunity_kind IN (
      'volunteering', 'student_activity', 'youth_program', 'career_development',
      'competition', 'hackathon', 'entrepreneurship', 'fellowship', 'scholarship',
      'internship', 'academic', 'technology', 'training', 'bootcamp', 'workshop',
      'webinar', 'conference', 'certification'
    )) NOT VALID;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'volunteer_opportunities_mode_check'
  ) THEN
    ALTER TABLE public.volunteer_opportunities
      DROP CONSTRAINT volunteer_opportunities_mode_check;
  END IF;

  ALTER TABLE public.volunteer_opportunities
    ADD CONSTRAINT volunteer_opportunities_mode_check
    CHECK (participation_mode IN ('onsite', 'online', 'hybrid', 'unspecified')) NOT VALID;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'volunteer_opportunities_status_check'
  ) THEN
    ALTER TABLE public.volunteer_opportunities
      ADD CONSTRAINT volunteer_opportunities_status_check
      CHECK (status IN (
        'upcoming', 'open', 'closing_soon', 'closed', 'archived', 'verification_required'
      )) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'volunteer_opportunities_review_check'
  ) THEN
    ALTER TABLE public.volunteer_opportunities
      ADD CONSTRAINT volunteer_opportunities_review_check
      CHECK (review_state IN (
        'auto', 'needs_review', 'approved', 'rejected'
      )) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'volunteer_opportunities_cost_check'
  ) THEN
    ALTER TABLE public.volunteer_opportunities
      ADD CONSTRAINT volunteer_opportunities_cost_check
      CHECK (cost_type IN ('free', 'paid', 'unspecified')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'volunteer_opportunities_deadline_precision_check'
  ) THEN
    ALTER TABLE public.volunteer_opportunities
      ADD CONSTRAINT volunteer_opportunities_deadline_precision_check
      CHECK (deadline_precision IN ('day', 'month')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'opportunity_sources_status_check'
  ) THEN
    ALTER TABLE public.opportunity_sources
      ADD CONSTRAINT opportunity_sources_status_check
      CHECK (last_status IN ('never_run', 'success', 'partial', 'failed')) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Row level security
--
-- The registry is public information about public sources, so anybody may
-- read it. The run log is operational detail: it is read by administrators
-- through the server-side admin API, which uses the service role, so no
-- client policy is created for it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.opportunity_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opportunity_sources_select_catalog ON public.opportunity_sources;
CREATE POLICY opportunity_sources_select_catalog
  ON public.opportunity_sources
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 6. The sources this deployment reads
--
-- The registry is data, not code: a new official source can be registered
-- without a code change, which is what lets the pipeline pick up programmes
-- that are announced after this migration was written.
-- ---------------------------------------------------------------------------

INSERT INTO public.opportunity_sources
  (slug, name, organization, country, kind, base_url, list_url, adapter, confidence, default_domain_ids)
VALUES
  (
    'mcit-announcements',
    'Ministry of Communications and Information Technology — Announcements',
    'MCIT',
    'Egypt',
    'announcements',
    'https://mcit.gov.eg/',
    'https://mcit.gov.eg/en/Announcements',
    'mcit-announcements',
    90,
    ARRAY['technology']::text[]
  ),
  (
    'nti-programs',
    'National Telecommunication Institute — Programmes',
    'NTI',
    'Egypt',
    'programs',
    'https://www.nti.sci.eg/',
    'https://www.nti.sci.eg/',
    'nti-programs',
    80,
    ARRAY['technology']::text[]
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  organization = EXCLUDED.organization,
  base_url = EXCLUDED.base_url,
  list_url = EXCLUDED.list_url,
  adapter = EXCLUDED.adapter,
  confidence = EXCLUDED.confidence,
  default_domain_ids = EXCLUDED.default_domain_ids,
  updated_at = now();
