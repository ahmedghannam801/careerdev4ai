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

/** The number of questions in one full mock interview. */
export const INTERVIEW_QUESTION_COUNT = 15;

export type InterviewStage = 'behavioral' | 'technical';

export interface InterviewPlanQuestion extends QuestionItem {
  /** 0-based position in the plan. */
  index: number;
  stage: InterviewStage;
  /** The real CV fact this question was adapted from, when there is one. */
  personalization?: string;
}

export interface InterviewPlanInput {
  /**
   * The candidate's target role.
   *
   * It is nullable: a candidate who has not chosen a role still gets a plan,
   * built from the universal questions and their own CV. The plan never
   * assumes a role it was not given.
   */
  role: TargetRole | null;
  experiences?: Array<{
    role: string;
    company: string;
    achievements?: string[];
    skillsUsed?: string[];
  }>;
  projects?: Array<{ title: string; description?: string; skills?: string[] }>;
  volunteering?: Array<{
    organization: string;
    role: string;
    responsibilities?: string[];
    achievements?: string[];
    skills?: string[];
  }>;
  completedTraining?: Array<{ title: string; provider?: string }>;
  ownedSkills?: string[];
}

function cleanText(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

/**
 * Builds the sequential 15-question mock interview.
 *
 * The order is fixed and deterministic: eight behavioural/personal questions
 * adapted to the candidate's own CV, then seven technical questions drawn from
 * the primary target role. The first half never assumes a technical role, and
 * the second half never drifts to another role. The UI shows one question at a
 * time and inserts a transition screen between the two stages.
 */
export function buildInterviewPlan(input: InterviewPlanInput): InterviewPlanQuestion[] {
  const role = input.role;
  // With no target role the plan is still built — from the candidate's own CV
  // and from the universal questions — and it speaks about "your target role"
  // rather than inventing one. The role-specific technical block is simply
  // empty until the candidate picks a role.
  const roleId = role?.id ?? 'general';
  const roleTitle = role?.title ?? 'your target role';
  const experiences = input.experiences ?? [];
  const projects = input.projects ?? [];
  const volunteering = input.volunteering ?? [];
  const training = input.completedTraining ?? [];
  const ownedSkills = input.ownedSkills ?? [];

  const primaryExperience = experiences[0];
  const primaryProject = projects[0];
  const primaryVolunteering = volunteering[0];
  const primaryTraining = training[0];

  const volunteerProject = primaryVolunteering
    ? firstNonEmpty(
        primaryVolunteering.achievements?.[0],
        primaryVolunteering.responsibilities?.[0]
      )
    : null;

  const experienceLabel = primaryExperience
    ? `${primaryExperience.role} at ${primaryExperience.company}`
    : null;
  const volunteeringLabel = primaryVolunteering
    ? `${primaryVolunteering.role} at ${primaryVolunteering.organization}`
    : null;
  const projectLabel = primaryProject?.title ?? null;
  const trainingLabel = primaryTraining
    ? `${primaryTraining.title}${primaryTraining.provider ? ` (${primaryTraining.provider})` : ''}`
    : null;

  const behavioural: Array<Omit<InterviewPlanQuestion, 'index' | 'stage'>> = [];

  behavioural.push({
    id: 'plan-beh-01',
    category: 'behavioral',
    roleTarget: roleId,
    question: `Walk me through your background and explain how it leads you to ${roleTitle}.`,
    context: experienceLabel
      ? `Personalised from your experience as ${experienceLabel}.`
      : 'A personal opening question that every candidate can answer.',
    recommendedFramework:
      'Present → Past → Future: who you are now, the evidence that prepared you, and why this role is the logical next step.',
    sampleKeyPoints: [
      experienceLabel
        ? `Use ${experienceLabel} as the anchor, not a list of every job`
        : 'Anchor the answer in your education, training or a project',
      'Name the two or three capabilities that transfer directly',
      `Connect them explicitly to ${roleTitle}`,
      'Close with what you want to build next',
    ],
    personalization: experienceLabel ?? trainingLabel ?? projectLabel ?? undefined,
  });

  if (primaryVolunteering) {
    behavioural.push({
      id: 'plan-beh-02',
      category: 'behavioral',
      roleTarget: roleId,
      question: `In your volunteer work as ${volunteeringLabel}, tell me about a specific problem you solved and the outcome you produced.`,
      context: `Personalised from your volunteering record${
        volunteerProject ? `: ${volunteerProject}` : ''
      }.`,
      recommendedFramework:
        'STAR: Situation (the organisation and constraint), Task (your responsibility), Action (what you personally did), Result (the outcome and what changed).',
      sampleKeyPoints: [
        `Be specific about your own contribution as ${primaryVolunteering.role}`,
        volunteerProject
          ? `Use the work around “${volunteerProject}” as concrete evidence`
          : 'Choose one real task rather than describing the whole organisation',
        'Explain the constraint or stakeholder pressure you were under',
        'State the measurable or observable result',
      ],
      personalization: volunteeringLabel ?? undefined,
    });
  }

  if (primaryProject) {
    behavioural.push({
      id: 'plan-beh-03',
      category: 'behavioral',
      roleTarget: roleId,
      question: `Tell me about ${projectLabel}. What problem did it solve, what did you build, and what was the hardest decision you made?`,
      context: `Personalised from your project “${projectLabel}”.`,
      recommendedFramework:
        'STAR with a decision point: problem, your ownership, the trade-off you chose, the result and what you would change.',
      sampleKeyPoints: [
        `State the user or business problem “${projectLabel}” addressed`,
        'Separate what you built from what the team built',
        'Name the hardest trade-off and why you chose as you did',
        'Give the outcome, even if it is a learning rather than a metric',
      ],
      personalization: projectLabel ?? undefined,
    });
  } else if (primaryExperience) {
    behavioural.push({
      id: 'plan-beh-03',
      category: 'behavioral',
      roleTarget: roleId,
      question: `At ${primaryExperience.company}, what is the piece of work you are proudest of, and why?`,
      context: `Personalised from your experience as ${experienceLabel}.`,
      recommendedFramework:
        'STAR: describe the task, the action you owned, the result, and the capability it proves for the target role.',
      sampleKeyPoints: [
        'Choose one piece of work and stay with it',
        'Show your personal contribution, not the team’s',
        'Explain why it mattered to the organisation',
        'Link the capability to the target role',
      ],
      personalization: experienceLabel ?? undefined,
    });
  } else {
    behavioural.push({
      id: 'plan-beh-03',
      category: 'behavioral',
      roleTarget: roleId,
      question: 'Tell me about a piece of work or study you are proudest of, and what it proves about how you work.',
      context: 'A personal evidence question for a candidate still building formal experience.',
      recommendedFramework:
        'STAR: the task, your action, the result, and the capability it demonstrates.',
      sampleKeyPoints: [
        'Choose one concrete piece of work',
        'Show your personal ownership',
        'Explain the outcome',
        'Connect it to the target role',
      ],
    });
  }

  if (primaryTraining) {
    behavioural.push({
      id: 'plan-beh-04',
      category: 'behavioral',
      roleTarget: roleId,
      question: `You completed ${trainingLabel}. How did you apply what you learned to a real task, and what changed in your work?`,
      context: `Personalised from your completed training: ${trainingLabel}.`,
      recommendedFramework:
        'Learning → Application → Result: the capability, the task you used it on, the outcome, and what you would do next.',
      sampleKeyPoints: [
        `Name the specific capability from ${primaryTraining.title}`,
        'Describe a real task where you used it',
        'Explain what you produced or improved',
        'Say what you would learn next',
      ],
      personalization: trainingLabel ?? undefined,
    });
  } else {
    behavioural.push({
      id: 'plan-beh-04',
      category: 'behavioral',
      roleTarget: roleId,
      question: 'Tell me about something you taught yourself because the work required it. How did you learn it and prove it worked?',
      context: 'Assesses learning velocity and evidence of self-directed growth.',
      recommendedFramework:
        'Context → Learning approach → Evidence → Result: what you needed, how you learned it, how you tested it, and what changed.',
      sampleKeyPoints: [
        'Name the gap and why it mattered',
        'Describe the learning method, not just the resource',
        'Show the evidence that you could apply it',
        'State the outcome',
      ],
    });
  }

  behavioural.push({
    id: 'plan-beh-05',
    category: 'behavioral',
    roleTarget: roleId,
    question:
      'Tell me about a time you disagreed with a colleague or manager about how work should be done. How did you handle it?',
    context: 'Tests cross-functional empathy, evidence-based persuasion and commit-and-deliver.',
    recommendedFramework:
      'STAR: shared goal, the evidence you brought, how you listened, the decision, and how you committed to it.',
    sampleKeyPoints: [
      'Focus on the shared outcome, not the personal conflict',
      'Show the evidence or worked example you used',
      'Name a concern you had not expected and how you responded',
      'Explain how you committed once the decision was made',
    ],
  });

  behavioural.push({
    id: 'plan-beh-06',
    category: 'behavioral',
    roleTarget: roleId,
    question: 'Tell me about a time something you owned went wrong. What did you do, and what did you change afterwards?',
    context: 'Assesses accountability, root-cause thinking and learning from failure.',
    recommendedFramework:
      'STAR: the situation, your ownership, the recovery action, the result, and the systemic change you made.',
    sampleKeyPoints: [
      'Own the mistake without blaming others',
      'Show how you contained the impact',
      'Explain the root cause rather than the symptom',
      'State the change that prevented a repeat',
    ],
  });

  behavioural.push({
    id: 'plan-beh-07',
    category: 'behavioral',
    roleTarget: roleId,
    question: 'When several priorities are urgent at once, how do you decide what to do first? Give me a real example.',
    context: 'Tests prioritisation, stakeholder management and delivery judgement.',
    recommendedFramework:
      'STAR plus the decision rule: the competing priorities, the criteria you used, who you consulted, what you did, and the result.',
    sampleKeyPoints: [
      'Name the competing priorities explicitly',
      'State the criteria: impact, deadline, dependency or risk',
      'Show how you communicated the trade-off',
      'Give the outcome and what you deliberately did not do',
    ],
  });

  behavioural.push({
    id: 'plan-beh-08',
    category: 'behavioral',
    roleTarget: roleId,
    question: `Why are you targeting ${roleTitle} now, and what is your plan for the first 12 months?`,
    context: 'Assesses career intentionality, self-awareness and growth planning.',
    recommendedFramework:
      'Past trajectory → catalyst → role alignment → a concrete 12-month learning and delivery plan.',
    sampleKeyPoints: [
      `Connect your evidence directly to ${roleTitle}`,
      'Explain the genuine motivation for this problem domain',
      'Name specific skills, projects or certifications you will build',
      'Say how you will know you are succeeding',
    ],
  });

  const technical: Array<Omit<InterviewPlanQuestion, 'index' | 'stage'>> = [];

  for (const question of (role ? buildRoleQuestions(role) : [])) {
    if (technical.length >= 5) break;
    technical.push(question);
  }

  const roleSkills = [
    ...new Set(
      [...(role?.requiredSkills ?? []), ...(role?.preferredSkills ?? [])]
        .map((skill) => skill.name)
        .filter(Boolean)
    ),
  ];
  const technicalSkills = roleSkills.filter(
    (skill) => !ownedSkills.some((owned) => owned.toLowerCase() === skill.toLowerCase())
  );
  const skillPool = technicalSkills.length > 0 ? technicalSkills : roleSkills;

  for (const skill of skillPool) {
    if (technical.length >= 7) break;
    if (technical.some((question) => question.question.includes(skill))) continue;
    technical.push({
      id: `plan-tech-skill-${technical.length + 1}`,
      category: 'technical',
      roleTarget: roleId,
      question: `How would you apply ${skill} in a real ${roleTitle} task? Walk me through your approach and the trade-offs.`,
      context: `A technical question drawn from the ${roleTitle} competency profile.`,
      recommendedFramework:
        'Principle → Application → Trade-off → Evidence: state the principle, show how you would apply it, name the risk, then give a concrete example.',
      sampleKeyPoints: [
        `Show that you understand what ${skill} means in ${roleTitle} work`,
        'Ground the answer in something you have actually done or studied',
        'Name the trade-off or risk you would watch for',
        'Close with the outcome you would be accountable for',
      ],
    });
  }

  const genericTechnical: Array<Omit<InterviewPlanQuestion, 'index' | 'stage'>> = [
    {
      id: 'plan-tech-90',
      category: 'technical',
      roleTarget: roleId,
      question: `How would you measure success in your first 90 days as a ${roleTitle}?`,
      context: 'Tests outcome thinking, role understanding and prioritisation.',
      recommendedFramework:
        'Learn → Contribute → Own: what you would learn first, what you would deliver, and the metric you would be accountable for.',
      sampleKeyPoints: [
        'Separate learning goals from delivery goals',
        'Name a metric or observable outcome',
        'Show how you would prioritise the first contribution',
        'Explain how you would check your understanding with stakeholders',
      ],
    },
    {
      id: 'plan-tech-91',
      category: 'technical',
      roleTarget: roleId,
      question: `Describe a difficult trade-off you would expect in ${roleTitle} work and how you would decide.`,
      context: 'Tests professional judgement and the ability to reason under constraints.',
      recommendedFramework:
        'Frame the trade-off, name the constraints, state the decision criteria, then give a recommendation and the risk you accept.',
      sampleKeyPoints: [
        'Name two legitimate options, not a right answer and a wrong one',
        'State the constraints that actually decide it',
        'Explain who should be involved in the decision',
        'Give a recommendation and the risk you are accepting',
      ],
    },
    {
      id: 'plan-tech-92',
      category: 'technical',
      roleTarget: roleId,
      question: `How do you keep your ${roleTitle} knowledge current, and how do you decide what is worth learning?`,
      context: 'Tests learning strategy, judgement about sources and professional growth.',
      recommendedFramework:
        'Sources → Filter → Practice → Evidence: where you learn, how you judge quality, how you practise, and how you prove it.',
      sampleKeyPoints: [
        'Name specific sources you actually use',
        'Explain how you judge whether a source is credible',
        'Show how you turn reading into practice',
        'Give an example of something you learned and applied',
      ],
    },
  ];

  for (const question of genericTechnical) {
    if (technical.length >= 7) break;
    technical.push(question);
  }

  const plan: InterviewPlanQuestion[] = [
    ...behavioural.slice(0, 8).map((question, index) => ({
      ...question,
      index,
      stage: 'behavioral' as const,
    })),
    ...technical.slice(0, 7).map((question, index) => ({
      ...question,
      index: 8 + index,
      stage: 'technical' as const,
    })),
  ];

  return plan.slice(0, INTERVIEW_QUESTION_COUNT);
}

