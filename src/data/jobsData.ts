import { JobListing } from '../types/career';

export const JOBS_CATALOG: JobListing[] = [
  {
    id: 'job-fe-01',
    title: 'Frontend Engineer (React / TypeScript)',
    company: 'Vanguard Systems',
    location: 'San Francisco, CA',
    workMode: 'Remote',
    level: 'Mid',
    salaryRange: '$110,000 - $135,000 / year',
    description: 'We are seeking a Frontend Engineer to lead user interface development for our high-throughput analytics platform. You will build accessible, fluid experiences with React and TypeScript.',
    responsibilities: [
      'Build performant and accessible web applications using React, TypeScript, and modern state architectures',
      'Translate design tokens and Figma prototypes into resilient reusable components',
      'Optimize web performance, Core Web Vitals, and time-to-interactive',
      'Write comprehensive unit and integration tests with Jest and Playwright'
    ],
    requirements: [
      '3+ years of professional web development with React and TypeScript',
      'Deep understanding of modern JavaScript (ES6+), DOM APIs, and CSS layout engines',
      'Demonstrated portfolio or GitHub projects showing clean component architecture',
      'Experience integrating RESTful APIs and WebSocket live streams'
    ],
    skillsRequired: ['React', 'TypeScript', 'JavaScript (ES6+)', 'HTML5 & Modern CSS', 'Git & Version Control', 'Web Performance Optimization'],
    applicationUrl: 'https://careers.vanguardsystems.example.com/fe-mid',
    postedDate: '2026-10-14'
  },
  {
    id: 'job-fs-02',
    title: 'Full-Stack Software Engineer',
    company: 'Nexus Cloud Technologies',
    location: 'Austin, TX',
    workMode: 'Hybrid',
    level: 'Mid',
    salaryRange: '$120,000 - $155,000 / year',
    description: 'Nexus builds modern enterprise automation tooling. We are expanding our core team to design resilient APIs and scalable UI interfaces.',
    responsibilities: [
      'Develop end-to-end features connecting React frontends with Node.js/PostgreSQL backends',
      'Architect relational database schemas, write migrations, and optimize queries',
      'Implement RBAC authorization and secure multi-tenant sessions',
      'Collaborate with cloud infrastructure teams to manage containerized deployments'
    ],
    requirements: [
      '3+ years building full-stack web applications',
      'Proficiency in Node.js, Express, TypeScript, and React',
      'Strong SQL database design and query optimization skills',
      'Familiarity with Docker and CI/CD pipelines'
    ],
    skillsRequired: ['React', 'Node.js & Express', 'TypeScript', 'SQL & Database Design', 'RESTful API Architecture', 'Git & Version Control'],
    applicationUrl: 'https://nexuscloud.example.com/careers/fs-engineer',
    postedDate: '2026-10-12'
  },
  {
    id: 'job-da-03',
    title: 'Data Analyst — Growth & Commercial Strategy',
    company: 'Kinetic Commerce',
    location: 'New York, NY',
    workMode: 'Remote',
    level: 'Entry-Mid',
    salaryRange: '$85,000 - $110,000 / year',
    description: 'Join Kinetic to uncover growth levers and customer retention patterns across millions of daily transactions. Partner directly with executive leadership.',
    responsibilities: [
      'Extract and transform data from Snowflake data warehouse using advanced SQL',
      'Build executive dashboards in Tableau tracking customer acquisition cost, LTV, and churn',
      'Conduct statistical analysis on A/B experiments for product checkouts',
      'Present monthly strategic insights to department heads'
    ],
    requirements: [
      '1-3 years experience in data analytics or quantitative consulting',
      'Advanced SQL querying skills (window functions, CTEs, aggregation)',
      'Proven expertise with Tableau, Power BI, or Looker',
      'Clear verbal and written communication with non-technical stakeholders'
    ],
    skillsRequired: ['SQL', 'Data Visualization (Tableau/Power BI)', 'Excel / Spreadsheets Modeling', 'Python for Data Analysis', 'Business Communication'],
    applicationUrl: 'https://kineticcommerce.example.com/jobs/growth-analyst',
    postedDate: '2026-10-16'
  },
  {
    id: 'job-ai-04',
    title: 'AI / Machine Learning Engineer',
    company: 'Synthetix Labs',
    location: 'Seattle, WA',
    workMode: 'Remote',
    level: 'Mid',
    salaryRange: '$140,000 - $185,000 / year',
    description: 'Synthetix builds enterprise generative AI agents. We are hiring an ML Engineer to build production RAG systems, evaluate model outputs, and optimize inference speed.',
    responsibilities: [
      'Architect robust retrieval-augmented generation (RAG) pipelines using vector databases',
      'Fine-tune open-source LLMs and train specialized embedding models',
      'Establish evaluation guardrails and automated hallucination detection benchmarks',
      'Deploy low-latency containerized ML services using FastAPI and Docker'
    ],
    requirements: [
      '2+ years experience in Python and deep learning frameworks (PyTorch)',
      'Hands-on experience with modern LLMs, prompt engineering, and vector indices',
      'Solid mathematical foundation in linear algebra, statistics, and optimization',
      'Track record of deploying AI services to production cloud environments'
    ],
    skillsRequired: ['Python', 'PyTorch / TensorFlow', 'Machine Learning Fundamentals', 'LLMs & Prompt Engineering', 'Vector DBs & RAG', 'Git & Linux CLI'],
    applicationUrl: 'https://synthetixlabs.example.com/openings/ai-engineer',
    postedDate: '2026-10-18'
  },
  {
    id: 'job-pm-05',
    title: 'Product Manager — Developer Experience',
    company: 'Starlight Platforms',
    location: 'Boston, MA',
    workMode: 'Hybrid',
    level: 'Mid',
    salaryRange: '$115,000 - $150,000 / year',
    description: 'Lead developer tools and API documentation product strategy for 50,000+ engineers building on our developer platform.',
    responsibilities: [
      'Run user interviews with engineering leads to understand developer friction',
      'Define product roadmap, write detailed PRDs, and guide sprint backlogs',
      'Track API adoption, onboarding completion, and SDK developer satisfaction metrics',
      'Partner with developer relations and marketing for major quarterly launches'
    ],
    requirements: [
      '2+ years in technical product management or developer tooling',
      'Demonstrated ability to prioritize roadmap features under competing constraints',
      'Strong technical fluency with APIs and developer workflows',
      'High emotional intelligence and cross-functional leadership skills'
    ],
    skillsRequired: ['Product Discovery & Strategy', 'User Research & Customer Interviews', 'Agile & Scrum Methodologies', 'Data-Driven Decision Making', 'Cross-Functional Leadership'],
    applicationUrl: 'https://starlightplatforms.example.com/pm-devex',
    postedDate: '2026-10-15'
  }
];
