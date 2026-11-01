-- Egypt-focused volunteering.
--
-- The live catalogue held 37 opportunities, all run by global or Western
-- organisations. A beginner in Egypt could read the list and still have
-- nothing they could actually apply to: the pages were in English, the work
-- was remote-first, and none of the organisations were local.
--
-- This migration is additive:
--   * four new columns describe what a volunteer actually needs to know:
--     country, languages, opportunity_type and deadline;
--   * twelve real Egyptian or Egypt-facing organisations are added, each
--     with a link that answered when this file was written;
--   * no existing row is deleted or rewritten.
--
-- `deadline` is left NULL for rolling programmes. It is never invented.

ALTER TABLE public.volunteer_opportunities
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'Global',
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS opportunity_type text NOT NULL DEFAULT 'ongoing',
  ADD COLUMN IF NOT EXISTS deadline date;

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_country
  ON public.volunteer_opportunities(country);

CREATE INDEX IF NOT EXISTS idx_volunteer_opportunities_type
  ON public.volunteer_opportunities(opportunity_type);

INSERT INTO public.volunteer_opportunities (
  id, title, organization, description, category, location, is_remote,
  commitment, application_url, skills_gained, required_skills, role_slugs,
  domain_ids, verification_status, verified_at, is_active,
  country, languages, opportunity_type, deadline
) VALUES
  (
    'vol-eg-red-crescent',
    'Volunteer with the Egyptian Red Crescent',
    'Egyptian Red Crescent Society',
    'The Egyptian Red Crescent runs first-aid, relief and community programmes across Egypt. The linked page explains the current volunteer tracks and how to apply.',
    'humanitarian', 'Egypt', false,
    'Varies by programme',
    'https://www.egyptianrc.org/en/volunteer',
    ARRAY['Stakeholder Communication', 'Team Coordination', 'Problem Resolution Under Time Pressure'],
    ARRAY['Stakeholder Communication'],
    ARRAY['operations-manager', 'project-manager', 'healthcare-administrator'],
    ARRAY['operations', 'healthcare'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'ongoing', NULL
  ),
  (
    'vol-eg-resala',
    'Volunteer with Resala',
    'Resala Charity Organization',
    'Resala is one of Egypt''s largest volunteer organisations, with branches and community programmes in many governorates. The linked page lists the ways to join.',
    'community', 'Egypt', false,
    'A few hours per week',
    'https://www.resala.org/volunteering',
    ARRAY['Community Management', 'Stakeholder Communication', 'Team Coordination'],
    ARRAY['Team Coordination'],
    ARRAY['social-media-manager', 'project-manager', 'operations-manager'],
    ARRAY['marketing', 'operations'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic'], 'ongoing', NULL
  ),
  (
    'vol-eg-injaz',
    'Mentor or facilitate with INJAZ Egypt',
    'INJAZ Egypt',
    'INJAZ Egypt connects volunteers from business and education with young people through employability and entrepreneurship programmes. The linked page describes current opportunities.',
    'education', 'Egypt', false,
    'Programme-based',
    'https://www.injaz-egypt.org/copy-of-careers',
    ARRAY['Facilitation & Presentation', 'Training Material Development', 'Stakeholder Communication'],
    ARRAY['Facilitation & Presentation'],
    ARRAY['training-specialist', 'teacher', 'learning-and-development-specialist'],
    ARRAY['education', 'human-resources'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL
  ),
  (
    'vol-eg-baheya',
    'Support Baheya Foundation',
    'Baheya Foundation',
    'Baheya supports women through breast-cancer treatment. Its volunteer page describes the patient-support and fundraising roles it accepts.',
    'healthcare', 'Egypt', false,
    'Varies by role',
    'https://baheya.org/ar/volunteer',
    ARRAY['Patient Communication', 'Stakeholder Communication', 'Service Quality & Patient Experience'],
    ARRAY['Patient Communication'],
    ARRAY['healthcare-administrator', 'registered-nurse', 'medical-assistant'],
    ARRAY['healthcare'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic'], 'ongoing', NULL
  ),
  (
    'vol-eg-clothing-bank',
    'Sort and distribute with the Egyptian Clothing Bank',
    'Egyptian Clothing Bank',
    'The Egyptian Clothing Bank collects, sorts and distributes clothing to families in need. Its volunteer page explains how to take part.',
    'humanitarian', 'Egypt', false,
    'A few hours per week',
    'https://www.egyptianclothingbank.org/ar/volunteer',
    ARRAY['Inventory & Warehouse Management', 'Logistics & Distribution', 'Team Coordination'],
    ARRAY['Team Coordination'],
    ARRAY['logistics-coordinator', 'inventory-planner', 'operations-manager'],
    ARRAY['operations'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic'], 'ongoing', NULL
  ),
  (
    'vol-eg-food-bank',
    'Volunteer with the Egyptian Food Bank',
    'Egyptian Food Bank',
    'The Egyptian Food Bank runs food-collection and distribution programmes. Its join-us page lists the volunteer options and how to register.',
    'humanitarian', 'Egypt', false,
    'Varies by programme',
    'https://www.egyptianfoodbank.com/ar/join-us',
    ARRAY['Logistics Coordination & Routing', 'Inventory Tracking & Reconciliation', 'Stakeholder Communication'],
    ARRAY['Logistics Coordination & Routing'],
    ARRAY['logistics-coordinator', 'operations-manager', 'inventory-planner'],
    ARRAY['operations'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic'], 'ongoing', NULL
  ),
  (
    'vol-eg-etijah',
    'Join an Etijah programme',
    'Etijah',
    'Etijah works on youth development and civic participation in Egypt. Its site lists current programmes and ways to get involved.',
    'community', 'Egypt', false,
    'Programme-based',
    'https://etijah.org/',
    ARRAY['Project Planning & Scheduling', 'Stakeholder Communication', 'Facilitation & Presentation'],
    ARRAY['Stakeholder Communication'],
    ARRAY['project-manager', 'program-manager', 'training-specialist'],
    ARRAY['business', 'education'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL
  ),
  (
    'vol-eg-ayb',
    'Volunteer with AYB-SD',
    'AYB-SD',
    'AYB-SD supports youth-led projects and community initiatives in the Arab region. Its site describes the programmes and how to apply.',
    'community', 'Egypt', false,
    'Programme-based',
    'https://ayb-sd.org/',
    ARRAY['Stakeholder Communication', 'Project Planning & Scheduling', 'Research & Benchmarking'],
    ARRAY['Project Planning & Scheduling'],
    ARRAY['project-manager', 'business-analyst', 'program-manager'],
    ARRAY['business', 'operations'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL
  ),
  (
    'vol-eg-nahdet',
    'Volunteer with Nahdet El Mahrousa',
    'Nahdet El Mahrousa',
    'Nahdet El Mahrousa supports social entrepreneurs and community projects in Egypt. Its site lists the programmes and ways to contribute.',
    'community', 'Egypt', false,
    'Programme-based',
    'https://nahdetelmahrousa.org/',
    ARRAY['Business Model Design & Validation', 'Stakeholder Management', 'Project Planning & Scheduling'],
    ARRAY['Stakeholder Management'],
    ARRAY['entrepreneur', 'business-analyst', 'project-manager'],
    ARRAY['business', 'operations'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'program', NULL
  ),
  (
    'vol-eg-unicef',
    'Take action with UNICEF Egypt',
    'UNICEF Egypt',
    'UNICEF Egypt publishes youth, advocacy and volunteering actions on its take-action page. The page is the source of truth for current openings.',
    'humanitarian', 'Egypt', true,
    'Varies by action',
    'https://www.unicef.org/egypt/take-action',
    ARRAY['Stakeholder Communication', 'Research & Benchmarking', 'Policy Briefing & Communication'],
    ARRAY['Stakeholder Communication'],
    ARRAY['public-health-analyst', 'hr-specialist', 'project-manager'],
    ARRAY['healthcare', 'human-resources', 'business'],
    'http', now(), true,
    'Egypt', ARRAY['Arabic', 'English'], 'remote', NULL
  ),
  (
    'vol-global-catchafire',
    'Remote pro-bono projects on Catchafire',
    'Catchafire',
    'Catchafire matches professionals with non-profits that need short, remote projects such as data analysis, marketing or finance support. The site lists current projects.',
    'pro-bono', 'Remote', true,
    'Project-based, usually 10-40 hours',
    'https://www.catchafire.org/',
    ARRAY['Data Analysis & Reporting', 'Marketing Strategy & Planning', 'Project Planning & Scheduling'],
    ARRAY['Project Planning & Scheduling'],
    ARRAY['data-analyst', 'digital-marketing-specialist', 'project-manager', 'financial-analyst'],
    ARRAY['data', 'marketing', 'business'],
    'http', now(), true,
    'Global', ARRAY['English'], 'remote', NULL
  ),
  (
    'vol-global-taproot',
    'Skills-based volunteering with Taproot Foundation',
    'Taproot Foundation',
    'Taproot Foundation connects professionals with non-profits for skills-based, remote projects in strategy, marketing, finance and operations. The site lists current opportunities.',
    'pro-bono', 'Remote', true,
    'Project-based',
    'https://www.taprootfoundation.org/',
    ARRAY['Business Case & Costing', 'Stakeholder Management', 'Data Analysis & Reporting'],
    ARRAY['Stakeholder Management'],
    ARRAY['management-consultant', 'business-analyst', 'financial-analyst', 'operations-manager'],
    ARRAY['business', 'finance', 'operations'],
    'http', now(), true,
    'Global', ARRAY['English'], 'remote', NULL
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
  updated_at = now();
