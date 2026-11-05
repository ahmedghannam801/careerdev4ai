/**
 * Comprehensive Interactive Product Tour Configuration
 *
 * 10 Chapters, 47 Steps covering the entire CareerDev4AI platform:
 * DISCOVER → LEARN → PRACTICE → PROVE → BUILD → APPLY → INTERVIEW → GROW
 */

export interface TourStep {
  id: string;
  chapterId: string;
  view: string;
  target: string;
  fallbackTarget?: string;
  title: string;
  body: string;
  example?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

export interface TourChapter {
  id: string;
  title: string;
  description: string;
  view: string;
  icon: string;
  steps: TourStep[];
}

export const TOUR_CHAPTERS: TourChapter[] = [
  // =========================================================================
  // CHAPTER 1: Welcome & Navigation (5 steps)
  // =========================================================================
  {
    id: 'welcome',
    title: 'Welcome & Navigation',
    description: 'Learn the platform purpose, sidebar navigation, top bar controls, notifications, and AI Copilot.',
    view: 'dashboard',
    icon: 'Sparkles',
    steps: [
      {
        id: 'welcome-purpose',
        chapterId: 'welcome',
        view: 'dashboard',
        target: '[data-tour="brand-logo"]',
        fallbackTarget: 'aside',
        title: 'Welcome to CareerDev4AI',
        body: 'Your comprehensive, Egypt-first Career Super App. We connect your entire journey: Discover, Learn, Practice, Prove, Build, Apply, Interview, and Grow — 100% free with zero paywalls.',
        example: 'Explore roadmaps, assess skills, build tailored CVs, and practice interviews all in one unified workspace.',
      },
      {
        id: 'welcome-sidebar',
        chapterId: 'welcome',
        view: 'dashboard',
        target: '[data-tour="sidebar-nav"]',
        fallbackTarget: 'aside',
        title: 'Main Navigation Rail',
        body: 'All platform destinations are organized into logical workflow stages. Click any link to jump directly to roadmaps, learning courses, projects, or job applications.',
        example: 'Use Career for planning and roadmaps, Learn for skill development, and Career Tools for job hunting.',
      },
      {
        id: 'welcome-top-controls',
        chapterId: 'welcome',
        view: 'dashboard',
        target: '[data-tour="top-controls"]',
        fallbackTarget: 'header',
        title: 'Global Search & Quick Controls',
        body: 'Quickly access actions, courses, roles, and settings using the global command palette (Ctrl/Cmd + K). Switch between English and Arabic (RTL) or toggle dark/light theme instantly.',
        example: 'Press ⌘K or Ctrl+K anywhere to search for any skill, role, or feature.',
      },
      {
        id: 'welcome-notifications-account',
        chapterId: 'welcome',
        view: 'dashboard',
        target: '[data-tour="notifications-account"]',
        fallbackTarget: 'header',
        title: 'Notifications & Account Menu',
        body: 'Stay informed about learning deadlines, roadmap reminders, and job matches. Manage your account settings and sign-out from the account dropdown.',
        example: 'Click the bell icon to review new course recommendations or upcoming milestone deadlines.',
      },
      {
        id: 'welcome-copilot-button',
        chapterId: 'welcome',
        view: 'dashboard',
        target: '[data-tour="copilot-button"]',
        fallbackTarget: 'aside',
        title: 'AI Career Copilot',
        body: 'Get instant, personalized guidance powered by Google Gemini. Ask questions about your skill gaps, interview answers, or career transitions grounded in your real profile.',
        example: 'Ask: "What are the top 3 skills I need to land a Full-Stack Engineer role in Egypt?"',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 2: Home Dashboard (6 steps)
  // =========================================================================
  {
    id: 'dashboard',
    title: 'Home Dashboard',
    description: 'Understand your command center: target role, readiness score, urgent skill gaps, active roadmap, and next action.',
    view: 'dashboard',
    icon: 'Home',
    steps: [
      {
        id: 'dashboard-greeting',
        chapterId: 'dashboard',
        view: 'dashboard',
        target: '[data-tour="dashboard-greeting"]',
        fallbackTarget: '#main-content',
        title: 'Personalized Command Center',
        body: 'Your dashboard summarizes your entire career status in one glance, showing real-time metrics computed directly from your profile, skills, and roadmap progress.',
        example: 'Check here daily for your highest-priority career action and active milestones.',
      },
      {
        id: 'dashboard-target-role',
        chapterId: 'dashboard',
        view: 'dashboard',
        target: '[data-tour="dashboard-target-role"]',
        fallbackTarget: '#main-content',
        title: 'Target Career Role',
        body: 'Your active destination. Every recommendation, skill gap calculation, and roadmap phase on the platform is benchmarked against this specific role specification.',
        example: 'Switching your target role recalculates all skill gaps and roadmap phases automatically.',
      },
      {
        id: 'dashboard-readiness-score',
        chapterId: 'dashboard',
        view: 'dashboard',
        target: '[data-guide="readiness"]',
        fallbackTarget: '[data-tour="dashboard-target-role"]',
        title: 'Role Readiness Score',
        body: 'Your readiness percentage measures how closely your rated proficiencies match the market benchmark for your role. It rises as you verify skills and complete roadmap tasks.',
        example: 'A score of 75%+ indicates strong readiness for entry to mid-level applications.',
      },
      {
        id: 'dashboard-skill-gaps',
        chapterId: 'dashboard',
        view: 'dashboard',
        target: '[data-guide="skill-gaps"]',
        fallbackTarget: '#main-content',
        title: 'Skill Gaps & Priorities',
        body: 'Shows required proficiencies sorted by urgency. "Critical" indicates a core requirement holding back your readiness; "High" represents an expected prerequisite.',
        example: 'Focus on closing "Critical" gaps first before taking on advanced optional topics.',
      },
      {
        id: 'dashboard-roadmap-summary',
        chapterId: 'dashboard',
        view: 'dashboard',
        target: '[data-tour="dashboard-roadmap-summary"]',
        fallbackTarget: '#main-content',
        title: 'Active Roadmap Progress',
        body: 'Tracks your current phase in your career roadmap. Displays total hours invested, completed milestones, and upcoming tasks to maintain steady momentum.',
        example: 'See what percentage of Phase 1 (Core Fundamentals) you have completed so far.',
      },
      {
        id: 'dashboard-next-action',
        chapterId: 'dashboard',
        view: 'dashboard',
        target: '[data-guide="next-action"]',
        fallbackTarget: '#main-content',
        title: 'Next Best Action',
        body: 'The single most impactful task you can complete today, computed from the top of your gap list. Eliminates guesswork on what to study or build next.',
        example: 'Click "Start Task" to jump directly to the relevant course or project guide.',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 3: Career Planning (5 steps)
  // =========================================================================
  {
    id: 'career-planning',
    title: 'Career Planning',
    description: 'Explore career domains, select target roles, evaluate benchmark requirements, and align your career stage.',
    view: 'my-career',
    icon: 'Compass',
    steps: [
      {
        id: 'career-intro',
        chapterId: 'career-planning',
        view: 'my-career',
        target: '[data-tour="my-career-header"]',
        fallbackTarget: '#main-content',
        title: 'My Career Exploration',
        body: 'Your strategic planning hub. Explore 15+ industry domains, compare career trajectories, and understand market salary ranges across Egypt and the MENA region.',
        example: 'Compare Software Engineering vs. Data Science to see which aligns best with your strengths.',
      },
      {
        id: 'career-role-picker',
        chapterId: 'career-planning',
        view: 'my-career',
        target: '[data-tour="role-picker-container"]',
        fallbackTarget: '#main-content',
        title: 'Role Catalog & Selection',
        body: 'Browse comprehensive career profiles with detailed role descriptions, key responsibilities, and seniority levels from Junior to Lead.',
        example: 'Select "Frontend Developer" or "AI Engineer" to instantly align your entire dashboard.',
      },
      {
        id: 'career-requirements-spec',
        chapterId: 'career-planning',
        view: 'my-career',
        target: '[data-tour="career-requirements-spec"]',
        fallbackTarget: '#main-content',
        title: 'Market Benchmark Specifications',
        body: 'Evaluates exact industry requirements: required core technologies, preferred frameworks, architectural patterns, and soft skills needed by employers.',
        example: 'See whether Docker or TypeScript is considered mandatory or preferred for your role.',
      },
      {
        id: 'career-recommendations-list',
        chapterId: 'career-planning',
        view: 'my-career',
        target: '[data-tour="career-recommendations-list"]',
        fallbackTarget: '#main-content',
        title: 'Tailored Career Recommendations',
        body: 'CareerDev4AI generates tailored suggestions based on your career stage — whether you are a student building fundamentals or a switcher leveraging transferable skills.',
        example: 'Students receive internship-focused tips; switchers get transition bridge roadmaps.',
      },
      {
        id: 'career-stage-selector',
        chapterId: 'career-planning',
        view: 'my-career',
        target: '[data-tour="career-stage-selector"]',
        fallbackTarget: '#main-content',
        title: 'Career Stage Alignment',
        body: 'Setting your career stage (Student, Fresh Grad, Working Pro, Career Switcher, Freelancer) adapts roadmap velocity and prioritizes the most relevant milestones.',
        example: 'Change your stage at any time to re-calibrate timeline estimates and milestone depths.',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 4: Career Roadmap (5 steps)
  // =========================================================================
  {
    id: 'roadmap',
    title: 'Career Roadmap',
    description: 'Navigate your personalized roadmap, milestones, actionable tasks, completion tracking, and platform integrations.',
    view: 'roadmap',
    icon: 'Layers',
    steps: [
      {
        id: 'roadmap-intro',
        chapterId: 'roadmap',
        view: 'roadmap',
        target: '[data-guide="roadmap-summary"]',
        fallbackTarget: '#main-content',
        title: 'Personalized Career Roadmap',
        body: 'A structured, phased curriculum engineered specifically for your role. It breaks the journey from where you are today into achievable, bite-sized phases.',
        example: 'Phases progress from Fundamentals to Intermediate Practice, Advanced Architecture, and Interview Readiness.',
      },
      {
        id: 'roadmap-phases',
        chapterId: 'roadmap',
        view: 'roadmap',
        target: '[data-tour="roadmap-phases"]',
        fallbackTarget: '#main-content',
        title: 'Phases and Milestones',
        body: 'Each phase contains clearly defined learning objectives and practical milestones. Prerequisites ensure you build a rock-solid foundation before moving ahead.',
        example: 'Complete Phase 1 (Fundamentals) to unlock Phase 2 (Building Real-world Systems).',
      },
      {
        id: 'roadmap-tasks',
        chapterId: 'roadmap',
        view: 'roadmap',
        target: '[data-guide="roadmap-task"]',
        fallbackTarget: '[data-tour="roadmap-phases"]',
        title: 'Actionable Learning Tasks',
        body: 'Every task specifies the exact skill it develops, estimated completion hours, and links directly to verified free courses and practice exercises.',
        example: 'A task like "Implement REST API Authentication" includes tutorials, documentation, and code criteria.',
      },
      {
        id: 'roadmap-completion',
        chapterId: 'roadmap',
        view: 'roadmap',
        target: '[data-tour="roadmap-task-checkbox"]',
        fallbackTarget: '[data-tour="roadmap-phases"]',
        title: 'Task Completion & Progress Velocity',
        body: 'Check off tasks as you finish them. Your overall phase completion percentage updates in real time, unlocking badges and advancing your readiness score.',
        example: 'Marking tasks complete feeds directly into your verified activity logs.',
      },
      {
        id: 'roadmap-integrations',
        chapterId: 'roadmap',
        view: 'roadmap',
        target: '[data-tour="roadmap-integrations-panel"]',
        fallbackTarget: '#main-content',
        title: 'Connected Platform Progress',
        body: 'Everything in CareerDev4AI connects together. Completing a recommended course or submitting a project automatically updates your roadmap and closes related skill gaps.',
        example: 'No duplicate tracking — one finished project updates your skills, roadmap, and CV simultaneously.',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 5: Learning Hub (5 steps)
  // =========================================================================
  {
    id: 'learning',
    title: 'Learning Hub',
    description: 'Discover curated courses, search filters, course verification, resource tracking, and readiness connection.',
    view: 'learning',
    icon: 'BookOpen',
    steps: [
      {
        id: 'learning-intro',
        chapterId: 'learning',
        view: 'learning',
        target: '[data-tour="learning-hero"]',
        fallbackTarget: '#main-content',
        title: 'Curated Learning Hub',
        body: 'Explore hand-picked, verified learning resources filtered specifically to address your active skill gaps, sourced from top educational providers.',
        example: 'Find free university courses, documentation, and high-quality interactive tutorials.',
      },
      {
        id: 'learning-filters',
        chapterId: 'learning',
        view: 'learning',
        target: '[data-tour="learning-search-filters"]',
        fallbackTarget: '#main-content',
        title: 'Search & Topic Filters',
        body: 'Filter by skill name, difficulty level (Beginner to Advanced), format (Video, Interactive, Documentation), and verified free providers.',
        example: 'Filter for "React" or "PostgreSQL" to quickly surface zero-cost, high-rating courses.',
      },
      {
        id: 'learning-verification',
        chapterId: 'learning',
        view: 'learning',
        target: '[data-guide="learning-reason"]',
        fallbackTarget: '#main-content',
        title: 'Why This Course?',
        body: 'Every course card explains the exact reasoning behind its recommendation: which open skill gap it targets and how much it advances your target role readiness.',
        example: 'Click "View Course" to open official materials from Harvard CS50, Coursera, FreeCodeCamp, or MDN.',
      },
      {
        id: 'learning-tracking',
        chapterId: 'learning',
        view: 'learning',
        target: '[data-tour="learning-bookmark-btn"]',
        fallbackTarget: '#main-content',
        title: 'Track Active Learning',
        body: 'Save courses to your personal learning queue, mark them "In Progress", and record hours studied to keep your learning momentum visible.',
        example: 'Save courses you plan to study this weekend into your personal queue.',
      },
      {
        id: 'learning-readiness-impact',
        chapterId: 'learning',
        view: 'learning',
        target: '[data-tour="learning-skills-link"]',
        fallbackTarget: '#main-content',
        title: 'Closing Gaps Through Study',
        body: 'When you finish a course, rate your new understanding in the Skills Center to raise your role readiness score and move closer to interview preparation.',
        example: 'Study SQL → Rate skill 3/5 → Watch your readiness score increase by 5%!',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 6: Skills & Assessments (4 steps)
  // =========================================================================
  {
    id: 'skills',
    title: 'Skills & Assessments',
    description: 'Master your skills inventory, rate proficiencies honestly, take diagnostic tests, and get targeted fixes.',
    view: 'skills',
    icon: 'Award',
    steps: [
      {
        id: 'skills-intro',
        chapterId: 'skills',
        view: 'skills',
        target: '[data-guide="skills-gaps"]',
        fallbackTarget: '#main-content',
        title: 'Skills Center & Proficiency Matrix',
        body: 'Manage your comprehensive technical, domain, and soft skill proficiencies. Categorized by Core, Secondary, Tools, and Methodologies.',
        example: 'View all skills categorized by status: Mastered, In Progress, and Needs Review.',
      },
      {
        id: 'skills-rating',
        chapterId: 'skills',
        view: 'skills',
        target: '[data-tour="skill-rate-widget"]',
        fallbackTarget: '#main-content',
        title: 'Honest 1–5 Proficiency Rating',
        body: 'Rate your real-world capability: 1 (Novice), 2 (Learner), 3 (Practitioner), 4 (Advanced), 5 (Expert). Accurate ratings generate realistic roadmaps.',
        example: 'Be honest: a rating of 2 tells CareerDev4AI to give you beginner-friendly learning tasks.',
      },
      {
        id: 'skills-assessments',
        chapterId: 'skills',
        view: 'assessment',
        target: '[data-tour="assessment-catalog"]',
        fallbackTarget: '#main-content',
        title: 'Skill Assessments & Quizzes',
        body: 'Take diagnostic assessments to objectively test your knowledge. Quizzes include realistic technical questions, scenario problem-solving, and code evaluation.',
        example: 'Take the 15-minute TypeScript Assessment to prove your proficiency level.',
      },
      {
        id: 'skills-feedback',
        chapterId: 'skills',
        view: 'assessment',
        target: '[data-tour="assessment-results-summary"]',
        fallbackTarget: '#main-content',
        title: 'Targeted Feedback & Fixes',
        body: 'Review detailed breakdown of your correct answers and knowledge gaps. One-click actions let you add targeted learning resources for every missed topic.',
        example: 'Missed asynchronous promises? One click adds the exact MDN guide to your roadmap.',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 7: Projects & Portfolio (4 steps)
  // =========================================================================
  {
    id: 'projects',
    title: 'Projects & Portfolio',
    description: 'Document real deliverables, tag technologies and outcomes, and sync them directly to your CV.',
    view: 'projects',
    icon: 'FolderGit2',
    steps: [
      {
        id: 'projects-intro',
        chapterId: 'projects',
        view: 'projects',
        target: '[data-guide="projects"]',
        fallbackTarget: '#main-content',
        title: 'Projects & Portfolio Evidence',
        body: 'Proof matters more than certificates. Build and showcase real-world projects that demonstrate your ability to solve complex problems and write clean code.',
        example: 'Browse suggested project briefs tailored to your role with architecture requirements.',
      },
      {
        id: 'projects-add-btn',
        chapterId: 'projects',
        view: 'projects',
        target: '[data-tour="add-project-button"]',
        fallbackTarget: '#main-content',
        title: 'Add Your Project',
        body: 'Document your project: title, problem statement, key features, GitHub repository URL, live deployment link, and screenshots.',
        example: 'Link your GitHub repository and live Vercel/Cloudflare demo to give recruiters instant proof.',
      },
      {
        id: 'projects-tech-outcomes',
        chapterId: 'projects',
        view: 'projects',
        target: '[data-tour="project-tech-tags"]',
        fallbackTarget: '#main-content',
        title: 'Tag Skills & Measurable Impact',
        body: 'Tag the technologies used (e.g. Node.js, PostgreSQL, Tailwind) and document quantifiable results (e.g. "Reduced latency by 40%", "Supported 500+ users").',
        example: 'Recruiters look for numbers: state what changed as a result of your work.',
      },
      {
        id: 'projects-cv-sync',
        chapterId: 'projects',
        view: 'projects',
        target: '[data-tour="project-portfolio-sync"]',
        fallbackTarget: '#main-content',
        title: 'Instant Portfolio & CV Verification',
        body: 'Every verified project is immediately available in your public portfolio link and ready to insert into targeted CV versions in CV Studio.',
        example: 'Include this project on your CV with one click during job applications.',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 8: Opportunities & Applications (4 steps)
  // =========================================================================
  {
    id: 'opportunities',
    title: 'Career Opportunities & Applications',
    description: 'Discover verified jobs, use location filters, check honest profile match scores, and track applications.',
    view: 'jobs',
    icon: 'Briefcase',
    steps: [
      {
        id: 'opportunities-discovery',
        chapterId: 'opportunities',
        view: 'jobs',
        target: '[data-tour="jobs-header-panel"]',
        fallbackTarget: '#main-content',
        title: 'Live Job Discovery',
        body: 'Discover verified job openings across Egypt, MENA, and remote international companies. No fake metrics, no phantom postings — only genuine listings.',
        example: 'Browse openings for Software Engineers, Product Managers, and Data Analysts.',
      },
      {
        id: 'opportunities-filters',
        chapterId: 'opportunities',
        view: 'jobs',
        target: '[data-tour="jobs-filter-bar"]',
        fallbackTarget: '#main-content',
        title: 'Targeted Search & Filters',
        body: 'Filter vacancies by city (Cairo, Alexandria, Giza, Remote), contract type (Full-time, Internship, Freelance), and experience tier (Junior, Mid, Senior).',
        example: 'Select "Cairo" + "Full-time" + "Junior" to see entry-level tech opportunities in Egypt.',
      },
      {
        id: 'opportunities-match-score',
        chapterId: 'opportunities',
        view: 'jobs',
        target: '[data-tour="job-match-badge"]',
        fallbackTarget: '#main-content',
        title: 'Honest Job Match Score',
        body: 'Compares job requirements with your real profile. Shows matched skills in green and missing skills in amber, so you know exactly where you stand.',
        example: 'See that you match 80% of requirements: you have React & TypeScript, but need Docker.',
      },
      {
        id: 'opportunities-applications-tracker',
        chapterId: 'opportunities',
        view: 'applications',
        target: '[data-tour="applications-kanban"]',
        fallbackTarget: '#main-content',
        title: 'Application Pipeline Tracker',
        body: 'Track every job submission across pipeline stages: Applied, Screening, Interview, Offer, and Rejected. Never lose track of where you applied.',
        example: 'Log interview dates, HR notes, and salary offers for each company in one clean board.',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 9: Career Tools (5 steps)
  // =========================================================================
  {
    id: 'career-tools',
    title: 'Career Tools',
    description: 'Build role-tailored CVs, generate cover letters, practice interview answers, and consult AI Mentor.',
    view: 'cv-studio',
    icon: 'FileText',
    steps: [
      {
        id: 'tools-cv-studio',
        chapterId: 'career-tools',
        view: 'cv-studio',
        target: '[data-guide="cv-build"]',
        fallbackTarget: '#main-content',
        title: 'CV Studio & Real Data Builder',
        body: 'Build ATS-friendly, professional resumes assembled directly from your profile data, verified skills, and projects. Zero hallucination, zero fluff.',
        example: 'Export clean PDF resumes formatted to international and Egyptian hiring standards.',
      },
      {
        id: 'tools-cv-tailoring',
        chapterId: 'career-tools',
        view: 'cv-studio',
        target: '[data-tour="cv-tailor-tab"]',
        fallbackTarget: '#main-content',
        title: 'Tailor CV to Job Descriptions',
        body: 'Paste any job description to instantly analyze match strength. The AI highlights missing keywords and recommends tailored bullet points based on your real experience.',
        example: 'Create a customized CV version for "Company X" without ever overwriting your master profile.',
      },
      {
        id: 'tools-cover-letters',
        chapterId: 'career-tools',
        view: 'cv-studio',
        target: '[data-tour="cover-letter-panel"]',
        fallbackTarget: '#main-content',
        title: 'Evidence-Based Cover Letters',
        body: 'Generate tailored cover letters that reference your actual portfolio projects and skills, avoiding generic templates that recruiters ignore.',
        example: 'Produces a 3-paragraph letter explaining your passion, your matching evidence, and your value.',
      },
      {
        id: 'tools-interview-prep',
        chapterId: 'career-tools',
        view: 'interviews',
        target: '[data-tour="interview-simulator"]',
        fallbackTarget: '#main-content',
        title: 'Interview Preparation & Practice',
        body: 'Prepare for behavioral and technical interviews. Practice answering standard and role-specific questions using the proven STAR framework (Situation, Task, Action, Result).',
        example: 'Practice: "Describe a time you resolved a critical production bug under time pressure."',
      },
      {
        id: 'tools-ai-mentor',
        chapterId: 'career-tools',
        view: 'interviews',
        target: '[data-tour="ai-mentor-panel"]',
        fallbackTarget: '#main-content',
        title: 'AI Career Mentor',
        body: 'Ask deep career guidance questions. Get honest advice on salary negotiations in Egypt, portfolio critique, and transition strategies.',
        example: 'Ask: "How should I answer expected salary questions as a fresh graduate in Cairo?"',
      },
    ],
  },

  // =========================================================================
  // CHAPTER 10: Profile, Progress & Personalization (4 steps)
  // =========================================================================
  {
    id: 'profile-progress',
    title: 'Profile, Progress & Personalization',
    description: 'Keep your identity fresh, document credentials, track career velocity, and access help anytime.',
    view: 'profile',
    icon: 'User',
    steps: [
      {
        id: 'profile-identity',
        chapterId: 'profile-progress',
        view: 'profile',
        target: '[data-tour="profile-card"]',
        fallbackTarget: '#main-content',
        title: 'Your Professional Profile',
        body: 'Keep your bio, contact information, education, and social links up to date. This forms the foundation of your shareable public profile and CVs.',
        example: 'Update your GitHub and LinkedIn links to ensure recruiters can view your work.',
      },
      {
        id: 'profile-credentials',
        chapterId: 'profile-progress',
        view: 'profile',
        target: '[data-tour="profile-credentials"]',
        fallbackTarget: '#main-content',
        title: 'Achievements & Credentials',
        body: 'Record verified certifications, academic honors, hackathon awards, and courses completed with credential IDs and issuing organizations.',
        example: 'Add your AWS Certified Developer or Meta Frontend certificate with verification link.',
      },
      {
        id: 'progress-velocity',
        chapterId: 'profile-progress',
        view: 'progress',
        target: '[data-tour="progress-metrics"]',
        fallbackTarget: '#main-content',
        title: 'Long-term Career Velocity',
        body: 'Track your career momentum: study hours logged, skills rated, milestone velocity, and readiness trajectory over the last 30 and 90 days.',
        example: 'Watch your readiness climb from 25% to 85% as you steadily progress through your roadmap.',
      },
      {
        id: 'tour-revisit-help',
        chapterId: 'profile-progress',
        view: 'settings',
        target: '[data-tour="tour-help-revisit"]',
        fallbackTarget: '#main-content',
        title: 'Tour Revisit & Help Center',
        body: 'You can restart this tour or revisit any individual chapter at any time from Settings or the account menu. We are here to support every step of your journey!',
        example: 'Click "Show me around again" in Settings or select any chapter from the Tour Navigator.',
      },
    ],
  },
];

export const ALL_TOUR_STEPS = TOUR_CHAPTERS.flatMap((c) => c.steps);
export const TOTAL_TOUR_STEPS = ALL_TOUR_STEPS.length;
