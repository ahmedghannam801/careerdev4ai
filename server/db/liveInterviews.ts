// Server persistence for public.live_interview_sessions.
//
// WHAT IS STORED
// The conversation, in words: the transcript, the report, the kind of
// interview, the language it was held in, the role it was about, and when it
// started and finished.
//
// WHAT IS NOT STORED
// The audio. There is no audio column in this table and no audio column in
// the migration that creates it. The browser streams the audio straight to
// Google and keeps only the text, so a recording of the candidate's voice
// never exists on this platform.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';
import type { LiveInterviewEvaluation, LiveTranscriptTurn } from '../interviews/live.ts';

export interface LiveInterviewSessionDTO {
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

export interface CreateLiveInterviewSessionInput {
  interviewType: string;
  language: string;
  targetRole?: string | null;
  jobId?: string | null;
  status?: 'completed' | 'ended';
  transcript: LiveTranscriptTurn[];
  evaluation?: LiveInterviewEvaluation | null;
  durationSeconds?: number | null;
}

interface LiveInterviewSessionRow {
  id: string;
  interview_type: string | null;
  language: string | null;
  target_role: string | null;
  job_id: string | null;
  status: string | null;
  transcript: unknown;
  evaluation: unknown;
  duration_seconds: number | null;
  created_at: string;
  completed_at: string | null;
}

const SELECT_COLUMNS =
  'id, interview_type, language, target_role, job_id, status, transcript, evaluation, duration_seconds, created_at, completed_at';

/** The transcript column is JSONB; it is read as a list of turns. */
function toTranscript(value: unknown): LiveTranscriptTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      speaker: entry.speaker === 'candidate' ? ('candidate' as const) : ('interviewer' as const),
      text: typeof entry.text === 'string' ? entry.text : '',
      at: typeof entry.at === 'string' ? entry.at : undefined,
    }))
    .filter((turn) => turn.text.trim().length > 0);
}

function toDTO(row: LiveInterviewSessionRow): LiveInterviewSessionDTO {
  return {
    id: row.id,
    interviewType: row.interview_type ?? 'mixed',
    language: row.language ?? 'en',
    targetRole: row.target_role,
    jobId: row.job_id,
    status: row.status ?? 'completed',
    transcript: toTranscript(row.transcript),
    evaluation: (row.evaluation as LiveInterviewEvaluation | null) ?? null,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export async function listLiveInterviewSessions(
  profileId: string
): Promise<LiveInterviewSessionDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('live_interview_sessions')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as LiveInterviewSessionRow[]).map(toDTO);
}

export async function getLiveInterviewSession(
  profileId: string,
  sessionId: string
): Promise<LiveInterviewSessionDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('live_interview_sessions')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as LiveInterviewSessionRow) : null;
}

export async function createLiveInterviewSession(
  profileId: string,
  input: CreateLiveInterviewSessionInput
): Promise<LiveInterviewSessionDTO> {
  const { data, error } = await getSupabaseServer()
    .from('live_interview_sessions')
    .insert({
      profile_id: profileId,
      interview_type: input.interviewType,
      language: input.language,
      target_role: input.targetRole ?? null,
      job_id: input.jobId ?? null,
      status: input.status ?? 'completed',
      // The transcript is the whole of the audio record. No audio is kept.
      transcript: input.transcript,
      evaluation: input.evaluation ?? null,
      duration_seconds: input.durationSeconds ?? null,
      completed_at: new Date().toISOString(),
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as LiveInterviewSessionRow);
}

export async function deleteLiveInterviewSession(
  profileId: string,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('live_interview_sessions')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', sessionId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
