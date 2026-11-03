/**
 * The client for the job-description flow.
 *
 * Two calls, with different guarantees.
 *
 * The analysis call reads the pasted advertisement and compares it with the
 * candidate's own record. It always answers: when the model is unavailable the
 * server reads the advertisement itself and still returns the analysis and the
 * score, so the studio keeps working.
 *
 * The generation call writes the CV. It may fail, and when it does the
 * candidate's document is untouched — nothing is written to the CV studio
 * until the candidate applies the result themselves.
 */

import { apiRequest } from './apiClient';
import type {
  AtsCvContent,
  AtsMatchReport,
  JobDescriptionAnalysis,
} from '../../shared/jobDescription';
import type { AiLanguageCode } from '../../shared/aiLanguages';

export interface JobDescriptionAnalysisPayload {
  success: boolean;
  /** What the advertisement asks for. */
  analysis: JobDescriptionAnalysis;
  /** How the candidate's record compares with it. */
  match: AtsMatchReport;
  /** True when the model read the advertisement; false when the server did. */
  aiUsed: boolean;
  /** Why the server read the advertisement itself, when it did. */
  aiFallbackReason: string | null;
}

export interface JobDescriptionCvPayload {
  success: boolean;
  analysis: JobDescriptionAnalysis;
  match: AtsMatchReport;
  /** The content written for this advertisement. */
  cv: AtsCvContent;
}

/**
 * The candidate's current CV document, as the server takes it.
 *
 * The ids in it are not trusted by the server: the records are resolved from
 * the database, so a wrong id simply produces nothing.
 */
export interface ClientCvSnapshot {
  title?: string;
  summary?: string;
  experiences?: { id: string; bullets?: string[] }[];
  projects?: { id: string; bullets?: string[]; description?: string }[];
  skillsList?: string[];
}

/** Extracts a TXT, PDF or DOCX job description in memory on the authenticated server. */
export async function extractJobDescriptionFile(
  file: File,
  options: { signal?: AbortSignal } = {}
): Promise<{ text: string; format: 'txt' | 'pdf' | 'docx'; characterCount: number }> {
  const form = new FormData();
  form.append('file', file, file.name);
  const response = await apiRequest<{
    success: boolean;
    text: string;
    format: 'txt' | 'pdf' | 'docx';
    characterCount: number;
  }>('/api/job-descriptions/extract', {
    method: 'POST',
    body: form,
    signal: options.signal,
  });
  if (!response.text?.trim()) throw new Error('The file did not contain readable job-description text.');
  return response;
}

/** Reads a job description and reports what it asks for. */
export async function analyzeJobDescription(
  body: { jobDescription: string; language?: AiLanguageCode },
  options: { signal?: AbortSignal } = {}
): Promise<JobDescriptionAnalysisPayload> {
  const response = await apiRequest<Partial<JobDescriptionAnalysisPayload>>(
    '/api/cv/job-description/analyze',
    {
      method: 'POST',
      body: JSON.stringify(body),
      signal: options.signal,
    }
  );

  return {
    success: response.success ?? true,
    analysis: (response.analysis ?? {
      jobTitle: null,
      requiredSkills: [],
      technicalSkills: [],
      keywords: [],
      responsibilities: [],
      experienceRequirements: [],
      qualifications: [],
    }) as JobDescriptionAnalysis,
    match: (response.match ?? {
      score: 0,
      breakdown: {
        skills: 0,
        keywords: 0,
        experience: 0,
        qualifications: 0,
        responsibilities: 0,
      },
      matched: [],
      missing: [],
      explanation: '',
      matchedKeywords: [],
      missingKeywords: [],
    }) as AtsMatchReport,
    aiUsed: response.aiUsed ?? false,
    aiFallbackReason:
      typeof response.aiFallbackReason === 'string' ? response.aiFallbackReason : null,
  };
}

/** Writes the CV for a job description. */
export async function generateJobDescriptionCv(
  body: {
    jobDescription: string;
    language?: AiLanguageCode;
    /** The candidate's current document, so the result improves it. */
    cv?: ClientCvSnapshot | null;
  },
  options: { signal?: AbortSignal } = {}
): Promise<JobDescriptionCvPayload> {
  const response = await apiRequest<Partial<JobDescriptionCvPayload>>(
    '/api/cv/job-description/generate',
    {
      method: 'POST',
      body: JSON.stringify(body),
      signal: options.signal,
    }
  );

  return {
    success: response.success ?? true,
    analysis: response.analysis as JobDescriptionAnalysis,
    match: response.match as AtsMatchReport,
    cv: response.cv as AtsCvContent,
  };
}
