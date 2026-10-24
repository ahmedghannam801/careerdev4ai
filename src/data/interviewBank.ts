import type { TargetRole } from '../types/career';

export interface QuestionItem {
  id: string;
  category: 'behavioral' | 'technical' | 'star';
  roleTarget: string; // 'all' or role id
  question: string;
  context: string;
  recommendedFramework: string;
  sampleKeyPoints: string[];
}

/**
 * The universal question bank.
 *
 * These questions are shown to every candidate, so none of them may assume a
 * technical role: "unexpected technical roadblock" was fine when every user
 * was a developer and wrong for everyone else.
 */
export const INTERVIEW_QUESTIONS_BANK: QuestionItem[] = [
  {
    id: 'q-star-01',
    category: 'star',
    roleTarget: 'all',
    question: 'Describe a situation where a project you led faced an unexpected obstacle close to a deadline. How did you resolve it?',
    context: 'Evaluates resilience, problem-solving, stakeholder communication, and delivery under pressure.',
    recommendedFramework: 'STAR: Situation (the timeline and constraint), Task (your specific ownership), Action (concrete steps taken, triage), Result (outcome, post-mortem, metrics).',
    sampleKeyPoints: [
      'State the exact project scope and impending deadline',
      'Describe root-cause analysis rather than a superficial workaround',
      'Explain transparent communication with affected stakeholders',
      'Highlight on-time delivery or minimized delay, plus what you changed afterwards to prevent a repeat'
    ]
  },
  {
    id: 'q-star-02',
    category: 'star',
    roleTarget: 'all',
    question: 'Tell me about a time you had a strong disagreement with a colleague or manager about how work should be done. How did you handle it?',
    context: 'Tests cross-functional empathy, collaborative reasoning, evidence-based persuasion, and "disagree and commit".',
    recommendedFramework: 'STAR: Focus on shared goal, objective criteria evaluated, and mutual respect.',
    sampleKeyPoints: [
      'Focus on the trade-offs that affect the shared outcome, not on personal conflict',
      'Presented evidence or a worked example rather than opinions',
      'Listened actively to the concerns you did not expect',
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
    id: 'q-tech-04',
    category: 'technical',
    roleTarget: 'financial-analyst',
    question: 'A budget is 8% over plan in a cost line you do not directly control. Walk me through how you would investigate it and what you would recommend.',
    context: 'Variance analysis, root-cause isolation, judgement under incomplete information and commercial judgement.',
    recommendedFramework: 'Isolate the driver (price, volume, mix or timing), size the impact, separate controllable from non-controllable, then present options with a recommendation.',
    sampleKeyPoints: [
      'Decompose the variance into price, volume, mix and timing before drawing conclusions',
      'Separate the part you can influence from the part you cannot',
      'Check whether the overspend is a timing difference or a permanent run-rate',
      'Present options with the trade-off stated, not just the number'
    ]
  },
  {
    id: 'q-tech-05',
    category: 'technical',
    roleTarget: 'recruiter',
    question: 'A critical role has been open for 60 days with no qualified applicants. Walk me through what you would change about the search.',
    context: 'Sourcing strategy, market realism, stakeholder management and candidate experience.',
    recommendedFramework: 'Re-read the market, then the definition, then the funnel: verify compensation, widen or sharpen the profile, change the channel mix, and fix the candidate experience.',
    sampleKeyPoints: [
      'Check the role and package against the market before assuming the pipeline is the problem',
      'Identify whether the profile is too narrow or too vague',
      'Change the sourcing mix rather than repeating the same channel',
      'Say what you would stop doing, and why the funnel stage it affects'
    ]
  },
  {
    id: 'q-tech-06',
    category: 'technical',
    roleTarget: 'registered-nurse',
    question: 'A patient you are responsible for deteriorates unexpectedly. Walk me through your assessment and escalation.',
    context: 'Clinical assessment, prioritisation, escalation and patient safety.',
    recommendedFramework: 'ABCDE assessment, vital signs and observations, early-warning score, escalate with SBAR, then document and review.',
    sampleKeyPoints: [
      'Structured assessment rather than working from first impressions',
      'Escalate early and escalate again if the response is inadequate',
      'Use a structured handover format so nothing is lost',
      'Document the assessment, the escalation and the response'
    ]
  },
  {
    id: 'q-tech-07',
    category: 'technical',
    roleTarget: 'teacher',
    question: 'A class is progressing more slowly than planned in one topic. How do you diagnose why and adjust your teaching?',
    context: 'Assessment for learning, differentiation, and the link between evidence and planning.',
    recommendedFramework: 'Establish the evidence, locate the cause (knowledge, understanding, engagement or task design), adjust the next lesson, then re-check.',
    sampleKeyPoints: [
      'Use the learner work or assessment evidence to locate the gap precisely',
      'Distinguish a gap in knowledge from a gap in understanding',
      'Change the task or support rather than simply repeating the explanation',
      'Say how you would know whether the adjustment worked'
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
      'Articulate genuine motivation for the challenges and the problem domain',
      'Mention specific certifications, projects, or advanced study currently underway',
      'Express enthusiasm for mentoring and team contribution'
    ]
  }
];

/**
 * Builds role-specific practice questions from the role catalogue.
 *
 * Every role in the catalogue carries its own interview topics, so the
 * practice material follows the user's actual target role and domain instead
 * of being limited to the handful of hand-written technical questions.
 */
export function buildRoleQuestions(role: TargetRole): QuestionItem[] {
  const topics = role.interviewTopics ?? [];
  return topics.slice(0, 6).map((topic, index) => ({
    id: `q-role-${role.id}-${index}`,
    category: 'technical' as const,
    roleTarget: role.id,
    question: `In your target role as ${role.title}, how would you approach: ${topic}?`,
    context: `A role-specific question drawn from the ${role.category} competency profile for ${role.title}.`,
    recommendedFramework: `Structure the answer around ${role.title} practice: state the principle, show how you apply it, then give a concrete example and the outcome.`,
    sampleKeyPoints: [
      `Show that you understand what ${topic} means in the context of ${role.title}`,
      'Ground the answer in something you have actually done or studied',
      'Name the trade-off or risk you would watch for',
      'Close with the outcome you would be accountable for'
    ],
  }));
}

/**
 * The question bank plus the questions for the user's target role.
 *
 * Universal questions come first, then the role-specific ones.
 */
export function questionsForRole(role: TargetRole | null | undefined): QuestionItem[] {
  const universal = INTERVIEW_QUESTIONS_BANK.filter((q) => q.roleTarget === 'all');
  if (!role) return universal;
  const forRole = INTERVIEW_QUESTIONS_BANK.filter((q) => q.roleTarget === role.id);
  return [...universal, ...forRole, ...buildRoleQuestions(role)];
}
