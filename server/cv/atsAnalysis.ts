// The ATS evaluation of a parsed CV.
//
// This is the one part of CV processing that needs the model, so it lives in
// its own module: the upload route runs it inline today, and the background
// task runs the same code. One implementation means the score a candidate sees
// in the studio and the score stored on the version can never drift apart.
//
// Two rules the module keeps:
//
//   * a score is never invented. If the model is unavailable, spends too much,
//     or answers with something that is not the expected shape, the result is
//     `null` and the caller stores no score at all. A missing score is honest;
//     a made-up one is not;
//   * the model is told to use only the candidate's own data, so the
//     suggestions are things the candidate can stand behind.

import { groundingRules } from '../ai/grounding.ts';
import type { JobDescriptionAiClient } from './jobDescription.ts';

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumberInRange(value: unknown, min = 0, max = 100): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Checks that a model answer is the ATS payload the interface expects.
 *
 * Returns the list of problems, so the caller can log what was wrong instead
 * of storing a half-answer.
 */
export function validateAtsPayload(value: unknown): string[] {
  if (!isJsonObject(value)) return ['response is not an object'];
  const errors: string[] = [];
  if (!isNumberInRange(value.overallScore)) errors.push('overallScore');
  if (!isJsonObject(value.breakdown)) {
    errors.push('breakdown');
  } else {
    for (const key of [
      'keywordsMatch',
      'impactAndMetrics',
      'formattingStructure',
      'experienceRelevance',
    ]) {
      if (!isNumberInRange(value.breakdown[key])) errors.push(`breakdown.${key}`);
    }
  }
  for (const key of ['matchedKeywords', 'missingKeywords']) {
    if (!isStringArray(value[key])) errors.push(key);
  }
  if (!Array.isArray(value.actionableImprovements)) {
    errors.push('actionableImprovements');
  } else {
    value.actionableImprovements.forEach((entry, index) => {
      if (!isJsonObject(entry)) {
        errors.push(`actionableImprovements[${index}]`);
        return;
      }
      for (const key of ['section', 'currentText', 'suggestedText', 'reason']) {
        if (typeof entry[key] !== 'string') {
          errors.push(`actionableImprovements[${index}].${key}`);
        }
      }
    });
  }
  return errors;
}

/**
 * The prompt that evaluates a parsed CV for a target role.
 */
export function buildAtsAnalysisPrompt(parsedCv: unknown, targetRoleTitle: string): string {
  return `Evaluate this parsed CV for the target role "${targetRoleTitle}".
JSON Schema:
{
  "overallScore": number (0-100),
  "breakdown": {
    "keywordsMatch": number,
    "impactAndMetrics": number,
    "formattingStructure": number,
    "experienceRelevance": number
  },
  "matchedKeywords": [string],
  "missingKeywords": [string],
  "actionableImprovements": [
    {
      "section": string,
      "currentText": string,
      "suggestedText": string,
      "reason": string
    }
  ]
}
Parsed CV:
${JSON.stringify(parsedCv)}
${groundingRules()}
Return only valid JSON.`;
}

export interface AtsAnalysisOutcome {
  /** The evaluation, or null when there is none to store. */
  analysis: Record<string, unknown> | null;
  /** Why there is no analysis, when there is none. */
  reason: 'ok' | 'no_model' | 'model_error' | 'invalid_response';
  /**
   * The provider error, when there was one.
   *
   * The caller needs it to tell a quota error from any other failure: a
   * provider that refused because the day's allowance is spent did not serve
   * the request, so the application's own allowance must not be charged for
   * it either.
   */
  error?: unknown;
}

/**
 * Runs the ATS evaluation.
 *
 * The caller decides what a missing analysis means for its own flow; this
 * function only reports honestly.
 */
export async function runAtsAnalysis(input: {
  parsedCv: unknown;
  targetRoleTitle: string;
  ai: JobDescriptionAiClient | null;
  model: string;
}): Promise<AtsAnalysisOutcome> {
  if (!input.ai) return { analysis: null, reason: 'no_model' };

  try {
    const response = await input.ai.models.generateContent({
      model: input.model,
      contents: buildAtsAnalysisPrompt(input.parsedCv, input.targetRoleTitle),
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(response.text || '{}') as unknown;
    const errors = validateAtsPayload(parsed);
    if (errors.length > 0) {
      return { analysis: null, reason: 'invalid_response' };
    }
    return { analysis: parsed as Record<string, unknown>, reason: 'ok' };
  } catch (error) {
    // The provider failed. No score is invented, and the caller keeps going
    // with a version that simply carries no analysis.
    return { analysis: null, reason: 'model_error', error };
  }
}
