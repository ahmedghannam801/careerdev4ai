import { TargetRole } from '../types/career';

export const TARGET_ROLES: TargetRole[] = [
  {
    id: 'frontend-engineer',
    title: 'Frontend Engineer',
    category: 'Software Engineering',
    level: 'Mid',
    overview: 'Builds responsive, high-performance, accessible user interfaces using modern web technologies like React, TypeScript, and state management architectures.',
    responsibilities: [
      'Architect, develop, and maintain responsive web applications',
      'Translate design wireframes and UX flows into clean, modular components',
      'Optimize application performance, core web vitals, and network latency',
      'Implement robust automated tests (unit, integration, and e2e)',
      'Collaborate with product designers, backend engineers, and product managers'
    ],
    requiredSkills: [
      { name: 'React', category: 'technical', minLevel: 4 },
      { name: 'TypeScript', category: 'technical', minLevel: 4 },
      { name: 'JavaScript (ES6+)', category: 'technical', minLevel: 4 },
      { name: 'HTML5 & Modern CSS', category: 'technical', minLevel: 4 },
      { name: 'State Management', category: 'technical', minLevel: 3 },
      { name: 'Web Performance Optimization', category: 'analytical', minLevel: 3 },
      { name: 'Git & Version Control', category: 'tools', minLevel: 4 },
      { name: 'REST & GraphQL APIs', category: 'technical', minLevel: 3 }
    ],
    preferredSkills: [
      { name: 'Next.js', category: 'technical', minLevel: 3 },
      { name: 'Tailwind CSS', category: 'tools', minLevel: 4 },
      { name: 'Testing (Jest/Playwright)', category: 'tools', minLevel: 3 },
      { name: 'CI/CD Pipelines', category: 'tools', minLevel: 2 },
      { name: 'Accessibility (a11y)', category: 'domain', minLevel: 3 }
    ],
    tools: ['React', 'TypeScript', 'Vite', 'Next.js', 'Tailwind CSS', 'Figma', 'Git', 'Chrome DevTools', 'Jest', 'Playwright'],
    experienceExpectation: '2-4 years of professional web development experience or equivalent demonstrable production projects',
    salaryRange: '$85,000 - $135,000 / year',
    typicalProjects: [
      'Design System component library with automated visual regression tests',
      'Real-time collaborative dashboard with WebSockets and responsive tables',
      'High-conversion e-commerce checkout flow with sub-second performance'
    ],
    certifications: ['Meta Front-End Developer Professional Certificate', 'AWS Certified Cloud Practitioner'],
    interviewTopics: [
      'Virtual DOM and React reconciliation lifecycle',
      'JavaScript event loop, closures, and asynchronous concurrency',
      'Browser rendering path and Core Web Vitals optimization',
      'Component state architecture and performance memoization',
      'STAR behavioral stories on resolving cross-functional trade-offs'
    ],
    careerProgression: ['Junior Frontend Developer', 'Mid Frontend Engineer', 'Senior Frontend Engineer', 'Lead UI Architect', 'Staff Engineer / Engineering Manager'],
    relatedRoles: ['fullstack-engineer', 'mobile-developer', 'ui-ux-designer']
  },
  {
    id: 'fullstack-engineer',
    title: 'Full-Stack Engineer',
    category: 'Software Engineering',
    level: 'Mid',
    overview: 'Designs, implements, and maintains end-to-end applications spanning client-side interfaces, server-side APIs, database schemas, and cloud deployment pipelines.',
    responsibilities: [
      'Design clean RESTful and GraphQL APIs with comprehensive input validation',
      'Develop reactive frontend interfaces connected to reliable backends',
      'Model relational and document database schemas with indexes and migrations',
      'Implement authentication, authorization (RBAC), and session management',
      'Deploy containerized services to cloud infrastructure'
    ],
    requiredSkills: [
      { name: 'React', category: 'technical', minLevel: 3 },
      { name: 'Node.js & Express', category: 'technical', minLevel: 4 },
      { name: 'TypeScript', category: 'technical', minLevel: 4 },
      { name: 'SQL & Database Design', category: 'analytical', minLevel: 4 },
      { name: 'RESTful API Architecture', category: 'technical', minLevel: 4 },
      { name: 'Authentication & Security', category: 'domain', minLevel: 3 },
      { name: 'Git & Version Control', category: 'tools', minLevel: 4 }
    ],
    preferredSkills: [
      { name: 'Docker & Containers', category: 'tools', minLevel: 3 },
      { name: 'PostgreSQL / Prisma', category: 'tools', minLevel: 3 },
      { name: 'Cloud Platforms (AWS/GCP)', category: 'tools', minLevel: 3 },
      { name: 'Redis Caching', category: 'technical', minLevel: 2 },
      { name: 'System Design', category: 'analytical', minLevel: 3 }
    ],
    tools: ['Node.js', 'React', 'TypeScript', 'PostgreSQL', 'Docker', 'Express', 'Git', 'Redis', 'AWS/GCP', 'Postman'],
    experienceExpectation: '2-5 years across both frontend frameworks and backend service architectures',
    salaryRange: '$95,000 - $150,000 / year',
    typicalProjects: [
      'Multi-tenant SaaS workspace with RBAC, subscriptions, and audit logs',
      'High-throughput messaging queue and job processing service',
      'E-commerce platform with stripe integration and inventory tracking'
    ],
    certifications: ['AWS Certified Solutions Architect Associate', 'Meta Full-Stack Developer Certificate'],
    interviewTopics: [
      'Relational vs NoSQL schema design trade-offs and indexing',
      'Authentication architectures (JWT, OAuth2, Session cookies)',
      'Horizontal scalability, load balancers, and cache invalidation strategies',
      'REST vs GraphQL vs gRPC comparison and use-case analysis'
    ],
    careerProgression: ['Junior Software Engineer', 'Full-Stack Engineer', 'Senior Full-Stack Engineer', 'Principal Architect', 'VP of Engineering'],
    relatedRoles: ['frontend-engineer', 'backend-engineer', 'cloud-devops-engineer']
  },
  {
    id: 'data-analyst',
    title: 'Data Analyst',
    category: 'Data & Analytics',
    level: 'Entry-Mid',
    overview: 'Transforms complex raw datasets into actionable commercial insights, executive dashboards, and statistical models that guide key business decisions.',
    responsibilities: [
      'Author complex SQL queries to extract, transform, and clean raw data',
      'Construct interactive visual dashboards in Tableau, Power BI, or Looker',
      'Conduct exploratory data analysis and hypothesis testing on user behavior',
      'Present analytical findings to senior stakeholders and business leaders',
      'Define, track, and maintain business KPIs and metric reporting pipelines'
    ],
    requiredSkills: [
      { name: 'SQL', category: 'analytical', minLevel: 4 },
      { name: 'Data Visualization (Tableau/Power BI)', category: 'tools', minLevel: 4 },
      { name: 'Excel / Spreadsheets Modeling', category: 'analytical', minLevel: 4 },
      { name: 'Python for Data Analysis', category: 'technical', minLevel: 3 },
      { name: 'Statistical Analysis', category: 'analytical', minLevel: 3 },
      { name: 'Business Communication', category: 'communication', minLevel: 4 }
    ],
    preferredSkills: [
      { name: 'Pandas & NumPy', category: 'technical', minLevel: 3 },
      { name: 'A/B Testing Methodology', category: 'analytical', minLevel: 3 },
      { name: 'Data Warehousing (BigQuery/Snowflake)', category: 'tools', minLevel: 2 },
      { name: 'Stakeholder Management', category: 'business', minLevel: 3 }
    ],
    tools: ['SQL', 'Tableau', 'Power BI', 'Python', 'Jupyter', 'BigQuery', 'Excel', 'Snowflake', 'dbt'],
    experienceExpectation: '1-3 years in quantitative analysis, data reporting, or degree in STEM / Economics',
    salaryRange: '$70,000 - $110,000 / year',
    typicalProjects: [
      'Customer churn analysis pipeline identifying key drop-off drivers',
      'Marketing campaign attribution and ROI automated executive dashboard',
      'Inventory forecasting model optimizing supplier reorder cycles'
    ],
    certifications: ['Google Data Analytics Professional Certificate', 'Tableau Certified Data Analyst'],
    interviewTopics: [
      'SQL joins, window functions, CTEs, and query optimization',
      'Interpreting p-values, confidence intervals, and selection bias in tests',
      'Communicating technical data nuances to non-technical stakeholders',
      'Dashboard layout principles and choosing optimal chart encodings'
    ],
    careerProgression: ['Junior Data Analyst', 'Data Analyst', 'Senior Data Analyst', 'Analytics Lead', 'Head of Business Intelligence'],
    relatedRoles: ['data-scientist', 'product-manager', 'business-analyst']
  },
  {
    id: 'ai-ml-engineer',
    title: 'AI / Machine Learning Engineer',
    category: 'Artificial Intelligence',
    level: 'Mid',
    overview: 'Develops, tunes, evaluates, and deploys machine learning models and LLM-powered applications into scalable production environments.',
    responsibilities: [
      'Design, train, and fine-tune machine learning and deep learning models',
      'Build end-to-end LLM pipelines utilizing RAG, embeddings, and vector databases',
      'Optimize inference latency, memory consumption, and GPU utilization',
      'Establish automated model evaluation, drift detection, and monitoring',
      'Deploy containerized ML microservices via REST/gRPC endpoints'
    ],
    requiredSkills: [
      { name: 'Python', category: 'technical', minLevel: 5 },
      { name: 'PyTorch / TensorFlow', category: 'technical', minLevel: 4 },
      { name: 'Machine Learning Fundamentals', category: 'analytical', minLevel: 4 },
      { name: 'LLMs & Prompt Engineering', category: 'technical', minLevel: 4 },
      { name: 'Vector DBs & RAG', category: 'technical', minLevel: 3 },
      { name: 'Data Preprocessing & Feature Engineering', category: 'analytical', minLevel: 4 },
      { name: 'Git & Linux CLI', category: 'tools', minLevel: 4 }
    ],
    preferredSkills: [
      { name: 'Docker & Kubernetes', category: 'tools', minLevel: 3 },
      { name: 'MLOps (MLflow, Weights & Biases)', category: 'tools', minLevel: 3 },
      { name: 'Cloud AI Services (GCP Vertex / AWS Bedrock)', category: 'tools', minLevel: 3 },
      { name: 'Model Quantization & Optimization', category: 'technical', minLevel: 3 }
    ],
    tools: ['Python', 'PyTorch', 'Hugging Face', 'LangChain/LlamaIndex', 'Chroma/Pinecone', 'Docker', 'FastAPI', 'MLflow', 'Jupyter'],
    experienceExpectation: '2-4 years in Python software engineering with applied machine learning or generative AI projects',
    salaryRange: '$120,000 - $185,000 / year',
    typicalProjects: [
      'Enterprise retrieval-augmented generation (RAG) assistant with source citation',
      'Multimodal classifier with active learning and automated retraining pipeline',
      'Fine-tuned open-source model optimized for domain-specific medical/legal QA'
    ],
    certifications: ['DeepLearning.AI Machine Learning Specialization', 'Google Cloud Professional Machine Learning Engineer'],
    interviewTopics: [
      'Bias-variance tradeoff, regularization, and gradient descent mechanics',
      'Attention mechanism, Transformer architecture, and tokenization',
      'Evaluating generative outputs: hallucination mitigation and RAG metrics',
      'Serving ML models at scale with low latency and batching'
    ],
    careerProgression: ['Associate ML Engineer', 'AI/ML Engineer', 'Senior AI Engineer', 'Staff ML Scientist', 'Head of AI'],
    relatedRoles: ['data-scientist', 'fullstack-engineer', 'backend-engineer']
  },
  {
    id: 'cloud-devops-engineer',
    title: 'Cloud & DevOps Engineer',
    category: 'Infrastructure & Cloud',
    level: 'Mid',
    overview: 'Automates cloud infrastructure provisioning, CI/CD deployment pipelines, system observability, and security posture across enterprise environments.',
    responsibilities: [
      'Define infrastructure as code using Terraform or CloudFormation',
      'Maintain Kubernetes clusters, container registries, and networking',
      'Construct automated CI/CD pipelines with security scanning and rollbacks',
      'Implement central logging, metrics alerting, and distributed tracing',
      'Ensure high availability, disaster recovery, and cloud cost governance'
    ],
    requiredSkills: [
      { name: 'Cloud Architecture (AWS / GCP / Azure)', category: 'technical', minLevel: 4 },
      { name: 'Docker & Containerization', category: 'tools', minLevel: 4 },
      { name: 'Kubernetes', category: 'technical', minLevel: 3 },
      { name: 'Infrastructure as Code (Terraform)', category: 'tools', minLevel: 4 },
      { name: 'CI/CD (GitHub Actions / GitLab)', category: 'tools', minLevel: 4 },
      { name: 'Linux System Administration', category: 'technical', minLevel: 4 },
      { name: 'Networking & Security (VPC, DNS, TLS)', category: 'domain', minLevel: 3 }
    ],
    preferredSkills: [
      { name: 'Observability (Prometheus / Grafana)', category: 'tools', minLevel: 3 },
      { name: 'Python / Bash Scripting', category: 'technical', minLevel: 3 },
      { name: 'Cost Optimization (FinOps)', category: 'business', minLevel: 2 }
    ],
    tools: ['AWS', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'GitHub Actions', 'Prometheus', 'Grafana', 'Linux', 'Helm'],
    experienceExpectation: '2-5 years in infrastructure engineering, sysadmin, or backend development',
    salaryRange: '$105,000 - $160,000 / year',
    typicalProjects: [
      'Multi-region high-availability Kubernetes cluster deployed with Terraform',
      'Zero-downtime blue/green deployment pipeline with automated canary analysis',
      'Unified enterprise telemetry stack with Prometheus, Grafana, and Alertmanager'
    ],
    certifications: ['AWS Certified Solutions Architect Associate', 'Certified Kubernetes Administrator (CKA)', 'HashiCorp Certified Terraform Associate'],
    interviewTopics: [
      'Immutable infrastructure and state management in Terraform',
      'Container lifecycle, pod scheduling, and ingress in Kubernetes',
      'Incident management post-mortems and site reliability engineering (SRE) principles',
      'Designing zero-trust network topologies and automated secret rotation'
    ],
    careerProgression: ['Systems Administrator', 'DevOps Engineer', 'Senior Cloud Architect', 'Staff Site Reliability Engineer', 'Director of Infrastructure'],
    relatedRoles: ['fullstack-engineer', 'cybersecurity-analyst']
  },
  {
    id: 'product-manager',
    title: 'Product Manager',
    category: 'Product & Leadership',
    level: 'Mid',
    overview: 'Leads cross-functional product discovery, roadmapping, backlog prioritization, and launch execution to deliver impactful user experiences and commercial outcomes.',
    responsibilities: [
      'Synthesize user research, data insights, and market trends into product roadmaps',
      'Author crisp Product Requirement Documents (PRDs) and user stories with acceptance criteria',
      'Prioritize engineering sprints balancing customer value, technical debt, and business goals',
      'Define, monitor, and report on core product engagement and retention KPIs',
      'Align executive stakeholders, sales, marketing, and customer support for go-to-market'
    ],
    requiredSkills: [
      { name: 'Product Discovery & Strategy', category: 'business', minLevel: 4 },
      { name: 'User Research & Customer Interviews', category: 'domain', minLevel: 4 },
      { name: 'Agile & Scrum Methodologies', category: 'tools', minLevel: 4 },
      { name: 'Data-Driven Decision Making', category: 'analytical', minLevel: 4 },
      { name: 'Roadmapping & Prioritization', category: 'business', minLevel: 4 },
      { name: 'Cross-Functional Leadership', category: 'leadership', minLevel: 4 },
      { name: 'Technical Literacy', category: 'technical', minLevel: 3 }
    ],
    preferredSkills: [
      { name: 'SQL for Product Metrics', category: 'analytical', minLevel: 2 },
      { name: 'UI/UX Prototyping (Figma)', category: 'tools', minLevel: 3 },
      { name: 'Go-to-Market Execution', category: 'business', minLevel: 3 }
    ],
    tools: ['Jira', 'Notion', 'Figma', 'Mixpanel', 'Amplitude', 'Linear', 'Google Analytics', 'PostHog'],
    experienceExpectation: '2-5 years in product management, consulting, UX research, or technical lead roles',
    salaryRange: '$100,000 - $160,000 / year',
    typicalProjects: [
      'Comprehensive product discovery and launch of a self-serve onboarding flow',
      'Feature prioritization matrix resolving competing requests from 50+ enterprise clients',
      'Retention analysis identifying feature usage leading to 25% lower monthly churn'
    ],
    certifications: ['Product School Certified Product Manager', 'Reforge Product Strategy Certificate'],
    interviewTopics: [
      'Product design sense: critique an existing product and propose improvements',
      'Prioritization frameworks (RICE, Kano) under resource and deadline constraints',
      'Root cause analysis on a sudden 15% drop in daily active users',
      'Handling conflict between engineering feasibility and sales commitment'
    ],
    careerProgression: ['Associate Product Manager', 'Product Manager', 'Senior Product Manager', 'Group Product Manager', 'VP of Product / Chief Product Officer'],
    relatedRoles: ['data-analyst', 'ui-ux-designer', 'business-analyst']
  },
  {
    id: 'ui-ux-designer',
    title: 'Product / UI-UX Designer',
    category: 'Design & Creative',
    level: 'Mid',
    overview: 'Researches user needs, crafts intuitive interaction architectures, and engineers design systems that deliver delightful, accessible digital experiences.',
    responsibilities: [
      'Conduct generative and evaluative user research to uncover pain points',
      'Design wireframes, high-fidelity prototypes, and design system components in Figma',
      'Collaborate with engineers to ensure pixel-perfect, accessible component delivery',
      'Design accessible interfaces compliant with WCAG 2.1 AA standards',
      'Create interactive motion prototypes explaining state transitions'
    ],
    requiredSkills: [
      { name: 'Figma & Design Systems', category: 'tools', minLevel: 5 },
      { name: 'Interaction & UX Design', category: 'domain', minLevel: 4 },
      { name: 'User Research & Usability Testing', category: 'analytical', minLevel: 4 },
      { name: 'Visual Hierarchy & Typography', category: 'domain', minLevel: 4 },
      { name: 'Accessibility (WCAG AA)', category: 'domain', minLevel: 3 },
      { name: 'Design-to-Code Handoff', category: 'communication', minLevel: 4 }
    ],
    preferredSkills: [
      { name: 'HTML & CSS Basics', category: 'technical', minLevel: 2 },
      { name: 'Motion & Micro-interactions', category: 'tools', minLevel: 3 },
      { name: 'Information Architecture', category: 'analytical', minLevel: 3 }
    ],
    tools: ['Figma', 'FigJam', 'Miro', 'Lottie', 'Maze', 'Notion', 'Storybook'],
    experienceExpectation: '2-4 years designing web or mobile digital products with a published portfolio',
    salaryRange: '$80,000 - $130,000 / year',
    typicalProjects: [
      'Comprehensive Design System tokens and component library used by 20+ devs',
      'End-to-end mobile checkout redesign lifting conversion rate by 18%',
      'Heuristic evaluation and redesign of a complex B2B data workspace'
    ],
    certifications: ['Google UX Design Professional Certificate', 'Nielsen Norman Group UX Certification'],
    interviewTopics: [
      'Portfolio walkthrough: trade-offs, constraints, research iterations, and final outcomes',
      'Design system governance: component tokens, versioning, and deprecation',
      'Handling critical stakeholder feedback that contradicts user research data',
      'Accessibility best practices for color contrast, keyboard focus, and screen readers'
    ],
    careerProgression: ['Junior UX Designer', 'Product Designer', 'Senior Product Designer', 'Design Lead', 'Head of Design'],
    relatedRoles: ['frontend-engineer', 'product-manager']
  },
  {
    id: 'cybersecurity-analyst',
    title: 'Cybersecurity Analyst',
    category: 'Security & Compliance',
    level: 'Entry-Mid',
    overview: 'Protects enterprise networks, cloud infrastructure, and data assets by monitoring threats, analyzing vulnerabilities, and mitigating security incidents.',
    responsibilities: [
      'Monitor Security Information and Event Management (SIEM) telemetry for anomalies',
      'Perform periodic vulnerability scans and penetration assessments',
      'Triage and investigate potential security incidents and malware indicators',
      'Ensure compliance with industry standards (SOC2, ISO 27001, GDPR)',
      'Conduct security awareness training and phishing simulations for employees'
    ],
    requiredSkills: [
      { name: 'Network Security & Protocols', category: 'domain', minLevel: 4 },
      { name: 'SIEM & Threat Detection (Splunk/Sentinel)', category: 'tools', minLevel: 4 },
      { name: 'Vulnerability Management', category: 'analytical', minLevel: 3 },
      { name: 'Incident Response Procedures', category: 'domain', minLevel: 3 },
      { name: 'Linux & Scripting (Python/Bash)', category: 'technical', minLevel: 3 },
      { name: 'Security Frameworks (NIST/ISO)', category: 'domain', minLevel: 3 }
    ],
    preferredSkills: [
      { name: 'Cloud Security (AWS Security Hub)', category: 'tools', minLevel: 3 },
      { name: 'Penetration Testing (Wireshark, Burp Suite)', category: 'tools', minLevel: 2 },
      { name: 'Identity & Access Management (IAM)', category: 'domain', minLevel: 3 }
    ],
    tools: ['Splunk', 'Wireshark', 'Burp Suite', 'Nessus', 'CrowdStrike', 'Linux', 'Python', 'AWS IAM'],
    experienceExpectation: '1-3 years in IT administration, networking, or cybersecurity operations',
    salaryRange: '$80,000 - $125,000 / year',
    typicalProjects: [
      'Automated threat correlation playbook reducing false positive alerts by 40%',
      'Enterprise vulnerability assessment and remediation roadmap across 200+ servers',
      'Incident response tabletop simulation for ransomware containment'
    ],
    certifications: ['CompTIA Security+', 'Certified Information Systems Security Professional (CISSP)', 'GIAC Certified Incident Handler (GCIH)'],
    interviewTopics: [
      'Walkthrough of the cyber kill chain and MITRE ATT&CK matrix',
      'How to isolate and investigate a compromised workstation',
      'Configuring firewalls, IDS/IPS, and zero trust architecture',
      'Communication protocols during an active data breach'
    ],
    careerProgression: ['SOC Analyst Tier 1', 'Cybersecurity Analyst Tier 2', 'Senior Security Engineer', 'Security Architect', 'Chief Information Security Officer (CISO)'],
    relatedRoles: ['cloud-devops-engineer', 'backend-engineer']
  }
];
