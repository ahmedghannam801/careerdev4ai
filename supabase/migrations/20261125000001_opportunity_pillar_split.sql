-- The two pillars: employment, and everything else.
--
-- The catalogue grew into a single table that holds volunteering, student
-- programmes, training courses, competitions, scholarships AND internships.
-- That was convenient while the catalogue was small, and it became a problem
-- the moment a candidate asked for "a job": the internships were in the same
-- list as the volunteering, and there was nothing in the database that could
-- tell the two apart.
--
-- The interface could have decided for itself which rows were jobs. That would
-- have been a decision made in the wrong place: the API, the administration
-- screen and the sync pipeline would each have made their own, and they would
-- not have agreed. So the distinction is stored WITH the row.
--
-- `pillar` is the answer, and it is the ONLY place the answer is written:
-- shared/opportunities.ts decides which pillar a kind belongs to, this
-- migration copies that decision into the rows, and the API filters on the
-- stored column.
--
--   'jobs'          an internship: a role somebody is taken on to do.
--   'opportunities' volunteering, student programmes, training, competitions,
--                   scholarships — everything a candidate JOINS or ATTENDS.

-- 1. The column itself. ------------------------------------------------------

ALTER TABLE public.volunteer_opportunities
  ADD COLUMN IF NOT EXISTS pillar text;

COMMENT ON COLUMN public.volunteer_opportunities.pillar IS
  'Which half of the ecosystem this record belongs to: ''jobs'' for employment (an internship), ''opportunities'' for volunteering, training and other activities.';

-- 2. The training programmes that were filed under another kind. -------------
--
-- Some training programmes were seeded with a kind that names their subject
-- rather than their form: a data course filed as 'technology', a leadership
-- course filed as 'career_development'. The tags already said 'training'; the
-- kind did not, so the two answers disagreed and the filter had to guess.
--
-- The kind is made to agree with the tag, so that "is this a training
-- programme?" has one answer rather than two.

UPDATE public.volunteer_opportunities
SET opportunity_kind = 'training'
WHERE opportunity_kind IN ('technology', 'career_development')
  AND tags IS NOT NULL
  AND 'training' = ANY (tags);

-- 3. The backfill. ------------------------------------------------------------
--
-- The rule is the one in shared/opportunities.ts: an internship is employment,
-- and everything else is an activity or a course. The rule is repeated here
-- rather than imported, because a migration is a statement about the past: it
-- has to keep saying the same thing even if the shared module changes later.

UPDATE public.volunteer_opportunities
SET pillar = CASE
  WHEN opportunity_kind = 'internship' THEN 'jobs'
  ELSE 'opportunities'
END
WHERE pillar IS NULL;

-- A row whose kind is missing falls back to the legacy category, and the
-- legacy category 'internship' also means employment.

UPDATE public.volunteer_opportunities
SET pillar = 'jobs'
WHERE pillar IS NULL
  AND (opportunity_kind IS NULL OR opportunity_kind = '')
  AND lower(coalesce(category, '')) = 'internship';

UPDATE public.volunteer_opportunities
SET pillar = 'opportunities'
WHERE pillar IS NULL;

-- 4. The constraint. ------------------------------------------------------------
--
-- NOT VALID, like the kind constraint beside it: the rows that exist are
-- checked as they are written from now on, and the check on the old rows is
-- proved by the backfill above rather than by a table scan that would lock
-- the catalogue for a reader.

ALTER TABLE public.volunteer_opportunities
  DROP CONSTRAINT IF EXISTS volunteer_opportunities_pillar_check;

ALTER TABLE public.volunteer_opportunities
  ADD CONSTRAINT volunteer_opportunities_pillar_check
  CHECK (pillar IN ('jobs', 'opportunities')) NOT VALID;

-- 5. The index that makes the filter cheap. -------------------------------------
--
-- The catalogue is read through this column on every page of opportunities and
-- every search, and it is written rarely.

CREATE INDEX IF NOT EXISTS volunteer_opportunities_pillar_idx
  ON public.volunteer_opportunities (pillar)
  WHERE is_active = true;

-- 6. The index that makes the training filter cheap. ---------------------------
--
-- The training programmes are the ones a candidate filters for most often, and
-- they were previously found by scanning a text array.

CREATE INDEX IF NOT EXISTS volunteer_opportunities_kind_idx
  ON public.volunteer_opportunities (opportunity_kind)
  WHERE is_active = true;
