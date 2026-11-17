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

export type EvidenceVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface EvidenceDTO {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  url: string | null;
  verified: boolean;
  verificationStatus: EvidenceVerificationStatus;
  verifiedAt: string | null;
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
  /** Ignored for public create/update; only the admin review route can verify. */
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
  verification_status?: EvidenceVerificationStatus | null;
  verified_at?: string | null;
  date_added: string | null;
  project_id: string | null;
}

const SELECT_COLUMNS =
  'id, title, type, description, url, verified, verification_status, verified_at, date_added, project_id';
const LEGACY_SELECT_COLUMNS =
  'id, title, type, description, url, verified, date_added, project_id';
type EvidenceQueryResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

function hasEvidenceReviewSchemaError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? '';
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    /verification_status|verified_at|verified_by|verification_note/i.test(message)
  );
}

export class EvidenceReviewUnavailableError extends Error {
  readonly code = 'EVIDENCE_REVIEW_SCHEMA_UNAVAILABLE';

  constructor() {
    super('Evidence review requires the evidence verification migration');
    this.name = 'EvidenceReviewUnavailableError';
  }
}

function toDTO(row: EvidenceRow, skillNames: string[]): EvidenceDTO {
  const verificationStatus = row.verification_status ?? 'pending';
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    description: row.description,
    url: row.url,
    // A legacy boolean is not sufficient proof of a platform review.
    verified: verificationStatus === 'verified',
    verificationStatus,
    verifiedAt: row.verified_at ?? null,
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
  const supabase = getSupabaseServer();
  let result: EvidenceQueryResult = await supabase
    .from('evidence_items')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('date_added', { ascending: false });
  if (hasEvidenceReviewSchemaError(result.error)) {
    result = await supabase
      .from('evidence_items')
      .select(LEGACY_SELECT_COLUMNS)
      .eq('profile_id', profileId)
      .order('date_added', { ascending: false });
  }
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as EvidenceRow[];
  const skillMap = await skillsForEvidence(rows.map((r) => r.id));
  return rows.map((row) => toDTO(row, skillMap.get(row.id) ?? []));
}

export async function getEvidence(
  profileId: string,
  evidenceId: string
): Promise<EvidenceDTO | null> {
  const supabase = getSupabaseServer();
  let result: EvidenceQueryResult = await supabase
    .from('evidence_items')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', evidenceId)
    .maybeSingle();
  if (hasEvidenceReviewSchemaError(result.error)) {
    result = await supabase
      .from('evidence_items')
      .select(LEGACY_SELECT_COLUMNS)
      .eq('profile_id', profileId)
      .eq('id', evidenceId)
      .maybeSingle();
  }
  if (result.error) throw result.error;
  if (!result.data) return null;
  const row = result.data as EvidenceRow;
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

  const supabase = getSupabaseServer();
  let result: EvidenceQueryResult = await supabase
    .from('evidence_items')
    .insert({
      profile_id: profileId,
      title: input.title,
      type: input.type ?? null,
      description: input.description ?? null,
      url: input.url ?? null,
      verified: false,
      verification_status: 'pending',
      date_added: input.dateAdded ?? null,
      project_id: input.projectId ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (hasEvidenceReviewSchemaError(result.error)) {
    result = await supabase
      .from('evidence_items')
      .insert({
        profile_id: profileId,
        title: input.title,
        type: input.type ?? null,
        description: input.description ?? null,
        url: input.url ?? null,
        verified: false,
        date_added: input.dateAdded ?? null,
        project_id: input.projectId ?? null,
      })
      .select(LEGACY_SELECT_COLUMNS)
      .single();
  }
  if (result.error) throw result.error;
  const row = result.data as EvidenceRow;

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
  // Ownership must be established before any child-table write. Without this
  // a skillNames-only PATCH for another user's evidence id would delete that
  // user's evidence_skills rows, because the parent row is not updated.
  const { data: owned, error: ownedError } = await getSupabaseServer()
    .from('evidence_items')
    .select('id')
    .eq('profile_id', profileId)
    .eq('id', evidenceId)
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (!owned) return null;

  if (updates.projectId) {
    const ok = await projectBelongsToProfile(profileId, updates.projectId);
    if (!ok) throw new Error('Project not found');
  }

  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.type !== undefined) patch.type = updates.type ?? null;
  if (updates.description !== undefined) patch.description = updates.description ?? null;
  if (updates.url !== undefined) patch.url = updates.url ?? null;
  if (updates.dateAdded !== undefined) patch.date_added = updates.dateAdded ?? null;
  if (updates.projectId !== undefined) patch.project_id = updates.projectId ?? null;

  let row: EvidenceRow | null = null;
  if (Object.keys(patch).length > 0) {
    const supabase = getSupabaseServer();
    let result: EvidenceQueryResult = await supabase
      .from('evidence_items')
      .update(patch)
      .eq('profile_id', profileId)
      .eq('id', evidenceId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (hasEvidenceReviewSchemaError(result.error)) {
      result = await supabase
        .from('evidence_items')
        .update(patch)
        .eq('profile_id', profileId)
        .eq('id', evidenceId)
        .select(LEGACY_SELECT_COLUMNS)
        .maybeSingle();
    }
    if (result.error) throw result.error;
    if (!result.data) return null;
    row = result.data as EvidenceRow;
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

export async function reviewEvidence(
  evidenceId: string,
  reviewerId: string,
  status: Exclude<EvidenceVerificationStatus, 'pending'>,
  note?: string
): Promise<EvidenceDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('evidence_items')
    .update({
      verification_status: status,
      verified: status === 'verified',
      verified_at: status === 'verified' ? new Date().toISOString() : null,
      verified_by: reviewerId,
      verification_note: note?.trim() || null,
    })
    .eq('id', evidenceId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (hasEvidenceReviewSchemaError(error)) throw new EvidenceReviewUnavailableError();
  if (error) throw error;
  if (!data) return null;
  const row = data as EvidenceRow;
  const skillMap = await skillsForEvidence([row.id]);
  return toDTO(row, skillMap.get(row.id) ?? []);
}

/**
 * One item in the administrator's review queue.
 *
 * The evidence itself is the candidate's own record; what an administrator
 * needs in addition is who it belongs to, so the row carries the owner's
 * name and target role.
 */
export interface EvidenceReviewQueueItem extends EvidenceDTO {
  /** The candidate the evidence belongs to. */
  profileId: string;
  /** The candidate's name, when they have one. */
  ownerName: string | null;
  /** The candidate's username, which is always present. */
  ownerUsername: string | null;
  /** The role the candidate is aiming at. */
  ownerTargetRole: string | null;
  /** When the evidence was recorded. */
  createdAt: string | null;
}

/**
 * The evidence that is waiting for an administrator to look at it.
 *
 * The queue is ordered oldest first, so the evidence that has been waiting
 * longest is the first one an administrator sees. The rows are read from the
 * whole table rather than for one candidate, because the review is the
 * administrator's job and not the candidate's.
 */
export async function listEvidenceForReview(
  limit = 50
): Promise<EvidenceReviewQueueItem[]> {
  const supabase = getSupabaseServer();

  const capped = Math.max(1, Math.min(limit, 200));
  let result: EvidenceQueryResult = await supabase
    .from('evidence_items')
    .select(`${SELECT_COLUMNS}, profile_id, created_at`)
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(capped);
  if (hasEvidenceReviewSchemaError(result.error)) {
    // The column that records when the artifact arrived may not be there
    // yet. The queue still works without it — the date the candidate wrote
    // is a weaker order, but a weaker order is better than no queue.
    result = await supabase
      .from('evidence_items')
      .select(`${LEGACY_SELECT_COLUMNS}, profile_id`)
      .eq('verification_status', 'pending')
      .order('date_added', { ascending: true })
      .limit(capped);
  }
  if (hasEvidenceReviewSchemaError(result.error)) throw new EvidenceReviewUnavailableError();
  if (result.error) throw result.error;

  const rows = (result.data ?? []) as Array<
    EvidenceRow & { profile_id: string | null; created_at: string | null }
  >;
  if (rows.length === 0) return [];

  // The owners are read once, so the queue costs two reads rather than one
  // per row.
  const ownerIds = Array.from(
    new Set(rows.map((row) => row.profile_id).filter((id): id is string => Boolean(id)))
  );
  const owners = new Map<
    string,
    { full_name: string | null; username: string | null; target_role: string | null }
  >();
  if (ownerIds.length > 0) {
    const { data: ownerRows, error: ownerError } = await supabase
      .from('profiles')
      .select('id, full_name, username, target_role')
      .in('id', ownerIds);
    if (ownerError) throw ownerError;
    for (const owner of (ownerRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      username: string | null;
      target_role: string | null;
    }>) {
      owners.set(owner.id, {
        full_name: owner.full_name,
        username: owner.username,
        target_role: owner.target_role,
      });
    }
  }

  const skillMap = await skillsForEvidence(rows.map((row) => row.id));

  return rows.map((row) => {
    const owner = row.profile_id ? owners.get(row.profile_id) : undefined;
    return {
      ...toDTO(row, skillMap.get(row.id) ?? []),
      profileId: row.profile_id ?? '',
      ownerName: owner?.full_name ?? null,
      ownerUsername: owner?.username ?? null,
      ownerTargetRole: owner?.target_role ?? null,
      createdAt: row.created_at ?? null,
    };
  });
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
