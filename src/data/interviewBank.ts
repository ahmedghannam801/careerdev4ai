export interface QuestionItem {
  id: string;
  category: 'behavioral' | 'technical' | 'star';
  roleTarget: string; // 'all' or role id
  question: string;
  context: string;
  recommendedFramework: string;
  sampleKeyPoints: string[];
}

export const INTERVIEW_QUESTIONS_BANK: QuestionItem[] = [
  {
    id: 'q-star-01',
    category: 'star',
    roleTarget: 'all',
    question: 'Describe a situation where a project you led faced an unexpected technical roadblock close to a deadline. How did you resolve it?',
    context: 'Evaluates resilience, technical problem-solving, stakeholder communication, and delivery under pressure.',
    recommendedFramework: 'STAR: Situation (the timeline and constraint), Task (your specific ownership), Action (concrete steps taken, triage), Result (outcome, post-mortem, metrics).',
    sampleKeyPoints: [
      'State the exact project scope and impending deadline',
      'Describe root-cause debugging instead of superficial patching',
      'Explain transparent communication with affected stakeholders',
      'Highlight on-time delivery or minimized delay, plus preventative monitoring added afterward'
    ]
  },
  {
    id: 'q-star-02',
    category: 'star',
    roleTarget: 'all',
    question: 'Tell me about a time you had a strong disagreement with a colleague or manager regarding a technical design decision. How did you handle it?',
    context: 'Tests cross-functional empathy, collaborative reasoning, data-driven persuasion, and "disagree and commit".',
    recommendedFramework: 'STAR: Focus on shared goal, objective criteria evaluated, and mutual respect.',
    sampleKeyPoints: [
      'Focus on technical trade-offs (e.g. latency vs maintainability), not personal conflict',
      'Presented empirical benchmarks or prototype proof rather than opinions',
      'Listened actively to their architectural concerns',
      'Committed fully once the consensus or decision was reached'
    ]
  },
  {
    id: 'q-tech-01',
    category: 'technical',
    roleTarget: 'frontend-engineer',
    question: 'How does React\'s reconciliation algorithm determine when to re-render DOM nodes, and how do you prevent unnecessary renders in large component trees?',
    context: 'Core React architectural understanding, virtual DOM diffing, memoization, and profiler usage.',
    recommendedFramework: 'Explain Fiber architecture, component purity, key prop heuristics, React.memo, useMemo/useCallback boundaries, and state colocation.',
    sampleKeyPoints: [
      'Virtual DOM vs real DOM synchronization',
      'Key prop importance in list diffing (never use math.random or index if array mutates)',
      'State colocation: moving state down so fewer components re-render',
      'React DevTools Profiler to measure flamecharts before blindly optimizing'
    ]
  },
  {
    id: 'q-tech-02',
    category: 'technical',
    roleTarget: 'fullstack-engineer',
    question: 'How would you architect an idempotent payment processing API endpoint that handles concurrent duplicate requests safely?',
    context: 'Distributed systems reliability, database transactions, locking, and financial integrity.',
    recommendedFramework: 'Discuss Idempotency-Key HTTP headers, Redis distributed locks, SQL ACID transactions, and unique constraints.',
    sampleKeyPoints: [
      'Client sends unique Idempotency-Key UUID header',
      'Check Redis cache or database for existing processed key with status',
      'Wrap charging and record update inside atomic database transaction with isolation level',
      'Return cached response on duplicate attempts without recharging payment gateway'
    ]
  },
  {
    id: 'q-tech-03',
    category: 'technical',
    roleTarget: 'data-analyst',
    question: 'Explain the difference between WHERE and HAVING clauses in SQL, and when would you use window functions like ROW_NUMBER() vs RANK()?',
    context: 'Foundational SQL execution order and analytical querying proficiency.',
    recommendedFramework: 'Explain SQL clause evaluation order: FROM -> WHERE -> GROUP BY -> HAVING -> SELECT -> ORDER BY.',
    sampleKeyPoints: [
      'WHERE filters individual rows before aggregation occurs',
      'HAVING filters aggregated groups after GROUP BY is computed',
      'ROW_NUMBER() assigns strictly sequential integers (1, 2, 3) with no ties',
      'RANK() allows ties and skips subsequent numbers (1, 1, 3)'
    ]
  },
  {
    id: 'q-beh-01',
    category: 'behavioral',
    roleTarget: 'all',
    question: 'Why are you targeting this role at this stage of your career, and what is your plan for continuous learning over the next 12 months?',
    context: 'Assesses career intentionality, self-awareness, motivation, and growth mindset.',
    recommendedFramework: 'Past Trajectory -> Catalyst/Pivot Point -> Target Role Alignment -> Concrete 12-Month Mastery Plan.',
    sampleKeyPoints: [
      'Connect your recent projects or education directly to the competencies of this role',
      'Articulate genuine passion for the challenges and problem domain',
      'Mention specific industry certifications, open-source projects, or advanced concepts currently underway',
      'Express enthusiasm for mentoring and team contribution'
    ]
  }
];
