// The client's side of the measured CV analysis.
//
// The measured analysis is counted from the candidate's own document. It runs
// no model, so it costs no quota and it returns the same answer every time.
//
// Two ways of asking for it:
//   * `requestMeasuredAnalysis` — one request, one answer.
//   * `streamMeasuredAnalysis` — the same measurement, with the stages
//     reported as they happen.
//
// The two read the same document and run the same measurement, so the answer
// is the same either way.

import { apiRequest, ApiRequestError } from './apiClient';
import { getAccessToken } from './supabase';
import { apiUrl } from './native';
import type { CvAnalysisReport, CvAnalysisStageEvent } from '../../shared/cvAnalysis.ts';
import type { ATSAnalysis } from '../types/career';

/** What the analysis routes answer with. */
export interface MeasuredAnalysis {
  analysis: CvAnalysisReport;
  /** The stored shape, for a caller that already knows how to read a score. */
  atsAnalysis: ATSAnalysis;
  /** The record of this run, when it was about a stored CV. */
  measurementId: string | null;
}

/** One recorded run of the measured analysis. */
export interface MeasurementRecord {
  id: string;
  cvId: string | null;
  cvVersionId: string | null;
  targetRoleTitle: string;
  jobDescription: string | null;
  overallScore: number;
  band: string;
  report: Record<string, unknown>;
  createdAt: string;
}

/** What the analysis is asked about. */
export interface AnalysisRequest {
  /** The stored version to measure. The server resolves it for its owner. */
  cvVersionId?: string | null;
  /** The document itself, for a copy that has not been saved yet. */
  cv?: unknown;
  targetRoleTitle?: string;
  targetRoleSkills?: string[];
  jobDescription?: string | null;
}

/** Measures a CV and returns the completed analysis. */
export async function requestMeasuredAnalysis(
  input: AnalysisRequest
): Promise<MeasuredAnalysis> {
  const payload = await apiRequest<{
    success: boolean;
    analysis: CvAnalysisReport;
    atsAnalysis: ATSAnalysis;
    measurementId: string | null;
  }>('/api/cv/analysis', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return {
    analysis: payload.analysis,
    atsAnalysis: payload.atsAnalysis,
    measurementId: payload.measurementId ?? null,
  };
}

/**
 * Measures a CV and reports every stage as it happens.
 *
 * The stages are the real ones: the server reports a stage after the work it
 * names has been done, so the list the candidate watches is the list the
 * measurement really went through.
 *
 * If the connection drops before the answer arrives, this throws. The caller
 * can then ask for the plain measurement, which is the same measurement.
 */
export async function streamMeasuredAnalysis(
  input: AnalysisRequest,
  onStage: (event: CvAnalysisStageEvent) => void,
  signal?: AbortSignal
): Promise<MeasuredAnalysis> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(apiUrl('/api/cv/analysis/stream'), {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
    cache: 'no-store',
    signal,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let code: string | null = null;
    try {
      const payload = await res.json();
      if (payload && typeof payload === 'object') {
        if (typeof payload.error === 'string') message = payload.error;
        if (typeof payload.code === 'string') code = payload.code;
      }
    } catch {
      // The body was not JSON; the status still stands.
    }
    throw new ApiRequestError(res.status, message, code);
  }

  const completed: MeasuredAnalysis[] = [];
  const failures: { code?: string; error?: string }[] = [];

  await readEventStream(res, (event, data) => {
    if (event === 'stage') {
      onStage(data as CvAnalysisStageEvent);
      return;
    }
    if (event === 'complete') {
      const payload = data as {
        analysis: CvAnalysisReport;
        atsAnalysis: ATSAnalysis;
        measurementId: string | null;
      };
      completed.push({
        analysis: payload.analysis,
        atsAnalysis: payload.atsAnalysis,
        measurementId: payload.measurementId ?? null,
      });
      return;
    }
    if (event === 'error') {
      failures.push((data ?? {}) as { code?: string; error?: string });
    }
  });

  const failure = failures[0];
  if (failure) {
    throw new ApiRequestError(
      422,
      failure.error ?? 'The CV could not be measured right now.',
      failure.code ?? 'analysis_failed'
    );
  }
  const result = completed[0];
  if (!result) {
    throw new ApiRequestError(
      502,
      'The measurement did not finish. Please try again.',
      'stream_incomplete'
    );
  }
  return result;
}

/** Reads the events of a response body, one frame at a time. */
async function readEventStream(
  response: Response,
  onEvent: (event: string, data: unknown) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  const handleFrame = (frame: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    const raw = dataLines.join('');
    let data: unknown = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    onEvent(event, data);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (frame.trim()) handleFrame(frame);
      boundary = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) handleFrame(buffer);
}

/** The recorded runs of the measured analysis, newest first. */
export async function fetchMeasurementHistory(
  cvId?: string | null
): Promise<MeasurementRecord[]> {
  const query = cvId ? `?cvId=${encodeURIComponent(cvId)}` : '';
  const payload = await apiRequest<{ success: boolean; measurements: MeasurementRecord[] }>(
    `/api/cv/analyses${query}`,
    { method: 'GET' }
  );
  return payload.measurements ?? [];
}
