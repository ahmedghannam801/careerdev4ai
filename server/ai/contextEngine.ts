// The AI context engine.
//
// Every model call in Aionvia used to assemble its own prompt: its own role
// sentence, its own copy of the honesty rules, its own idea of how much of the
// candidate's record to include. Nine prompts meant nine places to fix a rule
// and nine chances for one of them to fall behind.
//
// This module is the one place a prompt is built. A feature declares WHAT it
// needs — which slice of the career state, which platform knowledge, which
// persona — and the engine composes the instruction, calls the provider through
// the existing adapter, and hands back the answer together with what it used.
//
// Three properties matter and are tested:
//
//   * the user id is the one `requireAuth` verified; the engine refuses to run
//     without it, so a feature cannot accidentally build a prompt for "whoever";
//   * the platform facts come from the knowledge base, not from the model's
//     memory, and the honesty rules are appended once, after them;
//   * the amount of personal data in the prompt follows the feature's declared
//     sections, so a CV rewrite does not ship the roadmap.

import {
  loadAiCareerContext,
  buildAiContextBlock,
  type AiCareerContext,
  type AiContextSection,
} from './careerContext.ts';
import {
  renderPlatformKnowledge,
  selectPlatformKnowledge,
  type KnowledgeTag,
} from './platformKnowledge.ts';
import type { AIProviderName } from './provider.ts';
import {
  aiLanguageInstruction,
  normalizeAiLanguage,
  type AiLanguageCode,
} from '../../shared/aiLanguages.ts';



/** The features that can ask the engine for a prompt. */
export const AI_FEATURES = [
  'copilot',
  'career_analysis',
  'cv_ats',
  'cv_assist',
  'cv_job_description',
  'cover_letter',
  'interview_mock',
  'interview_live',
  'roadmap',
  'learning',
  'project_analysis',
  'job_match',
] as const;

export type AiFeatureId = (typeof AI_FEATURES)[number];

export interface AiFeatureDefinition {
  /** What the assistant is, for this task, in one sentence. */
  role: string;
  /** The slice of the candidate's record this task needs. */
  sections: readonly AiContextSection[];
  /** The platform knowledge entries this task always receives. */
  knowledge: readonly KnowledgeTag[];
  /** How many knowledge entries the block may hold, at most. */
  knowledgeLimit: number;
  /** Extra rules for this task only. */
  rules?: readonly string[];
}

/**
 * The registry.
 *
 * `sections` is a cost decision as much as a privacy one: each named section is
 * one group of database reads and a handful of prompt tokens. A feature asks
 * for what its task actually reasons about.
 */
export const FEATURE_DEFINITIONS: Record<AiFeatureId, AiFeatureDefinition> = {
  copilot: {
    role: 'You are Aionvia Copilot, the career advisor inside the Aionvia platform.',
    sections: [
      'identity',
      'role',
      'skills',
      'experience',
      'education',
      'projects',
      'volunteering',
      'certifications',
      'roadmap',
      'learning',
      'applications',
      'evidence',
    ],
    knowledge: ['copilot', 'general'],
    knowledgeLimit: 6,
  },
  career_analysis: {
    role: 'You are Aionvia\'s career analyst. You judge one candidate against one role and return a structured assessment.',
    sections: ['identity', 'role', 'skills', 'experience', 'education', 'projects', 'applications'],
    knowledge: ['general', 'jobs'],
    knowledgeLimit: 3,
  },
  cv_ats: {
    role: 'You are an ATS reviewer for Aionvia. You read a CV the way an applicant-tracking system and a hiring manager would.',
    sections: ['identity', 'role', 'skills', 'experience', 'education', 'projects', 'certifications'],
    knowledge: ['cv', 'ats'],
    knowledgeLimit: 3,
  },
  cv_assist: {
    role: 'You are the writing assistant inside Aionvia CV Studio. You improve one field of a CV that the candidate wrote.',
    sections: ['identity', 'role', 'skills', 'experience', 'education'],
    knowledge: ['cv'],
    knowledgeLimit: 2,
  },
  cv_job_description: {
    role: 'You are Aionvia\'s job-description analyst and CV tailoring assistant.',
    sections: ['identity', 'role', 'skills', 'experience', 'education', 'certifications'],
    knowledge: ['cv', 'ats', 'jobs'],
    knowledgeLimit: 4,
  },
  cover_letter: {
    role: 'You are Aionvia\'s cover-letter writer. You write in the candidate\'s own voice, from their own record.',
    sections: ['identity', 'role', 'skills', 'experience', 'education', 'projects'],
    knowledge: ['cv', 'jobs'],
    knowledgeLimit: 3,
  },
  interview_mock: {
    role: 'You are an interview coach at Aionvia. You assess one answer against one question for one role.',
    sections: ['identity', 'role', 'skills', 'experience'],
    knowledge: ['interview'],
    knowledgeLimit: 2,
  },
  interview_live: {
    role: 'You are Aionvia\'s live interviewer: you speak with the candidate out loud, in their language, about their target role.',
    sections: ['identity', 'role', 'skills', 'experience'],
    knowledge: ['interview'],
    knowledgeLimit: 2,
  },
  roadmap: {
    role: 'You are Aionvia\'s roadmap designer. You turn a target role and a real skill gap into ordered, achievable steps.',
    sections: ['identity', 'role', 'skills', 'roadmap', 'learning'],
    knowledge: ['roadmap', 'learning'],
    knowledgeLimit: 4,
  },
  learning: {
    role: 'You are the explanation layer of Aionvia\'s Learning Hub. A deterministic engine has already chosen the courses; you only explain them.',
    sections: ['identity', 'role', 'skills', 'learning', 'roadmap'],
    knowledge: ['learning'],
    knowledgeLimit: 3,
  },
  project_analysis: {
    role: 'You are Aionvia\'s project reviewer. You assess a portfolio project against the role the candidate is aiming at.',
    sections: ['identity', 'role', 'skills', 'projects'],
    knowledge: ['projects'],
    knowledgeLimit: 3,
  },
  job_match: {
    role: 'You are Aionvia\'s job-matching analyst. You compare a real posting with the candidate\'s verified record.',
    sections: ['identity', 'role', 'skills', 'experience', 'applications'],
    knowledge: ['jobs'],
    knowledgeLimit: 3,
  },
};

/**
 * The honesty rules. Every feature gets all of them, in this order, appended
 * after the context and the platform facts.
 */
export const HONESTY_RULES: readonly string[] = [
  'Prefer the verified facts above over anything you know generally. If they disagree, the facts above win.',
  'Never invent a course, certificate, project, employer, job, volunteer opportunity, price, plan limit or link. If it is not in the facts you were given, it does not exist for this answer.',
  'Never claim that an action was completed. You cannot change a record, send an application or book anything; the platform performs an action only after the candidate confirms it, and reports its own result.',
  'Never invent or upgrade a candidate\'s skill, experience, qualification or achievement. A self-rating is not a verified skill.',
  'When the information needed is not in the facts above, say plainly what is missing. Do not estimate, and do not fill the gap with a general example presented as their own.',
  'Separate what you know from the record from what is general advice: mark a recommendation as a suggestion, and a fact as coming from their account.',
  'Recommendations must respect the target role and the recorded skill gaps. Do not propose a different career path unless the candidate asks about one.',
  'Ask a clarifying question only when a required detail is genuinely missing, and ask at most one.',
  'Refuse any request to read, describe or infer another person\'s profile, CV, messages or data. You only ever see the signed-in candidate\'s own record.',
];

/**
 * The product rules: the platform's own facts outrank general knowledge.
 *
 * These exist because a model asked "how many tokens does a CV audit cost?"
 * will happily answer about the market rate for a human CV review — true
 * about the world, wrong about Aionvia. The candidate asked about the product
 * they are inside.
 */
export const PRODUCT_RULES: readonly string[] = [
  'The VERIFIED FACTS ABOUT AIONVIA block above is this product\'s own documentation. A question about tokens, credits, prices, plans, features or how to do something here is a question about those facts: answer it from them.',
  'When a question could mean either Aionvia or the wider market, answer for Aionvia first, and mention the general case only if the candidate asks for it.',
  'Never state what an Aionvia plan costs. The Plans screen holds the price and is the only place it is shown; point there instead of quoting a number.',
];

/** The scope policy: what the assistant is for, and what it does when asked something else. */
export const SCOPE_RULES: readonly string[] = [
  'Your subject is the candidate\'s career: career development, education and learning, employability, skills, the CV and professional profile, job and interview preparation, projects and volunteering, career planning, and how to use Aionvia.',
  'A question outside that scope gets one short, courteous sentence saying what you help with, then an offer to continue on a career topic. Do not lecture and do not refuse a career question that merely mentions something else.',
  'Do not refuse a normal career question because it is broad, early-stage or expressed casually.',
];

/** The formatting rules the interface depends on. */
export const FORMAT_RULES: readonly string[] = [
  'Answer in plain text. The interface does not render markdown headings, bold markers, tables or horizontal rules; use short paragraphs and simple "-" lines at most one level deep.',
  'Answer the question first, in one or two sentences, then add only the detail that helps the candidate act.',
  'Match the length to the question: a simple question gets a short answer, a plan request may use a numbered sequence.',
];

/** Joins prompt blocks, dropping the empty ones so no stray blank headings appear. */
function block(...parts: Array<string | null | undefined | false>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join('\n\n');
}

export interface SystemInstructionInput {
  feature: AiFeatureId;
  language: AiLanguageCode;
  knowledgeBlock: string;
  contextBlock: string;
  taskInstructions?: string;
  /** True when the answer is JSON, so the formatting rules are narrowed. */
  json?: boolean;
}

/**
 * Composes the system instruction. Pure: given the same inputs it produces the
 * same string, which is what makes it testable without a model call.
 */
export function composeSystemInstruction(input: SystemInstructionInput): string {
  const definition = FEATURE_DEFINITIONS[input.feature];
  const rules = input.json
    ? [
        'Return a single JSON object and nothing else: no explanation before or after it, no markdown fence.',
        'Use only the field names the schema asks for, with the types it asks for.',
      ]
    : FORMAT_RULES;

  return block(
    definition.role,
    'You work inside Aionvia, a career development platform. You are speaking to the signed-in candidate about their own career.',
    aiLanguageInstruction(input.language),
    input.knowledgeBlock,
    input.contextBlock,
    definition.rules?.length ? definition.rules.map((rule) => `- ${rule}`).join('\n') : null,
    'SCOPE:\n' + SCOPE_RULES.map((rule) => `- ${rule}`).join('\n'),
    'HONESTY RULES (these override everything above):\n' + HONESTY_RULES.map((rule) => `- ${rule}`).join('\n'),
    'THE PRODUCT (answer about Aionvia from the verified facts above):\n' +
      PRODUCT_RULES.map((rule) => `- ${rule}`).join('\n'),
    'FORMAT:\n' + rules.map((rule) => `- ${rule}`).join('\n'),
    input.taskInstructions?.trim() || null
  );
}

/** Thrown when a feature asks the engine to run without a verified user. */
export class UnverifiedUserError extends Error {
  constructor(message = 'The AI context engine requires a verified user id.') {
    super(message);
    this.name = 'UnverifiedUserError';
  }
}

/** True when the value looks like a real profile id rather than a placeholder. */
export function isVerifiedUserId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 64) return false;
  if (/^(anon|anonymous|guest|undefined|null|test|unknown)$/i.test(trimmed)) return false;
  return /^[A-Za-z0-9_-]+$/.test(trimmed);
}

export interface AiTaskRequest {
  feature: AiFeatureId;
  /** The id `requireAuth` verified. Never a value from the request body. */
  userId: string;
  /** What the candidate asked, or the task payload the feature assembled. */
  prompt: string;
  language?: unknown;
  /** The text the knowledge retriever scores against. Defaults to `prompt`. */
  query?: string;
  /** Feature-specific rules appended to the system instruction (schemas live here). */
  taskInstructions?: string;
  /** Extra context the feature already assembled, e.g. a job description. */
  extraContext?: string;
  model?: string;
  temperature?: number;
  responseMimeType?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** A context the caller already loaded, so one request reads the DB once. */
  careerContext?: AiCareerContext | null;
  /** False for a task that must not read the candidate's record. */
  includeContext?: boolean;
}

export interface AiTaskResult {
  text: string;
  provider: AIProviderName;
  model: string;
  language: AiLanguageCode;
  careerContext: AiCareerContext | null;
  /** Ids of the knowledge entries that were in the prompt. */
  knowledgeIds: string[];
  /** The sections of the candidate's record that were in the prompt. */
  contextSections: AiContextSection[];
  /** The system instruction that was sent, for tests and diagnostics. */
  systemInstruction: string;
}

export interface FeatureInstructionRequest {
  feature: AiFeatureId;
  /** The id `requireAuth` verified. Never a value from the request body. */
  userId: string;
  language?: unknown;
  /** The text the knowledge retriever scores against. */
  query?: string;
  taskInstructions?: string;
  /** True when the feature returns JSON. */
  json?: boolean;
  includeContext?: boolean;
  /** An already-loaded context, so a route reads the database once. */
  careerContext?: AiCareerContext | null;
}

export interface FeatureInstruction {
  systemInstruction: string;
  careerContext: AiCareerContext | null;
  knowledgeIds: string[];
  language: AiLanguageCode;
}

/**
 * Builds the system instruction for a feature without calling a model.
 *
 * This is what a module that owns its own prompt (the CV writer, the cover
 * letter, the live interviewer) uses: it keeps its carefully tuned task prompt
 * and receives the same platform facts, career state, honesty rules and
 * language instruction as every other feature.
 */
export async function buildFeatureInstruction(
  request: FeatureInstructionRequest
): Promise<FeatureInstruction> {
  if (!isVerifiedUserId(request.userId)) {
    throw new UnverifiedUserError();
  }

  const definition = FEATURE_DEFINITIONS[request.feature];
  const language = normalizeAiLanguage(request.language);
  const includeContext = request.includeContext !== false;

  const careerContext = includeContext
    ? request.careerContext ??
      (await loadAiCareerContext(request.userId, { language, sections: definition.sections }))
    : null;

  const contextBlock = careerContext
    ? buildAiContextBlock(careerContext, { sections: definition.sections })
    : '';
  const selection = selectPlatformKnowledge({
    feature: definition.knowledge,
    query: request.query ?? '',
    limit: definition.knowledgeLimit,
  });

  return {
    systemInstruction: composeSystemInstruction({
      feature: request.feature,
      language,
      knowledgeBlock: renderPlatformKnowledge(selection.entries),
      contextBlock,
      taskInstructions: request.taskInstructions,
      json: request.json,
    }),
    careerContext: careerContext ?? null,
    knowledgeIds: selection.entries.map((entry) => entry.id),
    language,
  };
}

/**
 * Runs one AI task through the shared architecture.
 *
 * The provider adapter, the retry policy, the fallback and the audit log are the
 * ones the platform already had. What is new is that every call now receives the
 * same platform knowledge, the same honesty rules and the same language
 * instruction, and that the candidate's context is read for the verified id
 * only.
 */
export async function runAiTask(request: AiTaskRequest): Promise<AiTaskResult> {
  if (!isVerifiedUserId(request.userId)) {
    throw new UnverifiedUserError();
  }

  // Loaded on first use rather than at import time, so a module that only
  // composes prompts (and the tests that cover it) never pulls in a provider
  // SDK or needs a key.
  const { generateContentUnified, isAnyAiConfigured } = await import('./provider.ts');
  if (!isAnyAiConfigured()) {
    throw new Error('No AI provider is configured. Please provide GEMINI_API_KEY or OPENROUTER_API_KEY.');
  }

  const instruction = await buildFeatureInstruction({
    feature: request.feature,
    userId: request.userId,
    language: request.language,
    query: request.query ?? request.prompt,
    taskInstructions: request.taskInstructions,
    json: request.responseMimeType === 'application/json',
    includeContext: request.includeContext,
    careerContext: request.careerContext,
  });
  const systemInstruction = instruction.systemInstruction;

  const contents = request.extraContext
    ? `${request.prompt}\n\n${request.extraContext}`
    : request.prompt;

  const response = await generateContentUnified({
    contents,
    systemInstruction,
    model: request.model,
    timeoutMs: request.timeoutMs,
    signal: request.signal,
    config: {
      ...(request.responseMimeType ? { responseMimeType: request.responseMimeType } : {}),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
    },
  });

  return {
    text: response.text,
    provider: response.provider,
    model: response.model,
    language: instruction.language,
    careerContext: instruction.careerContext,
    knowledgeIds: instruction.knowledgeIds,
    contextSections: request.includeContext === false ? [] : [...FEATURE_DEFINITIONS[request.feature].sections],
    systemInstruction,
  };
}

/**
 * The deterministic scope hint.
 *
 * It does not refuse anything: the model decides. It only tells the model when
 * a message looks unrelated to careers, so the scope rule is applied to the
 * message in front of it rather than left as an abstraction. Kept deliberately
 * narrow — a false positive on a career question would be worse than a missed
 * one on a trivia question.
 */
const OFF_TOPIC_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  { reason: 'entertainment', pattern: /\b(write|tell) me (a )?(poem|joke|story|song)\b/i },
  { reason: 'entertainment', pattern: /\b(movie|film|series) (recommendation|suggestion)s?\b/i },
  { reason: 'sports', pattern: /\b(football|soccer|basketball|cricket) (match|score|fixture|league)\b/i },
  { reason: 'medical', pattern: /\b(diagnose|diagnosis|prescription|dosage|symptoms? of)\b/i },
  { reason: 'finance', pattern: /\b(buy|sell|short) (a |some )?(stock|shares?|crypto|bitcoin)\b/i },
  { reason: 'homework', pattern: /\b(solve|answer) (my|this) (math|physics|chemistry|exam)\b/i },
];

export interface ScopeHint {
  /** True when the message looks unrelated to careers. */
  offTopic: boolean;
  reason: string | null;
}

/** Classifies a message for the scope hint. Never blocks a request. */
export function scopeHint(text: string): ScopeHint {
  const value = text ?? '';
  for (const rule of OFF_TOPIC_PATTERNS) {
    if (rule.pattern.test(value)) {
      return { offTopic: true, reason: rule.reason };
    }
  }
  return { offTopic: false, reason: null };
}

/** The instruction appended when the scope hint fires. */
export function scopeHintInstruction(hint: ScopeHint): string | null {
  if (!hint.offTopic) return null;
  return `SCOPE NOTE: this message looks unrelated to careers (${hint.reason}). Say in one sentence what you help with, then offer one concrete career next step.`;
}
