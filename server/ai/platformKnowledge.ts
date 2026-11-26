/**
 * The Aionvia knowledge base.
 *
 * The assistant used to know nothing about the product it lives in. Asked what a
 * token costs, how many CV templates a candidate gets, or which page holds the
 * ATS audit, the model could only generalise — and a generalised product claim
 * is a fabricated one.
 *
 * Every fact below is copied from the code that implements it and names the file
 * it came from. Nothing is inferred, nothing is aspirational, and nothing that
 * changes often (prices, live catalogue contents) is stated as a number: the
 * entry says where the number lives instead. If a fact cannot be proven from the
 * repository, it does not belong in this file.
 *
 * The entries are retrieved per request, not pasted wholesale: the engine asks
 * for the entries that belong to the feature making the call and for the ones the
 * question mentions, so a CV rewrite does not pay for the roadmap's description.
 */

import type { AiLanguageCode } from '../../shared/aiLanguages.ts';

/** The areas a knowledge entry can be attached to. */
export type KnowledgeTag =
  | 'general'
  | 'copilot'
  | 'cv'
  | 'ats'
  | 'jobs'
  | 'learning'
  | 'roadmap'
  | 'interview'
  | 'projects'
  | 'evidence'
  | 'account';

export interface KnowledgeEntry {
  /** Stable id, used by tests and by the engine's diagnostics. */
  id: string;
  /** The heading the model sees. */
  title: string;
  /** Verified facts, one per line. */
  facts: string[];
  /** The features that always receive this entry. */
  tags: KnowledgeTag[];
  /** Words that pull this entry in when the question mentions them. */
  keywords: string[];
  /** Where the fact is proved, for the maintainer — never sent to the model. */
  source: string;
}

export const PLATFORM_KNOWLEDGE: readonly KnowledgeEntry[] = [
  {
    id: 'what-is-aionvia',
    title: 'What Aionvia is',
    facts: [
      'Aionvia is a career development platform for students, graduates and early-career professionals.',
      'It turns an ambition into a recorded plan: a target role, a skills profile, a roadmap, learning, projects, a CV and job applications.',
      'It is not a job board and not a recruiter. It does not submit applications, contact employers or attend interviews on the candidate\'s behalf.',
      'The product covers every professional domain (engineering, data, design, product, business, finance, marketing, sales, HR, healthcare, education, legal and more), not only software.',
    ],
    tags: ['general', 'copilot'],
    keywords: ['aionvia', 'what is', 'platform', 'what can you do', 'about'],
    source: 'README.md, src/components/layout/AppShell.tsx (navGroups), shared/careerRoles.ts',
  },
  {
    id: 'navigation',
    title: 'Where everything lives',
    facts: [
      'My Career is the overview: the journey banner, the career timeline and what is blocking progress.',
      'Learn & Practise holds Learning Hub, Experience Hub, Assessments, Projects and Opportunities (volunteering, internships and training).',
      'Get Hired holds CV Studio, Jobs and Applications.',
      'Portfolio holds My Documents; Insights holds Progress, Job Discovery, Evidence and Recent Activity.',
      'Account holds My Profile and Settings. Staff accounts additionally see an Admin Center.',
    ],
    tags: ['general', 'copilot'],
    keywords: ['where', 'page', 'find', 'navigate', 'menu', 'sidebar', 'screen', 'tab'],
    source: 'src/components/layout/AppShell.tsx',
  },
  {
    id: 'tokens',
    title: 'Tokens (AI credits) and what costs one',
    facts: [
      'The interface calls them tokens; the ledger calls them credits. They are the same thing.',
      'Exactly four actions cost tokens: the deep ATS audit of a CV (1), rewriting a CV for a job description (1), project analysis or generated project ideas (1), and unlocking one premium CV template (5).',
      'Everything else is free: the Copilot chat, the career analysis, mock-interview feedback, cover letters, inline CV writing, job-description reading, learning explanations, roadmap generation and the standard CV studio.',
      'A new account receives five one-time trial tokens. Each day an account can claim a small free allowance, once per Africa/Cairo calendar day; unused daily tokens do not accumulate.',
      'Token packs are sold once each, as a one-off purchase. A subscription also grants a monthly allocation.',
      'The assistant must never state a price or a balance that was not given to it. Balances are shown on the Credits screen and prices on the Plans screen.',
    ],
    tags: ['general', 'copilot', 'account'],
    keywords: ['token', 'credit', 'cost', 'price', 'pay', 'free', 'charge', 'billing', 'subscription', 'plan'],
    source: 'shared/credits.ts (CREDIT_WEIGHTS, CREDIT_PACKS), supabase/migrations/20261110000003_verifications_and_ai_credits.sql',
  },
  {
    id: 'plans',
    title: 'Plans',
    facts: [
      'Four plans exist: free, student, pro and career_plus. Their published names are Free Explorer, Student & Early Career, Professional and Career Plus.',
      'Their monthly token allocations are 0, 15, 40 and 85 respectively; the free plan relies on the five one-time trial tokens and the daily claim.',
      'The annual price is ten monthly payments, so a year costs the same as ten months: two months free.',
      'An annual plan grants twelve months of access, and its tokens arrive once per month of those twelve — never twelve months of tokens at once.',
      'Plan names, descriptions, prices and token allowances are held in the subscription plans table and displayed on the Plans screen; the assistant quotes the screen, never a remembered number.',
      'A subscription is billed in Egyptian pounds through XPay, once per period. Recurring billing is not enabled, so a plan does not renew itself; the candidate renews deliberately and is shown the expiration date.',
    ],
    tags: ['account', 'general'],
    keywords: ['plan', 'subscription', 'upgrade', 'free', 'student', 'pro', 'career plus', 'price'],
    source: 'supabase/migrations/20261202000001_pricing_restructure_and_xpay_subscriptions.sql',
  },
  {
    id: 'cv-studio',
    title: 'CV Studio',
    facts: [
      'CV Studio is a five-step workflow: My CV, Import and review, Analyze, Improve, Export.',
      'It holds several CV versions, an inline AI writer, a job-description matcher that rewrites the CV for one posting (1 token), a deep ATS audit (1 token) and export to DOCX and PDF.',
      'Import accepts a pasted or uploaded CV and extracts it into the structured editor; the candidate reviews every extracted field before it is saved.',
      'The layout control (order, visibility and sidebar placement of sections) lives in the editing column, under "Arrange the sections".',
      'The ATS audit scores keyword match, impact and metrics, formatting and experience relevance, and suggests improvements. A suggestion is only kept if the wording is backed by the candidate\'s own record.',
    ],
    tags: ['cv', 'ats', 'copilot'],
    keywords: ['cv', 'resume', 'ats', 'template', 'import', 'export', 'docx', 'pdf', 'cover letter', 'layout'],
    source: 'src/components/views/CVStudioView.tsx, server/cv/*, tests/cv-studio.test.ts',
  },
  {
    id: 'jobs',
    title: 'Jobs and Applications',
    facts: [
      'Jobs shows a feed of openings, saved roles and an external search entry to LinkedIn and Wonderin.ai. External results are opened on the partner site; Aionvia does not apply for the candidate.',
      'Applications is the tracker: each application records its status, its dates and the notes the candidate adds.',
      'Match scores are computed from the job\'s recorded requirements and the candidate\'s verified skills and experience.',
    ],
    tags: ['jobs', 'copilot'],
    keywords: ['job', 'vacancy', 'apply', 'linkedin', 'application', 'employer', 'match', 'salary'],
    source: 'src/components/views/JobsView.tsx, src/components/views/ApplicationsView.tsx, server/jobs/*',
  },
  {
    id: 'learning',
    title: 'Learning Hub',
    facts: [
      'Learning Hub recommends courses from a real catalogue stored in the database. Every card is a catalogue entry with a working link.',
      'Ranking is deterministic: it is driven by the candidate\'s skill gaps, roadmap and weekly study hours and budget. The model may only explain a course that the ranking already selected.',
      'Filters cover weekly hours, budget (free only or paid), format and level. A recommendation that does not fit the chosen budget is not shown as the next step.',
      'The assistant must never invent a course, provider, certificate or URL. If the catalogue has nothing that fits, it says so.',
    ],
    tags: ['learning', 'copilot', 'roadmap'],
    keywords: ['course', 'learn', 'certificate', 'study', 'training', 'recommendation'],
    source: 'server/learning/recommendation.ts, server/learning/ai.ts, src/components/views/LearningCenterView.tsx',
  },
  {
    id: 'roadmap',
    title: 'Roadmap',
    facts: [
      'A roadmap is generated for the chosen target role and is stored as phases, milestones and tasks.',
      'It has two views: an interactive tree and guided stages. Tasks can be completed, skipped or reopened, and the Progress screen reads the same records.',
      'Roadmap generation is deterministic and free; no token is charged for it.',
    ],
    tags: ['roadmap', 'copilot', 'learning'],
    keywords: ['roadmap', 'plan', 'phase', 'milestone', 'task', 'step'],
    source: 'server/db/roadmap.ts, server/roadmap/service.ts, src/components/views/RoadmapView.tsx',
  },
  {
    id: 'interviews',
    title: 'Interview practice',
    facts: [
      'Interviews offers written mock questions with AI feedback and a live spoken interview that runs in the selected language and role.',
      'Both are free. A live session is stored with its transcript so the candidate can read it again.',
      'Feedback assesses the candidate\'s answer against the role and the question — never the interviewer\'s own script.',
    ],
    tags: ['interview', 'copilot'],
    keywords: ['interview', 'mock', 'practice', 'question', 'answer', 'voice', 'live'],
    source: 'server/interviews/live.ts, src/components/views/InterviewsView.tsx, supabase/migrations/20261129000001_live_interview_sessions.sql',
  },
  {
    id: 'projects',
    title: 'Projects, Experience Hub and Opportunities',
    facts: [
      'Projects is the portfolio: recorded projects, the evidence attached to them and an AI review that scores a project against the target role (1 token).',
      'Experience Hub records work, volunteering, courses and other experience that is not a formal job.',
      'Opportunities lists volunteering, internships and training from the platform\'s own catalogue, split into a jobs pillar and an opportunities pillar.',
    ],
    tags: ['projects', 'copilot'],
    keywords: ['project', 'portfolio', 'volunteer', 'internship', 'opportunity', 'experience'],
    source: 'server/projects/*, server/db/volunteerOpportunities.ts, supabase/migrations/20261125000001_opportunity_pillar_split.sql',
  },
  {
    id: 'evidence',
    title: 'Skills, Assessments and Evidence',
    facts: [
      'A skill can be self-rated, assessed by a platform assessment, and backed by evidence records.',
      'Evidence has a verification lifecycle (pending, verified, rejected); only verified evidence is presented as proof to an employer.',
      'The assistant must never upgrade a self-rating into a verified claim.',
    ],
    tags: ['evidence', 'copilot'],
    keywords: ['skill', 'evidence', 'assessment', 'verified', 'proficiency', 'level'],
    source: 'server/db/skillEvidence.ts, supabase/migrations/20261115145906_evidence_verification_lifecycle.sql',
  },
  {
    id: 'privacy',
    title: 'Privacy and what the assistant can see',
    facts: [
      'The assistant reads only the signed-in candidate\'s own records, on the server, for the verified session.',
      'It cannot open another candidate\'s profile, CV or messages, and it must refuse any request to do so.',
      'It cannot change a record on its own: proposed actions are shown for confirmation first.',
      'Candidates can switch off AI recommendations and AI grounding in Settings; while they are off, the assistant declines instead of reading the profile.',
    ],
    tags: ['general', 'copilot', 'account'],
    keywords: ['privacy', 'data', 'delete', 'other user', 'access', 'permission', 'security'],
    source: 'server/auth/require-auth.ts, src/context/CareerContext.tsx (sendCopilotMessage), src/components/views/SettingsView.tsx',
  },
  {
    id: 'languages',
    title: 'Languages and formatting',
    facts: [
      'The interface is available in English and Arabic.',
      'The assistant answers in the response language the candidate selected: English, Arabic (Modern Standard Arabic), French, German or Spanish.',
      'The answer language is independent of the interface language and of the language the question was typed in.',
      'Answers are plain text with simple lists; the interface does not render markdown headings, tables or bold markers.',
    ],
    tags: ['general', 'copilot'],
    keywords: ['language', 'arabic', 'english', 'french', 'translate', 'format', 'markdown'],
    source: 'shared/aiLanguages.ts, src/translations/*',
  },
  {
    id: 'limits',
    title: 'What the assistant cannot do',
    facts: [
      'It cannot guarantee an interview, an offer or a salary.',
      'It cannot see live job postings that are not in the feed, or a company\'s internal hiring criteria.',
      'It cannot verify a certificate it was not shown, and it cannot create one.',
      'It does not have internet access: it can only quote links that are in the records it was given.',
      'When the required information is missing it says what is missing rather than estimating.',
    ],
    tags: ['general', 'copilot'],
    keywords: ['can you', 'guarantee', 'salary', 'internet', 'browse', 'predict'],
    source: 'server/ai/grounding.ts, server/ai/provider.ts',
  },
];

/** The response languages the engine can ask for. Re-exported for callers. */
export type { AiLanguageCode };

const BY_ID = new Map(PLATFORM_KNOWLEDGE.map((entry) => [entry.id, entry]));

/** Every entry, by id. Exported so tests can assert the catalogue is complete. */
export function knowledgeEntry(id: string): KnowledgeEntry | undefined {
  return BY_ID.get(id);
}

export interface KnowledgeSelection {
  /** The entries chosen for this request, in the order they will be rendered. */
  entries: KnowledgeEntry[];
  /** Ids of the entries that were considered and dropped, for diagnostics. */
  dropped: string[];
}

/** Words too common to say anything about which entry is relevant. */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are', 'was', 'were',
  'be', 'been', 'do', 'does', 'did', 'how', 'what', 'when', 'where', 'which', 'who', 'why', 'can',
  'could', 'should', 'would', 'i', 'me', 'my', 'you', 'your', 'it', 'this', 'that', 'please', 'tell',
]);

/** Splits a question into the words that could match a keyword. */
export function knowledgeTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((term) => term.replace(/^\.+|\.+$/g, ''))
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
}

/**
 * Chooses the entries for one request.
 *
 * An entry is always included when it is tagged with the feature — a CV task
 * always needs to know what CV Studio does. The remaining slots are filled by
 * keyword overlap with the question, best match first, so a question about
 * tokens pulls the token entry even from the roadmap screen.
 *
 * `limit` bounds the block: knowledge is a prompt cost, and a request that needs
 * three entries must not pay for thirteen.
 */
export function selectPlatformKnowledge(options: {
  feature: KnowledgeTag | readonly KnowledgeTag[];
  query?: string;
  limit?: number;
}): KnowledgeSelection {
  const features = Array.isArray(options.feature) ? options.feature : [options.feature];
  const limit = Math.max(1, Math.floor(options.limit ?? 4));
  const terms = knowledgeTerms(options.query ?? '');
  const termSet = new Set(terms);

  const scored = PLATFORM_KNOWLEDGE.map((entry, index) => {
    const tagged = entry.tags.some((tag) => features.includes(tag));
    let score = tagged ? 100 : 0;
    for (const keyword of entry.keywords) {
      const key = keyword.toLowerCase();
      if (termSet.has(key)) score += 6;
      else if (key.includes(' ') && (options.query ?? '').toLowerCase().includes(key)) score += 5;
      else if (terms.some((term) => term.length >= 4 && key.includes(term))) score += 2;
    }
    // `general` entries are the product's identity; they break ties rather than
    // outrank a feature-specific match.
    if (entry.tags.includes('general')) score += 1;
    return { entry, index, score, tagged };
  });

  const chosen = scored
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    // Render in catalogue order, so the prompt reads as a document rather than
    // as a relevance ranking.
    .sort((a, b) => a.index - b.index)
    .map((candidate) => candidate.entry);

  const chosenIds = new Set(chosen.map((entry) => entry.id));
  return {
    entries: chosen,
    dropped: PLATFORM_KNOWLEDGE.filter((entry) => !chosenIds.has(entry.id)).map((entry) => entry.id),
  };
}

/** Renders the selected entries as the block the model reads. */
export function renderPlatformKnowledge(entries: readonly KnowledgeEntry[]): string {
  if (entries.length === 0) return '';
  const blocks = entries.map((entry) => {
    const facts = entry.facts.map((fact) => `- ${fact}`).join('\n');
    return `${entry.title}:\n${facts}`;
  });
  return [
    'VERIFIED FACTS ABOUT AIONVIA (the platform you are part of).',
    'These facts come from the product itself. Prefer them over anything you may know generally, and never contradict them.',
    blocks.join('\n\n'),
  ].join('\n');
}

/** The ids of every entry, in catalogue order. Used by the completeness test. */
export const KNOWLEDGE_IDS: readonly string[] = PLATFORM_KNOWLEDGE.map((entry) => entry.id);
