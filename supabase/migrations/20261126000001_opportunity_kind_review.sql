-- The kinds that did not say what the records were.
--
-- The pillar split put every record on the right side of the line between
-- employment and everything else, and that split is correct. But a record can
-- sit in the right section and still carry the wrong KIND, and the kind is what
-- the card shows, what the kind filter reads and what the tags carry.
--
-- The clearest examples are the volunteering organisations whose records were
-- seeded under the kind 'technology', because the organisation works in
-- technology: "Code for America — Volunteer", "NumFOCUS — Volunteer and
-- Mentor", "Mozilla — Contribute". A candidate who filters the catalogue for
-- VOLUNTEERING did not find them, because the kind said 'technology'. The
-- technology was the subject; the volunteering was the form of the
-- participation, and the form is what the kind names.
--
-- The same holds for the training programmes filed as 'scholarship' — an
-- upskilling programme and a "Train To Hire" course are not scholarships, they
-- are courses — and for the free evening events filed as 'technology'.
--
-- Nothing is deleted. A record keeps its title, its description, its
-- organisation, its links and its tags; only the kind is corrected, and the
-- tag that names the kind is added so that the two agree, which is the
-- invariant the sync pipeline writes and the pillar backfill relied on.

-- 1. The volunteering records filed under a subject instead of a form. ---------

UPDATE public.volunteer_opportunities
SET opportunity_kind = 'volunteering'
WHERE is_active = true
  AND opportunity_kind = 'technology'
  AND title IN (
    'Code for America — Volunteer',
    'DataKind — Volunteer Data Projects',
    'Mozilla — Contribute',
    'NumFOCUS — Volunteer and Mentor',
    'Wikimedia Foundation — Get Involved'
  );

-- 2. The courses and programmes filed under something else. -------------------

-- A postgraduate diploma is a course of study.
UPDATE public.volunteer_opportunities
SET opportunity_kind = 'training'
WHERE is_active = true
  AND title = 'Post Graduate Diploma'
  AND opportunity_kind = 'technology';

-- Two academies: a cybersecurity academy and an AI ambassadors programme are
-- programmes a candidate is trained by.
UPDATE public.volunteer_opportunities
SET opportunity_kind = 'training'
WHERE is_active = true
  AND title IN (
    'ITI Cybersecurity Academy',
    'AI Ambassadors Program'
  )
  AND opportunity_kind = 'career_development';

-- The capacity-building programmes: an upskilling course and a "Train To Hire"
-- course are courses, not scholarships.
UPDATE public.volunteer_opportunities
SET opportunity_kind = 'training'
WHERE is_active = true
  AND title IN (
    'Upskilling Programs',
    'Train To Hire (4 Month)',
    'Creativa Innovation Hubs
Unleashing Talents for Freelancing'
  )
  AND opportunity_kind = 'scholarship';

-- The laptop-funding initiative that puts graduates and trainees into the
-- freelance market is career development, not a technology product.
UPDATE public.volunteer_opportunities
SET opportunity_kind = 'career_development'
WHERE is_active = true
  AND title = 'ProGIG'
  AND opportunity_kind = 'technology';

-- 3. The free evening events are workshops. ----------------------------------

UPDATE public.volunteer_opportunities
SET opportunity_kind = 'workshop'
WHERE is_active = true
  AND title IN (
    'SECC Tech Night: AI in Test Automation',
    'SECC Tech Night: Vibe Engineering'
  )
  AND opportunity_kind = 'technology';

-- 4. The tags agree with the kind again. --------------------------------------
--
-- The sync pipeline writes the kind into the tags, so a record whose kind has
-- just been corrected must carry the corrected kind as a tag as well. The
-- subject tags are left alone: an organisation that volunteers in technology
-- is still a technology record in every sense but the kind.

UPDATE public.volunteer_opportunities o
SET tags = ARRAY(
  SELECT DISTINCT unnest(
    COALESCE(o.tags, ARRAY[]::text[]) || ARRAY[o.opportunity_kind]
  )
)
WHERE o.is_active = true
  AND o.opportunity_kind IS NOT NULL
  AND NOT (o.opportunity_kind = ANY (COALESCE(o.tags, ARRAY[]::text[])));

-- 5. The pillar follows the kind. ---------------------------------------------
--
-- The rule is the one in shared/opportunities.ts: an internship is employment,
-- and everything else is an activity or a course. Every record corrected above
-- is a course, an event or a volunteering stint, so every one of them belongs
-- to the opportunities pillar — this statement restates the invariant rather
-- than changing any row's side.

UPDATE public.volunteer_opportunities
SET pillar = CASE
  WHEN opportunity_kind = 'internship' THEN 'jobs'
  ELSE 'opportunities'
END
WHERE pillar IS NULL
   OR (opportunity_kind = 'internship' AND pillar <> 'jobs')
   OR (opportunity_kind <> 'internship' AND pillar = 'jobs');
