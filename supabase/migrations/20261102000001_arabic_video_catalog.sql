-- Arabic-first, video-first learning catalogue.
--
-- The live catalogue was 467 courses and 100% English. For a beginner in
-- Egypt that is the wrong starting point: the best explanation of HTML, SQL
-- or Excel is often an Arabic YouTube playlist, and a video is easier to
-- follow than a text article.
--
-- This migration is additive and idempotent:
--   * it never deletes or rewrites an existing course;
--   * every row is a real playlist, verified through YouTube's oEmbed
--     endpoint before this file was written (the title and channel below are
--     the values oEmbed returned, not invented);
--   * skills use the same canonical names as the role catalogue, so the
--     existing deterministic recommender scores them without special cases.
--
-- Re-running the file updates the same rows in place.

INSERT INTO public.courses (
  id, title, provider, provider_url, category, level, duration_hours,
  language, url, availability, availability_note, format, description,
  is_verified, verified_at
) VALUES
  -- Arabic: web foundations
  ('yt-ar-elzero-html', 'Learn HTML In Arabic 2021', 'Elzero Web School',
   'https://www.youtube.com/@ElzeroWebSchool', 'Frontend', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLDoPjvoNmBAw_t_XWUFbBX-c9MafPk9ji',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic HTML course from the basics to building a complete page structure.', true, now()),

  ('yt-ar-elzero-css', 'Learn CSS In Arabic 2021', 'Elzero Web School',
   'https://www.youtube.com/@ElzeroWebSchool', 'Frontend', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLDoPjvoNmBAzjsz06gkzlSrlev53MGIKe',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic CSS course covering layout, flexbox, grid and responsive design.', true, now()),

  ('yt-ar-elzero-js', 'Learn JavaScript in Arabic 2021', 'Elzero Web School',
   'https://www.youtube.com/@ElzeroWebSchool', 'Programming', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLDoPjvoNmBAx3kiplQR_oeDqLDBUDYwVv',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic JavaScript course from syntax and the DOM to events and async code.', true, now()),

  ('yt-ar-elzero-js-oop', 'Learn JavaScript OOP', 'Elzero Web School',
   'https://www.youtube.com/@ElzeroWebSchool', 'Programming', 'Intermediate', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLDoPjvoNmBAzLyvrWPwMw6bbBlTwPxgLF',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic object-oriented JavaScript: classes, prototypes and design patterns.', true, now()),

  ('yt-ar-elzero-git', 'Learn Git and Github', 'Elzero Web School',
   'https://www.youtube.com/@ElzeroWebSchool', 'Programming', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLDoPjvoNmBAw4eOj58MZPakHjaO3frVMF',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic Git and GitHub course: commits, branches, merging and pull requests.', true, now()),

  ('yt-ar-elzero-python', 'Mastering Python - تعلم بايثون', 'Elzero Web School',
   'https://www.youtube.com/@ElzeroWebSchool', 'Programming', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLDoPjvoNmBAyE_gei5d18qkfIe-Z8mocs',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic Python course from the language basics to practical scripting.', true, now()),

  -- Arabic: data and analytics
  ('yt-ar-elzero-mysql', 'MySQL 5 Essential Training', 'Elzero Web School',
   'https://www.youtube.com/@ElzeroWebSchool', 'Data', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLDoPjvoNmBAz6DT8SzQ1CODJTH-NIA7R9',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic MySQL course: schemas, queries, joins and database design basics.', true, now()),

  ('yt-ar-khaled-powerbi', 'كورس Power BI بالعربى من الصفر إلى الاحتراف | Power BI Full Course in Arabic',
   'Khaled Shaaban | Learn Excel & Power BI', 'https://www.youtube.com/@KhaledShaaban',
   'Analytics', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLX7gALGQvxQO7VibyE8dtSZ3nDDM_J3LE',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic Power BI course: connecting data, modelling, DAX and dashboards.', true, now()),

  ('yt-ar-alaa-excel', 'كورس تحليل البيانات باستخدام الاكسيل - Data Analysis Course Using Excel',
   'Alaa Essam - آلاء عصام', 'https://www.youtube.com/@AlaaEssam',
   'Analytics', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PL4lTDSNRMsOkwBKlTxlW3kI1kUDhtAKEN',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic Excel data-analysis course: cleaning, pivot tables and reporting.', true, now()),

  ('yt-ar-assaal-excel', 'احترف أكسل - الكورس الكامل لل أكسل',
   'Mohamed Al Assaal - اتعلم مع العسال', 'https://www.youtube.com/@MohamedAlAssaal',
   'Analytics', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLXlHqMRg9lAYiiutr-Ou0J1uU20T-5a4-',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Complete Arabic Excel course, from formulas to analysis and charts.', true, now()),

  ('yt-ar-elgouhary-ml', 'تعلم الآلة بالعربي || Machine Learning in Arabic', 'Elgouhary AI',
   'https://www.youtube.com/@ElgouharyAI', 'AI', 'Intermediate', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLtsZ69x5q-X9j44MdSX-NGuOhGXOY0aqH',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic machine-learning course covering the core algorithms and workflow.', true, now()),

  -- Arabic: software engineering
  ('yt-ar-codezone-react', 'Arabic React Course [Itrax] - كورس ريأكت بالعربى', 'codeZone',
   'https://www.youtube.com/@codeZone', 'Frontend', 'Intermediate', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLQtNtS-WfRa9LbmD8ON7rWhn-AtKTGdkn',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic React course: components, hooks, state and building a real app.', true, now()),

  ('yt-ar-codezone-node', 'NodeJS and express in Arabic - نود جى اس واكسبريس بالعربى', 'codeZone',
   'https://www.youtube.com/@codeZone', 'Backend', 'Intermediate', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLQtNtS-WfRa8OF9juY3k6WUWayMfDKHK2',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic Node.js and Express course: routing, APIs and server-side logic.', true, now()),

  ('yt-ar-tharwat-flutter', 'Best Flutter Course For Beginner in Arabic| افضل دوره فلاتر بالعربي',
   'ثروت سامي | Tharwat Samy', 'https://www.youtube.com/@TharwatSamy',
   'Programming', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLGVaNq6mHinjCPki-3xraQdGWKVz7PhgI',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic Flutter course for beginners: widgets, layout and a first mobile app.', true, now()),

  -- Arabic: design
  ('yt-ar-ehab-figma', 'كورس تعلم الـ UI Design و Figma من الصفر للاحتراف مجانا 2026', 'Ehab Fayez',
   'https://www.youtube.com/@EhabFayez', 'Design', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLjzhiGLyugKwnM6uN4NXhfpU8L7XvtDEv',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic UI design and Figma course, from the interface to a complete design.', true, now()),

  ('yt-ar-mostafa-uiux', 'Best Ui/Ux Course in Arabic |افضل كورس تصميم واجهات وتجربة المستخدم بالعربي',
   'Mostafa Ali | مصطفى علي', 'https://www.youtube.com/@MostafaAli',
   'Design', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PL5kpBeMNDbmK90t8nvtNLaq1dKwYQqMJM',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic UX and UI course covering research, wireframes and interface design.', true, now()),

  -- Arabic: business and management
  ('yt-ar-walid-marketing', 'Digital Marketing 101 | Walid Taha', 'Walid Taha',
   'https://www.youtube.com/@WalidTaha', 'Marketing', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLfJqU5-lpa3CiLPNeSl5vy6CxXIKHsX7t',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic digital-marketing course: channels, campaigns and measurement.', true, now()),

  ('yt-ar-moustafa-seo', 'SEO Arabic Course – كورس السيو بالعربي', 'Moustafa Khalil',
   'https://www.youtube.com/@MoustafaKhalil', 'Marketing', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLjzsQu47cKEThYKragKhdJqRod7LNJ7Si',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic SEO course: keyword research, on-page work and technical basics.', true, now()),

  ('yt-ar-amgad-pmp', 'PMP Full Course (Arabic)', 'Amgad Badewi',
   'https://www.youtube.com/@AmgadBadewi', 'Project Management', 'Intermediate', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLwVp5s2iKJCRdxBjMxhbNpzzp8bcjOkxP',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic project-management course aligned with PMP planning and delivery.', true, now()),

  ('yt-ar-mindstruct-ba', 'IIBA® Business Analysis Basics – Full Course in Arabic', 'Mindstruct',
   'https://www.youtube.com/@Mindstruct', 'Business', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLDz_v9axCckGAvi65P9YGua8x6qQhWNRY',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic business-analysis course: requirements, stakeholders and process mapping.', true, now()),

  ('yt-ar-kholif-po', 'The Practical training for product owner بالعربي', 'Kholif DevTalks',
   'https://www.youtube.com/@KholifDevTalks', 'Product', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PL-f_Sn4DXCQj3AS6c8QB29-Ffc1katmlN',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic product-owner training: backlog, user stories and agile delivery.', true, now()),

  ('yt-ar-gadallah-supply', 'Supply chain management - إدارة سلاسل الإمداد', 'Hossam Gadallah - حسام جادالله',
   'https://www.youtube.com/@HossamGadallah', 'Supply Chain', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLO4XyFY0aJoN1kdjrPFP_FoIk_GYWQs18',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic supply-chain course: planning, inventory, procurement and logistics.', true, now()),

  ('yt-ar-karim-finance', 'Financial Ratio Analysis Course: Techniques & Applications كورس كامل عن التحليل المالي',
   'Dr. Karim Farag - د. كريم فرج', 'https://www.youtube.com/@DrKarimFarag',
   'Finance', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLA50qgyvgsf4L3ko6Hh31l8T3N6vY9UIV',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic financial-analysis course: reading statements and ratio analysis.', true, now()),

  ('yt-ar-maher-accounting', 'Financial Accounting | المحاسبة المالية',
   'Mohamed Maher | محمد ماهر', 'https://www.youtube.com/@MohamedMaher',
   'Accounting', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLm877Wx3hfJ1G8H_z2xk-HVA1GNwoNIFn',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic financial-accounting course: journal entries, ledgers and statements.', true, now()),

  ('yt-ar-saheb-hr', 'تعلم الاتش ار من الصفر - كورس HR', 'صاحب بيزنس',
   'https://www.youtube.com/@SahebBusiness', 'People', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLeuj-AmjixnCp99PtlXtKtFY6wUDXCef4',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic HR course from the basics: hiring, employee relations and policy.', true, now()),

  ('yt-ar-waleed-cyber', 'Certified in Cybersecurity (CC) - Free Arabic Course', 'Waleed El-Naggar',
   'https://www.youtube.com/@WaleedElNaggar', 'Cybersecurity', 'Beginner', NULL,
   'Arabic', 'https://www.youtube.com/playlist?list=PLMJ5EzPjD0zH_bAuXVYkUkwNV2Nzn-WzC',
   'youtube_free', 'Free Arabic video playlist on YouTube.', 'playlist',
   'Arabic cybersecurity foundations aligned with the ISC2 CC domains.', true, now()),

  -- English: high-quality video courses for advanced topics
  ('yt-en-fcc-data-python', 'Data Analysis with Python Course', 'freeCodeCamp.org',
   'https://www.youtube.com/@freecodecamp', 'Data', 'Intermediate', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLWKjhJtqVAblvI1i46ScbKV2jH1gdL7VQ',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Full data-analysis course using Python, pandas and visualisation.', true, now()),

  ('yt-en-fcc-react', 'React Tutorials', 'freeCodeCamp.org',
   'https://www.youtube.com/@freecodecamp', 'Frontend', 'Intermediate', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLWKjhJtqVAbkArDMazoARtNz1aMwNWmvC',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'React tutorials covering components, hooks and application structure.', true, now()),

  ('yt-en-fcc-js', 'JavaScript Basics Course', 'freeCodeCamp.org',
   'https://www.youtube.com/@freecodecamp', 'Programming', 'Beginner', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLWKjhJtqVAbk2qRZtWSzCIN38JC_NdhW5',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'JavaScript fundamentals: variables, functions, arrays, objects and the DOM.', true, now()),

  ('yt-en-fcc-ml', 'Machine Learning', 'freeCodeCamp.org',
   'https://www.youtube.com/@freecodecamp', 'AI', 'Intermediate', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLWKjhJtqVAblStefaz_YOVpDWqcRScc2s',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Machine-learning course covering supervised learning and model evaluation.', true, now()),

  ('yt-en-fcc-data-science', 'Data Science', 'freeCodeCamp.org',
   'https://www.youtube.com/@freecodecamp', 'Data', 'Intermediate', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLWKjhJtqVAblQe2CCWqV4Zy3LY01Z8aF1',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Data-science course covering statistics, Python and the analysis workflow.', true, now()),

  ('yt-en-techtfq-sql', 'Learn Complete SQL (Beginner to Advance)', 'techTFQ',
   'https://www.youtube.com/@techTFQ', 'Data', 'Beginner', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLavw5C92dz9Ef4E-1Zi9KfCTXS_IN8gXZ',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Complete SQL course: queries, joins, window functions and interview practice.', true, now()),

  ('yt-en-alex-bootcamp', 'Data Analyst Bootcamp', 'Alex The Analyst',
   'https://www.youtube.com/@AlexTheAnalyst', 'Analytics', 'Beginner', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLUaB-1hjhk8FE_XZ87vPPSfHqb6OcM0cF',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Data-analyst bootcamp: Excel, SQL, Tableau and a portfolio project.', true, now()),

  ('yt-en-chandoo-excel', 'FREE Microsoft Excel Course', 'Chandoo',
   'https://www.youtube.com/@chandoo', 'Analytics', 'Beginner', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLmejDGrsgFyCZ4YC5s8mgdQztj7zt5to5',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Practical Excel course: formulas, tables, charts and data analysis.', true, now()),

  ('yt-en-google-pm', 'Google Project Management Certificate', 'Grow with Google',
   'https://www.youtube.com/@GrowwithGoogle', 'Project Management', 'Beginner', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLTZYG7bZ1u6puLWxUtqAjZkIB4dB_JFzk',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Project-management foundations from the Google Career Certificate.', true, now()),

  ('yt-en-google-marketing', 'Google Digital Marketing & E-commerce Certificate', 'Grow with Google',
   'https://www.youtube.com/@GrowwithGoogle', 'Marketing', 'Beginner', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLTZYG7bZ1u6qDuyxKfDrvzJRFnjalX32r',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Digital-marketing and e-commerce foundations from the Google certificate.', true, now()),

  ('yt-en-google-data', 'Google Data Analytics Certificate', 'Grow with Google',
   'https://www.youtube.com/@GrowwithGoogle', 'Analytics', 'Beginner', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLTZYG7bZ1u6rcPlcX75pMkjsYY_HTL7aZ',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'Data-analytics foundations: spreadsheets, SQL, visualisation and case study.', true, now()),

  ('yt-en-google-ux', 'Google UX Design Certificate', 'Grow with Google',
   'https://www.youtube.com/@GrowwithGoogle', 'Design', 'Beginner', NULL,
   'English', 'https://www.youtube.com/playlist?list=PLTZYG7bZ1u6oHnGp4Ib3n0y-CmFQdTW6r',
   'youtube_free', 'Free English video playlist on YouTube.', 'playlist',
   'UX design foundations: research, wireframes, prototypes and portfolio.', true, now())
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

-- Skills. Names match the role catalogue exactly so the deterministic
-- recommender can resolve them through its existing fuzzy lookup.
INSERT INTO public.course_skills (course_id, skill_name, importance) VALUES
  ('yt-ar-elzero-html', 'HTML5 & Modern CSS', 5),
  ('yt-ar-elzero-html', 'Accessibility (a11y)', 2),

  ('yt-ar-elzero-css', 'HTML5 & Modern CSS', 5),
  ('yt-ar-elzero-css', 'Web Performance Optimization', 2),

  ('yt-ar-elzero-js', 'JavaScript (ES6+)', 5),
  ('yt-ar-elzero-js', 'Programming Fundamentals', 4),

  ('yt-ar-elzero-js-oop', 'JavaScript (ES6+)', 5),
  ('yt-ar-elzero-js-oop', 'Programming Fundamentals', 4),

  ('yt-ar-elzero-git', 'Git & Version Control', 5),
  ('yt-ar-elzero-git', 'CI/CD Pipelines', 2),

  ('yt-ar-elzero-python', 'Python for Data Analysis', 4),
  ('yt-ar-elzero-python', 'Programming Fundamentals', 5),

  ('yt-ar-elzero-mysql', 'SQL & Database Design', 5),
  ('yt-ar-elzero-mysql', 'Data Modelling & Warehousing', 3),

  ('yt-ar-khaled-powerbi', 'Data Visualization (Tableau/Power BI)', 5),
  ('yt-ar-khaled-powerbi', 'Data Visualisation & Dashboarding', 5),
  ('yt-ar-khaled-powerbi', 'Business Metric Definition', 3),

  ('yt-ar-alaa-excel', 'Excel / Spreadsheets Modeling', 5),
  ('yt-ar-alaa-excel', 'Data Analysis & Reporting', 4),
  ('yt-ar-alaa-excel', 'Data Visualisation & Dashboarding', 3),

  ('yt-ar-assaal-excel', 'Excel / Spreadsheets Modeling', 5),
  ('yt-ar-assaal-excel', 'Spreadsheet & Modelling', 5),
  ('yt-ar-assaal-excel', 'Data Analysis & Reporting', 3),

  ('yt-ar-elgouhary-ml', 'Machine Learning Fundamentals', 5),
  ('yt-ar-elgouhary-ml', 'Statistical Analysis', 3),
  ('yt-ar-elgouhary-ml', 'Python for Data Analysis', 3),

  ('yt-ar-codezone-react', 'React', 5),
  ('yt-ar-codezone-react', 'State Management', 4),
  ('yt-ar-codezone-react', 'JavaScript (ES6+)', 3),

  ('yt-ar-codezone-node', 'Node.js & Express', 5),
  ('yt-ar-codezone-node', 'RESTful API Architecture', 4),
  ('yt-ar-codezone-node', 'REST & GraphQL APIs', 4),

  ('yt-ar-tharwat-flutter', 'Mobile SDK Development (React Native / Flutter / Swift / Kotlin)', 5),
  ('yt-ar-tharwat-flutter', 'Mobile UI & Navigation Patterns', 4),

  ('yt-ar-ehab-figma', 'Figma & Design Systems', 5),
  ('yt-ar-ehab-figma', 'Visual Hierarchy & Typography', 3),

  ('yt-ar-mostafa-uiux', 'Interaction & UX Design', 5),
  ('yt-ar-mostafa-uiux', 'User Research & Usability Testing', 4),
  ('yt-ar-mostafa-uiux', 'Prototyping & Wireframing', 4),

  ('yt-ar-walid-marketing', 'Paid Search & Paid Social', 4),
  ('yt-ar-walid-marketing', 'Marketing Strategy & Planning', 4),
  ('yt-ar-walid-marketing', 'Campaign Performance Measurement', 4),

  ('yt-ar-moustafa-seo', 'Keyword & Search Intent Research', 5),
  ('yt-ar-moustafa-seo', 'On-Page SEO & Internal Linking', 4),
  ('yt-ar-moustafa-seo', 'Technical SEO (Crawl, Index, Schema)', 3),

  ('yt-ar-amgad-pmp', 'Project Planning & Scheduling', 5),
  ('yt-ar-amgad-pmp', 'Agile & Scrum Methodologies', 4),
  ('yt-ar-amgad-pmp', 'Risk & Issue Management', 4),

  ('yt-ar-mindstruct-ba', 'Requirements Gathering & Analysis', 5),
  ('yt-ar-mindstruct-ba', 'Process Mapping & Documentation', 4),
  ('yt-ar-mindstruct-ba', 'Stakeholder Communication', 3),

  ('yt-ar-kholif-po', 'Backlog Management', 5),
  ('yt-ar-kholif-po', 'User Stories & Acceptance Criteria', 5),
  ('yt-ar-kholif-po', 'Agile & Scrum Methodologies', 4),

  ('yt-ar-gadallah-supply', 'Logistics & Distribution', 4),
  ('yt-ar-gadallah-supply', 'Inventory & Warehouse Management', 4),
  ('yt-ar-gadallah-supply', 'Demand Forecasting & Supply Planning', 4),
  ('yt-ar-gadallah-supply', 'Supplier & Vendor Management', 3),

  ('yt-ar-karim-finance', 'Financial Statement Analysis', 5),
  ('yt-ar-karim-finance', 'Financial Modelling & Forecasting', 4),
  ('yt-ar-karim-finance', 'Business Communication', 2),

  ('yt-ar-maher-accounting', 'Financial Statement Preparation', 5),
  ('yt-ar-maher-accounting', 'Bookkeeping & General Ledger', 4),
  ('yt-ar-maher-accounting', 'Account Reconciliation', 3),

  ('yt-ar-saheb-hr', 'Employee Relations', 4),
  ('yt-ar-saheb-hr', 'Employment Law & Policy Application', 4),
  ('yt-ar-saheb-hr', 'Onboarding & Offboarding', 3),

  ('yt-ar-waleed-cyber', 'Network Security & Protocols', 5),
  ('yt-ar-waleed-cyber', 'Security Frameworks (NIST/ISO)', 4),
  ('yt-ar-waleed-cyber', 'Incident Response Procedures', 3),

  ('yt-en-fcc-data-python', 'Python for Data Analysis', 5),
  ('yt-en-fcc-data-python', 'Statistical Analysis', 4),
  ('yt-en-fcc-data-python', 'Data Visualisation & Dashboarding', 3),

  ('yt-en-fcc-react', 'React', 5),
  ('yt-en-fcc-react', 'State Management', 3),

  ('yt-en-fcc-js', 'JavaScript (ES6+)', 5),
  ('yt-en-fcc-js', 'Programming Fundamentals', 4),

  ('yt-en-fcc-ml', 'Machine Learning Fundamentals', 5),
  ('yt-en-fcc-ml', 'Python for Data Analysis', 3),

  ('yt-en-fcc-data-science', 'Statistical Analysis', 5),
  ('yt-en-fcc-data-science', 'Python for Data Analysis', 4),
  ('yt-en-fcc-data-science', 'Machine Learning Fundamentals', 3),

  ('yt-en-techtfq-sql', 'SQL', 5),
  ('yt-en-techtfq-sql', 'SQL & Database Design', 4),
  ('yt-en-techtfq-sql', 'Data Modelling & Warehousing', 3),

  ('yt-en-alex-bootcamp', 'Data Visualization (Tableau/Power BI)', 5),
  ('yt-en-alex-bootcamp', 'SQL', 4),
  ('yt-en-alex-bootcamp', 'Excel / Spreadsheets Modeling', 4),

  ('yt-en-chandoo-excel', 'Excel / Spreadsheets Modeling', 5),
  ('yt-en-chandoo-excel', 'Spreadsheet & Modelling', 5),
  ('yt-en-chandoo-excel', 'Data Analysis & Reporting', 3),

  ('yt-en-google-pm', 'Project Planning & Scheduling', 5),
  ('yt-en-google-pm', 'Agile & Scrum Methodologies', 4),
  ('yt-en-google-pm', 'Stakeholder Communication', 4),

  ('yt-en-google-marketing', 'Paid Search & Paid Social', 5),
  ('yt-en-google-marketing', 'Marketing Analytics (GA4, Mixpanel)', 4),
  ('yt-en-google-marketing', 'Email & Lifecycle Marketing', 3),

  ('yt-en-google-data', 'Data Visualisation & Dashboarding', 5),
  ('yt-en-google-data', 'SQL', 4),
  ('yt-en-google-data', 'Spreadsheet & Modelling', 4),

  ('yt-en-google-ux', 'User Research & Usability Testing', 5),
  ('yt-en-google-ux', 'Interaction & UX Design', 4),
  ('yt-en-google-ux', 'Prototyping & Wireframing', 4)
ON CONFLICT (course_id, skill_name) DO UPDATE SET
  importance = EXCLUDED.importance;

-- Role relevance. The slug is the role catalogue id used by the app.
INSERT INTO public.course_roles (course_id, role_slug, relevance_score) VALUES
  ('yt-ar-elzero-html', 'frontend-engineer', 92),
  ('yt-ar-elzero-html', 'fullstack-engineer', 72),
  ('yt-ar-elzero-html', 'ui-ux-designer', 40),

  ('yt-ar-elzero-css', 'frontend-engineer', 92),
  ('yt-ar-elzero-css', 'fullstack-engineer', 72),
  ('yt-ar-elzero-css', 'ui-ux-designer', 45),

  ('yt-ar-elzero-js', 'frontend-engineer', 92),
  ('yt-ar-elzero-js', 'fullstack-engineer', 82),
  ('yt-ar-elzero-js', 'software-engineer', 72),

  ('yt-ar-elzero-js-oop', 'frontend-engineer', 74),
  ('yt-ar-elzero-js-oop', 'fullstack-engineer', 74),
  ('yt-ar-elzero-js-oop', 'software-engineer', 78),

  ('yt-ar-elzero-git', 'frontend-engineer', 72),
  ('yt-ar-elzero-git', 'fullstack-engineer', 74),
  ('yt-ar-elzero-git', 'software-engineer', 76),
  ('yt-ar-elzero-git', 'cloud-devops-engineer', 62),
  ('yt-ar-elzero-git', 'qa-engineer', 60),

  ('yt-ar-elzero-python', 'data-analyst', 76),
  ('yt-ar-elzero-python', 'data-scientist', 82),
  ('yt-ar-elzero-python', 'ai-ml-engineer', 82),
  ('yt-ar-elzero-python', 'software-engineer', 68),

  ('yt-ar-elzero-mysql', 'data-analyst', 86),
  ('yt-ar-elzero-mysql', 'analytics-engineer', 86),
  ('yt-ar-elzero-mysql', 'business-intelligence-analyst', 82),
  ('yt-ar-elzero-mysql', 'data-scientist', 72),
  ('yt-ar-elzero-mysql', 'fullstack-engineer', 76),
  ('yt-ar-elzero-mysql', 'software-engineer', 76),

  ('yt-ar-khaled-powerbi', 'data-analyst', 86),
  ('yt-ar-khaled-powerbi', 'business-intelligence-analyst', 92),
  ('yt-ar-khaled-powerbi', 'analytics-engineer', 72),

  ('yt-ar-alaa-excel', 'data-analyst', 82),
  ('yt-ar-alaa-excel', 'business-intelligence-analyst', 82),
  ('yt-ar-alaa-excel', 'financial-analyst', 70),
  ('yt-ar-alaa-excel', 'business-analyst', 62),

  ('yt-ar-assaal-excel', 'data-analyst', 80),
  ('yt-ar-assaal-excel', 'business-intelligence-analyst', 78),
  ('yt-ar-assaal-excel', 'financial-analyst', 68),
  ('yt-ar-assaal-excel', 'accountant', 58),

  ('yt-ar-elgouhary-ml', 'ai-ml-engineer', 90),
  ('yt-ar-elgouhary-ml', 'data-scientist', 86),
  ('yt-ar-elgouhary-ml', 'data-analyst', 58),

  ('yt-ar-codezone-react', 'frontend-engineer', 92),
  ('yt-ar-codezone-react', 'fullstack-engineer', 86),

  ('yt-ar-codezone-node', 'fullstack-engineer', 92),
  ('yt-ar-codezone-node', 'software-engineer', 72),

  ('yt-ar-tharwat-flutter', 'mobile-engineer', 92),

  ('yt-ar-ehab-figma', 'ui-ux-designer', 92),
  ('yt-ar-ehab-figma', 'product-designer', 86),

  ('yt-ar-mostafa-uiux', 'ui-ux-designer', 92),
  ('yt-ar-mostafa-uiux', 'product-designer', 92),

  ('yt-ar-walid-marketing', 'digital-marketing-specialist', 92),
  ('yt-ar-walid-marketing', 'marketing-manager', 76),
  ('yt-ar-walid-marketing', 'social-media-manager', 72),

  ('yt-ar-moustafa-seo', 'seo-specialist', 95),
  ('yt-ar-moustafa-seo', 'content-marketing-specialist', 78),
  ('yt-ar-moustafa-seo', 'digital-marketing-specialist', 72),

  ('yt-ar-amgad-pmp', 'project-manager', 92),
  ('yt-ar-amgad-pmp', 'program-manager', 86),
  ('yt-ar-amgad-pmp', 'product-owner', 70),
  ('yt-ar-amgad-pmp', 'operations-manager', 66),

  ('yt-ar-mindstruct-ba', 'business-analyst', 92),
  ('yt-ar-mindstruct-ba', 'product-owner', 66),
  ('yt-ar-mindstruct-ba', 'project-manager', 62),

  ('yt-ar-kholif-po', 'product-owner', 92),
  ('yt-ar-kholif-po', 'product-manager', 76),
  ('yt-ar-kholif-po', 'project-manager', 62),

  ('yt-ar-gadallah-supply', 'supply-chain-manager', 92),
  ('yt-ar-gadallah-supply', 'logistics-coordinator', 86),
  ('yt-ar-gadallah-supply', 'inventory-planner', 82),
  ('yt-ar-gadallah-supply', 'procurement-specialist', 62),

  ('yt-ar-karim-finance', 'financial-analyst', 92),
  ('yt-ar-karim-finance', 'investment-analyst', 82),
  ('yt-ar-karim-finance', 'accountant', 60),

  ('yt-ar-maher-accounting', 'accountant', 92),
  ('yt-ar-maher-accounting', 'bookkeeper', 88),
  ('yt-ar-maher-accounting', 'audit-assistant', 74),
  ('yt-ar-maher-accounting', 'financial-analyst', 62),

  ('yt-ar-saheb-hr', 'hr-specialist', 86),
  ('yt-ar-saheb-hr', 'recruiter', 68),
  ('yt-ar-saheb-hr', 'hr-business-partner', 62),

  ('yt-ar-waleed-cyber', 'cybersecurity-analyst', 90),
  ('yt-ar-waleed-cyber', 'security-engineer', 70),
  ('yt-ar-waleed-cyber', 'security-consultant', 66),

  ('yt-en-fcc-data-python', 'data-analyst', 86),
  ('yt-en-fcc-data-python', 'data-scientist', 86),

  ('yt-en-fcc-react', 'frontend-engineer', 90),
  ('yt-en-fcc-react', 'fullstack-engineer', 86),

  ('yt-en-fcc-js', 'frontend-engineer', 86),
  ('yt-en-fcc-js', 'fullstack-engineer', 82),
  ('yt-en-fcc-js', 'software-engineer', 76),

  ('yt-en-fcc-ml', 'ai-ml-engineer', 90),
  ('yt-en-fcc-ml', 'data-scientist', 86),

  ('yt-en-fcc-data-science', 'data-scientist', 90),
  ('yt-en-fcc-data-science', 'data-analyst', 80),

  ('yt-en-techtfq-sql', 'data-analyst', 92),
  ('yt-en-techtfq-sql', 'analytics-engineer', 88),
  ('yt-en-techtfq-sql', 'business-intelligence-analyst', 86),
  ('yt-en-techtfq-sql', 'data-scientist', 76),

  ('yt-en-alex-bootcamp', 'data-analyst', 92),
  ('yt-en-alex-bootcamp', 'business-intelligence-analyst', 82),

  ('yt-en-chandoo-excel', 'data-analyst', 82),
  ('yt-en-chandoo-excel', 'business-intelligence-analyst', 76),
  ('yt-en-chandoo-excel', 'financial-analyst', 70),

  ('yt-en-google-pm', 'project-manager', 92),
  ('yt-en-google-pm', 'program-manager', 82),
  ('yt-en-google-pm', 'product-owner', 66),

  ('yt-en-google-marketing', 'digital-marketing-specialist', 92),
  ('yt-en-google-marketing', 'marketing-manager', 76),

  ('yt-en-google-data', 'data-analyst', 86),
  ('yt-en-google-data', 'business-intelligence-analyst', 86),

  ('yt-en-google-ux', 'ui-ux-designer', 90),
  ('yt-en-google-ux', 'product-designer', 86)
ON CONFLICT (course_id, role_slug) DO UPDATE SET
  relevance_score = EXCLUDED.relevance_score;

-- The recommender filters on language and format, so both get an index.
CREATE INDEX IF NOT EXISTS idx_courses_language ON public.courses(language);
CREATE INDEX IF NOT EXISTS idx_courses_format ON public.courses(format);
