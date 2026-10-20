// Server persistence for public.secondary_goals.
//
// Shape mirrors the current SecondaryCareerGoal type exactly.
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export type SecondaryGoalPriority = 'high' | 'medium' | 'low';
export type SecondaryGoalStatus = 'active' | 'achieved' | 'paused';

export interface SecondaryGoalDTO {
  id: string;
  title: string;
  description: string | null;
  priority: SecondaryGoalPriority;
  deadline: string | null;
  status: SecondaryGoalStatus;
  progressPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSecondaryGoalInput {
  title: string;
  description?: string;
  priority?: SecondaryGoalPriority;
  deadline?: string;
  status?: SecondaryGoalStatus;
  progressPercent?: number;
}

export type UpdateSecondaryGoalInput = Partial<CreateSecondaryGoalInput>;

interface SecondaryGoalRow {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  deadline: string | null;
  status: string;
  progress_percent: number;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, title, description, priority, deadline, status, progress_percent, created_at, updated_at';

function toDTO(row: SecondaryGoalRow): SecondaryGoalDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority as SecondaryGoalPriority,
    deadline: row.deadline,
    status: row.status as SecondaryGoalStatus,
    progressPercent: row.progress_percent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSecondaryGoals(profileId: string): Promise<SecondaryGoalDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('secondary_goals')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as SecondaryGoalRow[]).map(toDTO);
}

export async function createSecondaryGoal(
  profileId: string,
  input: CreateSecondaryGoalInput
): Promise<SecondaryGoalDTO> {
  const { data, error } = await getSupabaseServer()
    .from('secondary_goals')
    .insert({
      profile_id: profileId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'medium',
      deadline: input.deadline ?? null,
      status: input.status ?? 'active',
      progress_percent: input.progressPercent ?? 0,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as SecondaryGoalRow);
}

export async function updateSecondaryGoal(
  profileId: string,
  goalId: string,
  updates: UpdateSecondaryGoalInput
): Promise<SecondaryGoalDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.description !== undefined) patch.description = updates.description ?? null;
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.deadline !== undefined) patch.deadline = updates.deadline ?? null;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.progressPercent !== undefined) patch.progress_percent = updates.progressPercent;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from('secondary_goals')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', goalId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as SecondaryGoalRow) : null;
}

export async function deleteSecondaryGoal(
  profileId: string,
  goalId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('secondary_goals')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', goalId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
