// Server persistence for public.interview_sessions.
//
// A session records one mock-interview exchange: the question, the user's
// answer and the AI feedback (score, strengths, improvements).
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export type InterviewType = 'behavioral' | 'technical' | 'star';

export const INTERVIEW_TYPES: InterviewType[] = ['behavioral', 'technical', 'star'];

export interface InterviewSessionDTO {
  id: string;
  roleTitle: string | null;
  type: string | null;
  question: string;
  userAnswer: string | null;
  /** AI feedback: score, strengths, improvements, starEvaluation, suggestedAnswer. */
  aiFeedback: unknown;
  createdAt: string;
}

export interface CreateInterviewSessionInput {
  roleTitle?: string;
  type?: InterviewType;
  question: string;
  userAnswer?: string;
  aiFeedback?: unknown;
}

export type UpdateInterviewSessionInput = Partial<CreateInterviewSessionInput>;

interface InterviewSessionRow {
  id: string;
  role_title: string | null;
  type: string | null;
  question: string;
  user_answer: string | null;
  ai_feedback: unknown;
  created_at: string;
}

const SELECT_COLUMNS = 'id, role_title, type, question, user_answer, ai_feedback, created_at';

function toDTO(row: InterviewSessionRow): InterviewSessionDTO {
  return {
    id: row.id,
    roleTitle: row.role_title,
    type: row.type,
    question: row.question,
    userAnswer: row.user_answer,
    aiFeedback: row.ai_feedback,
    createdAt: row.created_at,
  };
}

export async function listInterviewSessions(
  profileId: string
): Promise<InterviewSessionDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('interview_sessions')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as InterviewSessionRow[]).map(toDTO);
}

export async function getInterviewSession(
  profileId: string,
  sessionId: string
): Promise<InterviewSessionDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('interview_sessions')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as InterviewSessionRow) : null;
}

export async function createInterviewSession(
  profileId: string,
  input: CreateInterviewSessionInput
): Promise<InterviewSessionDTO> {
  const { data, error } = await getSupabaseServer()
    .from('interview_sessions')
    .insert({
      profile_id: profileId,
      role_title: input.roleTitle ?? null,
      type: input.type ?? null,
      question: input.question,
      user_answer: input.userAnswer ?? null,
      ai_feedback: input.aiFeedback ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as InterviewSessionRow);
}

export async function updateInterviewSession(
  profileId: string,
  sessionId: string,
  updates: UpdateInterviewSessionInput
): Promise<InterviewSessionDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.roleTitle !== undefined) patch.role_title = updates.roleTitle ?? null;
  if (updates.type !== undefined) patch.type = updates.type ?? null;
  if (updates.question !== undefined) patch.question = updates.question;
  if (updates.userAnswer !== undefined) patch.user_answer = updates.userAnswer ?? null;
  if (updates.aiFeedback !== undefined) patch.ai_feedback = updates.aiFeedback ?? null;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from('interview_sessions')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', sessionId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as InterviewSessionRow) : null;
}

export async function deleteInterviewSession(
  profileId: string,
  sessionId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('interview_sessions')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', sessionId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
