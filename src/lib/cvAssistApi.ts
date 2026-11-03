/**
 * The client for AI-assisted CV writing.
 *
 * One call, one field. The server resolves the record the field belongs to
 * and grounds the answer in the candidate's own data, so the client only has
 * to say which field it is writing and what the candidate already wrote.
 */

import { apiRequest } from './apiClient';
import type {
  CvAssistField,
  CvAssistLength,
  CvAssistSourceKind,
  CvAssistTone,
} from '../../shared/cvAiAssist';
import type { AiLanguageCode } from '../../shared/aiLanguages';

export interface CvAssistPayload {
  success: boolean;
  /** The content to put in the field. */
  text: string;
  /** The bullets, for a bullet-shaped field. */
  bullets: string[];
  /** The claims that were removed because the candidate has no record of them. */
  removedClaims: string[];
  /** A message for the candidate, or null when nothing was removed. */
  groundingNote: string | null;
}

export interface CvAssistRequestBody {
  field: CvAssistField;
  sourceKind?: CvAssistSourceKind;
  sourceId?: string;
  context?: string;
  existingText?: string;
  targetRoleTitle?: string;
  tone?: CvAssistTone;
  length?: CvAssistLength;
  language?: AiLanguageCode;
  /** Which attempt this is. The first attempt is 0. */
  attempt?: number;
}

/** The headline options the server returns. */
export interface CvHeadlineSuggestionsPayload {
  success: boolean;
  /** The options to show, never empty on a successful response. */
  suggestions: string[];
  /** True when at least one option came from the model. */
  aiUsed: boolean;
  /** Why local options are being shown instead, when they are. */
  fallbackReason: string | null;
}

export interface CvHeadlineSuggestionsRequestBody {
  targetRoleTitle?: string;
  additionalTargetRoles?: string[];
  language?: AiLanguageCode;
  /**
   * Whether the model may be used. `false` asks for the deterministic options
   * only, which is what a candidate with AI writing switched off receives.
   */
  ai?: boolean;
}

/**
 * Writes one CV field.
 *
 * Throws an ApiRequestError when the server declines, so the caller can show
 * the server's own reason rather than a generic failure.
 */
export async function assistCvField(
  body: CvAssistRequestBody,
  options: { signal?: AbortSignal } = {}
): Promise<CvAssistPayload> {
  const response = await apiRequest<Partial<CvAssistPayload>>('/api/cv/ai-assist', {
    method: 'POST',
    body: JSON.stringify(body),
    signal: options.signal,
  });
  return {
    success: response.success ?? true,
    text: typeof response.text === 'string' ? response.text : '',
    bullets: Array.isArray(response.bullets) ? response.bullets : [],
    removedClaims: Array.isArray(response.removedClaims) ? response.removedClaims : [],
    groundingNote:
      typeof response.groundingNote === 'string' ? response.groundingNote : null,
  };
}

/**
 * Asks for headline options.
 *
 * The request is bounded in time. A stalled model call must not leave the
 * studio spinning: the caller falls back to the deterministic generator when
 * this throws, so the control always leaves its loading state.
 */
export async function suggestCvHeadlines(
  body: CvHeadlineSuggestionsRequestBody
): Promise<CvHeadlineSuggestionsPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await apiRequest<Partial<CvHeadlineSuggestionsPayload>>(
      '/api/cv/ai-assist',
      {
        method: 'POST',
        body: JSON.stringify({ field: 'headline', suggestions: true, ...body }),
        signal: controller.signal,
      }
    );
    return {
      success: response.success ?? true,
      suggestions: Array.isArray(response.suggestions)
        ? response.suggestions.filter(
            (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
          )
        : [],
      aiUsed: response.aiUsed === true,
      fallbackReason:
        typeof response.fallbackReason === 'string' ? response.fallbackReason : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
