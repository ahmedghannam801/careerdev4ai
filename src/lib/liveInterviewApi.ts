/**
 * The live interview's own API.
 * ---------------------------------------------------------------------------
 * Three calls, and nothing else:
 *
 *   * `startLiveInterview` asks the server for a session credential.
 *   * `completeLiveInterview` hands the transcript back and receives the
 *     report.
 *   * `listLiveInterviewSessions` reads the candidate's own history.
 *
 * The Gemini key never appears here, and never appears in the bundle: the
 * credential the browser receives is an ephemeral token that the server
 * minted for one session.
 */

import { apiUrl } from './native';
import { getAccessToken } from './supabase';

export type LiveInterviewType = 'hr' | 'technical' | 'role' | 'behavioral' | 'mixed';
export type LiveInterviewLanguage = 'en' | 'ar' | 'ar-eg';

/** The credential the browser opens the live session with. */
export interface LiveInterviewGrant {
  token: string;
  model: string;
  /**
   * The API version the token was minted on.
   *
   * An ephemeral token can only open a session on the API version that
   * issued it, so the server sends the version it used and the browser
   * spends the token against exactly that one.
   */
  apiVersion: string;
  expiresAt: string;
  language: LiveInterviewLanguage;
  type: LiveInterviewType;
}

/** One turn of the conversation. */
export interface LiveTranscriptTurn {
  speaker: 'interviewer' | 'candidate';
  text: string;
  at?: string;
}

/** The report written from the transcript. */
export interface LiveInterviewEvaluation {
  score: number;
  communication: number;
  technicalKnowledge: number;
  answerQuality: number;
  problemSolving: number;
  languageFluency: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  suggestedAnswers: string[];
  trainingPlan: string[];
  communicationObservations: string[];
}

/** A finished interview, as it is kept. */
export interface LiveInterviewSession {
  id: string;
  interviewType: string;
  language: string;
  targetRole: string | null;
  jobId: string | null;
  status: string;
  transcript: LiveTranscriptTurn[];
  evaluation: LiveInterviewEvaluation | null;
  durationSeconds: number | null;
  createdAt: string;
  completedAt: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** Asks the server for a credential that can open one live session. */
export async function startLiveInterview(input: {
  type: LiveInterviewType;
  language: LiveInterviewLanguage;
  roleTitle?: string;
  jobDescription?: string;
  jobId?: string;
}): Promise<LiveInterviewGrant> {
  const response = await fetch(apiUrl('/api/interviews/live/session'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error ?? 'The live interviewer could not be started. Please try again shortly.'
    );
  }
  const body = (await response.json()) as { grant?: LiveInterviewGrant };
  if (!body.grant?.token) {
    throw new Error('The live interviewer could not be started. Please try again shortly.');
  }
  return body.grant;
}

/** Hands the transcript back and receives the report. */
export async function completeLiveInterview(input: {
  type: LiveInterviewType;
  language: LiveInterviewLanguage;
  roleTitle?: string;
  jobDescription?: string;
  jobId?: string;
  transcript: LiveTranscriptTurn[];
  durationSeconds?: number;
}): Promise<{
  session: LiveInterviewSession;
  evaluation: LiveInterviewEvaluation | null;
  evaluationError: string | null;
}> {
  const response = await fetch(apiUrl('/api/interviews/live/complete'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? 'The interview could not be saved.');
  }
  return (await response.json()) as {
    session: LiveInterviewSession;
    evaluation: LiveInterviewEvaluation | null;
    evaluationError: string | null;
  };
}

/** The candidate's own live interview history. */
export async function listLiveInterviewSessions(): Promise<LiveInterviewSession[]> {
  const response = await fetch(apiUrl('/api/interviews/live'), {
    method: 'GET',
    headers: await authHeaders(),
  });
  if (!response.ok) {
    throw new Error('The interview history could not be loaded.');
  }
  const body = (await response.json()) as { sessions?: LiveInterviewSession[] };
  return body.sessions ?? [];
}
