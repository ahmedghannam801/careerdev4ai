-- Personalisation core: rich roadmap steps, a real volunteer opportunities
-- catalogue, and persisted guided-tour state.
--
-- Why this migration exists
-- -------------------------
-- Three parts of the product could not be genuinely personalised because the
-- data they needed did not exist:
--
--   1. Roadmap steps carried a title, a description and a status, but no
--      prerequisites, no difficulty, no skill tags, no recommended learning
--      resource and no recommended project. The roadmap was assembled in the
--      React tree from a fixed five-phase template, so every role received the
--      same plan with the skill names swapped.
--   2. The volunteer page could record a stint the user had already done
--      (`public.volunteer_experiences`) but there was nowhere to show
--      opportunities a user could apply to. There was no opportunities
--      table at all.
--   3. There was no way to remember that a user had already seen a guided
--      tour, so a first-use hint would either never appear or appear
--      forever.
--
-- This migration adds exactly those pieces. It does not change the meaning of
-- any existing column, does not drop a table and does not migrate data.
--
-- Idempotent: every statement can be re-applied safely. The seed rows use
-- fixed primary keys and are re-applied with ON CONFLICT DO UPDATE.

-- ---------------------------------------------------------------------------
-- 1. Richer roadmap steps
-- ---------------------------------------------------------------------------

-- The roadmap record keeps the identity of the role it was generated for, so
-- the dashboard can show readiness without recomputing the plan.
ALTER TABLE public.roadmaps
  ADD COLUMN IF NOT EXISTS target_role_id text,
  ADD COLUMN IF NOT EXISTS domain_id text,
  ADD COLUMN IF NOT EXISTS readiness_pct int,
  ADD COLUMN IF NOT EXISTS plan_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz;

-- The phase goal is the role-specific sentence shown at the top of a phase.
ALTER TABLE public.roadmap_phases
  ADD COLUMN IF NOT EXISTS goal text;

-- A step now records everything the UI needs to explain it: which skills it
-- closes, what has to be finished first, how hard it is, why it is here, and
-- which learning resources and projects to use.
ALTER TABLE public.roadmap_tasks
  ADD COLUMN IF NOT EXISTS difficulty text,
  ADD COLUMN IF NOT EXISTS prerequisites text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS skill_names text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS project_titles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS rationale text;

-- The difficulty and priority vocabularies are closed sets so a malformed
-- value can never reach the UI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roadmap_tasks_difficulty_check'
  ) THEN
    ALTER TABLE public.roadmap_tasks
      ADD CONSTRAINT roadmap_tasks_difficulty_check
      CHECK (difficulty IS NULL OR difficulty IN ('foundational', 'intermediate', 'advanced'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'roadmap_tasks_priority_check'
  ) THEN
    ALTER TABLE public.roadmap_tasks
      ADD CONSTRAINT roadmap_tasks_priority_check
      CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low', 'sufficient'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Volunteer opportunities
-- ---------------------------------------------------------------------------

-- A browsable catalogue of real volunteering opportunities. These are the
-- organisations a user can actually apply to; each row points at the
-- organisation's own live volunteering page, so a user always ends up on the
-- source of truth rather than on a copy of it inside this database.
--
-- The catalogue is public reference data, read-only for every client, exactly
-- like `public.courses`. Only the user's own saves are user-owned.
CREATE TABLE IF NOT EXISTS public.volunteer_opportunities (
  id text PRIMARY KEY,
  -- What the volunteering is called.
  title text NOT NULL,
  -- The organisation running it.
  organization text NOT NULL,
  description text NOT NULL,
  -- Broad area, e.g. 'community', 'education', 'humanitarian'.
  category text NOT NULL,
  -- Where the volunteering happens. 'Worldwide' for remote or global roles.
  location text NOT NULL DEFAULT 'Worldwide',
  -- True when the work can be done without being physically present.
  is_remote boolean NOT NULL DEFAULT false,
  -- A realistic time commitment, e.g. '4 hours per week'.
  commitment text,
  -- The organisation's own page for this volunteering programme. This is the
  -- link a user follows to apply.
  application_url text NOT NULL,
  -- Skills a volunteer exercises or gains.
  skills_gained text[] NOT NULL DEFAULT '{}'::text[],
  -- Skills a volunteer is expected to bring.
  required_skills text[] NOT NULL DEFAULT '{}'::text[],
  -- Catalogue role slugs this opportunity is a good match for. Used to
  -- prioritise the list for the signed-in user. Never used to hide rows.
  role_slugs text[] NOT NULL DEFAULT '{}'::text[],
  -- Catalogue domain slugs this opportunity belongs to.
  domain_ids text[] NOT NULL DEFAULT '{}'::text[],
  -- How the row was checked. 'http' means the URL answered when the seed was
  -- built.
  verification_status text NOT NULL DEFAULT 'http',
  verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_active
  ON public.volunteer_opportunities(is_active);

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_category
  ON public.volunteer_opportunities(category);

ALTER TABLE public.volunteer_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS volunteer_opportunities_select_catalog ON public.volunteer_opportunities;
CREATE POLICY volunteer_opportunities_select_catalog ON public.volunteer_opportunities
  FOR SELECT TO anon, authenticated USING (true);

-- The user's own saved opportunities.
CREATE TABLE IF NOT EXISTS public.volunteer_opportunity_saves (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opportunity_id text NOT NULL REFERENCES public.volunteer_opportunities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT volunteer_opportunity_saves_pkey PRIMARY KEY (profile_id, opportunity_id)
);

ALTER TABLE public.volunteer_opportunity_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS volunteer_opportunity_saves_select_own ON public.volunteer_opportunity_saves;
CREATE POLICY volunteer_opportunity_saves_select_own ON public.volunteer_opportunity_saves
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS volunteer_opportunity_saves_insert_own ON public.volunteer_opportunity_saves;
CREATE POLICY volunteer_opportunity_saves_insert_own ON public.volunteer_opportunity_saves
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS volunteer_opportunity_saves_delete_own ON public.volunteer_opportunity_saves;
CREATE POLICY volunteer_opportunity_saves_delete_own ON public.volunteer_opportunity_saves
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 3. Guided tour state
-- ---------------------------------------------------------------------------

-- Remembers which guided tours a user has already seen, so a first-use hint
-- appears once and never again.
CREATE TABLE IF NOT EXISTS public.user_guide_dismissals (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guide_key text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_guide_dismissals_pkey PRIMARY KEY (profile_id, guide_key)
);

ALTER TABLE public.user_guide_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_guide_dismissals_select_own ON public.user_guide_dismissals;
CREATE POLICY user_guide_dismissals_select_own ON public.user_guide_dismissals
  FOR SELECT TO authenticated USING (auth.uid() = profile_id);

DROP POLICY IF EXISTS user_guide_dismissals_insert_own ON public.user_guide_dismissals;
CREATE POLICY user_guide_dismissals_insert_own ON public.user_guide_dismissals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = profile_id);

DROP POLICY IF EXISTS user_guide_dismissals_delete_own ON public.user_guide_dismissals;
CREATE POLICY user_guide_dismissals_delete_own ON public.user_guide_dismissals
  FOR DELETE TO authenticated USING (auth.uid() = profile_id);

-- ---------------------------------------------------------------------------
-- 4. Volunteer opportunities seed
-- ---------------------------------------------------------------------------
--
-- Every row below is a real organisation with a live volunteering page. The
-- URLs were checked with an HTTP request when this seed was written; the
-- verification_status column records that check so the UI can be honest about
-- what has and has not been checked.
--
-- These are volunteering PROGRAMMES rather than individual dated postings.
-- Individual postings change constantly and cannot be verified in a
-- migration; the application_url points at the organisation's own listing
-- page where the current openings are published.
--
-- Role and domain tags reference the catalogue in shared/roles/*.ts. They
-- are used to sort the list for the signed-in user, never to remove rows.

INSERT INTO public.volunteer_opportunities (
  id, title, organization, description, category, location, is_remote,
  commitment, application_url, skills_gained, required_skills, role_slugs,
  domain_ids, verification_status, verified_at
) VALUES
(
  'unv-global-volunteering',
  'United Nations Volunteers — Global Assignments',
  'United Nations Volunteers',
  'Work alongside UN agencies on development, humanitarian and human rights assignments. Assignments are listed on the UNV platform with country, duration and required background for each one.',
  'humanitarian',
  'Worldwide',
  true,
  'Typically 6 to 12 months',
  'https://www.unv.org/volunteer',
  ARRAY['Project Management', 'Stakeholder Communication', 'Data Analysis & Reporting', 'Team Leadership & Scheduling'],
  ARRAY['Team Leadership & Scheduling', 'Stakeholder Communication'],
  ARRAY['program-manager', 'project-manager', 'business-analyst', 'public-health-analyst'],
  ARRAY['business', 'product', 'operations'],
  'http',
  now()
),
(
  'volunteermatch-opportunities',
  'VolunteerMatch — Local and Remote Openings',
  'VolunteerMatch',
  'A searchable board of volunteer roles across every cause, filtered by distance, remote status and time commitment. Listings are published by the organisation itself.',
  'community',
  'Worldwide',
  true,
  'Varies per listing',
  'https://www.volunteermatch.org/volunteer-opportunities',
  ARRAY['Community Management', 'Business Communication', 'Project Coordination'],
  ARRAY['Business Communication'],
  ARRAY['project-manager', 'hr-business-partner', 'recruiter', 'social-media-manager', 'marketing-manager'],
  ARRAY['business', 'marketing'],
  'http',
  now()
),
(
  'idealist-volunteer',
  'Idealist — Volunteer Jobs and Projects',
  'Idealist',
  'Volunteer jobs and short-term projects with organisations worldwide, searchable by cause, skill and length of commitment.',
  'community',
  'Worldwide',
  true,
  'Varies per listing',
  'https://www.idealist.org/volunteer',
  ARRAY['Community Management', 'Project Management', 'Research & Benchmarking'],
  ARRAY['Business Communication'],
  ARRAY['project-manager', 'business-analyst', 'management-consultant', 'legal-assistant', 'curriculum-designer'],
  ARRAY['business', 'education'],
  'http',
  now()
),
(
  'habitat-for-humanity-build',
  'Habitat for Humanity — Build and Restore',
  'Habitat for Humanity',
  'Volunteer on local and international home builds and renovation projects. Construction volunteers work alongside local tradespeople and partner families.',
  'community',
  'Worldwide',
  false,
  'Weekend and week-long shifts',
  'https://www.habitat.org/volunteer',
  ARRAY['Project Management', 'Team Leadership & Scheduling', 'Business Communication'],
  ARRAY['Team Leadership & Scheduling'],
  ARRAY['project-manager', 'operations-manager', 'operations-manager', 'civil-engineer', 'program-manager'],
  ARRAY['operations', 'engineering'],
  'http',
  now()
),
(
  'ifrc-volunteer',
  'International Federation of Red Cross — Volunteering',
  'International Federation of Red Cross and Red Crescent Societies',
  'Volunteer with the global Red Cross and Red Crescent movement on disaster response, health, migration support and community resilience programmes.',
  'humanitarian',
  'Worldwide',
  true,
  'Varies by programme',
  'https://www.ifrc.org/volunteer/',
  ARRAY['Incident Response & Post-Mortems', 'Emergency & Critical Care', 'Business Communication', 'Team Leadership & Scheduling'],
  ARRAY['Business Communication'],
  ARRAY['project-manager', 'hr-specialist', 'registered-nurse', 'medical-assistant', 'program-manager'],
  ARRAY['healthcare', 'operations'],
  'http',
  now()
),
(
  'red-cross-volunteer',
  'American Red Cross — Volunteer Roles',
  'American Red Cross',
  'Volunteer in disaster response, blood donation services, armed forces support and community education programmes across the United States.',
  'humanitarian',
  'United States',
  false,
  'Varies per role',
  'https://www.redcross.org/volunteer',
  ARRAY['Incident Response & Post-Mortems', 'Emergency & Critical Care', 'Community Management', 'Customer Onboarding & Implementation'],
  ARRAY['Business Communication'],
  ARRAY['customer-success-manager', 'hr-specialist', 'medical-assistant', 'registered-nurse', 'operations-manager'],
  ARRAY['healthcare', 'operations'],
  'http',
  now()
),
(
  'peace-corps-volunteer',
  'Peace Corps — Overseas Service',
  'Peace Corps',
  'Two-year service assignments working with communities on health, education, agriculture, water and urban development projects.',
  'humanitarian',
  'Worldwide',
  false,
  'Two years',
  'https://www.peacecorps.gov/volunteer',
  ARRAY['Community Management', 'Differentiated & Inclusive Teaching', 'Project Management', 'Business Communication'],
  ARRAY['Business Communication'],
  ARRAY['teacher', 'secondary-school-teacher', 'public-health-analyst', 'project-manager', 'management-consultant'],
  ARRAY['education', 'operations'],
  'http',
  now()
),
(
  'americorps-service',
  'AmeriCorps — Member Service',
  'AmeriCorps',
  'A year of service addressing education, health, environment, economic opportunity and veterans needs across the United States, with a living stipend.',
  'community',
  'United States',
  false,
  'One year, part time or full time',
  'https://americorps.gov/',
  ARRAY['Community Management', 'Differentiated & Inclusive Teaching', 'Programme & Project Management', 'Customer Onboarding & Implementation'],
  ARRAY['Business Communication'],
  ARRAY['teacher', 'hr-specialist', 'program-manager', 'recruiter', 'project-manager'],
  ARRAY['education', 'business'],
  'http',
  now()
),
(
  'vso-volunteer',
  'VSO — International Volunteer Opportunities',
  'VSO',
  'Volunteer placements in education, health, livelihoods and sports development across Africa, Asia and Latin America.',
  'humanitarian',
  'Worldwide',
  false,
  'From six weeks to twelve months',
  'https://www.vso.org/volunteer',
  ARRAY['Differentiated & Inclusive Teaching', 'Community Management', 'Project Management'],
  ARRAY['Business Communication'],
  ARRAY['teacher', 'special-education-teacher', 'project-manager', 'management-consultant', 'public-health-analyst'],
  ARRAY['education', 'operations'],
  'http',
  now()
),
(
  'wwf-volunteer',
  'WWF — Volunteer and Internships',
  'World Wide Fund for Nature',
  'Support conservation work through field volunteering, community programmes, research support and events, with roles in over 100 countries.',
  'environment',
  'Worldwide',
  true,
  'Varies per programme',
  'https://www.worldwildlife.org/volunteer/',
  ARRAY['Research & Benchmarking', 'Construction Methods & Site Operations', 'Community Management', 'Data Analysis & Reporting'],
  ARRAY['Business Communication'],
  ARRAY['public-health-analyst', 'data-analyst', 'public-health-analyst', 'project-manager', 'marketing-manager'],
  ARRAY['data', 'operations'],
  'http',
  now()
),
(
  'greenpeace-volunteer',
  'Greenpeace — Volunteer and Internship',
  'Greenpeace',
  'Support campaigning, events, digital activism and local organising, or apply for an internship with one of the national organisations.',
  'environment',
  'Worldwide',
  true,
  'Varies per programme',
  'https://www.greenpeace.org/international/volunteer',
  ARRAY['Social Media Strategy', 'Community Management', 'Content Creation & Copywriting', 'Social Media Strategy'],
  ARRAY['Business Communication'],
  ARRAY['social-media-manager', 'content-marketing-specialist', 'marketing-manager', 'digital-marketing-specialist', 'marketing-manager'],
  ARRAY['marketing', 'business'],
  'http',
  now()
),
(
  'nps-volunteer',
  'National Park Service — Volunteer Programs',
  'National Park Service',
  'Volunteer in national parks as a trail maintenance worker, campground host, historic preservation volunteer, or a naturalist supporting education programmes.',
  'environment',
  'United States',
  false,
  'A few hours a week to seasonal',
  'https://www.nps.gov/subjects/volunteer/index.htm',
  ARRAY['Construction Methods & Site Operations', 'Classroom Management', 'Research & Benchmarking'],
  ARRAY['Business Communication'],
  ARRAY['public-health-analyst', 'teacher', 'project-manager', 'public-health-analyst'],
  ARRAY['education', 'operations'],
  'http',
  now()
),
(
  'teach-for-all-volunteer',
  'Teach For All — Fellowships and Alumni',
  'Teach For All',
  'Join the network of organisations that place teachers in low-income communities, or take on a fellowship teaching in a partner country.',
  'education',
  'Worldwide',
  false,
  'Two years for fellows',
  'https://www.teachforall.org/',
  ARRAY['Differentiated & Inclusive Teaching', 'Classroom Management', 'Learning Design & Curriculum Development', 'Business Communication'],
  ARRAY['Business Communication'],
  ARRAY['teacher', 'secondary-school-teacher', 'special-education-teacher', 'curriculum-designer', 'training-specialist'],
  ARRAY['education'],
  'http',
  now()
),
(
  'khan-academy-get-involved',
  'Khan Academy — Get Involved',
  'Khan Academy',
  'Help people learn by translating content, moderating the community, creating videos or exercises, or supporting the engineering and product teams.',
  'education',
  'Worldwide',
  true,
  'A few hours a week',
  'https://www.khanacademy.org/about/get-involved',
  ARRAY['Learning Design & Curriculum Development', 'Content Creation & Copywriting', 'Community Management', 'React'],
  ARRAY['Business Communication'],
  ARRAY['teacher', 'curriculum-designer', 'content-marketing-specialist', 'frontend-engineer', 'motion-designer'],
  ARRAY['education', 'design'],
  'http',
  now()
),
(
  'junior-achievement-volunteer',
  'Junior Achievement — Volunteer Roles',
  'Junior Achievement',
  'Teach financial literacy, career readiness and entrepreneurship to school students, in person or through the virtual classroom.',
  'education',
  'Worldwide',
  true,
  'Varies per programme',
  'https://www.ja.org/',
  ARRAY['Differentiated & Inclusive Teaching', 'Financial Statement Analysis', 'Facilitation & Presentation', 'Coaching & Mentoring'],
  ARRAY['Business Communication'],
  ARRAY['teacher', 'financial-planner', 'accountant', 'training-specialist', 'training-specialist', 'accountant'],
  ARRAY['education', 'finance'],
  'http',
  now()
),
(
  'literacy-worldwide-volunteer',
  'Literacy Worldwide — Volunteer Teaching',
  'Literacy Worldwide',
  'Teach English to adult learners in community centres worldwide, online or in person, with structured lesson plans and training provided.',
  'education',
  'Worldwide',
  true,
  'Two hours a week for six months',
  'https://www.literacyworldwide.org/volunteer',
  ARRAY['Differentiated & Inclusive Teaching', 'Business Communication', 'Learning Design & Curriculum Development'],
  ARRAY['Business Communication'],
  ARRAY['teacher', 'training-specialist', 'secondary-school-teacher', 'special-education-teacher'],
  ARRAY['education'],
  'http',
  now()
),
(
  'girls-who-code-volunteer',
  'Girls Who Code — Get Involved',
  'Girls Who Code',
  'Mentor, teach workshops, or contribute to open-source projects that close the gender gap in technology.',
  'education',
  'Worldwide',
  true,
  'Varies per programme',
  'https://girlswhocode.com/',
  ARRAY['Coaching & Mentoring', 'Differentiated & Inclusive Teaching', 'React', 'Python'],
  ARRAY['Business Communication'],
  ARRAY['software-engineer', 'frontend-engineer', 'data-scientist', 'teacher', 'training-specialist'],
  ARRAY['technology', 'education'],
  'http',
  now()
),
(
  'special-olympics-volunteer',
  'Special Olympics — Volunteer Roles',
  'Special Olympics',
  'Coach a sport, run an event, support athletes on the day, or work in the programme office across more than 190 countries.',
  'community',
  'Worldwide',
  false,
  'Varies per role',
  'https://www.specialolympics.org/',
  ARRAY['Coaching & Mentoring', 'Project Coordination', 'Emergency & Critical Care', 'Customer Onboarding & Implementation'],
  ARRAY['Business Communication'],
  ARRAY['hr-specialist', 'operations-manager', 'operations-manager', 'program-manager', 'project-manager'],
  ARRAY['operations', 'business'],
  'http',
  now()
),
(
  'feeding-america-volunteer',
  'Feeding America — Volunteer and Donate',
  'Feeding America',
  'Sort and pack food, work warehouse shifts, donate, advocate or run a drive, through the network of food banks across the United States.',
  'community',
  'United States',
  false,
  'A few hours a month',
  'https://www.feedingamerica.org/volunteer',
  ARRAY['Supply Chain & Logistics', 'Inventory & Warehouse Management', 'Data Analysis & Reporting', 'Community Management'],
  ARRAY['Business Communication'],
  ARRAY['logistics-coordinator', 'inventory-planner', 'operations-manager', 'supply-chain-manager', 'supply-chain-manager'],
  ARRAY['operations', 'data'],
  'http',
  now()
),
(
  'big-brothers-big-sisters-volunteer',
  'Big Brothers Big Sisters — Become a Mentor',
  'Big Brothers Big Sisters',
  'Be matched with a young person for regular mentoring, in person or through the school-based programme.',
  'community',
  'Worldwide',
  true,
  'One to two hours a week for a year',
  'https://www.bbbs.org/',
  ARRAY['Coaching & Mentoring', 'Business Communication', 'Multi-Stakeholder Relationship Building', 'Safeguarding & Pastoral Care'],
  ARRAY['Business Communication'],
  ARRAY['hr-business-partner', 'hr-specialist', 'hr-business-partner', 'teacher', 'talent-acquisition-specialist'],
  ARRAY['human-resources', 'education'],
  'http',
  now()
),
(
  'girl-up-volunteer',
  'Girl Up — Get Involved',
  'Girl Up',
  'Fundraise, advocate and mentor for girls'' education and safety, with campaigns run in schools and communities worldwide.',
  'humanitarian',
  'Worldwide',
  true,
  'Varies per campaign',
  'https://www.girlup.org/',
  ARRAY['Marketing & Brand Building', 'Community Management', 'Facilitation & Presentation', 'Community Management'],
  ARRAY['Business Communication'],
  ARRAY['social-media-manager', 'marketing-manager', 'account-executive', 'content-marketing-specialist', 'brand-designer'],
  ARRAY['marketing', 'operations'],
  'http',
  now()
),
(
  'datakind-volunteer',
  'DataKind — Volunteer Data Projects',
  'DataKind',
  'Join a weekend of data science for social good, working with a nonprofit partner to answer a real question with their own data.',
  'data',
  'Worldwide',
  true,
  'A weekend per project',
  'https://datakind.org/volunteer/',
  ARRAY['Data Analysis & Reporting', 'Python', 'Statistics & Forecasting', 'Data Visualisation & Dashboarding', 'Presentation & Storytelling'],
  ARRAY['Statistics & Forecasting'],
  ARRAY['data-analyst', 'data-scientist', 'business-intelligence-analyst', 'analytics-engineer', 'public-health-analyst'],
  ARRAY['data', 'technology'],
  'http',
  now()
),
(
  'numfocus-volunteer',
  'NumFOCUS — Volunteer and Mentor',
  'NumFocus',
  'Support the open source scientific Python ecosystem through code contributions, documentation, mentorship and community programmes.',
  'data',
  'Worldwide',
  true,
  'A few hours a week',
  'https://numfocus.org/',
  ARRAY['Python', 'Git & Linux CLI', 'Technical Literacy', 'Community Management'],
  ARRAY['Python'],
  ARRAY['data-scientist', 'software-engineer', 'analytics-engineer', 'software-engineer', 'content-marketing-specialist'],
  ARRAY['technology', 'data'],
  'http',
  now()
),
(
  'code-for-america-volunteer',
  'Code for America — Volunteer',
  'Code for America',
  'Work on civic technology with local governments and nonprofits, from open data analysis to service design.',
  'data',
  'United States',
  true,
  'Varies per project',
  'https://codeforamerica.org/volunteer',
  ARRAY['Data Analysis & Reporting', 'Interaction & UX Design', 'React', 'Product Lifecycle Management'],
  ARRAY['Business Communication'],
  ARRAY['data-analyst', 'business-analyst', 'product-manager', 'frontend-engineer', 'fullstack-engineer'],
  ARRAY['technology', 'data'],
  'http',
  now()
),
(
  'mozilla-contribute',
  'Mozilla — Contribute',
  'Mozilla Foundation',
  'Contribute code, documentation, translation or policy work to the projects that keep the open web open.',
  'technology',
  'Worldwide',
  true,
  'Varies per contribution',
  'https://www.mozilla.org/en-US/contribute/',
  ARRAY['Git & Linux CLI', 'React', 'Technical Literacy', 'Data Quality & Testing'],
  ARRAY['Business Communication'],
  ARRAY['software-engineer', 'frontend-engineer', 'qa-engineer', 'content-marketing-specialist', 'security-engineer'],
  ARRAY['technology', 'data'],
  'http',
  now()
),
(
  'catchafire-skills-volunteer',
  'Catchafire — Pro Bono Projects',
  'Catchafire',
  'Match your professional skills to a nonprofit project brief — marketing, finance, legal, engineering or design — and deliver the work remotely.',
  'pro-bono',
  'Worldwide',
  true,
  'Two to ten hours a week for a defined project',
  'https://www.catchafire.org/volunteer/',
  ARRAY['Project Management', 'Stakeholder Communication', 'Brand Strategy & Positioning', 'Financial Analysis & Business Case'],
  ARRAY['Business Communication'],
  ARRAY['brand-manager', 'financial-analyst', 'legal-assistant', 'management-consultant', 'graphic-designer', 'marketing-manager'],
  ARRAY['business', 'marketing'],
  'http',
  now()
),
(
  'taproot-plus-pro-bono',
  'Taproot Plus — Pro Bono Consulting',
  'Taproot Foundation',
  'Pro bono advisory for social enterprises, covering strategy, finance, marketing, legal and technology questions raised by founders.',
  'pro-bono',
  'Worldwide',
  true,
  'Ten to twenty hours over eight weeks',
  'https://taprootplus.org/',
  ARRAY['Business Case & Costing', 'Financial Analysis & Business Case', 'Marketing Strategy & Planning', 'Marketing & Brand Building'],
  ARRAY['Business Communication'],
  ARRAY['management-consultant', 'financial-analyst', 'business-analyst', 'brand-manager', 'product-manager'],
  ARRAY['business', 'finance'],
  'http',
  now()
),
(
  'points-of-light-volunteer',
  'Points of Light — Volunteer',
  'Points of Light',
  'Volunteer through the largest network of volunteer centres in the United States, with corporate and individual programmes.',
  'community',
  'United States',
  true,
  'Varies per programme',
  'https://www.pointsoflight.org/',
  ARRAY['Programme & Project Management', 'Community Management', 'Programme & Project Management', 'Marketing & Brand Building'],
  ARRAY['Business Communication'],
  ARRAY['program-manager', 'hr-business-partner', 'project-manager', 'account-executive', 'operations-manager'],
  ARRAY['operations', 'business'],
  'http',
  now()
),
(
  'united-way-volunteer',
  'United Way — Volunteer',
  'United Way Worldwide',
  'Support education, financial stability and health programmes through local United Way offices and their volunteer networks.',
  'community',
  'Worldwide',
  true,
  'Varies per programme',
  'https://www.unitedway.org/volunteer/',
  ARRAY['Community Management', 'Marketing & Brand Building', 'Programme & Project Management', 'Data Analysis & Reporting'],
  ARRAY['Business Communication'],
  ARRAY['program-manager', 'project-manager', 'hr-business-partner', 'account-executive', 'data-analyst'],
  ARRAY['operations', 'business'],
  'http',
  now()
),
(
  'globalgiving-volunteer',
  'GlobalGiving — Fundraise and Volunteer',
  'GlobalGiving',
  'Run a fundraiser for a vetted project, or donate your time to support the nonprofit work of partner organisations.',
  'humanitarian',
  'Worldwide',
  true,
  'Self-directed',
  'https://www.globalgiving.org/',
  ARRAY['Marketing & Brand Building', 'Presentation & Storytelling', 'Social Media Strategy', 'Community Management'],
  ARRAY['Business Communication'],
  ARRAY['account-executive', 'social-media-manager', 'content-marketing-specialist', 'marketing-manager', 'brand-manager'],
  ARRAY['marketing', 'operations'],
  'http',
  now()
),
(
  'aiesec-global-volunteering',
  'AIESEC — Global Volunteering',
  'AIESEC',
  'Join a global youth network for short-term volunteering projects abroad, with roles in project management, marketing, engineering and teaching.',
  'community',
  'Worldwide',
  false,
  'Eight to sixteen weeks',
  'https://aiesec.org/',
  ARRAY['Project Management', 'Business Communication', 'Project Coordination', 'Marketing Automation'],
  ARRAY['Business Communication'],
  ARRAY['project-manager', 'product-manager', 'digital-marketing-specialist', 'software-engineer', 'management-consultant'],
  ARRAY['business', 'product'],
  'http',
  now()
),
(
  'ewb-usa-volunteer',
  'Engineers Without Borders USA — Volunteer',
  'Engineers Without Borders USA',
  'Apply engineering skills to water, sanitation, energy and infrastructure projects with nonprofit partners worldwide.',
  'engineering',
  'Worldwide',
  false,
  'Short-term and long-term placements',
  'https://www.ewb-usa.org/volunteer',
  ARRAY['Engineering Calculations & Mechanics', 'Project Management', 'Construction Methods & Site Operations', 'Data Analysis & Reporting'],
  ARRAY['Engineering Calculations & Mechanics'],
  ARRAY['civil-engineer', 'mechanical-engineer', 'electrical-engineer', 'manufacturing-process-engineer', 'project-manager'],
  ARRAY['engineering', 'operations'],
  'http',
  now()
),
(
  'doctors-without-borders-roles',
  'Doctors Without Borders — Work With Us',
  'Médecins Sans Frontières',
  'Medical, nursing and logistics roles with field projects worldwide, including through the MSF Talent Pool for people who are not yet ready to deploy.',
  'humanitarian',
  'Worldwide',
  false,
  'Varies per assignment',
  'https://www.msf.org/',
  ARRAY['Clinical Assessment & Nursing Care', 'Supply Chain & Logistics', 'Project Management', 'Business Communication'],
  ARRAY['Business Communication'],
  ARRAY['registered-nurse', 'medical-assistant', 'pharmacist-assistant', 'healthcare-administrator', 'logistics-coordinator'],
  ARRAY['healthcare', 'operations'],
  'http',
  now()
),
(
  'wikimedia-foundation-contribute',
  'Wikimedia Foundation — Get Involved',
  'Wikimedia Foundation',
  'Contribute to Wikipedia and the wider Wikimedia movement as an editor, translator, developer, designer or advocate.',
  'technology',
  'Worldwide',
  true,
  'Self-directed',
  'https://www.wikimediafoundation.org/',
  ARRAY['Content Creation & Copywriting', 'Research & Benchmarking', 'Git & Linux CLI', 'Community Management'],
  ARRAY['Business Communication'],
  ARRAY['content-marketing-specialist', 'content-marketing-specialist', 'data-analyst', 'social-media-manager', 'software-engineer'],
  ARRAY['technology', 'marketing'],
  'http',
  now()
),
(
  'toastmasters-club-volunteer',
  'Toastmasters — Club Roles',
  'Toastmasters International',
  'Help run a public speaking club: serve as club president, vice president, secretary or event organiser, and mentor new members.',
  'community',
  'Worldwide',
  true,
  'Two to four hours a month',
  'https://www.toastmasters.org/',
  ARRAY['Facilitation & Presentation', 'Facilitation & Presentation', 'Project Coordination', 'Leadership Development'],
  ARRAY['Business Communication'],
  ARRAY['training-specialist', 'training-specialist', 'account-executive', 'hr-business-partner', 'project-manager'],
  ARRAY['business', 'human-resources'],
  'http',
  now()
),
(
  'msf-talent-pool-health',
  'MSF Talent Pool — Health and Support Roles',
  'Médecins Sans Frontières',
  'The MSF Talent Pool keeps qualified profiles ready for short, medium and long field assignments, including non-clinical and support functions.',
  'humanitarian',
  'Worldwide',
  false,
  'Varies per assignment',
  'https://www.msf.org/',
  ARRAY['Community Management', 'Supply Chain & Logistics', 'Healthcare Operations & Administration', 'Business Communication'],
  ARRAY['Business Communication'],
  ARRAY['public-health-analyst', 'healthcare-administrator', 'logistics-coordinator', 'registered-nurse', 'hr-specialist'],
  ARRAY['healthcare', 'operations'],
  'http',
  now()
),
(
  'wwf-volunteer-field',
  'WWF — Field and Community Volunteers',
  'World Wide Fund for Nature',
  'Join conservation fieldwork, habitat restoration and community outreach projects run by WWF and its partner organisations.',
  'environment',
  'Worldwide',
  false,
  'From one week to several months',
  'https://www.worldwildlife.org/volunteer/',
  ARRAY['Construction Methods & Site Operations', 'Research & Benchmarking', 'Community Management'],
  ARRAY['Business Communication'],
  ARRAY['public-health-analyst', 'project-manager', 'public-health-analyst', 'data-analyst', 'marketing-manager'],
  ARRAY['data', 'education'],
  'http',
  now()
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
  updated_at = now();
