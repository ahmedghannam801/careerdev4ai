// Server persistence for public.career_milestones.
//
// Independent of public.roadmap_milestones: these are achieved, dated life
// events, not planned roadmap work.
//
// Shape mirrors the current CareerMilestoneItem type exactly.
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export type MilestoneCategory =
  | 'internship'
  | 'project'
  | 'certification'
  | 'application'
  | 'interview'
  | 'offer'
  | 'role'
  | 'promotion'
  | 'skill';

export const MILESTONE_CATEGORIES: MilestoneCategory[] = [
  'internship',
  'project',
  'certification',
  'application',
  'interview',
  'offer',
  'role',
  'promotion',
  'skill',
];

export interface CareerMilestoneDTO {
  id: string;
  title: string;
  category: MilestoneCategory;
  dateAchieved: string;
  notes: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCareerMilestoneInput {
  title: string;
  category: MilestoneCategory;
  dateAchieved: string;
  notes?: string;
  verified?: boolean;
}

export type UpdateCareerMilestoneInput = Partial<CreateCareerMilestoneInput>;

interface MilestoneRow {
  id: string;
  title: string;
  category: string;
  date_achieved: string;
  notes: string | null;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, title, category, date_achieved, notes, verified, created_at, updated_at';

function toDTO(row: MilestoneRow): CareerMilestoneDTO {
  return {
    id: row.id,
    title: row.title,
    category: row.category as MilestoneCategory,
    dateAchieved: row.date_achieved,
    notes: row.notes,
    verified: row.verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCareerMilestones(
  profileId: string
): Promise<CareerMilestoneDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('career_milestones')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('date_achieved', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as MilestoneRow[]).map(toDTO);
}

export async function createCareerMilestone(
  profileId: string,
  input: CreateCareerMilestoneInput
): Promise<CareerMilestoneDTO> {
  const { data, error } = await getSupabaseServer()
    .from('career_milestones')
    .insert({
      profile_id: profileId,
      title: input.title,
      category: input.category,
      date_achieved: input.dateAchieved,
      notes: input.notes ?? null,
      verified: input.verified ?? false,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as MilestoneRow);
}

export async function updateCareerMilestone(
  profileId: string,
  milestoneId: string,
  updates: UpdateCareerMilestoneInput
): Promise<CareerMilestoneDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.dateAchieved !== undefined) patch.date_achieved = updates.dateAchieved;
  if (updates.notes !== undefined) patch.notes = updates.notes ?? null;
  if (updates.verified !== undefined) patch.verified = updates.verified;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from('career_milestones')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', milestoneId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as MilestoneRow) : null;
}

export async function deleteCareerMilestone(
  profileId: string,
  milestoneId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('career_milestones')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', milestoneId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
