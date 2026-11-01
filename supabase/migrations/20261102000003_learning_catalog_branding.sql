-- Phase B.8 - catalogue provider identity and availability accuracy
--
-- The course card needs a provider tier, an optional provider rating and an
-- optional branded thumbnail. None of these change eligibility: the relevance
-- gate is still the role/skill/gap/roadmap signal. Tier only ranks otherwise
-- relevant courses, so a priority provider is not allowed to appear for an
-- unrelated role.
--
-- It also corrects the CS50 availability wording. CS50 is free to audit, and
-- CS50 itself issues a free CS50 Certificate; the optional edX verified
-- certificate is the paid part. The old note implied the certificate was
-- always paid.
--
-- Idempotent: every statement can be re-applied. No row is deleted.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS provider_tier int NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS rating numeric(2, 1),
  ADD COLUMN IF NOT EXISTS rating_count int,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_provider_tier_check'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_provider_tier_check
      CHECK (provider_tier BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_rating_check'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_rating_check
      CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'courses_rating_count_check'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_rating_count_check
      CHECK (rating_count IS NULL OR rating_count >= 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_courses_provider_tier ON public.courses(provider_tier);

-- Tier 1 is the deliberate priority list. Tier 2 is other reputable sources.
-- Everything else stays at the default tier 3.
UPDATE public.courses
SET provider_tier = CASE
  WHEN provider ILIKE '%harvard%'
    OR provider ILIKE '%cs50%'
    OR provider ILIKE '%mit opencourseware%'
    OR provider ILIKE '%mit ocw%'
    OR provider ILIKE '%edx%'
    OR provider ILIKE '%stanford%'
    OR provider ILIKE '%microsoft learn%'
    OR provider ILIKE '%microsoft%'
    OR provider ILIKE '%ibm skillsbuild%'
    OR provider ILIKE '%skillsbuild%'
    OR provider ILIKE '%ibm%'
    OR provider ILIKE '%google%'
    OR provider ILIKE '%cisco networking academy%'
    OR provider ILIKE '%cisco netacad%'
    OR provider ILIKE '%cisco%'
    OR provider ILIKE '%openlearn%'
    OR provider ILIKE '%open university%'
    OR provider ILIKE '%kaggle%'
    THEN 1
  WHEN provider ILIKE '%coursera%'
    OR provider ILIKE '%datacamp%'
    OR provider ILIKE '%udacity%'
    OR provider ILIKE '%deeplearning%'
    OR provider ILIKE '%aws%'
    OR provider ILIKE '%amazon%'
    OR provider ILIKE '%meta%'
    OR provider ILIKE '%linkedin%'
    OR provider ILIKE '%freecodecamp%'
    OR provider ILIKE '%codecademy%'
    OR provider ILIKE '%khan academy%'
    OR provider ILIKE '%hubspot%'
    OR provider ILIKE '%salesforce%'
    OR provider ILIKE '%trailhead%'
    OR provider ILIKE '%adobe%'
    OR provider ILIKE '%nielsen norman%'
    OR provider ILIKE '%gov.uk%'
    OR provider ILIKE '%semrush%'
    OR provider ILIKE '%moz%'
    OR provider ILIKE '%ibm%'
    THEN 2
  ELSE 3
END;

-- CS50: free course content, a free CS50 Certificate from CS50 itself, and a
-- paid optional edX verified certificate. "audit" understated the free
-- certificate, so these rows become "free" with an explicit note.
UPDATE public.courses
SET
  availability = 'free',
  availability_note = 'Course content is free to audit. CS50 itself issues a free CS50 Certificate; the optional edX verified certificate is paid.',
  updated_at = now()
WHERE id IN ('edx-cs50x', 'edx-cs50-sql', 'edx-cs50-python', 'edx-cs50-ai');

-- MIT OpenCourseWare is free and does not issue certificates or credit.
UPDATE public.courses
SET
  availability = 'free',
  availability_note = 'Free MIT OpenCourseWare materials. No certificate or credit is issued.',
  updated_at = now()
WHERE provider ILIKE '%mit opencourseware%'
  AND (availability_note IS NULL OR availability_note ILIKE '%certificate%');
