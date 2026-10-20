// Server persistence for public.evidence_items + public.evidence_skills.
//
// Evidence belongs to a profile and may optionally link to one of the
// profile's projects. Its skills are a many-to-many link to the shared
// public.skills catalogue.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export type EvidenceType =
  | 'github'
  | 'demo'
  | 'certificate'
  | 'project'
  | 'experience'
  | 'course'
  | 'assessment'
  | 'portfolio';

export const EVIDENCE_TYPES: EvidenceType[] = [
  'github',
  'demo',
  'certificate',
  'project',
  'experience',
  'course',
  'assessment',
  'portfolio',
];

export interface EvidenceDTO {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  url: string | null;
  verified: boolean;
  dateAdded: string | null;
  /** Optional link to one of the profile's projects. */
  projectId: string | null;
  /** Skill names linked through public.evidence_skills. */
  skillNames: string[];
}

export interface CreateEvidenceInput {
  title: string;
  type?: EvidenceType;
  description?: string;
  url?: string;
  verified?: boolean;
  dateAdded?: string;
  projectId?: string;
  skillNames?: string[];
}

export type UpdateEvidenceInput = Partial<CreateEvidenceInput>;

interface EvidenceRow {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  url: string | null;
  verified: boolean;
  date_added: string | null;
  project_id: string | null;
}

const SELECT_COLUMNS =
  'id, title, type, description, url, verified, date_added, project_id';

function toDTO(row: EvidenceRow, skillNames: string[]): EvidenceDTO {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    description: row.description,
    url: row.url,
    verified: row.verified,
    dateAdded: row.date_added,
    projectId: row.project_id,
    skillNames,
  };
}

async function skillsForEvidence(evidenceIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (evidenceIds.length === 0) return map;
  const { data, error } = await getSupabaseServer()
    .from('evidence_skills')
    .select('evidence_id, skill_id')
    .in('evidence_id', evidenceIds);
  if (error) throw error;

  const skillIds = (data ?? []).map((r) => (r as { skill_id: string }).skill_id);
  let namesById = new Map<string, string>();
  if (skillIds.length > 0) {
    const { data: skills, error: skillError } = await getSupabaseServer()
      .from('skills')
      .select('id, name')
      .in('id', skillIds);
    if (skillError) throw skillError;
    namesById = new Map(
      ((skills ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name])
    );
  }

  for (const row of (data ?? []) as Array<{ evidence_id: string; skill_id: string }>) {
    const list = map.get(row.evidence_id) ?? [];
    const name = namesById.get(row.skill_id);
    if (name) list.push(name);
    map.set(row.evidence_id, list);
  }
  return map;
}

async function resolveSkillIds(skillNames: string[]): Promise<Array<{ skill_id: string; skill_name: string }>> {
  const resolved: Array<{ skill_id: string; skill_name: string }> = [];
  for (const rawName of skillNames) {
    const name = rawName.trim();
    if (!name) continue;
    const { data: found } = await getSupabaseServer()
      .from('skills')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    let id = found?.id as string | undefined;
    if (!id) {
      const { data: created, error: createError } = await getSupabaseServer()
        .from('skills')
        .insert({ name, category: 'technical' })
        .select('id')
        .single();
      if (createError) throw createError;
      id = created?.id as string;
    }
    if (id) resolved.push({ skill_id: id, skill_name: name });
  }
  return resolved;
}

/** Verifies the referenced project belongs to the same profile. */
export async function projectBelongsToProfile(
  profileId: string,
  projectId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function listEvidence(profileId: string): Promise<EvidenceDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('evidence_items')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('date_added', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as EvidenceRow[];
  const skillMap = await skillsForEvidence(rows.map((r) => r.id));
  return rows.map((row) => toDTO(row, skillMap.get(row.id) ?? []));
}

export async function getEvidence(
  profileId: string,
  evidenceId: string
): Promise<EvidenceDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('evidence_items')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', evidenceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as EvidenceRow;
  const skillMap = await skillsForEvidence([row.id]);
  return toDTO(row, skillMap.get(row.id) ?? []);
}

export async function createEvidence(
  profileId: string,
  input: CreateEvidenceInput
): Promise<EvidenceDTO> {
  if (input.projectId) {
    const ok = await projectBelongsToProfile(profileId, input.projectId);
    if (!ok) throw new Error('Project not found');
  }

  const { data, error } = await getSupabaseServer()
    .from('evidence_items')
    .insert({
      profile_id: profileId,
      title: input.title,
      type: input.type ?? null,
      description: input.description ?? null,
      url: input.url ?? null,
      verified: input.verified ?? false,
      date_added: input.dateAdded ?? null,
      project_id: input.projectId ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  const row = data as EvidenceRow;

  const skillLinks = await resolveSkillIds(input.skillNames ?? []);
  if (skillLinks.length > 0) {
    const { error: linkError } = await getSupabaseServer()
      .from('evidence_skills')
      .upsert(
        skillLinks.map((link) => ({
          evidence_id: row.id,
          skill_id: link.skill_id,
        })),
        { onConflict: 'evidence_id,skill_id' }
      );
    if (linkError) throw linkError;
  }

  return toDTO(row, skillLinks.map((l) => l.skill_name));
}

export async function updateEvidence(
  profileId: string,
  evidenceId: string,
  updates: UpdateEvidenceInput
): Promise<EvidenceDTO | null> {
  if (updates.projectId) {
    const ok = await projectBelongsToProfile(profileId, updates.projectId);
    if (!ok) throw new Error('Project not found');
  }

  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.type !== undefined) patch.type = updates.type ?? null;
  if (updates.description !== undefined) patch.description = updates.description ?? null;
  if (updates.url !== undefined) patch.url = updates.url ?? null;
  if (updates.verified !== undefined) patch.verified = updates.verified;
  if (updates.dateAdded !== undefined) patch.date_added = updates.dateAdded ?? null;
  if (updates.projectId !== undefined) patch.project_id = updates.projectId ?? null;

  let row: EvidenceRow | null = null;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await getSupabaseServer()
      .from('evidence_items')
      .update(patch)
      .eq('profile_id', profileId)
      .eq('id', evidenceId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    row = data as EvidenceRow;
  }

  if (updates.skillNames !== undefined) {
    const skillLinks = await resolveSkillIds(updates.skillNames);
    const { error: clearError } = await getSupabaseServer()
      .from('evidence_skills')
      .delete()
      .eq('evidence_id', evidenceId);
    if (clearError) throw clearError;
    if (skillLinks.length > 0) {
      const { error: linkError } = await getSupabaseServer()
        .from('evidence_skills')
        .upsert(
          skillLinks.map((link) => ({
            evidence_id: evidenceId,
            skill_id: link.skill_id,
          })),
          { onConflict: 'evidence_id,skill_id' }
        );
      if (linkError) throw linkError;
    }
  }

  if (!row) return getEvidence(profileId, evidenceId);
  const skillMap = await skillsForEvidence([row.id]);
  return toDTO(row, skillMap.get(row.id) ?? []);
}

export async function deleteEvidence(
  profileId: string,
  evidenceId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('evidence_items')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', evidenceId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
