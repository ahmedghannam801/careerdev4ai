import { CareerProject } from '../types/career';

export const PROJECTS_CATALOG: CareerProject[] = [
  {
    id: 'proj-design-system',
    title: 'Accessible Design System & Component Library',
    goal: 'Build and document a WCAG 2.1 AA compliant UI component system with automated test coverage and visual Storybook preview.',
    description: 'A comprehensive frontend engineering project demonstrating mastery over design tokens, accessible keyboard interactions, polymorphic React components, and zero-runtime CSS.',
    difficulty: 'Intermediate',
    skills: ['React', 'TypeScript', 'Tailwind CSS', 'Accessibility (a11y)', 'Testing (Jest/Playwright)'],
    tasks: [
      'Define semantic design tokens (colors, spacing, typography scales, elevation)',
      'Construct accessible primitives: Modal, Combobox, Popover, and Data Table',
      'Integrate keyboard focus trapping and ARIA live regions',
      'Publish automated npm package with type declarations and live Storybook docs'
    ],
    deliverables: [
      'GitHub repository with CI/CD GitHub Actions test workflows',
      'Interactive documentation site with copy-paste code snippets',
      '95%+ unit test coverage report across all UI components'
    ],
    status: 'in_progress',
    repositoryUrl: 'https://github.com/example/accessible-ui-system',
    demoUrl: 'https://accessible-ui-system.example.com',
    createdAt: '2026-09-15'
  },
  {
    id: 'proj-saas-api',
    title: 'Multi-Tenant SaaS Backend with RBAC & Webhooks',
    goal: 'Engineer a scalable REST/GraphQL API supporting multi-tenant organizations, Stripe webhook handling, and audit trails.',
    description: 'Production backend architecture addressing real enterprise security concerns: role-based access control, tenant data isolation, rate limiting, and background event queues.',
    difficulty: 'Advanced',
    skills: ['Node.js & Express', 'TypeScript', 'SQL & Database Design', 'Authentication & Security', 'Docker & Containers'],
    tasks: [
      'Model relational schema with PostgreSQL (tenants, memberships, roles, audit logs)',
      'Implement JWT authentication with refresh token rotation and cookie security',
      'Build Stripe webhook ingestion with idempotency keys and error handling',
      'Containerize using multi-stage Dockerfiles and deploy with docker-compose'
    ],
    deliverables: [
      'Complete Swagger/OpenAPI documentation with Postman collection',
      'Database migration scripts with indexed relational joins',
      'Benchmark report proving sub-50ms API response latency under load'
    ],
    status: 'planned',
    createdAt: '2026-09-20'
  },
  {
    id: 'proj-churn-dashboard',
    title: 'SaaS Customer Churn & Cohort Retention Dashboard',
    goal: 'Analyze raw product telemetry and subscription logs to uncover retention drivers and build an executive decision dashboard.',
    description: 'An end-to-end data analytics portfolio piece transforming 100,000+ customer events into actionable business churn mitigation recommendations.',
    difficulty: 'Intermediate',
    skills: ['SQL', 'Data Visualization (Tableau/Power BI)', 'Python for Data Analysis', 'Statistical Analysis', 'Business Communication'],
    tasks: [
      'Write complex SQL queries calculating monthly recurring revenue (MRR) and cohort churn',
      'Cleanse messy user interaction logs using Python Pandas and NumPy',
      'Formulate hypothesis tests investigating correlation between onboarding completion and churn',
      'Design interactive Power BI / Tableau dashboard with drill-down filters'
    ],
    deliverables: [
      'Executive 1-page PDF summary detailing top 3 churn levers and estimated revenue impact',
      'Public interactive Tableau dashboard or Streamlit visualizer',
      'Documented SQL query repository on GitHub'
    ],
    status: 'completed',
    repositoryUrl: 'https://github.com/example/saas-churn-analytics',
    demoUrl: 'https://public.tableau.com/views/saas-retention-demo',
    createdAt: '2026-08-10',
    completedAt: '2026-09-05'
  },
  {
    id: 'proj-rag-ai-assistant',
    title: 'Domain Knowledge Retrieval-Augmented Generation (RAG) Engine',
    goal: 'Build an AI assistant that grounds LLM answers in company documentation with source citations and hallucination guardrails.',
    description: 'State-of-the-art AI/ML engineering project using vector embeddings, hybrid semantic keyword search, and LLM re-ranking.',
    difficulty: 'Advanced',
    skills: ['Python', 'LLMs & Prompt Engineering', 'Vector DBs & RAG', 'PyTorch / TensorFlow', 'FastAPI'],
    tasks: [
      'Chunk and embed 500+ technical PDF documents using high-dimensional embeddings',
      'Store and index vectors with Chroma/Pinecone vector database',
      'Implement prompt synthesis with exact context window injection and citations',
      'Benchmark hallucination rates using synthetic evaluation test cases'
    ],
    deliverables: [
      'FastAPI microservice with streaming SSE response endpoints',
      'Interactive React demo allowing document upload and live querying',
      'Evaluation notebook comparing baseline prompt vs RAG grounded response accuracy'
    ],
    status: 'idea',
    createdAt: '2026-10-01'
  }
];
