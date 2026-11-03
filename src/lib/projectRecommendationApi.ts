/**
 * The client for the project recommendations and the project health check.
 *
 * Both calls always answer with the deterministic result. The model improves
 * the wording of the plans and of the suggestions, but a recommendation never
 * depends on it being there.
 */

import { apiRequest } from './apiClient';
import type {
  ProjectHealthReport,
  ProjectPlan,
  ProjectSkillGap,
} from '../../shared/projectRecommendation';
import type { AiLanguageCode } from '../../shared/aiLanguages';

export interface ProjectRecommendationContextSummary {
  targetRoleTitle: string | null;
  careerLevel: string | null;
  openSkillGaps: ProjectSkillGap[];
  coveredSkills: string[];
  roadmapSkills: string[];
  learningInProgress: string[];
  completedCourses: string[];
  existingProjectCount: number;
  jobDescriptionTitle: string | null;
}

export interface ProjectRecommendationPayload {
  success: boolean;
  /** The recommended projects, each with a complete plan. */
  plans: ProjectPlan[];
  /** True when the model wrote the plans. */
  aiUsed: boolean;
  /** Why the deterministic plans were kept, when they were. */
  aiFallbackReason: string | null;
  context: ProjectRecommendationContextSummary;
}

export interface ProjectHealthPayload {
  success: boolean;
  /** One report per project the candidate already has. */
  reports: ProjectHealthReport[];
  /** True when the model improved the wording of the suggestions. */
  aiUsed: boolean;
  /** Why the factual reports were kept on their own, when they were. */
  aiFallbackReason: string | null;
}

/**
 * Recommends the projects that would help this candidate most.
 *
 * The pasted job description is optional. When it is supplied the server
 * reads it and aims the recommendations at it.
 */
export async function fetchProjectRecommendations(body: {
  jobDescription?: string;
  language?: AiLanguageCode;
  limit?: number;
}, options: { signal?: AbortSignal } = {}): Promise<ProjectRecommendationPayload> {
  const response = await apiRequest<Partial<ProjectRecommendationPayload>>(
    '/api/projects/recommendations',
    {
      method: 'POST',
      body: JSON.stringify(body),
      signal: options.signal,
    }
  );

  return {
    success: response.success ?? true,
    plans: Array.isArray(response.plans) ? response.plans : [],
    aiUsed: response.aiUsed ?? false,
    aiFallbackReason:
      typeof response.aiFallbackReason === 'string' ? response.aiFallbackReason : null,
    context: (response.context ?? {
      targetRoleTitle: null,
      careerLevel: null,
      openSkillGaps: [],
      coveredSkills: [],
      roadmapSkills: [],
      learningInProgress: [],
      completedCourses: [],
      existingProjectCount: 0,
      jobDescriptionTitle: null,
    }) as ProjectRecommendationContextSummary,
  };
}

/** Checks the projects the candidate already has. */
export async function fetchProjectHealth(
  body: { language?: AiLanguageCode },
  options: { signal?: AbortSignal } = {}
): Promise<ProjectHealthPayload> {
  const response = await apiRequest<Partial<ProjectHealthPayload>>('/api/projects/analyze', {
    method: 'POST',
    body: JSON.stringify(body),
    signal: options.signal,
  });

  return {
    success: response.success ?? true,
    reports: Array.isArray(response.reports) ? response.reports : [],
    aiUsed: response.aiUsed ?? false,
    aiFallbackReason:
      typeof response.aiFallbackReason === 'string' ? response.aiFallbackReason : null,
  };
}
