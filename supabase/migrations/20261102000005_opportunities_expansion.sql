-- Opportunities & Activities expansion.
--
-- The catalogue began as volunteering only. The product now covers the wider
-- ecosystem a student or graduate actually browses: student activities, youth
-- programmes, career development, competitions, entrepreneurship, fellowships,
-- internships, academic and technology programmes.
--
-- This migration is additive and idempotent:
--   * new columns describe the ecosystem without replacing the existing ones;
--   * every existing row is classified from the category it already had;
--   * a curated set of Egyptian and Egypt-facing programmes is added, each
--     pointing at the organisation's own official page;
--   * no deadline is invented. Rolling programmes keep `deadline = NULL`.
--
-- The existing `category`, `application_url`, `skills_gained`, `role_slugs`
-- and `domain_ids` columns stay exactly as they are, so the current API, saves
-- and UI keep working while the new vocabulary is layered on top.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.volunteer_opportunities
  ADD COLUMN IF NOT EXISTS opportunity_kind text NOT NULL DEFAULT 'volunteering',
  ADD COLUMN IF NOT EXISTS participation_mode text NOT NULL DEFAULT 'onsite',
  ADD COLUMN IF NOT EXISTS audience text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS eligibility text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS organization_type text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. Classify the existing catalogue
--
-- `kindForCategory` in shared/opportunities.ts uses the same mapping. Keeping
-- the SQL and the TypeScript in step means a row written by either path is
-- understood by both.
-- ---------------------------------------------------------------------------

UPDATE public.volunteer_opportunities
SET opportunity_kind = CASE lower(coalesce(category, ''))
    WHEN 'community' THEN 'student_activity'
    WHEN 'youth' THEN 'youth_program'
    WHEN 'career' THEN 'career_development'
    WHEN 'career-development' THEN 'career_development'
    WHEN 'competition' THEN 'competition'
    WHEN 'hackathon' THEN 'competition'
    WHEN 'entrepreneurship' THEN 'entrepreneurship'
    WHEN 'startup' THEN 'entrepreneurship'
    WHEN 'fellowship' THEN 'fellowship'
    WHEN 'scholarship' THEN 'fellowship'
    WHEN 'internship' THEN 'internship'
    WHEN 'academic' THEN 'academic'
    WHEN 'research' THEN 'academic'
    WHEN 'technology' THEN 'technology'
    WHEN 'tech' THEN 'technology'
    WHEN 'data' THEN 'technology'
    ELSE 'volunteering'
  END
WHERE opportunity_kind = 'volunteering'
  AND lower(coalesce(category, '')) NOT IN ('', 'volunteering', 'humanitarian', 'pro-bono', 'environment', 'healthcare', 'education');

UPDATE public.volunteer_opportunities
SET participation_mode = CASE
    WHEN is_remote THEN 'online'
    ELSE 'onsite'
  END
WHERE participation_mode = 'onsite';

UPDATE public.volunteer_opportunities
SET audience = CASE opportunity_kind
    WHEN 'student_activity' THEN ARRAY['university_students', 'youth']
    WHEN 'youth_program' THEN ARRAY['youth', 'university_students']
    WHEN 'career_development' THEN ARRAY['fresh_graduates', 'professionals']
    WHEN 'competition' THEN ARRAY['university_students', 'fresh_graduates']
    WHEN 'entrepreneurship' THEN ARRAY['university_students', 'fresh_graduates', 'professionals']
    WHEN 'fellowship' THEN ARRAY['university_students', 'fresh_graduates', 'professionals']
    WHEN 'internship' THEN ARRAY['university_students', 'fresh_graduates']
    WHEN 'academic' THEN ARRAY['university_students', 'fresh_graduates']
    WHEN 'technology' THEN ARRAY['university_students', 'fresh_graduates', 'professionals']
    ELSE ARRAY['everyone']
  END
WHERE audience = '{}'::text[];

UPDATE public.volunteer_opportunities
SET source_url = application_url
WHERE source_url IS NULL;

UPDATE public.volunteer_opportunities
SET organization_type = CASE
    WHEN organization ILIKE '%UNICEF%' OR organization ILIKE '%UNDP%' OR organization ILIKE '%UN Women%' THEN 'international_organization'
    WHEN organization ILIKE '%Red Crescent%' THEN 'ngo'
    WHEN organization ILIKE '%Foundation%' OR organization ILIKE '%Bank%' THEN 'foundation'
    WHEN organization ILIKE '%University%' OR organization ILIKE '%City%' THEN 'university'
    ELSE 'organization'
  END
WHERE organization_type IS NULL;

-- Tags power the interest filters (Technology, Business, HR, Data, Marketing,
-- PR, AI, Entrepreneurship, ...). Existing domain ids are the closest true
-- signal; the category is added as a second, broader tag.
UPDATE public.volunteer_opportunities
SET tags = (
  SELECT array_agg(DISTINCT tag ORDER BY tag)
  FROM unnest(
    coalesce(domain_ids, '{}'::text[]) ||
    CASE WHEN category IS NOT NULL AND category <> '' THEN ARRAY[lower(category)] ELSE '{}'::text[] END
  ) AS tag
  WHERE tag <> ''
)
WHERE tags = '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_kind
  ON public.volunteer_opportunities(opportunity_kind);

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_mode
  ON public.volunteer_opportunities(participation_mode);

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_active_deadline
  ON public.volunteer_opportunities(is_active, deadline);

-- The vocabulary is fixed in shared/opportunities.ts. The checks are added NOT
-- VALID so they apply to every future write without failing on historical data
-- that an older deployment may have written.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'volunteer_opportunities_kind_check'
  ) THEN
    ALTER TABLE public.volunteer_opportunities
      ADD CONSTRAINT volunteer_opportunities_kind_check
      CHECK (opportunity_kind IN (
        'volunteering', 'student_activity', 'youth_program', 'career_development',
        'competition', 'entrepreneurship', 'fellowship', 'internship',
        'academic', 'technology'
      )) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'volunteer_opportunities_mode_check'
  ) THEN
    ALTER TABLE public.volunteer_opportunities
      ADD CONSTRAINT volunteer_opportunities_mode_check
      CHECK (participation_mode IN ('onsite', 'online', 'hybrid')) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Curated Egypt / Egypt-facing programmes
--
-- Every URL below is the organisation's own public page. Titles describe the
-- programme an organisation publishes rather than a specific intake, because
-- inventing an opening date or a deadline would be a lie. `deadline` is NULL
-- for rolling and programme-based entries.
-- ---------------------------------------------------------------------------

INSERT INTO public.volunteer_opportunities (
  id, title, organization, description, category, location, is_remote,
  commitment, application_url, skills_gained, required_skills, role_slugs,
  domain_ids, verification_status, verified_at, is_active,
  country, languages, opportunity_type, deadline,
  opportunity_kind, participation_mode, audience, eligibility, source_url,
  organization_type, tags, is_featured
) VALUES
  (
    'opp-eg-zewail-city',
    'Student programmes at Zewail City',
    'Zewail City of Science and Technology',
    'Zewail City publishes its undergraduate, graduate and research programmes, including summer schools and student research opportunities. The linked page is the university''s own admissions and programme portal.',
    'academic', 'Giza, Egypt', false,
    'Programme-based',
    'https://www.zewailcity.edu.eg/',
    ARRAY['Research & Benchmarking', 'Data Analysis & Reporting', 'Technical Writing'],
    ARRAY['Research & Benchmarking'],
    ARRAY['research-scientist', 'data-analyst', 'software-engineer'],
    ARRAY['data', 'technology'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'academic', 'onsite', ARRAY['university_students', 'fresh_graduates'],
    'See the university''s programme pages for the current admission requirements.',
    'https://www.zewailcity.edu.eg/', 'university',
    ARRAY['academic', 'technology', 'data', 'training'], true
  ),
  (
    'opp-eg-nile-university',
    'Programmes and student activities at Nile University',
    'Nile University',
    'Nile University publishes its academic programmes, research centres and student activities. The linked page is the university''s official portal.',
    'academic', 'Sheikh Zayed City, Egypt', false,
    'Programme-based',
    'https://www.nu.edu.eg/',
    ARRAY['Research & Benchmarking', 'Project Planning & Scheduling', 'Technical Writing'],
    ARRAY['Project Planning & Scheduling'],
    ARRAY['research-scientist', 'software-engineer', 'business-analyst'],
    ARRAY['data', 'technology', 'business'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'academic', 'onsite', ARRAY['university_students', 'fresh_graduates'],
    'See the university''s programme pages for the current admission requirements.',
    'https://www.nu.edu.eg/', 'university',
    ARRAY['academic', 'technology', 'business'], false
  ),
  (
    'opp-eg-auc-student',
    'Student activities and public programmes at AUC',
    'The American University in Cairo',
    'AUC publishes student clubs, leadership programmes, community engagement and public events across its campuses. The linked page is the university''s official site.',
    'community', 'Cairo, Egypt', false,
    'Varies by activity',
    'https://www.aucegypt.edu/',
    ARRAY['Stakeholder Communication', 'Team Coordination', 'Event Management'],
    ARRAY['Team Coordination'],
    ARRAY['project-manager', 'social-media-manager', 'program-manager'],
    ARRAY['business', 'marketing', 'education'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'ongoing', NULL,
    'student_activity', 'onsite', ARRAY['university_students', 'youth'],
    NULL,
    'https://www.aucegypt.edu/', 'university',
    ARRAY['student-activities', 'leadership', 'business'], false
  ),
  (
    'opp-eg-egypt-scholars',
    'Research and scholarship programmes with Egypt Scholars',
    'Egypt Scholars',
    'Egypt Scholars connects Egyptian students and researchers with mentorship, research training and scholarship guidance. The linked page is the organisation''s official site.',
    'fellowship', 'Online', true,
    'Programme-based',
    'https://egyptscholars.org/',
    ARRAY['Research & Benchmarking', 'Technical Writing', 'Data Analysis & Reporting'],
    ARRAY['Research & Benchmarking'],
    ARRAY['research-scientist', 'data-analyst', 'public-health-analyst'],
    ARRAY['data', 'education'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'fellowship', 'online', ARRAY['university_students', 'fresh_graduates'],
    'Check the programme page for the current eligibility and intake.',
    'https://egyptscholars.org/', 'ngo',
    ARRAY['fellowships', 'academic', 'research', 'training'], true
  ),
  (
    'opp-eg-aiesec',
    'Leadership and volunteering programmes with AIESEC',
    'AIESEC',
    'AIESEC runs youth leadership, global volunteer and professional internship programmes in Egypt and abroad. The linked page is AIESEC''s official global platform.',
    'youth', 'Egypt / Global', true,
    'Programme-based',
    'https://aiesec.org/',
    ARRAY['Stakeholder Communication', 'Team Coordination', 'Facilitation & Presentation', 'Project Planning & Scheduling'],
    ARRAY['Stakeholder Communication'],
    ARRAY['project-manager', 'program-manager', 'training-specialist', 'social-media-manager'],
    ARRAY['business', 'marketing', 'operations'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'youth_program', 'hybrid', ARRAY['university_students', 'fresh_graduates', 'youth'],
    'Check the programme page for the current country and role requirements.',
    'https://aiesec.org/', 'ngo',
    ARRAY['youth', 'leadership', 'volunteering', 'internships'], true
  ),
  (
    'opp-eg-enactus',
    'Enactus student entrepreneurship competitions',
    'Enactus',
    'Enactus supports university teams that build social enterprises and present them in national and global competitions. The linked page is Enactus''s official site.',
    'competition', 'Egypt / Global', false,
    'Academic year',
    'https://enactus.org/',
    ARRAY['Business Model Design & Validation', 'Project Planning & Scheduling', 'Stakeholder Management', 'Marketing Strategy & Planning'],
    ARRAY['Business Model Design & Validation'],
    ARRAY['entrepreneur', 'business-analyst', 'project-manager', 'digital-marketing-specialist'],
    ARRAY['business', 'marketing', 'operations'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'event', NULL,
    'competition', 'hybrid', ARRAY['university_students'],
    'Participation is through a university team; see the organisation for the current cycle.',
    'https://enactus.org/', 'ngo',
    ARRAY['competitions', 'entrepreneurship', 'leadership', 'business'], true
  ),
  (
    'opp-global-hult-prize',
    'Hult Prize student social-enterprise competition',
    'Hult Prize Foundation',
    'The Hult Prize runs a global competition in which university teams propose social enterprises. The linked page is the foundation''s official site.',
    'competition', 'Global', true,
    'Competition cycle',
    'https://www.hultprize.org/',
    ARRAY['Business Model Design & Validation', 'Stakeholder Management', 'Facilitation & Presentation'],
    ARRAY['Business Model Design & Validation'],
    ARRAY['entrepreneur', 'business-analyst', 'management-consultant'],
    ARRAY['business', 'operations'],
    'http', now(), true,
    'Global', ARRAY['English'], 'event', NULL,
    'competition', 'hybrid', ARRAY['university_students'],
    'Eligibility and team rules are published by the competition each cycle.',
    'https://www.hultprize.org/', 'foundation',
    ARRAY['competitions', 'entrepreneurship', 'leadership'], false
  ),
  (
    'opp-global-gdsc',
    'Google Developer Student Clubs',
    'Google Developer Student Clubs',
    'Google Developer Student Clubs are university-based communities for students interested in technology, workshops and building projects. The linked page is Google''s official programme page.',
    'technology', 'University campuses', false,
    'Academic year',
    'https://developers.google.com/community/gdsc',
    ARRAY['Programming Fundamentals', 'Team Coordination', 'Project Planning & Scheduling', 'Technical Writing'],
    ARRAY['Programming Fundamentals'],
    ARRAY['software-engineer', 'frontend-engineer', 'backend-engineer', 'data-analyst'],
    ARRAY['technology', 'data'],
    'http', now(), true,
    'Global', ARRAY['English'], 'program', NULL,
    'student_activity', 'hybrid', ARRAY['university_students'],
    'Clubs are hosted by participating universities; see the programme page.',
    'https://developers.google.com/community/gdsc', 'technology_program',
    ARRAY['technology', 'ai', 'student-activities', 'training'], true
  ),
  (
    'opp-global-mlsa',
    'Microsoft Learn Student Ambassadors',
    'Microsoft',
    'The Microsoft Learn Student Ambassadors programme supports university students who organise technology workshops and build community projects. The linked page is Microsoft''s official programme page.',
    'technology', 'Online', true,
    'Programme-based',
    'https://mvp.microsoft.com/en-US/studentambassadors',
    ARRAY['Programming Fundamentals', 'Facilitation & Presentation', 'Technical Writing', 'Team Coordination'],
    ARRAY['Programming Fundamentals'],
    ARRAY['software-engineer', 'frontend-engineer', 'data-analyst'],
    ARRAY['technology', 'data'],
    'http', now(), true,
    'Global', ARRAY['English'], 'program', NULL,
    'student_activity', 'online', ARRAY['university_students'],
    'See the programme page for the current application window and eligibility.',
    'https://mvp.microsoft.com/en-US/studentambassadors', 'technology_program',
    ARRAY['technology', 'ai', 'student-activities', 'training'], false
  ),
  (
    'opp-eg-flat6labs',
    'Startup programmes with Flat6Labs',
    'Flat6Labs',
    'Flat6Labs runs accelerator and seed programmes for early-stage startups in Egypt and the region. The linked page is the organisation''s official site.',
    'entrepreneurship', 'Cairo, Egypt', false,
    'Accelerator cycle',
    'https://flat6labs.com/',
    ARRAY['Business Model Design & Validation', 'Business Case & Costing', 'Stakeholder Management', 'Marketing Strategy & Planning'],
    ARRAY['Business Model Design & Validation'],
    ARRAY['entrepreneur', 'business-analyst', 'management-consultant', 'digital-marketing-specialist'],
    ARRAY['business', 'finance', 'marketing'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'entrepreneurship', 'onsite', ARRAY['fresh_graduates', 'professionals'],
    'Accelerator eligibility is published per cycle by Flat6Labs.',
    'https://flat6labs.com/', 'accelerator',
    ARRAY['entrepreneurship', 'business', 'training'], true
  ),
  (
    'opp-eg-almakinah',
    'Technology and entrepreneurship training at AlMakinah',
    'AlMakinah',
    'AlMakinah runs technology, freelancing and entrepreneurship training for young people in Egypt. The linked page is the organisation''s official site.',
    'technology', 'Cairo, Egypt', false,
    'Course-based',
    'https://almakinah.com/',
    ARRAY['Programming Fundamentals', 'Business Model Design & Validation', 'Marketing Strategy & Planning'],
    ARRAY['Programming Fundamentals'],
    ARRAY['software-engineer', 'frontend-engineer', 'digital-marketing-specialist', 'entrepreneur'],
    ARRAY['technology', 'business', 'marketing'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'technology', 'hybrid', ARRAY['university_students', 'fresh_graduates', 'youth'],
    'See the training page for the current tracks and fees.',
    'https://almakinah.com/', 'training_provider',
    ARRAY['technology', 'training', 'entrepreneurship', 'business'], false
  ),
  (
    'opp-eg-nilepreneurs',
    'Innovation and entrepreneurship programmes at NilePreneurs',
    'NilePreneurs',
    'NilePreneurs supports startups and innovators through incubation, training and access to facilities. The linked page is the initiative''s official site.',
    'entrepreneurship', 'Egypt', false,
    'Programme-based',
    'https://np.eg/',
    ARRAY['Business Model Design & Validation', 'Project Planning & Scheduling', 'Stakeholder Management'],
    ARRAY['Business Model Design & Validation'],
    ARRAY['entrepreneur', 'business-analyst', 'project-manager'],
    ARRAY['business', 'operations'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'entrepreneurship', 'hybrid', ARRAY['university_students', 'fresh_graduates'],
    'Check the initiative''s programme page for the current intake.',
    'https://np.eg/', 'government_initiative',
    ARRAY['entrepreneurship', 'business', 'training'], false
  ),
  (
    'opp-eg-tiec',
    'Technology Innovation and Entrepreneurship Center programmes',
    'Technology Innovation and Entrepreneurship Center (TIEC)',
    'TIEC, part of Egypt''s ICT development ecosystem, publishes incubation, training and startup support programmes. The linked page is the centre''s official site.',
    'technology', 'Cairo, Egypt', false,
    'Programme-based',
    'https://tiec.gov.eg/',
    ARRAY['Business Model Design & Validation', 'Programming Fundamentals', 'Project Planning & Scheduling'],
    ARRAY['Project Planning & Scheduling'],
    ARRAY['entrepreneur', 'software-engineer', 'business-analyst', 'project-manager'],
    ARRAY['technology', 'business'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'technology', 'onsite', ARRAY['fresh_graduates', 'professionals'],
    'See the centre''s programme pages for the current calls.',
    'https://tiec.gov.eg/', 'government_initiative',
    ARRAY['technology', 'entrepreneurship', 'training', 'business'], false
  ),
  (
    'opp-eg-itida',
    'Training and internship programmes with ITIDA',
    'Information Technology Industry Development Agency (ITIDA)',
    'ITIDA publishes training, internship and capacity-building programmes for Egypt''s ICT workforce. The linked page is the agency''s official site.',
    'technology', 'Cairo, Egypt', false,
    'Programme-based',
    'https://itida.gov.eg/English/',
    ARRAY['Programming Fundamentals', 'Technical Writing', 'Project Planning & Scheduling'],
    ARRAY['Programming Fundamentals'],
    ARRAY['software-engineer', 'frontend-engineer', 'backend-engineer', 'data-analyst'],
    ARRAY['technology', 'data'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'technology', 'hybrid', ARRAY['university_students', 'fresh_graduates'],
    'See the agency''s programme pages for the current eligibility.',
    'https://itida.gov.eg/English/', 'government_agency',
    ARRAY['technology', 'training', 'internships', 'data'], true
  ),
  (
    'opp-eg-misr-el-kheir',
    'Volunteer with Misr El Kheir Foundation',
    'Misr El Kheir Foundation',
    'Misr El Kheir runs community development, health and education programmes across Egypt and publishes ways to volunteer and support. The linked page is the foundation''s official site.',
    'humanitarian', 'Egypt', false,
    'Varies by programme',
    'https://www.mekeg.org/',
    ARRAY['Stakeholder Communication', 'Team Coordination', 'Community Management'],
    ARRAY['Team Coordination'],
    ARRAY['operations-manager', 'project-manager', 'social-media-manager'],
    ARRAY['operations', 'healthcare', 'education'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic'], 'ongoing', NULL,
    'volunteering', 'onsite', ARRAY['everyone'],
    NULL,
    'https://www.mekeg.org/', 'foundation',
    ARRAY['volunteering', 'community', 'humanitarian'], false
  ),
  (
    'opp-eg-undp',
    'Internships and fellowships with UNDP Egypt',
    'UNDP Egypt',
    'UNDP Egypt publishes internships, fellowships and youth engagement opportunities on its official country office pages. The linked page is UNDP''s Egypt site.',
    'career', 'Cairo, Egypt', false,
    'Programme-based',
    'https://www.undp.org/egypt',
    ARRAY['Research & Benchmarking', 'Policy Briefing & Communication', 'Data Analysis & Reporting', 'Stakeholder Communication'],
    ARRAY['Research & Benchmarking'],
    ARRAY['public-health-analyst', 'data-analyst', 'project-manager', 'hr-specialist'],
    ARRAY['data', 'business', 'human-resources'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'internship', 'hybrid', ARRAY['university_students', 'fresh_graduates'],
    'Each vacancy publishes its own eligibility and deadline.',
    'https://www.undp.org/egypt', 'international_organization',
    ARRAY['internships', 'fellowships', 'career-development', 'data'], true
  ),
  (
    'opp-eg-un-women',
    'Programmes and opportunities with UN Women Egypt',
    'UN Women Egypt',
    'UN Women Egypt publishes programmes, calls and opportunities related to women''s economic empowerment and leadership. The linked page is the official country office site.',
    'career', 'Cairo, Egypt', false,
    'Programme-based',
    'https://egypt.unwomen.org/en',
    ARRAY['Research & Benchmarking', 'Policy Briefing & Communication', 'Stakeholder Communication'],
    ARRAY['Stakeholder Communication'],
    ARRAY['public-health-analyst', 'hr-specialist', 'project-manager'],
    ARRAY['human-resources', 'business', 'data'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'fellowship', 'hybrid', ARRAY['women', 'fresh_graduates', 'professionals'],
    'Each call publishes its own eligibility and deadline.',
    'https://egypt.unwomen.org/en', 'international_organization',
    ARRAY['fellowships', 'career-development', 'leadership'], false
  ),
  (
    'opp-eg-eyouth',
    'Career development and youth training with EYouth',
    'EYouth',
    'EYouth runs employability, entrepreneurship and digital-skills training for young people in Egypt and the region. The linked page is the organisation''s official site.',
    'career', 'Online', true,
    'Course-based',
    'https://eyouthlearning.com/',
    ARRAY['Stakeholder Communication', 'Project Planning & Scheduling', 'Marketing Strategy & Planning', 'Facilitation & Presentation'],
    ARRAY['Stakeholder Communication'],
    ARRAY['training-specialist', 'digital-marketing-specialist', 'hr-specialist', 'project-manager'],
    ARRAY['business', 'marketing', 'human-resources'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'career_development', 'online', ARRAY['university_students', 'fresh_graduates', 'youth'],
    'See the training page for the current tracks.',
    'https://eyouthlearning.com/', 'training_provider',
    ARRAY['career-development', 'training', 'business', 'marketing'], true
  ),
  (
    'opp-eg-entreprenelle',
    'Women-focused entrepreneurship programmes with Entreprenelle',
    'Entreprenelle',
    'Entreprenelle supports women entrepreneurs through training, mentorship and community programmes in Egypt. The linked page is the organisation''s official site.',
    'entrepreneurship', 'Cairo, Egypt', false,
    'Programme-based',
    'https://entreprenelle.com/',
    ARRAY['Business Model Design & Validation', 'Marketing Strategy & Planning', 'Stakeholder Management', 'Facilitation & Presentation'],
    ARRAY['Business Model Design & Validation'],
    ARRAY['entrepreneur', 'digital-marketing-specialist', 'business-analyst'],
    ARRAY['business', 'marketing'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'entrepreneurship', 'hybrid', ARRAY['women', 'university_students', 'fresh_graduates'],
    'See the organisation''s programme page for the current intake.',
    'https://entreprenelle.com/', 'ngo',
    ARRAY['entrepreneurship', 'business', 'marketing', 'leadership'], true
  ),
  (
    'opp-eg-ejb',
    'Business networking and development with EJB',
    'Egyptian Junior Business Association',
    'The Egyptian Junior Business Association runs business networks, training and advocacy programmes for professionals and entrepreneurs. The linked page is the association''s official site.',
    'career', 'Cairo, Egypt', false,
    'Membership / programme-based',
    'https://ejb.org.eg/',
    ARRAY['Stakeholder Management', 'Business Case & Costing', 'Project Planning & Scheduling'],
    ARRAY['Stakeholder Management'],
    ARRAY['business-analyst', 'project-manager', 'management-consultant', 'hr-specialist'],
    ARRAY['business', 'human-resources', 'finance'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL,
    'career_development', 'onsite', ARRAY['fresh_graduates', 'professionals'],
    'See the association for membership and programme requirements.',
    'https://ejb.org.eg/', 'professional_association',
    ARRAY['business', 'career-development', 'leadership'], false
  ),
  (
    'opp-eg-ncw',
    'Programmes and initiatives with the National Council for Women',
    'National Council for Women',
    'The National Council for Women publishes national programmes and initiatives on women''s empowerment, leadership and economic participation. The linked page is the council''s official site.',
    'career', 'Cairo, Egypt', false,
    'Programme-based',
    'https://ncw.gov.eg/',
    ARRAY['Policy Briefing & Communication', 'Stakeholder Communication', 'Research & Benchmarking'],
    ARRAY['Stakeholder Communication'],
    ARRAY['public-health-analyst', 'hr-specialist', 'project-manager'],
    ARRAY['human-resources', 'business'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic'], 'program', NULL,
    'career_development', 'onsite', ARRAY['women', 'fresh_graduates', 'professionals'],
    'See the council''s published initiatives for participation details.',
    'https://ncw.gov.eg/', 'government_agency',
    ARRAY['career-development', 'leadership', 'business'], false
  ),
  (
    'opp-global-ieee',
    'IEEE student branches and technical communities',
    'IEEE',
    'IEEE student branches run technical talks, competitions and projects on university campuses worldwide, including Egypt. The linked page is IEEE''s official student site.',
    'technology', 'University campuses / Online', true,
    'Academic year',
    'https://www.ieee.org/',
    ARRAY['Programming Fundamentals', 'Research & Benchmarking', 'Technical Writing', 'Team Coordination'],
    ARRAY['Programming Fundamentals'],
    ARRAY['software-engineer', 'data-analyst', 'research-scientist'],
    ARRAY['technology', 'data'],
    'http', now(), true,
    'Global', ARRAY['English'], 'program', NULL,
    'student_activity', 'hybrid', ARRAY['university_students'],
    'Student membership and branch details are published by IEEE.',
    'https://www.ieee.org/', 'professional_association',
    ARRAY['technology', 'student-activities', 'competitions', 'training'], false
  ),
  (
    'opp-eg-unicef-youth',
    'Youth engagement and advocacy with UNICEF Egypt',
    'UNICEF Egypt',
    'UNICEF Egypt publishes youth participation, advocacy and volunteering actions for young people. The linked page is UNICEF''s official take-action page.',
    'youth', 'Egypt', true,
    'Varies by action',
    'https://www.unicef.org/egypt/take-action',
    ARRAY['Stakeholder Communication', 'Research & Benchmarking', 'Policy Briefing & Communication'],
    ARRAY['Stakeholder Communication'],
    ARRAY['public-health-analyst', 'project-manager', 'social-media-manager'],
    ARRAY['business', 'marketing'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'ongoing', NULL,
    'youth_program', 'online', ARRAY['youth', 'university_students'],
    NULL,
    'https://www.unicef.org/egypt/take-action', 'international_organization',
    ARRAY['youth', 'volunteering', 'leadership', 'career-development'], false
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  organization = EXCLUDED.organization,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  location = EXCLUDED.location,
  is_remote = EXCLUDED.is_remote,
  commitment = EXCLUDED.commitment,
  application_url = EXCLUDED.application_url,
  skills_gained = EXCLUDED.skills_gained,
  required_skills = EXCLUDED.required_skills,
  role_slugs = EXCLUDED.role_slugs,
  domain_ids = EXCLUDED.domain_ids,
  verification_status = EXCLUDED.verification_status,
  verified_at = EXCLUDED.verified_at,
  is_active = EXCLUDED.is_active,
  country = EXCLUDED.country,
  languages = EXCLUDED.languages,
  opportunity_type = EXCLUDED.opportunity_type,
  deadline = EXCLUDED.deadline,
  opportunity_kind = EXCLUDED.opportunity_kind,
  participation_mode = EXCLUDED.participation_mode,
  audience = EXCLUDED.audience,
  eligibility = EXCLUDED.eligibility,
  source_url = EXCLUDED.source_url,
  organization_type = EXCLUDED.organization_type,
  tags = EXCLUDED.tags,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();
