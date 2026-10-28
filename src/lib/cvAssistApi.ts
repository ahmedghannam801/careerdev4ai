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
  language?: 'en' | 'ar';
  /** Which attempt this is. The first attempt is 0. */
  attempt?: number;
}

/**
 * Writes one CV field.
 *
 * Throws an ApiRequestError when the server declines, so the caller can show
 * the server's own reason rather than a generic failure.
 */
export async function assistCvField(body: CvAssistRequestBody): Promise<CvAssistPayload> {
  const response = await apiRequest<Partial<CvAssistPayload>>('/api/cv/ai-assist', {
    method: 'POST',
    body: JSON.stringify(body),
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
