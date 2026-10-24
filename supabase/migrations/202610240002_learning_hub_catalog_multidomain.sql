-- Phase B.6 - multi-domain verified course catalogue
--
-- The catalogue seeded in 202510220002_learning_hub_catalog.sql holds 77
-- resources, 75 of which are technical (Programming, Data, AI, Frontend,
-- Backend, Cloud, Cybersecurity). The product is now a career operating
-- system for every major career domain, so the Learning Hub needs real
-- learning material for business, finance, marketing, sales, people and HR,
-- healthcare, education, legal, operations, design, engineering and product
-- roles too.
--
-- This migration ADDS 36 verified courses across 13 categories. It does not
-- modify or remove any existing row.
--
-- Every URL below was checked with an HTTP HEAD request and returned 200 at
-- the time this migration was written. Availability is explicit per row and
-- uses only the six values the schema allows:
--   free                          no payment required
--   free_with_limitations         free access with a real restriction (account, first chapter, labs)
--   audit                         free to audit; certificate costs extra
--   free_course_paid_certificate  course content free, certificate paid
--   paid                          payment required
--   youtube_free                  free YouTube video/playlist
--
-- Coursera and edX are never marked free: individual courses are free to
-- AUDIT with an account and the certificate is a paid extra; multi-course
-- specialisations need a subscription or a paid enrolment per course.
--
-- The catalogue is idempotent: re-applying it updates the same rows and
-- never duplicates them.

INSERT INTO public.courses
  (id, title, provider, provider_url, category, level, duration_hours, language, url, availability, availability_note, format, description, is_verified, verified_at)
VALUES
  -- ---------------------------------------------------------------------
  -- Finance and accounting
  -- ---------------------------------------------------------------------
  ('crs-uva-financial-accounting', 'Financial Accounting Fundamentals', 'University of Virginia / Coursera', 'https://www.coursera.org', 'Accounting', 'Beginner', 7, 'English', 'https://www.coursera.org/learn/uva-darden-financial-accounting', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Journal entries, t-accounts and the three core financial statements, using the records of a small business.', true, '2026-10-24T00:00:00Z'),
  ('crs-uiuc-financial-accounting', 'Financial Accounting: Foundations', 'University of Illinois Urbana-Champaign / Coursera', 'https://www.coursera.org', 'Accounting', 'Beginner', 15, 'English', 'https://www.coursera.org/learn/financial-accounting-basics', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'How accounting information is used by capital markets, with revenue recognition and accrual accounting.', true, '2026-10-24T00:00:00Z'),
  ('crs-cfi-accounting-fundamentals', 'Accounting Fundamentals', 'Corporate Finance Institute / Coursera', 'https://www.coursera.org', 'Accounting', 'Beginner', 7, 'English', 'https://www.coursera.org/learn/learn-accounting-fundamentals-corporate-finance', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Financial statement terms, multi-year income statement, balance sheet and cash flow statement preparation.', true, '2026-10-24T00:00:00Z'),
  ('crs-iese-principles-financial-accounting', 'Accounting: Principles of Financial Accounting', 'IESE Business School / Coursera', 'https://www.coursera.org', 'Accounting', 'Beginner', 12, 'English', 'https://www.coursera.org/learn/financial-accounting', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Accounting principles for informed decisions, with practice work in Microsoft Excel.', true, '2026-10-24T00:00:00Z'),
  ('crs-fin-accounting-master-core', 'Financial Accounting: Master Core Concepts & Analysis', 'Coursera', 'https://www.coursera.org', 'Accounting', 'Intermediate', 60, 'English', 'https://www.coursera.org/specializations/financial-accounting-master-core-concepts-analysis', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'A four-course series on accounting fundamentals, EPS, shareholder equity, ratio analysis and tax reporting.', true, '2026-10-24T00:00:00Z'),
  ('crs-wharton-corporate-finance', 'Corporate Finance Essentials', 'Wharton / Coursera', 'https://www.coursera.org', 'Finance', 'Intermediate', 9, 'English', 'https://www.coursera.org/learn/corporate-finance-essentials', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'How firms make investment, financing and dividend decisions, and the mechanics behind them.', true, '2026-10-24T00:00:00Z'),
  ('crs-yale-financial-markets', 'Financial Markets', 'Yale University / Coursera', 'https://www.coursera.org', 'Finance', 'Beginner', 13, 'English', 'https://www.coursera.org/learn/financial-markets-global', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'How the financial markets work, the behaviour of securities and the risk-return trade-off.', true, '2026-10-24T00:00:00Z'),
  ('crs-ucd-python-statistics-finance', 'Python and Statistics for Financial Analysis', 'University of California, Davis / Coursera', 'https://www.coursera.org', 'Finance', 'Intermediate', 33, 'English', 'https://www.coursera.org/learn/python-statistics-financial-analysis', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Using Python and statistics to analyse real financial datasets, with portfolio and risk analysis.', true, '2026-10-24T00:00:00Z'),
  ('crs-investment-management', 'Investment Management', 'Coursera', 'https://www.coursera.org', 'Finance', 'Advanced', 50, 'English', 'https://www.coursera.org/specializations/investment-management', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Portfolio construction, asset allocation and the theory behind professional investment practice.', true, '2026-10-24T00:00:00Z'),

  -- ---------------------------------------------------------------------
  -- People, HR and leadership
  -- ---------------------------------------------------------------------
  ('crs-talent-acquisition-strategy', 'Talent Acquisition Strategy', 'Coursera', 'https://www.coursera.org', 'People', 'Intermediate', 4, 'English', 'https://www.coursera.org/learn/talent-acquisition-strategy', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Connecting workforce planning, job documentation and sourcing strategy to real hiring needs.', true, '2026-10-24T00:00:00Z'),
  ('crs-talent-acquisition-recruitment', 'Talent Acquisition and Recruitment Strategies', 'EDUCBA / Coursera', 'https://www.coursera.org', 'People', 'Intermediate', 9, 'English', 'https://www.coursera.org/learn/talent-acquisition-recruitment-strategies', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'End-to-end hiring: workforce planning, sourcing, structured selection, offers and onboarding.', true, '2026-10-24T00:00:00Z'),
  ('crs-managing-talent-lifecycle', 'Managing the Talent Lifecycle', 'Coursera', 'https://www.coursera.org', 'People', 'Beginner', 30, 'English', 'https://www.coursera.org/specializations/managing-the-talent-lifecycle', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Attract, select, onboard, retain and support talent across the employee lifecycle.', true, '2026-10-24T00:00:00Z'),
  ('crs-hr-training-talent-management', 'HR Training and Talent Management', 'Coursera', 'https://www.coursera.org', 'People', 'Beginner', 60, 'English', 'https://www.coursera.org/specializations/hr-training-talent-management', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Recruitment, performance appraisal, workforce planning, succession and leadership development.', true, '2026-10-24T00:00:00Z'),
  ('crs-recruiting-analytics', 'Recruiting Analytics and Talent Pipeline Management', 'ADP / Coursera', 'https://www.coursera.org', 'People', 'Intermediate', 40, 'English', 'https://www.coursera.org/specializations/recruiting-analytics-and-talent-pipeline-management', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Recruiting metrics and key performance indicators applied to sourcing and pipeline health.', true, '2026-10-24T00:00:00Z'),
  ('crs-hr-management', 'Human Resource Management Specialization', 'Coursera', 'https://www.coursera.org', 'People', 'Beginner', 50, 'English', 'https://www.coursera.org/specializations/human-resources-management', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'The core HR practice: planning, recruitment, performance, rewards and employee relations.', true, '2026-10-24T00:00:00Z'),
  ('edx-leadership-development-strategy', 'Designing and implementing a leadership development strategy', 'University of Adelaide / edX', 'https://www.edx.org', 'People', 'Intermediate', 12, 'English', 'https://www.edx.org/learn/business-management/university-of-adelaide-designing-and-implementing-a-leadership-development-strategy', 'paid', 'Listed as a paid edX course (about $165 USD) with access to the course materials.', 'course', 'Build a leadership development strategy: capability matrices, change plans and programme design.', true, '2026-10-24T00:00:00Z'),
  ('edx-trust-conscious-communication', 'Trust and Conscious Communication for Leaders', 'Deepak Chopra / edX', 'https://www.edx.org', 'People', 'Beginner', 8, 'English', 'https://www.edx.org/learn/business-management/deepak-chopra-trust-and-conscious-communication-for-leaders', 'audit', 'Free to audit on edX with an account; the verified certificate is a paid extra.', 'course', 'The components of trusted leadership and conscious communication for leading teams.', true, '2026-10-24T00:00:00Z'),

  -- ---------------------------------------------------------------------
  -- Operations and supply chain
  -- ---------------------------------------------------------------------
  ('crs-supply-chain-analytics-spec', 'Supply Chain Analytics Specialization', 'Rutgers University / Coursera', 'https://www.coursera.org', 'Supply Chain', 'Beginner', 48, 'English', 'https://www.coursera.org/specializations/supply-chain-analytics', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Demand, inventory, sourcing and logistics analytics with applied projects on real data.', true, '2026-10-24T00:00:00Z'),
  ('crs-supply-chain-analytics', 'Supply Chain Analytics', 'Rutgers University / Coursera', 'https://www.coursera.org', 'Supply Chain', 'Beginner', 9, 'English', 'https://www.coursera.org/learn/supply-chain-analytics', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Designing and optimising supply chains across cost efficiency and customer satisfaction.', true, '2026-10-24T00:00:00Z'),
  ('crs-spjimr-supply-chain-management', 'Supply Chain Management', 'S.P. Jain Institute of Management and Research / Coursera', 'https://www.coursera.org', 'Supply Chain', 'Beginner', 50, 'English', 'https://www.coursera.org/specializations/spjimr-supply-chain-management', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Supply chain foundations, planning and execution: procurement, logistics, risk and resilience.', true, '2026-10-24T00:00:00Z'),
  ('crs-supply-chain-management-and-analytics', 'Supply Chain Management and Analytics', 'Unilever / Coursera', 'https://www.coursera.org', 'Operations', 'Beginner', 30, 'English', 'https://www.coursera.org/learn/supply-chain-management-and-analytics', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'The supply chain analyst role, planning and scheduling analytics, and the financial impact of operations.', true, '2026-10-24T00:00:00Z'),

  -- ---------------------------------------------------------------------
  -- Marketing and sales
  -- ---------------------------------------------------------------------
  ('crs-social-media-marketing', 'Social Media Marketing Specialization', 'Coursera', 'https://www.coursera.org', 'Marketing', 'Beginner', 50, 'English', 'https://www.coursera.org/specializations/social-media-marketing', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Audience research, social strategy, content planning, paid promotion and campaign measurement.', true, '2026-10-24T00:00:00Z'),
  ('crs-marketing-analytics', 'Marketing Analytics', 'Coursera', 'https://www.coursera.org', 'Marketing', 'Intermediate', 14, 'English', 'https://www.coursera.org/learn/marketing-analytics', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Measuring marketing performance with segmentation, experiments and marketing metrics.', true, '2026-10-24T00:00:00Z'),
  ('crs-b2b-sales-strategies', 'Sales Strategies: Mastering Complex B2B Sales', 'The Expert Academy / Coursera', 'https://www.coursera.org', 'Sales', 'Intermediate', 40, 'English', 'https://www.coursera.org/specializations/sales-strategies-mastering-complex-b2b-sales', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Qualifying and closing complex B2B deals, managing buying groups and running RFP processes.', true, '2026-10-24T00:00:00Z'),
  ('crs-b2b-sales-foundations', 'B2B Sales Foundations For Complex Deals', 'The Expert Academy / Coursera', 'https://www.coursera.org', 'Sales', 'Intermediate', 10, 'English', 'https://www.coursera.org/learn/b2b-sales-foundations-for-complex-deals', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Consultative selling, trust building, negotiation psychology and structured discovery.', true, '2026-10-24T00:00:00Z'),
  ('crs-advanced-b2b-sales', 'Advanced B2B Sales For Enterprise Deals', 'The Expert Academy / Coursera', 'https://www.coursera.org', 'Sales', 'Intermediate', 17, 'English', 'https://www.coursera.org/learn/advanced-b2b-sales-for-enterprise-deals', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'MEDDICC and SPICED qualification, multi-threaded stakeholder management and pipeline inspection.', true, '2026-10-24T00:00:00Z'),

  -- ---------------------------------------------------------------------
  -- Design and creative
  -- ---------------------------------------------------------------------
  ('crs-graphic-design', 'Graphic Design Specialization', 'Coursera', 'https://www.coursera.org', 'Design', 'Beginner', 150, 'English', 'https://www.coursera.org/specializations/graphic-design', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Typography, colour, visual composition, brand systems and practical design studio projects.', true, '2026-10-24T00:00:00Z'),
  ('crs-ux-design', 'UX Design Specialization', 'Google / Coursera', 'https://www.coursera.org', 'Design', 'Beginner', 100, 'English', 'https://www.coursera.org/specializations/ux-design', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'User research, wireframing, prototyping and design systems, with portfolio-ready projects.', true, '2026-10-24T00:00:00Z'),

  -- ---------------------------------------------------------------------
  -- Healthcare
  -- ---------------------------------------------------------------------
  ('crs-nursing-fundamentals', 'Nursing Fundamentals: Skills for Patient Care Excellence', 'Coursera', 'https://www.coursera.org', 'Healthcare', 'Beginner', 4, 'English', 'https://www.coursera.org/learn/nursing-fundamentals-skills-for-patient-care-excellence', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Structured nursing assessment, patient communication, patient safety and infection control.', true, '2026-10-24T00:00:00Z'),
  ('crs-clinical-medical-assistant', 'Clinical Medical Assistant Fundamentals', 'MedCerts / Coursera', 'https://www.coursera.org', 'Healthcare', 'Beginner', 40, 'English', 'https://www.coursera.org/specializations/clinical-medical-assistant-fundamentals', 'paid', 'Requires a Coursera Plus subscription or paid enrolment per course.', 'learning_path', 'Medical terminology, vital signs, phlebotomy, infection control and clinical documentation.', true, '2026-10-24T00:00:00Z'),

  -- ---------------------------------------------------------------------
  -- Legal and compliance
  -- ---------------------------------------------------------------------
  ('crs-ai-for-legal-professionals', 'AI for Legal Professionals', 'Coursera', 'https://www.coursera.org', 'Legal', 'Beginner', 7, 'English', 'https://www.coursera.org/learn/ai-for-legal-professionals', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Applying AI to legal research, contract review, clause analysis and compliance checks.', true, '2026-10-24T00:00:00Z'),
  ('crs-contracts-commercial-agreements', 'Contracts and Commercial Agreements', 'University of California, Santa Barbara / Coursera', 'https://www.coursera.org', 'Legal', 'Beginner', 12, 'English', 'https://www.coursera.org/learn/contracts-and-commercial-agreements', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Contract review, vendor contracts, commercial terms and the legal risk they carry.', true, '2026-10-24T00:00:00Z'),
  ('crs-legal-contracts-entrepreneurs', 'Legal Contracts and Agreements for Entrepreneurs', 'University of Maryland, College Park / Coursera', 'https://www.coursera.org', 'Legal', 'Beginner', 20, 'English', 'https://www.coursera.org/learn/legal-contracts-and-agreements-for-entrepreneurs', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Contract negotiation, review and management for founders and small business owners.', true, '2026-10-24T00:00:00Z'),

  -- ---------------------------------------------------------------------
  -- Education, project management and engineering
  -- ---------------------------------------------------------------------
  ('crs-learning-how-to-learn', 'Learning How to Learn', 'Coursera', 'https://www.coursera.org', 'Education', 'Beginner', 10, 'English', 'https://www.coursera.org/learn/learning-how-to-learn', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Evidence-based approaches to focused practice, spaced repetition and procrastination.', true, '2026-10-24T00:00:00Z'),
  ('crs-project-management-basics', 'Project Management Basics', 'Coursera', 'https://www.coursera.org', 'Project Management', 'Beginner', 8, 'English', 'https://www.coursera.org/learn/project-management-basics', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'Planning, scheduling, budgeting and stakeholder communication for a delivered project.', true, '2026-10-24T00:00:00Z'),
  ('crs-engineering-for-everyone', 'Engineering for Everyone', 'Coursera', 'https://www.coursera.org', 'Engineering', 'Beginner', 8, 'English', 'https://www.coursera.org/learn/engineering-for-everyone', 'audit', 'Free to audit with a Coursera account; the certificate is a paid extra.', 'course', 'What engineering actually involves: complex problem solving, teamwork and trade-offs.', true, '2026-10-24T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  provider = EXCLUDED.provider,
  provider_url = EXCLUDED.provider_url,
  category = EXCLUDED.category,
  level = EXCLUDED.level,
  duration_hours = EXCLUDED.duration_hours,
  language = EXCLUDED.language,
  url = EXCLUDED.url,
  availability = EXCLUDED.availability,
  availability_note = EXCLUDED.availability_note,
  format = EXCLUDED.format,
  description = EXCLUDED.description,
  is_verified = EXCLUDED.is_verified,
  verified_at = EXCLUDED.verified_at,
  updated_at = now();

-- Skill mapping -----------------------------------------------------------
-- Every skill_name below exists in the shared role catalogue, so the
-- recommender can match a course to the learner's actual skill gaps.
INSERT INTO public.course_skills (course_id, skill_name, importance)
VALUES
  ('crs-uva-financial-accounting', 'Financial Statement Preparation', 5),
  ('crs-uva-financial-accounting', 'Bookkeeping & Ledger Maintenance', 5),
  ('crs-uva-financial-accounting', 'Basic Tax Compliance', 3),
  ('crs-uiuc-financial-accounting', 'Financial Statement Preparation', 5),
  ('crs-uiuc-financial-accounting', 'Bookkeeping & Ledger Maintenance', 4),
  ('crs-cfi-accounting-fundamentals', 'Financial Statement Preparation', 5),
  ('crs-cfi-accounting-fundamentals', 'Account Reconciliation', 4),
  ('crs-cfi-accounting-fundamentals', 'Audit Support', 3),
  ('crs-iese-principles-financial-accounting', 'Financial Statement Preparation', 5),
  ('crs-iese-principles-financial-accounting', 'Advanced Excel / Spreadsheet Modelling', 4),
  ('crs-fin-accounting-master-core', 'Financial Statement Analysis', 5),
  ('crs-fin-accounting-master-core', 'Financial Statement Preparation', 5),
  ('crs-fin-accounting-master-core', 'Risk Assessment', 3),
  ('crs-wharton-corporate-finance', 'Financial Modelling & Forecasting', 5),
  ('crs-wharton-corporate-finance', 'Business Case & ROI Modelling', 4),
  ('crs-yale-financial-markets', 'Investment Portfolio Construction', 4),
  ('crs-yale-financial-markets', 'Risk Assessment', 4),
  ('crs-ucd-python-statistics-finance', 'Python for Data Analysis', 5),
  ('crs-ucd-python-statistics-finance', 'Statistical Analysis', 4),
  ('crs-ucd-python-statistics-finance', 'Data Analysis & Reporting', 4),
  ('crs-investment-management', 'Investment Portfolio Construction', 5),
  ('crs-investment-management', 'Investment Thesis Writing', 4),
  ('crs-talent-acquisition-strategy', 'Sourcing & Boolean Search', 5),
  ('crs-talent-acquisition-strategy', 'Hiring Metrics & Funnel Analysis', 4),
  ('crs-talent-acquisition-recruitment', 'Sourcing & Boolean Search', 5),
  ('crs-talent-acquisition-recruitment', 'Candidate Assessment & Screening', 5),
  ('crs-talent-acquisition-recruitment', 'Interview Coordination', 4),
  ('crs-managing-talent-lifecycle', 'Structured Interviewing & Scorecards', 5),
  ('crs-managing-talent-lifecycle', 'Candidate Experience Management', 5),
  ('crs-hr-training-talent-management', 'Training Needs Analysis', 5),
  ('crs-hr-training-talent-management', 'Performance & Talent Management', 4),
  ('crs-hr-training-talent-management', 'Strategic Workforce Planning', 4),
  ('crs-recruiting-analytics', 'Hiring Metrics & Funnel Analysis', 5),
  ('crs-recruiting-analytics', 'People Data & HR Reporting', 4),
  ('crs-hr-management', 'Employee Relations', 5),
  ('crs-hr-management', 'Employment Law & Policy Application', 4),
  ('crs-hr-management', 'Compensation & Benefits Administration', 3),
  ('edx-leadership-development-strategy', 'Leadership Development', 5),
  ('edx-leadership-development-strategy', 'Change Management', 4),
  ('edx-trust-conscious-communication', 'Employee Relations', 4),
  ('edx-trust-conscious-communication', 'Stakeholder Communication', 4),
  ('crs-supply-chain-analytics-spec', 'Demand Forecasting & Supply Planning', 5),
  ('crs-supply-chain-analytics-spec', 'Inventory Management (Safety Stock, Reorder Point)', 5),
  ('crs-supply-chain-analytics-spec', 'Cost & Service Level Trade-offs', 4),
  ('crs-supply-chain-analytics', 'Demand Forecasting', 5),
  ('crs-supply-chain-analytics', 'Data Analysis & Reporting', 4),
  ('crs-spjimr-supply-chain-management', 'Inventory Management (Safety Stock, Reorder Point)', 5),
  ('crs-spjimr-supply-chain-management', 'Supplier & Vendor Management', 5),
  ('crs-spjimr-supply-chain-management', 'Logistics & Distribution', 4),
  ('crs-supply-chain-management-and-analytics', 'Demand Forecasting & Supply Planning', 5),
  ('crs-supply-chain-management-and-analytics', 'Logistics & Distribution', 5),
  ('crs-supply-chain-management-and-analytics', 'Cost & Service Level Trade-offs', 4),
  ('crs-social-media-marketing', 'Social Media Strategy', 5),
  ('crs-social-media-marketing', 'Community Management', 4),
  ('crs-social-media-marketing', 'Content Strategy & Planning', 4),
  ('crs-social-media-marketing', 'Brand Strategy & Positioning', 3),
  ('crs-marketing-analytics', 'Marketing Analytics (GA4, Mixpanel)', 5),
  ('crs-marketing-analytics', 'Campaign Performance Measurement', 5),
  ('crs-marketing-analytics', 'Keyword & Search Intent Research', 4),
  ('crs-b2b-sales-strategies', 'Complex Deal Management', 5),
  ('crs-b2b-sales-strategies', 'Account Planning & Expansion', 5),
  ('crs-b2b-sales-strategies', 'CRM Discipline & Forecasting', 4),
  ('crs-b2b-sales-foundations', 'Discovery & Qualification', 5),
  ('crs-b2b-sales-foundations', 'Consultative Selling & Objection Handling', 5),
  ('crs-b2b-sales-foundations', 'Negotiation', 4),
  ('crs-advanced-b2b-sales', 'Negotiation', 5),
  ('crs-advanced-b2b-sales', 'CRM Discipline & Forecasting', 5),
  ('crs-advanced-b2b-sales', 'Value Selling & ROI Business Cases', 5),
  ('crs-graphic-design', 'Adobe Creative Suite (Illustrator / Photoshop / InDesign)', 5),
  ('crs-graphic-design', 'Typography & Layout', 5),
  ('crs-graphic-design', 'Visual Composition & Art Direction', 4),
  ('crs-graphic-design', 'Visual Identity Systems', 4),
  ('crs-ux-design', 'Figma & Design Systems', 5),
  ('crs-ux-design', 'Interaction & UX Design', 5),
  ('crs-ux-design', 'User Research & Usability Testing', 4),
  ('crs-nursing-fundamentals', 'Clinical Assessment & Nursing Care', 5),
  ('crs-nursing-fundamentals', 'Patient Assessment & Monitoring', 5),
  ('crs-nursing-fundamentals', 'Infection Control & Health & Safety', 4),
  ('crs-clinical-medical-assistant', 'Clinical Procedures & Vital Signs', 5),
  ('crs-clinical-medical-assistant', 'Medical Terminology', 5),
  ('crs-clinical-medical-assistant', 'EHR / Medical Records Management', 4),
  ('crs-ai-for-legal-professionals', 'Legal Research & Case Analysis', 5),
  ('crs-ai-for-legal-professionals', 'Contract Lifecycle Management', 4),
  ('crs-contracts-commercial-agreements', 'Contract Drafting & Interpretation', 5),
  ('crs-contracts-commercial-agreements', 'Commercial Awareness & Risk Assessment', 4),
  ('crs-legal-contracts-entrepreneurs', 'Contract Drafting & Interpretation', 5),
  ('crs-legal-contracts-entrepreneurs', 'Contract Management & Negotiation', 5),
  ('crs-learning-how-to-learn', 'Adult Learning Principles', 5),
  ('crs-learning-how-to-learn', 'Curriculum & Lesson Planning', 4),
  ('crs-learning-how-to-learn', 'Differentiated & Inclusive Teaching', 3),
  ('crs-project-management-basics', 'Project Planning & Scheduling', 5),
  ('crs-project-management-basics', 'Stakeholder Communication', 4),
  ('crs-project-management-basics', 'Backlog Management', 3),
  ('crs-engineering-for-everyone', 'Engineering Calculations & Mechanics', 4),
  ('crs-engineering-for-everyone', 'Technical Drawing & Documentation', 4),
  ('crs-engineering-for-everyone', 'Architectural Design & Drafting', 3)
ON CONFLICT (course_id, skill_name) DO UPDATE SET importance = EXCLUDED.importance;

-- Role mapping ------------------------------------------------------------
-- Every role_slug below exists in the shared role catalogue.
INSERT INTO public.course_roles (course_id, role_slug, relevance_score)
VALUES
  ('crs-uva-financial-accounting', 'accountant', 95),
  ('crs-uva-financial-accounting', 'bookkeeper', 92),
  ('crs-uva-financial-accounting', 'financial-analyst', 80),
  ('crs-uva-financial-accounting', 'tax-advisor', 68),
  ('crs-uiuc-financial-accounting', 'accountant', 92),
  ('crs-uiuc-financial-accounting', 'bookkeeper', 88),
  ('crs-uiuc-financial-accounting', 'financial-analyst', 78),
  ('crs-cfi-accounting-fundamentals', 'accountant', 88),
  ('crs-cfi-accounting-fundamentals', 'bookkeeper', 90),
  ('crs-cfi-accounting-fundamentals', 'audit-assistant', 82),
  ('crs-iese-principles-financial-accounting', 'accountant', 90),
  ('crs-iese-principles-financial-accounting', 'bookkeeper', 85),
  ('crs-iese-principles-financial-accounting', 'financial-analyst', 75),
  ('crs-fin-accounting-master-core', 'accountant', 92),
  ('crs-fin-accounting-master-core', 'financial-analyst', 85),
  ('crs-fin-accounting-master-core', 'risk-management-analyst', 62),
  ('crs-wharton-corporate-finance', 'financial-analyst', 88),
  ('crs-wharton-corporate-finance', 'investment-analyst', 82),
  ('crs-wharton-corporate-finance', 'management-consultant', 70),
  ('crs-wharton-corporate-finance', 'treasury-analyst', 74),
  ('crs-yale-financial-markets', 'financial-analyst', 80),
  ('crs-yale-financial-markets', 'investment-analyst', 88),
  ('crs-yale-financial-markets', 'financial-planner', 78),
  ('crs-ucd-python-statistics-finance', 'financial-analyst', 85),
  ('crs-ucd-python-statistics-finance', 'data-analyst', 72),
  ('crs-ucd-python-statistics-finance', 'business-analyst', 70),
  ('crs-investment-management', 'investment-analyst', 92),
  ('crs-investment-management', 'financial-planner', 82),
  ('crs-talent-acquisition-strategy', 'recruiter', 90),
  ('crs-talent-acquisition-strategy', 'talent-acquisition-specialist', 88),
  ('crs-talent-acquisition-recruitment', 'recruiter', 92),
  ('crs-talent-acquisition-recruitment', 'talent-acquisition-specialist', 85),
  ('crs-managing-talent-lifecycle', 'talent-acquisition-specialist', 90),
  ('crs-managing-talent-lifecycle', 'recruiter', 85),
  ('crs-managing-talent-lifecycle', 'hr-specialist', 82),
  ('crs-hr-training-talent-management', 'hr-specialist', 88),
  ('crs-hr-training-talent-management', 'learning-and-development-specialist', 85),
  ('crs-hr-training-talent-management', 'hr-business-partner', 72),
  ('crs-recruiting-analytics', 'talent-acquisition-specialist', 92),
  ('crs-recruiting-analytics', 'hr-analyst', 85),
  ('crs-recruiting-analytics', 'recruiter', 80),
  ('crs-hr-management', 'hr-specialist', 90),
  ('crs-hr-management', 'hr-business-partner', 82),
  ('crs-hr-management', 'people-operations-specialist', 78),
  ('crs-hr-management', 'compensation-analyst', 74),
  ('edx-leadership-development-strategy', 'learning-and-development-specialist', 88),
  ('edx-leadership-development-strategy', 'hr-business-partner', 80),
  ('edx-trust-conscious-communication', 'hr-business-partner', 75),
  ('edx-trust-conscious-communication', 'hr-specialist', 70),
  ('crs-supply-chain-analytics-spec', 'supply-chain-manager', 92),
  ('crs-supply-chain-analytics-spec', 'inventory-planner', 88),
  ('crs-supply-chain-analytics-spec', 'logistics-coordinator', 72),
  ('crs-supply-chain-analytics', 'supply-chain-manager', 88),
  ('crs-supply-chain-analytics', 'inventory-planner', 85),
  ('crs-spjimr-supply-chain-management', 'supply-chain-manager', 95),
  ('crs-spjimr-supply-chain-management', 'procurement-specialist', 85),
  ('crs-spjimr-supply-chain-management', 'manufacturing-process-engineer', 60),
  ('crs-supply-chain-management-and-analytics', 'logistics-coordinator', 88),
  ('crs-supply-chain-management-and-analytics', 'supply-chain-manager', 86),
  ('crs-supply-chain-management-and-analytics', 'procurement-specialist', 75),
  ('crs-social-media-marketing', 'social-media-manager', 92),
  ('crs-social-media-marketing', 'digital-marketing-specialist', 80),
  ('crs-social-media-marketing', 'content-marketing-specialist', 74),
  ('crs-social-media-marketing', 'brand-manager', 70),
  ('crs-marketing-analytics', 'digital-marketing-specialist', 88),
  ('crs-marketing-analytics', 'marketing-manager', 85),
  ('crs-marketing-analytics', 'seo-specialist', 72),
  ('crs-marketing-analytics', 'product-marketing-manager', 70),
  ('crs-b2b-sales-strategies', 'account-executive', 92),
  ('crs-b2b-sales-strategies', 'sales-representative', 78),
  ('crs-b2b-sales-strategies', 'customer-success-manager', 74),
  ('crs-b2b-sales-strategies', 'sales-operations-analyst', 68),
  ('crs-b2b-sales-foundations', 'sales-representative', 90),
  ('crs-b2b-sales-foundations', 'account-executive', 78),
  ('crs-b2b-sales-foundations', 'business-development-manager', 72),
  ('crs-advanced-b2b-sales', 'account-executive', 90),
  ('crs-advanced-b2b-sales', 'sales-operations-analyst', 72),
  ('crs-advanced-b2b-sales', 'business-development-manager', 68),
  ('crs-graphic-design', 'graphic-designer', 95),
  ('crs-graphic-design', 'brand-designer', 75),
  ('crs-graphic-design', 'motion-designer', 60),
  ('crs-ux-design', 'ui-ux-designer', 92),
  ('crs-ux-design', 'product-designer', 80),
  ('crs-nursing-fundamentals', 'registered-nurse', 92),
  ('crs-nursing-fundamentals', 'medical-assistant', 70),
  ('crs-nursing-fundamentals', 'pharmacist-assistant', 60),
  ('crs-clinical-medical-assistant', 'medical-assistant', 95),
  ('crs-clinical-medical-assistant', 'healthcare-administrator', 70),
  ('crs-clinical-medical-assistant', 'public-health-analyst', 55),
  ('crs-ai-for-legal-professionals', 'paralegal', 88),
  ('crs-ai-for-legal-professionals', 'legal-assistant', 80),
  ('crs-ai-for-legal-professionals', 'compliance-analyst', 70),
  ('crs-contracts-commercial-agreements', 'contract-manager', 92),
  ('crs-contracts-commercial-agreements', 'paralegal', 78),
  ('crs-legal-contracts-entrepreneurs', 'contract-manager', 85),
  ('crs-legal-contracts-entrepreneurs', 'entrepreneur', 70),
  ('crs-learning-how-to-learn', 'training-specialist', 88),
  ('crs-learning-how-to-learn', 'curriculum-designer', 82),
  ('crs-learning-how-to-learn', 'teacher', 80),
  ('crs-learning-how-to-learn', 'secondary-school-teacher', 75),
  ('crs-learning-how-to-learn', 'special-education-teacher', 72),
  ('crs-learning-how-to-learn', 'learning-and-development-specialist', 78),
  ('crs-project-management-basics', 'project-manager', 92),
  ('crs-project-management-basics', 'program-manager', 82),
  ('crs-project-management-basics', 'operations-manager', 70),
  ('crs-project-management-basics', 'product-owner', 74),
  ('crs-project-management-basics', 'business-analyst', 72),
  ('crs-engineering-for-everyone', 'mechanical-engineer', 80),
  ('crs-engineering-for-everyone', 'civil-engineer', 78),
  ('crs-engineering-for-everyone', 'electrical-engineer', 78),
  ('crs-engineering-for-everyone', 'architect', 72),
  ('crs-engineering-for-everyone', 'quality-engineer', 65),
  -- -------------------------------------------------------------------
  -- The technical roles that were added to the shared catalogue when it
  -- became multi-domain. The seeded technical courses already teach these
  -- skills; they simply were not linked to the new role slugs, so a
  -- software engineer or a data scientist was served an empty Learning Hub.
  -- These rows add the missing links only -- no course is modified.
  -- -------------------------------------------------------------------
  ('dc-python-intro', 'software-engineer', 85),
  ('dc-sql-intro', 'software-engineer', 78),
  ('dc-git', 'software-engineer', 85),
  ('ts-handbook', 'software-engineer', 80),
  ('fcc-frontend-libraries', 'software-engineer', 74),
  ('fcc-backend-apis', 'software-engineer', 78),
  ('edx-cs50x', 'software-engineer', 70),
  ('ms-python-fundamentals', 'software-engineer', 80),
  ('ts-handbook', 'mobile-engineer', 70),
  ('dc-git', 'mobile-engineer', 68),
  ('dc-python-intro', 'mobile-engineer', 58),
  ('edx-cs50x', 'mobile-engineer', 52),
  ('dc-git', 'qa-engineer', 75),
  ('dc-sql-intro', 'qa-engineer', 70),
  ('dc-python-intro', 'qa-engineer', 62),
  ('fcc-frontend-libraries', 'qa-engineer', 60),
  ('fcc-backend-apis', 'qa-engineer', 66),
  ('cisco-python-essentials', 'qa-engineer', 64),
  ('udemy-docker-kubernetes', 'site-reliability-engineer', 88),
  ('google-cloud-architect', 'site-reliability-engineer', 86),
  ('ibm-cloud-catalog', 'site-reliability-engineer', 85),
  ('google-cloud-fundamentals', 'site-reliability-engineer', 80),
  ('cisco-ccna-intro', 'site-reliability-engineer', 78),
  ('cisco-networking-basics', 'site-reliability-engineer', 76),
  ('ms-azure-fundamentals', 'site-reliability-engineer', 74),
  ('ms-security-basics', 'site-reliability-engineer', 62),
  ('dc-ds-intro', 'data-scientist', 88),
  ('dc-ml-supervised', 'data-scientist', 86),
  ('dc-stats-intro', 'data-scientist', 85),
  ('dc-eda', 'data-scientist', 82),
  ('dc-ml-unsupervised', 'data-scientist', 80),
  ('dc-pandas', 'data-scientist', 78),
  ('coursera-ml-specialization', 'data-scientist', 88),
  ('coursera-deep-learning', 'data-scientist', 84),
  ('ibm-ai-catalog', 'data-scientist', 80),
  ('khan-statistics', 'data-scientist', 82),
  ('dc-sql-intermediate', 'analytics-engineer', 90),
  ('dc-sql-joins', 'analytics-engineer', 86),
  ('dc-sql-intro', 'analytics-engineer', 84),
  ('ibm-data-catalog', 'analytics-engineer', 86),
  ('fcc-relational-database', 'analytics-engineer', 80),
  ('dc-pandas', 'analytics-engineer', 78),
  ('ms-powerbi-prepare', 'analytics-engineer', 76),
  ('dc-powerbi-intro', 'analytics-engineer', 74),
  ('dc-powerbi-intro', 'business-intelligence-analyst', 92),
  ('ms-powerbi-prepare', 'business-intelligence-analyst', 88),
  ('udemy-powerbi', 'business-intelligence-analyst', 90),
  ('dc-excel-analysis', 'business-intelligence-analyst', 84),
  ('fcc-data-visualization', 'business-intelligence-analyst', 80),
  ('coursera-google-data-analytics', 'business-intelligence-analyst', 86),
  ('dc-matplotlib', 'business-intelligence-analyst', 70),
  ('ibm-cyber-catalog', 'security-engineer', 88),
  ('fcc-information-security', 'security-engineer', 86),
  ('coursera-google-cybersecurity', 'security-engineer', 85),
  ('cisco-intro-cyber', 'security-engineer', 82),
  ('cisco-cyber-essentials', 'security-engineer', 80),
  ('ms-security-basics', 'security-engineer', 78),
  ('ibm-cyber-catalog', 'security-consultant', 90),
  ('ms-security-basics', 'security-consultant', 86),
  ('coursera-google-cybersecurity', 'security-consultant', 84),
  ('fcc-information-security', 'security-consultant', 82),
  ('cisco-cyber-essentials', 'security-consultant', 78)
ON CONFLICT (course_id, role_slug) DO UPDATE SET relevance_score = EXCLUDED.relevance_score;

-- Remove join rows whose course no longer exists. Never touches user rows.
DELETE FROM public.course_roles WHERE course_id NOT IN (SELECT id FROM public.courses);
DELETE FROM public.course_skills WHERE course_id NOT IN (SELECT id FROM public.courses);
