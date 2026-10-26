// Server persistence for public.volunteer_experiences + public.volunteer_projects.
//
// A volunteer experience is a stint the user volunteered for: the
// organisation, the role they took on, how long it lasted, what they were
// responsible for, what they achieved and which skills it gave them.
//
// It is deliberately NOT stored in `public.experiences`: that table holds
// EMPLOYMENT and feeds the CV import pipeline and the public resume, so a
// volunteer stint stored there would appear in the wrong timeline.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value. A link row is only
// written when BOTH the volunteer stint and the project belong to the
// signed-in user.
import { getSupabaseServer } from './supabase';

export interface VolunteerExperienceDTO {
  id: string;
  organization: string;
  role: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  responsibilities: string[];
  achievements: string[];
  skills: string[];
  /**
   * The ids of the EXISTING projects this stint is evidenced by.
   *
   * The link lives in `public.volunteer_projects`; `public.projects` itself
   * is untouched.
   */
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateVolunteerExperienceInput {
  organization: string;
  role: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  responsibilities?: string[];
  achievements?: string[];
  skills?: string[];
  projectIds?: string[];
}

export type UpdateVolunteerExperienceInput = Partial<CreateVolunteerExperienceInput>;

interface VolunteerRow {
  id: string;
  organization: string;
  role: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  responsibilities: unknown;
  achievements: unknown;
  skills: unknown;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, organization, role, location, start_date, end_date, is_current, description, responsibilities, achievements, skills, created_at, updated_at';

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toDTO(row: VolunteerRow, projectIds: string[]): VolunteerExperienceDTO {
  return {
    id: row.id,
    organization: row.organization,
    role: row.role,
    location: row.location,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    description: row.description,
    responsibilities: toStringArray(row.responsibilities),
    achievements: toStringArray(row.achievements),
    skills: toStringArray(row.skills),
    projectIds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The linked project ids for each volunteer experience. */
async function projectLinksFor(
  volunteerIds: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (volunteerIds.length === 0) return map;
  const { data, error } = await getSupabaseServer()
    .from('volunteer_projects')
    .select('volunteer_experience_id, project_id')
    .in('volunteer_experience_id', volunteerIds);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ volunteer_experience_id: string; project_id: string }>) {
    const list = map.get(row.volunteer_experience_id) ?? [];
    list.push(row.project_id);
    map.set(row.volunteer_experience_id, list);
  }
  return map;
}

/**
 * The ids of the projects that belong to this user.
 *
 * A link to a project the user does not own is rejected rather than written,
 * so one user can never attach a volunteer stint to somebody else's project.
 */
async function ownedProjectIds(profileId: string, projectIds: string[]): Promise<string[]> {
  const unique = [...new Set(projectIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const { data, error } = await getSupabaseServer()
    .from('projects')
    .select('id')
    .eq('profile_id', profileId)
    .in('id', unique);
  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export async function listVolunteerExperiences(
  profileId: string
): Promise<VolunteerExperienceDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('volunteer_experiences')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as VolunteerRow[];
  const linkMap = await projectLinksFor(rows.map((r) => r.id));
  return rows.map((row) => toDTO(row, linkMap.get(row.id) ?? []));
}

export async function getVolunteerExperience(
  profileId: string,
  id: string
): Promise<VolunteerExperienceDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('volunteer_experiences')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as VolunteerRow;
  const linkMap = await projectLinksFor([row.id]);
  return toDTO(row, linkMap.get(row.id) ?? []);
}

/** Replaces the project links of a volunteer experience with `projectIds`. */
async function replaceProjectLinks(
  profileId: string,
  volunteerId: string,
  projectIds: string[]
): Promise<string[]> {
  const owned = await ownedProjectIds(profileId, projectIds);
  const { error: clearError } = await getSupabaseServer()
    .from('volunteer_projects')
    .delete()
    .eq('volunteer_experience_id', volunteerId);
  if (clearError) throw clearError;
  if (owned.length > 0) {
    const { error: linkError } = await getSupabaseServer()
      .from('volunteer_projects')
      .upsert(
        owned.map((projectId) => ({
          volunteer_experience_id: volunteerId,
          project_id: projectId,
        })),
        { onConflict: 'volunteer_experience_id,project_id' }
      );
    if (linkError) throw linkError;
  }
  return owned;
}

export async function createVolunteerExperience(
  profileId: string,
  input: CreateVolunteerExperienceInput
): Promise<VolunteerExperienceDTO> {
  const { data, error } = await getSupabaseServer()
    .from('volunteer_experiences')
    .insert({
      profile_id: profileId,
      organization: input.organization,
      role: input.role,
      location: input.location ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      is_current: input.isCurrent ?? false,
      description: input.description ?? null,
      responsibilities: input.responsibilities ?? [],
      achievements: input.achievements ?? [],
      skills: input.skills ?? [],
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  const row = data as VolunteerRow;

  const linked = await replaceProjectLinks(profileId, row.id, input.projectIds ?? []);
  return toDTO(row, linked);
}

export async function updateVolunteerExperience(
  profileId: string,
  id: string,
  updates: UpdateVolunteerExperienceInput
): Promise<VolunteerExperienceDTO | null> {
  // Ownership is established BEFORE any child-table write: a links-only
  // PATCH for another user's volunteer id would otherwise delete that user's
  // project links, because the parent row itself is not updated.
  const { data: owned, error: ownedError } = await getSupabaseServer()
    .from('volunteer_experiences')
    .select('id')
    .eq('profile_id', profileId)
    .eq('id', id)
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (!owned) return null;

  const patch: Record<string, unknown> = {};
  if (updates.organization !== undefined) patch.organization = updates.organization;
  if (updates.role !== undefined) patch.role = updates.role;
  if (updates.location !== undefined) patch.location = updates.location ?? null;
  if (updates.startDate !== undefined) patch.start_date = updates.startDate ?? null;
  if (updates.endDate !== undefined) patch.end_date = updates.endDate ?? null;
  if (updates.isCurrent !== undefined) patch.is_current = updates.isCurrent;
  if (updates.description !== undefined) patch.description = updates.description ?? null;
  if (updates.responsibilities !== undefined) patch.responsibilities = updates.responsibilities;
  if (updates.achievements !== undefined) patch.achievements = updates.achievements;
  if (updates.skills !== undefined) patch.skills = updates.skills;
  if (Object.keys(patch).length > 0) patch.updated_at = new Date().toISOString();

  let row: VolunteerRow | null = null;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await getSupabaseServer()
      .from('volunteer_experiences')
      .update(patch)
      .eq('profile_id', profileId)
      .eq('id', id)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    row = data as VolunteerRow;
  }

  let linked: string[] | null = null;
  if (updates.projectIds !== undefined) {
    linked = await replaceProjectLinks(profileId, id, updates.projectIds);
  }

  if (!row) {
    const existing = await getVolunteerExperience(profileId, id);
    return existing;
  }
  if (linked === null) {
    const linkMap = await projectLinksFor([row.id]);
    linked = linkMap.get(row.id) ?? [];
  }
  return toDTO(row, linked);
}

export async function deleteVolunteerExperience(
  profileId: string,
  id: string
): Promise<boolean> {
  // The link rows go with the stint (ON DELETE CASCADE), so the delete is
  // scoped to the owner and the links never outlive their stint.
  const { data, error } = await getSupabaseServer()
    .from('volunteer_experiences')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/**
 * The volunteer experiences that a project is evidenced by.
 *
 * This is the OTHER direction of the link: the projects page shows which
 * volunteer stint a project belongs to.
 */
export async function listVolunteerExperiencesForProject(
  profileId: string,
  projectId: string
): Promise<VolunteerExperienceDTO[]> {
  const { data: links, error: linkError } = await getSupabaseServer()
    .from('volunteer_projects')
    .select('volunteer_experience_id')
    .eq('project_id', projectId);
  if (linkError) throw linkError;
  const ids = (links ?? []).map((row) => row.volunteer_experience_id as string);
  if (ids.length === 0) return [];

  const { data, error } = await getSupabaseServer()
    .from('volunteer_experiences')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as VolunteerRow[];
  const linkMap = await projectLinksFor(rows.map((r) => r.id));
  return rows.map((row) => toDTO(row, linkMap.get(row.id) ?? []));
}
