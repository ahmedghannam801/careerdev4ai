-- Career Experience Hub
--
-- A curated catalogue of official, self-paced virtual job simulations, the
-- candidate's own progress, and the certificate link they submit afterwards.
--
-- Shape:
--   career_experiences            the curated catalogue (official provider URL)
--   career_experience_skills      which skills a simulation practises
--   career_experience_roles       which target roles it is relevant to
--   user_experience_progress      the candidate's own state
--   user_experience_certificates  the certificate link they submitted
--
-- Ownership follows the platform's existing model:
--   auth.users.id -> public.profiles.id -> owner column
--
-- The catalogue is global reference data and read-only for clients. Writes
-- stay with the service-role client (which bypasses RLS), so a user cannot
-- invent a simulation, change an official URL or mark a listing active.
--
-- What a certificate means:
--   * `self_reported` is the only state a candidate can write. They finished
--     the simulation and pasted the link the provider gave them.
--   * `pending` and `verified` are reserved for a trusted review. The RLS
--     policies below make a candidate's own write of either state impossible,
--     and no interface describes a self-reported certificate as verified.
--
-- Additive and idempotent: no table is dropped, no row is deleted, and no
-- existing table is modified.

-- ---------------------------------------------------------------------------
-- career_experiences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.career_experiences (
  id text PRIMARY KEY,
  title text NOT NULL,
  provider text NOT NULL DEFAULT 'Forage',
  provider_url text,
  description text NOT NULL,
  category text NOT NULL,
  difficulty text NOT NULL,
  duration_hours numeric(5, 2),
  duration_label text,
  url text NOT NULL,
  domain_ids text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT career_experiences_difficulty_check CHECK (
    difficulty IN ('introductory', 'intermediate', 'advanced')
  ),
  CONSTRAINT career_experiences_duration_check CHECK (
    duration_hours IS NULL OR (duration_hours >= 0 AND duration_hours <= 100)
  ),
  CONSTRAINT career_experiences_url_check CHECK (url ~* '^https://'),
  CONSTRAINT career_experiences_provider_url_check CHECK (
    provider_url IS NULL OR provider_url ~* '^https://'
  )
);

CREATE INDEX IF NOT EXISTS idx_career_experiences_category
  ON public.career_experiences(category);
CREATE INDEX IF NOT EXISTS idx_career_experiences_difficulty
  ON public.career_experiences(difficulty);
CREATE INDEX IF NOT EXISTS idx_career_experiences_active_sort
  ON public.career_experiences(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_career_experiences_domains
  ON public.career_experiences USING gin(domain_ids);

-- ---------------------------------------------------------------------------
-- career_experience_skills
--
-- `skill_name` is the canonical join key the deterministic matcher uses. It
-- mirrors the Learning Hub's course_skills shape so one skill vocabulary is
-- shared by both catalogues.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.career_experience_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id text NOT NULL REFERENCES public.career_experiences(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  importance int NOT NULL DEFAULT 3,
  CONSTRAINT career_experience_skills_importance_check CHECK (importance BETWEEN 1 AND 5),
  CONSTRAINT career_experience_skills_key UNIQUE (experience_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_career_experience_skills_experience
  ON public.career_experience_skills(experience_id);
CREATE INDEX IF NOT EXISTS idx_career_experience_skills_name
  ON public.career_experience_skills(lower(skill_name));

-- ---------------------------------------------------------------------------
-- career_experience_roles
--
-- `role_slug` is the stable id of a role in shared/careerRoles.ts. A separate
-- roles table would duplicate a catalogue the application already owns.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.career_experience_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id text NOT NULL REFERENCES public.career_experiences(id) ON DELETE CASCADE,
  role_slug text NOT NULL,
  relevance_score int NOT NULL DEFAULT 50,
  CONSTRAINT career_experience_roles_relevance_check CHECK (relevance_score BETWEEN 1 AND 100),
  CONSTRAINT career_experience_roles_key UNIQUE (experience_id, role_slug)
);

CREATE INDEX IF NOT EXISTS idx_career_experience_roles_experience
  ON public.career_experience_roles(experience_id);
CREATE INDEX IF NOT EXISTS idx_career_experience_roles_slug
  ON public.career_experience_roles(role_slug);

-- ---------------------------------------------------------------------------
-- user_experience_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_experience_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  experience_id text NOT NULL REFERENCES public.career_experiences(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  saved boolean NOT NULL DEFAULT true,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_experience_progress_status_check CHECK (
    status IN ('not_started', 'in_progress', 'completed')
  ),
  CONSTRAINT user_experience_progress_profile_experience_key UNIQUE (
    profile_id,
    experience_id
  )
);

CREATE INDEX IF NOT EXISTS idx_user_experience_progress_profile
  ON public.user_experience_progress(profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_experience_progress_status
  ON public.user_experience_progress(profile_id, status);

-- ---------------------------------------------------------------------------
-- user_experience_certificates
--
-- One certificate link per experience per candidate. A certificate may only
-- be submitted for a completed simulation, which the insert policy checks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_experience_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  experience_id text NOT NULL REFERENCES public.career_experiences(id) ON DELETE CASCADE,
  certificate_url text NOT NULL,
  verification_status text NOT NULL DEFAULT 'self_reported',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_experience_certificates_status_check CHECK (
    verification_status IN ('self_reported', 'pending', 'verified')
  ),
  CONSTRAINT user_experience_certificates_url_check CHECK (
    certificate_url ~* '^https://'
  ),
  CONSTRAINT user_experience_certificates_profile_experience_key UNIQUE (
    profile_id,
    experience_id
  )
);

CREATE INDEX IF NOT EXISTS idx_user_experience_certificates_profile
  ON public.user_experience_certificates(profile_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.career_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_experience_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_experience_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_experience_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_experience_certificates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Catalogue: public reference data, read-only for every client. There is
  -- deliberately no write policy, so only the service role can change it.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='career_experiences' AND policyname='career_experiences_select_catalog') THEN
    CREATE POLICY career_experiences_select_catalog
      ON public.career_experiences FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='career_experience_skills' AND policyname='career_experience_skills_select_catalog') THEN
    CREATE POLICY career_experience_skills_select_catalog
      ON public.career_experience_skills FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='career_experience_roles' AND policyname='career_experience_roles_select_catalog') THEN
    CREATE POLICY career_experience_roles_select_catalog
      ON public.career_experience_roles FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- Progress: the candidate's own row only.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_experience_progress' AND policyname='user_experience_progress_select_own') THEN
    CREATE POLICY user_experience_progress_select_own
      ON public.user_experience_progress FOR SELECT TO authenticated
      USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_experience_progress' AND policyname='user_experience_progress_insert_own') THEN
    CREATE POLICY user_experience_progress_insert_own
      ON public.user_experience_progress FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_experience_progress' AND policyname='user_experience_progress_update_own') THEN
    CREATE POLICY user_experience_progress_update_own
      ON public.user_experience_progress FOR UPDATE TO authenticated
      USING (auth.uid() = profile_id)
      WITH CHECK (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_experience_progress' AND policyname='user_experience_progress_delete_own') THEN
    CREATE POLICY user_experience_progress_delete_own
      ON public.user_experience_progress FOR DELETE TO authenticated
      USING (auth.uid() = profile_id);
  END IF;

  -- Certificates: own row, self-reported only, and only after completion.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_experience_certificates' AND policyname='user_experience_certificates_select_own') THEN
    CREATE POLICY user_experience_certificates_select_own
      ON public.user_experience_certificates FOR SELECT TO authenticated
      USING (auth.uid() = profile_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_experience_certificates' AND policyname='user_experience_certificates_insert_own_self_reported') THEN
    CREATE POLICY user_experience_certificates_insert_own_self_reported
      ON public.user_experience_certificates FOR INSERT TO authenticated
      WITH CHECK (
        auth.uid() = profile_id
        AND verification_status = 'self_reported'
        AND verified_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.user_experience_progress p
          WHERE p.profile_id = auth.uid()
            AND p.experience_id = user_experience_certificates.experience_id
            AND p.status = 'completed'
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_experience_certificates' AND policyname='user_experience_certificates_update_own_self_reported') THEN
    CREATE POLICY user_experience_certificates_update_own_self_reported
      ON public.user_experience_certificates FOR UPDATE TO authenticated
      USING (
        auth.uid() = profile_id
        AND verification_status = 'self_reported'
      )
      WITH CHECK (
        auth.uid() = profile_id
        AND verification_status = 'self_reported'
        AND verified_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.user_experience_progress p
          WHERE p.profile_id = auth.uid()
            AND p.experience_id = user_experience_certificates.experience_id
            AND p.status = 'completed'
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_experience_certificates' AND policyname='user_experience_certificates_delete_own') THEN
    CREATE POLICY user_experience_certificates_delete_own
      ON public.user_experience_certificates FOR DELETE TO authenticated
      USING (auth.uid() = profile_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Curated catalogue
--
-- Every URL below was read from Forage's public sitemap and each simulation
-- page was checked before it was added. The descriptions are written for this
-- platform; they do not reproduce provider marketing copy. Durations are the
-- provider's published guidance (`duration_label`) and `duration_hours` is its
-- midpoint, used only for filtering. Skill tags are this platform's curation
-- of the tasks the provider publishes.
-- ---------------------------------------------------------------------------
INSERT INTO public.career_experiences
  (id, title, provider, provider_url, description, category, difficulty,
   duration_hours, duration_label, url, domain_ids, is_featured, sort_order)
VALUES
  (
    'forage-commonwealth-bank-software-engineering',
    'Commonwealth Bank Software Engineering',
    'Forage', 'https://www.theforage.com',
    'Work through backend and frontend changes in an existing application, cover the code with tests and open a pull request the way a team reviews one.',
    'Software Engineering', 'advanced', 5.5, '5-6 hours',
    'https://www.theforage.com/simulations/commonwealth-bank/software-engineering-c4hw',
    ARRAY['technology']::text[], true, 10
  ),
  (
    'forage-hewlett-packard-enterprise-software-engineering',
    'Hewlett Packard Enterprise Software Engineering',
    'Forage', 'https://www.theforage.com',
    'Turn a REST API proposal into a working service, add upload support and write unit tests for the behaviour you built.',
    'Software Engineering', 'intermediate', 6.5, '6-7 hours',
    'https://www.theforage.com/simulations/hewlett-packard-enterprise/software-engineering-pcij',
    ARRAY['technology']::text[], false, 20
  ),
  (
    'forage-walmart-advanced-software-engineering',
    'Walmart Advanced Software Engineering',
    'Forage', 'https://www.theforage.com',
    'Practise advanced data structures, software architecture, relational schema design and data munging in a set of applied engineering tasks.',
    'Software Engineering', 'advanced', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/walmart/software-engineering-fceb',
    ARRAY['technology']::text[], false, 30
  ),
  (
    'forage-blackbird-software-engineering',
    'Blackbird Software Engineering',
    'Forage', 'https://www.theforage.com',
    'Contribute to several open-source style engineering tasks, from GitHub collaboration and CI verification to a sprint retrospective.',
    'Software Engineering', 'advanced', 6.5, '6-7 hours',
    'https://www.theforage.com/simulations/blackbird/software-engineering-4mt9',
    ARRAY['technology']::text[], false, 40
  ),
  (
    'forage-datacom-software-development',
    'Datacom Software Development',
    'Forage', 'https://www.theforage.com',
    'Review a small codebase, trace two defects to their root cause and fix them, the way a support-minded developer works.',
    'Software Engineering', 'introductory', 1.5, '1-2 hours',
    'https://www.theforage.com/simulations/datacom/software-development-l47g',
    ARRAY['technology']::text[], true, 50
  ),
  (
    'forage-commonwealth-bank-introduction-to-cybersecurity',
    'Commonwealth Bank Introduction to Cybersecurity',
    'Forage', 'https://www.theforage.com',
    'Explore security operations through data analysis, incident response, awareness and a penetration-testing exercise.',
    'Cybersecurity', 'introductory', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/commonwealth-bank/intro-cybersecurity-rdxl',
    ARRAY['security']::text[], true, 60
  ),
  (
    'forage-mastercard-cybersecurity',
    'Mastercard Cybersecurity',
    'Forage', 'https://www.theforage.com',
    'Design a phishing simulation and interpret the results, the way an awareness programme is measured.',
    'Cybersecurity', 'introductory', 1.5, '1-2 hours',
    'https://www.theforage.com/simulations/mastercard/cybersecurity-t8ye',
    ARRAY['security']::text[], false, 70
  ),
  (
    'forage-tata-cybersecurity-analyst',
    'Tata Cybersecurity Analyst',
    'Forage', 'https://www.theforage.com',
    'Approach an analyst brief through investigation, evidence and reporting rather than a single multiple-choice quiz.',
    'Cybersecurity', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/tata/cybersecurity-sbda',
    ARRAY['security']::text[], false, 80
  ),
  (
    'forage-datacom-introduction-to-cloud',
    'Datacom Introduction to Cloud',
    'Forage', 'https://www.theforage.com',
    'Register an application in the cloud and automate a build with a GitHub Actions workflow.',
    'Cloud & Infrastructure', 'introductory', 2.5, '2-3 hours',
    'https://www.theforage.com/simulations/datacom/intro-cloud-yfvk',
    ARRAY['technology']::text[], false, 90
  ),
  (
    'forage-solutions-architecture',
    'Forage Solutions Architecture',
    'Forage', 'https://www.theforage.com',
    'Translate a business requirement into a solution design and explain the architecture behind it.',
    'Cloud & Infrastructure', 'introductory', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/forage/solutions-architecture-ts4o-fg-acad',
    ARRAY['technology']::text[], false, 100
  ),
  (
    'forage-tata-genai-powered-data-analytics',
    'Tata GenAI Powered Data Analytics',
    'Forage', 'https://www.theforage.com',
    'Use a generative-AI workflow to explore a dataset and turn the findings into an analyst recommendation.',
    'Data & Analytics', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/tata/data-analytics-t3zr',
    ARRAY['data', 'technology']::text[], true, 110
  ),
  (
    'forage-deloitte-australia-data-analytics',
    'Deloitte Australia Data Analytics',
    'Forage', 'https://www.theforage.com',
    'Clean and interpret a dataset, then present what the evidence supports to a business audience.',
    'Data & Analytics', 'intermediate', 1.5, '1-2 hours',
    'https://www.theforage.com/simulations/deloitte-au/data-analytics-s5zy',
    ARRAY['data', 'business']::text[], false, 120
  ),
  (
    'forage-british-airways-data-science',
    'British Airways Data Science',
    'Forage', 'https://www.theforage.com',
    'Model two commercial questions - lounge eligibility and buying behaviour - from data preparation to a written recommendation.',
    'Data & Analytics', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/british-airways/data-science-yqoz',
    ARRAY['data']::text[], false, 130
  ),
  (
    'forage-bcg-data-science',
    'BCG Data Science',
    'Forage', 'https://www.theforage.com',
    'Frame a business problem, clean and explore the data, engineer features and evaluate a model end to end.',
    'Data & Analytics', 'advanced', 8.5, '8-9 hours',
    'https://www.theforage.com/simulations/bcg/data-science-ccdz',
    ARRAY['data']::text[], true, 140
  ),
  (
    'forage-tata-data-visualisation',
    'Tata Data Visualisation',
    'Forage', 'https://www.theforage.com',
    'Frame a business scenario, choose the right visuals, build them and communicate the insight rather than the chart.',
    'Data & Analytics', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/tata/data-visualisation-p5xo',
    ARRAY['data', 'business']::text[], false, 150
  ),
  (
    'forage-bcg-strategy-consulting',
    'BCG Strategy Consulting',
    'Forage', 'https://www.theforage.com',
    'Research a market, build a financial model, design a consumer survey and analyse the result as a consulting team would.',
    'Consulting', 'intermediate', 4.5, '4-5 hours',
    'https://www.theforage.com/simulations/bcg/strategy-consulting-jk76',
    ARRAY['business']::text[], true, 160
  ),
  (
    'forage-bcg-genai',
    'BCG GenAI',
    'Forage', 'https://www.theforage.com',
    'Explore how generative AI changes a consulting workflow, from research and drafting to the final recommendation.',
    'AI & Emerging Tech', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/bcg/gen-ai-anlo',
    ARRAY['technology', 'business', 'product']::text[], true, 170
  ),
  (
    'forage-pwc-us-management-consulting',
    'PwC US Management Consulting',
    'Forage', 'https://www.theforage.com',
    'Summarise a business, prepare an interview guide, present qualitative synergies and build a simple Excel model.',
    'Consulting', 'intermediate', 4.5, '4-5 hours',
    'https://www.theforage.com/simulations/pwc-us/management-consulting-gwcm',
    ARRAY['business']::text[], false, 180
  ),
  (
    'forage-product-management',
    'Forage Product Management',
    'Forage', 'https://www.theforage.com',
    'Take a product from discovery to a prioritised plan, practising the decisions a product manager makes.',
    'Product Management', 'introductory', 2.5, '2-3 hours',
    'https://www.theforage.com/simulations/forage/product-management-5c7c-fg-acad',
    ARRAY['product']::text[], false, 190
  ),
  (
    'forage-bank-of-america-investment-banking',
    'Bank of America Investment Banking',
    'Forage', 'https://www.theforage.com',
    'Analyse a company financial performance, weigh strategic alternatives and build the model behind the recommendation.',
    'Investment Banking', 'advanced', 4.5, '4-5 hours',
    'https://www.theforage.com/simulations/bank-of-america/investment-banking-bwp7',
    ARRAY['finance']::text[], true, 200
  ),
  (
    'forage-goldman-sachs-risk',
    'Goldman Sachs Risk',
    'Forage', 'https://www.theforage.com',
    'Work through risk identification and assessment in a short, introductory finance exercise.',
    'Risk', 'introductory', 0.75, '30-60 mins',
    'https://www.theforage.com/simulations/goldman-sachs/risk-ljdz',
    ARRAY['finance', 'business']::text[], false, 210
  ),
  (
    'forage-kpmg-us-audit',
    'KPMG U.S. Career Catalyst: Audit',
    'Forage', 'https://www.theforage.com',
    'Follow an audit from planning to receivables testing, client communication and a walkthrough of the client process.',
    'Audit', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/kpmg-us/audit-gsyv',
    ARRAY['finance']::text[], false, 220
  ),
  (
    'forage-fidelity-international-investment-management',
    'Fidelity International Investment Management',
    'Forage', 'https://www.theforage.com',
    'Answer a client investment questions, evaluate equity and fixed-income options and construct a multi-asset portfolio.',
    'Investment Management', 'intermediate', 4.5, '4-5 hours',
    'https://www.theforage.com/simulations/fidelity-international/investment-management-bqoj',
    ARRAY['finance']::text[], false, 230
  ),
  (
    'forage-cbre-commercial-real-estate',
    'CBRE Commercial Real Estate',
    'Forage', 'https://www.theforage.com',
    'Research a commercial property market and prepare the account-management view a real-estate team uses.',
    'Commercial Real Estate', 'introductory', 1.5, '1-2 hours',
    'https://www.theforage.com/simulations/cbre/commercial-real-estate-2wj8',
    ARRAY['finance', 'business']::text[], false, 240
  ),
  (
    'forage-pearson-marketing-explorer',
    'Pearson Marketing Explorer',
    'Forage', 'https://www.theforage.com',
    'Explore the marketing function through a short, introductory set of commercial tasks.',
    'Marketing', 'introductory', 0.6, '30-40 mins',
    'https://www.theforage.com/simulations/pearson/marketing-oxce',
    ARRAY['marketing']::text[], false, 250
  ),
  (
    'forage-red-bull-off-premise-sales',
    'Red Bull Off-Premise Sales',
    'Forage', 'https://www.theforage.com',
    'Analyse a client off-premise opportunity and present the case for the products you would recommend.',
    'Sales', 'introductory', 1.5, '1-2 hours',
    'https://www.theforage.com/simulations/red-bull/off-premise-sales-wob6',
    ARRAY['sales']::text[], false, 260
  ),
  (
    'forage-ge-aerospace-human-resources',
    'GE Aerospace Explore Human Resources',
    'Forage', 'https://www.theforage.com',
    'Practise constructive feedback, Lean process improvement and a compensation conversation with a leader.',
    'Human Resources', 'introductory', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/ge-aerospace/human-resources-8hl7',
    ARRAY['human-resources']::text[], false, 270
  ),
  (
    'forage-ge-aerospace-engineering',
    'GE Aerospace Explore Engineering',
    'Forage', 'https://www.theforage.com',
    'Work through energy-source design, compression and bypass ratio, and the performance implications of each choice.',
    'Engineering', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/ge-aerospace/engineering-xadc',
    ARRAY['engineering']::text[], false, 280
  ),
  (
    'forage-lja-civil-engineering',
    'LJA Civil Engineering',
    'Forage', 'https://www.theforage.com',
    'Apply civil-engineering judgement to a practical design and documentation task.',
    'Engineering', 'intermediate', 2.5, '2-3 hours',
    'https://www.theforage.com/simulations/lja/civil-engineering-np8u',
    ARRAY['engineering']::text[], false, 290
  ),
  (
    'forage-ge-aerospace-manufacturing-engineering',
    'GE Aerospace Explore Manufacturing Engineering',
    'Forage', 'https://www.theforage.com',
    'Determine the requirements for a manufacturing fixture and disposition non-conforming turbine blades.',
    'Engineering', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/ge-aerospace/supply-chain-n0yr',
    ARRAY['engineering', 'operations']::text[], false, 300
  ),
  (
    'forage-pwc-us-cyber-security-consulting',
    'PwC US Cyber Security Consulting',
    'Forage', 'https://www.theforage.com',
    'Assess risk, walk through the software development lifecycle, test IT controls and summarise the result for a client.',
    'Cybersecurity', 'intermediate', 4.5, '4-5 hours',
    'https://www.theforage.com/simulations/pwc-us/cybersecurity-consulting-sr1m',
    ARRAY['security', 'business']::text[], true, 310
  ),
  (
    'forage-linklaters-uk-commercial-law',
    'Linklaters UK Commercial Law',
    'Forage', 'https://www.theforage.com',
    'Practise business development, project management, legal research and the responsible use of AI in a law firm.',
    'Legal', 'introductory', 4.5, '4-5 hours',
    'https://www.theforage.com/simulations/linklaters/commercial-law-uk-xkbb',
    ARRAY['legal']::text[], false, 320
  ),
  (
    'forage-lifearc-life-sciences-biology-research',
    'LifeArc Life Sciences: Biology Research',
    'Forage', 'https://www.theforage.com',
    'Optimise an experimental condition, analyse the data, synthesise the evidence and present the result.',
    'Life Sciences', 'intermediate', 7.5, '7-8 hours',
    'https://www.theforage.com/simulations/life-arc/life-sciences-biology-research-5t8f',
    ARRAY['healthcare']::text[], false, 330
  ),
  (
    'forage-national-urban-league-career-readiness',
    'National Urban League Career Readiness',
    'Forage', 'https://www.theforage.com',
    'Build an elevator pitch, a network plan, a resume story and a virtual-interview approach for the job search.',
    'Career Readiness', 'introductory', 6.5, '6-7 hours',
    'https://www.theforage.com/simulations/national-urban-league/career-readiness-nhwo',
    ARRAY['education', 'human-resources']::text[], false, 340
  ),
  (
    'forage-johnson-and-johnson-robotics-and-controls',
    'Johnson & Johnson Robotics and Controls',
    'Forage', 'https://www.theforage.com',
    'Work through robotics and controls tasks that connect mechanical behaviour to the control system behind it.',
    'Engineering', 'intermediate', 3.5, '3-4 hours',
    'https://www.theforage.com/simulations/johnson-and-johnson/robotics-controls-aozc',
    ARRAY['engineering', 'technology']::text[], false, 350
  ),
  (
    'forage-siemens-mobility-project-manager',
    'Siemens Mobility Project Manager',
    'Forage', 'https://www.theforage.com',
    'Plan a project, manage its constraints and communicate progress in a short project-management exercise.',
    'Project Management', 'introductory', 1.5, '1-2 hours',
    'https://www.theforage.com/simulations/siemens-mobility/project-management-qydx',
    ARRAY['operations', 'business']::text[], false, 360
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  provider = EXCLUDED.provider,
  provider_url = EXCLUDED.provider_url,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  difficulty = EXCLUDED.difficulty,
  duration_hours = EXCLUDED.duration_hours,
  duration_label = EXCLUDED.duration_label,
  url = EXCLUDED.url,
  domain_ids = EXCLUDED.domain_ids,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Curated skill tags
-- ---------------------------------------------------------------------------
INSERT INTO public.career_experience_skills (experience_id, skill_name, importance)
VALUES
  ('forage-commonwealth-bank-software-engineering', 'Programming Fundamentals', 5),
  ('forage-commonwealth-bank-software-engineering', 'React', 4),
  ('forage-commonwealth-bank-software-engineering', 'Automated Testing', 4),
  ('forage-commonwealth-bank-software-engineering', 'Git & Version Control', 4),
  ('forage-commonwealth-bank-software-engineering', 'Debugging & Problem Solving', 3),
  ('forage-hewlett-packard-enterprise-software-engineering', 'RESTful API Architecture', 5),
  ('forage-hewlett-packard-enterprise-software-engineering', 'Programming Fundamentals', 4),
  ('forage-hewlett-packard-enterprise-software-engineering', 'Automated Testing', 4),
  ('forage-hewlett-packard-enterprise-software-engineering', 'Git & Version Control', 3),
  ('forage-walmart-advanced-software-engineering', 'Data Structures & Algorithms', 5),
  ('forage-walmart-advanced-software-engineering', 'SQL & Database Design', 4),
  ('forage-walmart-advanced-software-engineering', 'Programming Fundamentals', 4),
  ('forage-walmart-advanced-software-engineering', 'Technical Literacy', 3),
  ('forage-blackbird-software-engineering', 'Git & Version Control', 5),
  ('forage-blackbird-software-engineering', 'CI/CD (GitHub Actions / GitLab)', 4),
  ('forage-blackbird-software-engineering', 'Programming Fundamentals', 4),
  ('forage-blackbird-software-engineering', 'Technical Literacy', 3),
  ('forage-datacom-software-development', 'Debugging & Problem Solving', 5),
  ('forage-datacom-software-development', 'Programming Fundamentals', 4),
  ('forage-datacom-software-development', 'Automated Testing', 3),
  ('forage-commonwealth-bank-introduction-to-cybersecurity', 'Incident Response Procedures', 5),
  ('forage-commonwealth-bank-introduction-to-cybersecurity', 'Network Security & Protocols', 4),
  ('forage-commonwealth-bank-introduction-to-cybersecurity', 'Vulnerability Management', 3),
  ('forage-commonwealth-bank-introduction-to-cybersecurity', 'Security Frameworks (NIST/ISO)', 3),
  ('forage-mastercard-cybersecurity', 'Security Frameworks (NIST/ISO)', 4),
  ('forage-mastercard-cybersecurity', 'Incident Response Procedures', 3),
  ('forage-mastercard-cybersecurity', 'Client Communication & Reporting', 3),
  ('forage-tata-cybersecurity-analyst', 'Incident Response Procedures', 4),
  ('forage-tata-cybersecurity-analyst', 'Vulnerability Management', 4),
  ('forage-tata-cybersecurity-analyst', 'Network Security & Protocols', 3),
  ('forage-tata-cybersecurity-analyst', 'Security Frameworks (NIST/ISO)', 3),
  ('forage-datacom-introduction-to-cloud', 'Cloud Architecture (AWS / GCP / Azure)', 5),
  ('forage-datacom-introduction-to-cloud', 'CI/CD (GitHub Actions / GitLab)', 5),
  ('forage-datacom-introduction-to-cloud', 'Infrastructure as Code (Terraform)', 3),
  ('forage-solutions-architecture', 'Cloud Architecture (AWS / GCP / Azure)', 5),
  ('forage-solutions-architecture', 'Technical Literacy', 4),
  ('forage-solutions-architecture', 'Stakeholder Communication', 3),
  ('forage-tata-genai-powered-data-analytics', 'Python for Data Analysis', 4),
  ('forage-tata-genai-powered-data-analytics', 'Data Preprocessing & Feature Engineering', 4),
  ('forage-tata-genai-powered-data-analytics', 'LLMs & Prompt Engineering', 4),
  ('forage-tata-genai-powered-data-analytics', 'Data-Driven Decision Making', 3),
  ('forage-deloitte-australia-data-analytics', 'Data Visualisation & Dashboarding', 5),
  ('forage-deloitte-australia-data-analytics', 'SQL', 4),
  ('forage-deloitte-australia-data-analytics', 'Business Communication', 4),
  ('forage-deloitte-australia-data-analytics', 'Data Validation & Reconciliation', 3),
  ('forage-british-airways-data-science', 'Statistical Analysis', 5),
  ('forage-british-airways-data-science', 'Python for Data Analysis', 4),
  ('forage-british-airways-data-science', 'Machine Learning Fundamentals', 4),
  ('forage-british-airways-data-science', 'Data Visualization & Communication', 4),
  ('forage-bcg-data-science', 'Statistical Analysis', 5),
  ('forage-bcg-data-science', 'Python for Data Analysis', 5),
  ('forage-bcg-data-science', 'Data Preprocessing & Feature Engineering', 4),
  ('forage-bcg-data-science', 'Machine Learning Fundamentals', 4),
  ('forage-bcg-data-science', 'Data Visualization & Communication', 4),
  ('forage-tata-data-visualisation', 'Data Visualization (Tableau/Power BI)', 5),
  ('forage-tata-data-visualisation', 'Data Visualisation & Dashboarding', 5),
  ('forage-tata-data-visualisation', 'Business Communication', 4),
  ('forage-tata-data-visualisation', 'Business Metric Definition', 3),
  ('forage-bcg-strategy-consulting', 'Problem Structuring & Hypothesis Testing', 5),
  ('forage-bcg-strategy-consulting', 'Financial Analysis & Business Case', 4),
  ('forage-bcg-strategy-consulting', 'Research & Benchmarking', 4),
  ('forage-bcg-strategy-consulting', 'Executive Communication & Storytelling', 4),
  ('forage-bcg-genai', 'LLMs & Prompt Engineering', 5),
  ('forage-bcg-genai', 'Data-Driven Decision Making', 4),
  ('forage-bcg-genai', 'Executive Communication & Storytelling', 4),
  ('forage-bcg-genai', 'Technical Literacy', 3),
  ('forage-pwc-us-management-consulting', 'Problem Structuring & Hypothesis Testing', 4),
  ('forage-pwc-us-management-consulting', 'Financial Analysis & Business Case', 4),
  ('forage-pwc-us-management-consulting', 'Executive Communication & Storytelling', 4),
  ('forage-pwc-us-management-consulting', 'Advanced Excel / Spreadsheet Modelling', 4),
  ('forage-product-management', 'Product Discovery & Strategy', 5),
  ('forage-product-management', 'Roadmapping & Prioritization', 4),
  ('forage-product-management', 'User Research & Customer Interviews', 3),
  ('forage-product-management', 'Cross-Functional Leadership', 3),
  ('forage-bank-of-america-investment-banking', 'Financial Modelling & Forecasting', 5),
  ('forage-bank-of-america-investment-banking', 'Financial Statement Analysis', 5),
  ('forage-bank-of-america-investment-banking', 'Market & Industry Research', 4),
  ('forage-bank-of-america-investment-banking', 'Business Communication', 4),
  ('forage-goldman-sachs-risk', 'Risk Assessment', 5),
  ('forage-goldman-sachs-risk', 'Risk Assessment & Rating', 4),
  ('forage-goldman-sachs-risk', 'Data Analysis & Reporting', 4),
  ('forage-goldman-sachs-risk', 'Financial Statement Analysis', 3),
  ('forage-kpmg-us-audit', 'Control Testing & Audit', 4),
  ('forage-kpmg-us-audit', 'Audit Evidence & Working Papers', 5),
  ('forage-kpmg-us-audit', 'Account Reconciliation', 4),
  ('forage-kpmg-us-audit', 'Documentation & Review Standards', 4),
  ('forage-fidelity-international-investment-management', 'Investment Portfolio Construction', 5),
  ('forage-fidelity-international-investment-management', 'Financial Statement Analysis', 4),
  ('forage-fidelity-international-investment-management', 'Risk Assessment', 4),
  ('forage-fidelity-international-investment-management', 'Client Advisory & Communication', 4),
  ('forage-cbre-commercial-real-estate', 'Market & Industry Research', 4),
  ('forage-cbre-commercial-real-estate', 'Account Planning & Expansion', 4),
  ('forage-cbre-commercial-real-estate', 'Business Communication', 4),
  ('forage-cbre-commercial-real-estate', 'Commercial Awareness & Risk Assessment', 3),
  ('forage-pearson-marketing-explorer', 'Marketing Strategy & Planning', 4),
  ('forage-pearson-marketing-explorer', 'Campaign Performance Measurement', 4),
  ('forage-pearson-marketing-explorer', 'Audience Targeting & Segmentation', 3),
  ('forage-pearson-marketing-explorer', 'Brand Positioning & Messaging', 3),
  ('forage-red-bull-off-premise-sales', 'Consultative Selling & Objection Handling', 5),
  ('forage-red-bull-off-premise-sales', 'Pipeline & Deal Management', 4),
  ('forage-red-bull-off-premise-sales', 'Account Planning & Expansion', 4),
  ('forage-red-bull-off-premise-sales', 'Product & Market Knowledge', 4),
  ('forage-ge-aerospace-human-resources', 'Employee Relations', 4),
  ('forage-ge-aerospace-human-resources', 'Performance & Talent Management', 4),
  ('forage-ge-aerospace-human-resources', 'Compensation Benchmarking & Market Pricing', 4),
  ('forage-ge-aerospace-human-resources', 'Executive Coaching & Advisory', 4),
  ('forage-ge-aerospace-engineering', 'Engineering Calculations & Mechanics', 5),
  ('forage-ge-aerospace-engineering', 'Technical Drawing & Documentation', 3),
  ('forage-ge-aerospace-engineering', 'Root Cause Analysis & Troubleshooting', 3),
  ('forage-lja-civil-engineering', 'Structural Analysis & Design', 5),
  ('forage-lja-civil-engineering', 'Technical Drawing & Documentation', 4),
  ('forage-lja-civil-engineering', 'Engineering Calculations & Codes', 4),
  ('forage-lja-civil-engineering', 'Project Management & Cost Awareness', 3),
  ('forage-ge-aerospace-manufacturing-engineering', 'Process Design & Improvement', 5),
  ('forage-ge-aerospace-manufacturing-engineering', 'Root Cause Analysis & Troubleshooting', 4),
  ('forage-ge-aerospace-manufacturing-engineering', 'Tooling & Fixture Design', 3),
  ('forage-ge-aerospace-manufacturing-engineering', 'Quality Management Systems (ISO 9001)', 3),
  ('forage-pwc-us-cyber-security-consulting', 'Risk Assessment & Rating', 5),
  ('forage-pwc-us-cyber-security-consulting', 'Control Testing & Audit', 4),
  ('forage-pwc-us-cyber-security-consulting', 'Security Frameworks (NIST/ISO)', 4),
  ('forage-pwc-us-cyber-security-consulting', 'Client Communication & Reporting', 4),
  ('forage-pwc-us-cyber-security-consulting', 'Regulatory Requirements (GDPR, SOC2)', 3),
  ('forage-linklaters-uk-commercial-law', 'Legal Research & Case Analysis', 4),
  ('forage-linklaters-uk-commercial-law', 'Legal Research & Precedent Analysis', 5),
  ('forage-linklaters-uk-commercial-law', 'Commercial Awareness & Risk Assessment', 4),
  ('forage-linklaters-uk-commercial-law', 'Negotiation', 3),
  ('forage-linklaters-uk-commercial-law', 'Contract Drafting & Interpretation', 3),
  ('forage-lifearc-life-sciences-biology-research', 'Statistical Analysis', 4),
  ('forage-lifearc-life-sciences-biology-research', 'Health Data Analysis & Reporting', 4),
  ('forage-lifearc-life-sciences-biology-research', 'Data Analysis & Reporting', 4),
  ('forage-lifearc-life-sciences-biology-research', 'Research & Benchmarking', 3),
  ('forage-national-urban-league-career-readiness', 'Stakeholder Communication', 4),
  ('forage-national-urban-league-career-readiness', 'Interview Coordination', 3),
  ('forage-national-urban-league-career-readiness', 'Copywriting & Editing', 3),
  ('forage-national-urban-league-career-readiness', 'Adult Learning Principles', 3),
  ('forage-johnson-and-johnson-robotics-and-controls', 'Electrical System Design', 4),
  ('forage-johnson-and-johnson-robotics-and-controls', 'Controls & Instrumentation', 4),
  ('forage-johnson-and-johnson-robotics-and-controls', 'Engineering Calculations & Mechanics', 4),
  ('forage-johnson-and-johnson-robotics-and-controls', 'Root Cause Analysis & Troubleshooting', 3),
  ('forage-siemens-mobility-project-manager', 'Project Planning & Scheduling', 5),
  ('forage-siemens-mobility-project-manager', 'Risk & Issue Management', 4),
  ('forage-siemens-mobility-project-manager', 'Budget Management', 4),
  ('forage-siemens-mobility-project-manager', 'Stakeholder Communication', 4)
ON CONFLICT (experience_id, skill_name) DO UPDATE SET
  importance = EXCLUDED.importance;

-- ---------------------------------------------------------------------------
-- Curated role relevance
-- ---------------------------------------------------------------------------
INSERT INTO public.career_experience_roles (experience_id, role_slug, relevance_score)
VALUES
  ('forage-commonwealth-bank-software-engineering', 'software-engineer', 95),
  ('forage-commonwealth-bank-software-engineering', 'fullstack-engineer', 90),
  ('forage-commonwealth-bank-software-engineering', 'frontend-engineer', 85),
  ('forage-hewlett-packard-enterprise-software-engineering', 'software-engineer', 90),
  ('forage-hewlett-packard-enterprise-software-engineering', 'fullstack-engineer', 85),
  ('forage-walmart-advanced-software-engineering', 'software-engineer', 95),
  ('forage-walmart-advanced-software-engineering', 'cloud-devops-engineer', 80),
  ('forage-blackbird-software-engineering', 'software-engineer', 90),
  ('forage-blackbird-software-engineering', 'fullstack-engineer', 80),
  ('forage-datacom-software-development', 'software-engineer', 85),
  ('forage-datacom-software-development', 'qa-engineer', 80),
  ('forage-commonwealth-bank-introduction-to-cybersecurity', 'cybersecurity-analyst', 95),
  ('forage-mastercard-cybersecurity', 'cybersecurity-analyst', 90),
  ('forage-tata-cybersecurity-analyst', 'cybersecurity-analyst', 95),
  ('forage-tata-cybersecurity-analyst', 'security-engineer', 85),
  ('forage-datacom-introduction-to-cloud', 'cloud-devops-engineer', 95),
  ('forage-solutions-architecture', 'cloud-devops-engineer', 90),
  ('forage-solutions-architecture', 'software-engineer', 75),
  ('forage-tata-genai-powered-data-analytics', 'data-analyst', 90),
  ('forage-tata-genai-powered-data-analytics', 'data-scientist', 85),
  ('forage-deloitte-australia-data-analytics', 'data-analyst', 90),
  ('forage-deloitte-australia-data-analytics', 'business-analyst', 80),
  ('forage-deloitte-australia-data-analytics', 'business-intelligence-analyst', 85),
  ('forage-british-airways-data-science', 'data-scientist', 90),
  ('forage-british-airways-data-science', 'data-analyst', 80),
  ('forage-bcg-data-science', 'data-scientist', 95),
  ('forage-bcg-data-science', 'ai-ml-engineer', 85),
  ('forage-tata-data-visualisation', 'data-analyst', 90),
  ('forage-tata-data-visualisation', 'business-intelligence-analyst', 90),
  ('forage-bcg-strategy-consulting', 'management-consultant', 95),
  ('forage-bcg-strategy-consulting', 'business-analyst', 85),
  ('forage-bcg-genai', 'ai-ml-engineer', 85),
  ('forage-bcg-genai', 'management-consultant', 80),
  ('forage-bcg-genai', 'product-manager', 75),
  ('forage-pwc-us-management-consulting', 'management-consultant', 90),
  ('forage-pwc-us-management-consulting', 'business-analyst', 85),
  ('forage-product-management', 'product-manager', 95),
  ('forage-product-management', 'product-owner', 90),
  ('forage-bank-of-america-investment-banking', 'investment-analyst', 95),
  ('forage-bank-of-america-investment-banking', 'financial-analyst', 85),
  ('forage-goldman-sachs-risk', 'risk-management-analyst', 90),
  ('forage-goldman-sachs-risk', 'financial-analyst', 80),
  ('forage-kpmg-us-audit', 'audit-assistant', 95),
  ('forage-kpmg-us-audit', 'accountant', 85),
  ('forage-fidelity-international-investment-management', 'investment-analyst', 90),
  ('forage-fidelity-international-investment-management', 'financial-planner', 85),
  ('forage-cbre-commercial-real-estate', 'financial-analyst', 75),
  ('forage-cbre-commercial-real-estate', 'business-development-manager', 80),
  ('forage-pearson-marketing-explorer', 'marketing-manager', 85),
  ('forage-pearson-marketing-explorer', 'digital-marketing-specialist', 85),
  ('forage-red-bull-off-premise-sales', 'sales-representative', 90),
  ('forage-red-bull-off-premise-sales', 'account-executive', 85),
  ('forage-ge-aerospace-human-resources', 'hr-specialist', 85),
  ('forage-ge-aerospace-human-resources', 'hr-business-partner', 85),
  ('forage-ge-aerospace-human-resources', 'compensation-analyst', 80),
  ('forage-ge-aerospace-engineering', 'mechanical-engineer', 85),
  ('forage-ge-aerospace-engineering', 'electrical-engineer', 80),
  ('forage-lja-civil-engineering', 'civil-engineer', 95),
  ('forage-ge-aerospace-manufacturing-engineering', 'manufacturing-process-engineer', 95),
  ('forage-ge-aerospace-manufacturing-engineering', 'quality-engineer', 85),
  ('forage-ge-aerospace-manufacturing-engineering', 'supply-chain-manager', 75),
  ('forage-pwc-us-cyber-security-consulting', 'security-consultant', 95),
  ('forage-pwc-us-cyber-security-consulting', 'cybersecurity-analyst', 85),
  ('forage-linklaters-uk-commercial-law', 'paralegal', 85),
  ('forage-linklaters-uk-commercial-law', 'legal-assistant', 80),
  ('forage-linklaters-uk-commercial-law', 'contract-manager', 80),
  ('forage-lifearc-life-sciences-biology-research', 'public-health-analyst', 80),
  ('forage-national-urban-league-career-readiness', 'training-specialist', 80),
  ('forage-national-urban-league-career-readiness', 'hr-specialist', 75),
  ('forage-johnson-and-johnson-robotics-and-controls', 'electrical-engineer', 85),
  ('forage-johnson-and-johnson-robotics-and-controls', 'mechanical-engineer', 80),
  ('forage-siemens-mobility-project-manager', 'project-manager', 95),
  ('forage-siemens-mobility-project-manager', 'program-manager', 90)
ON CONFLICT (experience_id, role_slug) DO UPDATE SET
  relevance_score = EXCLUDED.relevance_score;
