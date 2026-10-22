// AI explanation layer for the Learning Hub.
//
// The deterministic engine has already selected, scored and ordered the
// candidates. Gemini is only allowed to write an explanation for a candidate
// it was given. Its output is parsed and validated before anything is shown:
//   - the courseId must be one of the supplied candidates;
//   - an id may appear only once;
//   - explanations must be substantial but bounded;
//   - no item may contain a URL, because the catalogue URL is the only URL the
//     product is allowed to display.
//
// Any failure returns the deterministic result unchanged. Recommendation
// quality never depends on the model being available.

import type {
  LearningContext,
  LearningRecommendation,
  RecommendationResult,
} from './recommendation.ts';

export interface AiClientLike {
  models: {
    generateContent: (args: {
      model: string;
      contents: string;
      config?: Record<string, unknown>;
    }) => Promise<{ text?: string }>;
  };
}

export interface AiCourseExplanation {
  courseId: string;
  reason: string;
  skillGap?: string;
  roadmapLink?: string;
}

export interface AiValidationResult {
  valid: AiCourseExplanation[];
  rejected: number;
  errors: string[];
}

const MAX_REASON = 800;
const MIN_REASON = 20;
const MAX_SHORT_FIELD = 300;
const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/i;

function asString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/**
 * Validates an already-parsed AI payload. Exported so tests can exercise every
 * rejection rule without a network call or an API key.
 */
export function validateAiRecommendations(
  payload: unknown,
  allowedCourseIds: Set<string>,
  maxItems = 12
): AiValidationResult {
  const errors: string[] = [];
  const valid: AiCourseExplanation[] = [];
  let rejected = 0;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid, rejected: 1, errors: ['AI response is not a JSON object'] };
  }
  const rawItems = (payload as { recommendations?: unknown }).recommendations;
  if (!Array.isArray(rawItems)) {
    return { valid, rejected: 1, errors: ['AI response has no recommendations array'] };
  }

  const seen = new Set<string>();
  for (const item of rawItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      rejected += 1;
      errors.push('recommendation is not an object');
      continue;
    }
    const record = item as Record<string, unknown>;
    const courseId = asString(record.courseId, 120);
    if (!courseId) {
      rejected += 1;
      errors.push('missing courseId');
      continue;
    }
    if (!allowedCourseIds.has(courseId)) {
      rejected += 1;
      errors.push(`unknown courseId: ${courseId}`);
      continue;
    }
    if (seen.has(courseId)) {
      rejected += 1;
      errors.push(`duplicate courseId: ${courseId}`);
      continue;
    }
    const reason = asString(record.reason, MAX_REASON);
    if (!reason || reason.length < MIN_REASON) {
      rejected += 1;
      errors.push(`invalid reason for ${courseId}`);
      continue;
    }
    if (URL_PATTERN.test(reason)) {
      rejected += 1;
      errors.push(`reason contains a URL for ${courseId}`);
      continue;
    }
    const skillGap = record.skillGap === undefined ? undefined : asString(record.skillGap, MAX_SHORT_FIELD);
    const roadmapLink = record.roadmapLink === undefined ? undefined : asString(record.roadmapLink, MAX_SHORT_FIELD);
    if (record.skillGap !== undefined && !skillGap) {
      rejected += 1;
      errors.push(`invalid skillGap for ${courseId}`);
      continue;
    }
    if (record.roadmapLink !== undefined && !roadmapLink) {
      rejected += 1;
      errors.push(`invalid roadmapLink for ${courseId}`);
      continue;
    }
    if (
      (skillGap && URL_PATTERN.test(skillGap)) ||
      (roadmapLink && URL_PATTERN.test(roadmapLink))
    ) {
      rejected += 1;
      errors.push(`URL in explanation for ${courseId}`);
      continue;
    }
    seen.add(courseId);
    valid.push({ courseId, reason, skillGap: skillGap ?? undefined, roadmapLink: roadmapLink ?? undefined });
    if (valid.length >= maxItems) break;
  }

  if (valid.length === 0) {
    errors.push('AI returned no valid recommendation explanations');
  }
  return { valid, rejected, errors };
}

export function parseAiRecommendations(
  text: string,
  allowedCourseIds: Set<string>,
  maxItems = 12
): AiValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return { valid: [], rejected: 1, errors: ['AI response is not valid JSON'] };
  }
  return validateAiRecommendations(parsed, allowedCourseIds, maxItems);
}

function buildPrompt(
  candidates: LearningRecommendation[],
  context: LearningContext
): string {
  const candidatePayload = candidates.map((candidate) => ({
    courseId: candidate.course.id,
    title: candidate.course.title,
    provider: candidate.course.provider,
    format: candidate.course.format,
    level: candidate.course.level,
    durationHours: candidate.course.durationHours,
    availability: candidate.course.availability,
    skills: candidate.course.skills.map((skill) => skill.name),
    roleRelevance: candidate.roleRelevance,
    deterministicScore: candidate.score,
    deterministicReason: candidate.deterministicReason,
  }));

  const gapMap = new Map<string, { current: number; target: number; gap: number }>();
  for (const skill of context.userSkills) {
    gapMap.set(skill.name, { current: skill.currentLevel, target: skill.targetLevel, gap: skill.gap });
  }

  return `You are the explanation layer of CareerPilot's Learning Hub.
A deterministic engine has ALREADY selected and scored the courses below.

Your job is only to explain, for each selected course:
1. what the user should learn next,
2. why it is relevant,
3. which skill gap it addresses,
4. how it connects to the target role or roadmap.

HARD RULES:
- Use ONLY the courseId values in the candidate list. Never invent a course.
- Never write a URL, provider name that is not in the candidate, or a price.
- Do not change the ranking or claim a course is free if its availability says paid.
- Return JSON only, with this shape:
{"recommendations":[{"courseId":"...","reason":"...","skillGap":"...","roadmapLink":"..."}]}
- reason: 2-4 specific sentences, 20-800 characters.
- skillGap and roadmapLink are optional short phrases, max 300 characters.

USER CONTEXT:
careerGoal: ${context.careerGoal}
targetRole: ${context.targetRole?.title ?? 'not set'}
targetRoleLevel: ${context.targetRole?.level ?? 'not set'}
experienceLevel: ${context.experienceLevel}
language: ${context.language}
weeklyHours: ${context.weeklyHours}
budget: ${context.budget}
focusSkill: ${context.focusSkill ?? 'none'}
roadmapSkills: ${JSON.stringify(context.roadmapSkills.slice(0, 20))}
skillGaps: ${JSON.stringify([...gapMap.values()].slice(0, 20))}

DETERMINISTIC CANDIDATES:
${JSON.stringify(candidatePayload, null, 2)}`;
}

export interface AiEnrichmentOptions {
  ai: AiClientLike | null;
  model?: string;
  timeoutMs?: number;
}

/**
 * Enriches the deterministic result with AI explanations. The deterministic
 * order, score, URLs and candidates are never modified. On any failure the
 * original result is returned with `aiUsed: false` and a concrete reason.
 */
export async function enrichRecommendationsWithAi(
  deterministic: LearningRecommendation[],
  context: LearningContext,
  options: AiEnrichmentOptions
): Promise<RecommendationResult> {
  const generatedAt = new Date().toISOString();
  const fallback = (reason: string): RecommendationResult => ({
    recommendations: deterministic,
    aiUsed: false,
    aiFallbackReason: reason,
    generatedAt,
  });

  if (deterministic.length === 0) {
    return fallback('No deterministic candidates were available.');
  }
  if (!options.ai) {
    return fallback('GEMINI_API_KEY is not configured; deterministic ranking was used.');
  }

  const candidates = deterministic.slice(0, 10);
  const allowedIds = new Set(candidates.map((candidate) => candidate.course.id));
  const timeoutMs = options.timeoutMs ?? 12000;

  try {
    const response = await Promise.race([
      options.ai.models.generateContent({
        model: options.model ?? 'gemini-3.8-flash',
        contents: buildPrompt(candidates, context),
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI request timed out')), timeoutMs);
      }),
    ]);

    const validation = parseAiRecommendations(response.text ?? '', allowedIds, candidates.length);
    if (validation.valid.length === 0) {
      return fallback(
        `AI output was rejected (${validation.errors[0] ?? 'invalid response'}); deterministic ranking was used.`
      );
    }

    const explanations = new Map(validation.valid.map((item) => [item.courseId, item]));
    const recommendations = deterministic.map((candidate) => {
      const explanation = explanations.get(candidate.course.id);
      if (!explanation) return candidate;
      return {
        ...candidate,
        aiExplanation: explanation.reason,
        aiSkillGap: explanation.skillGap,
        aiRoadmapLink: explanation.roadmapLink,
      };
    });

    return {
      recommendations,
      aiUsed: true,
      aiFallbackReason:
        validation.rejected > 0
          ? `${validation.rejected} AI item(s) were discarded during validation.`
          : null,
      generatedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown AI error';
    // Keep provider details in the server log; the browser only needs to know
    // that it is seeing the deterministic result and why.
    console.error('Learning Hub AI generation failed:', message);
    return fallback(
      message.toLowerCase().includes('timed out')
        ? 'AI request timed out; deterministic ranking was used.'
        : 'AI generation failed; deterministic ranking was used.'
    );
  }
}
