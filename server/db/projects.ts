// Server persistence for public.projects + public.project_skills.
//
// A project belongs to a profile. Its skills are a many-to-many link to the
// shared public.skills catalogue.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export type ProjectStatus = 'idea' | 'planned' | 'in_progress' | 'completed' | 'published';
export type ProjectDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type ProjectCategory = 'academic' | 'personal' | 'professional' | 'volunteer' | 'team';

export interface ProjectDTO {
  id: string;
  title: string;
  goal: string | null;
  description: string | null;
  difficulty: string | null;
  status: string | null;
  repositoryUrl: string | null;
  demoUrl: string | null;
  documentation: string | null;
  tasks: string[];
  deliverables: string[];
  /** Skill names linked through public.project_skills. */
  skills: string[];
  category: ProjectCategory;
  role: string | null;
  responsibilities: string[];
  startDate: string | null;
  isFeatured: boolean;
  includeInPortfolio: boolean;
  thumbnailUrl: string | null;
  screenshots: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface CreateProjectInput {
  title: string;
  goal?: string;
  description?: string;
  difficulty?: ProjectDifficulty;
  status?: ProjectStatus;
  repositoryUrl?: string;
  demoUrl?: string;
  documentation?: string;
  tasks?: string[];
  deliverables?: string[];
  skills?: string[];
  category?: ProjectCategory;
  role?: string;
  responsibilities?: string[];
  startDate?: string;
  isFeatured?: boolean;
  includeInPortfolio?: boolean;
  thumbnailUrl?: string;
  screenshots?: string[];
}

export type UpdateProjectInput = Partial<CreateProjectInput>;

interface ProjectRow {
  id: string;
  title: string;
  goal: string | null;
  description: string | null;
  difficulty: string | null;
  status: string | null;
  repository_url: string | null;
  demo_url: string | null;
  documentation: string | null;
  tasks: unknown;
  deliverables: unknown;
  created_at: string;
  completed_at: string | null;
  category?: string | null;
  role?: string | null;
  responsibilities?: unknown;
  start_date?: string | null;
  is_featured?: boolean | null;
  include_in_portfolio?: boolean | null;
  thumbnail_url?: string | null;
  screenshots?: unknown;
}

const SELECT_COLUMNS =
  'id, title, goal, description, difficulty, status, repository_url, demo_url, documentation, tasks, deliverables, created_at, completed_at, category, role, responsibilities, start_date, is_featured, include_in_portfolio, thumbnail_url, screenshots';

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toDTO(row: ProjectRow, skills: string[]): ProjectDTO {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    description: row.description,
    difficulty: row.difficulty,
    status: row.status,
    repositoryUrl: row.repository_url,
    demoUrl: row.demo_url,
    documentation: row.documentation,
    tasks: toStringArray(row.tasks),
    deliverables: toStringArray(row.deliverables),
    skills,
    category: (row.category as ProjectCategory) || 'personal',
    role: row.role ?? null,
    responsibilities: toStringArray(row.responsibilities),
    startDate: row.start_date ?? null,
    isFeatured: Boolean(row.is_featured),
    includeInPortfolio: row.include_in_portfolio !== false,
    thumbnailUrl: row.thumbnail_url ?? null,
    screenshots: toStringArray(row.screenshots),
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function skillsForProjects(projectIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (projectIds.length === 0) return map;
  const { data, error } = await getSupabaseServer()
    .from('project_skills')
    .select('project_id, skill_name')
    .in('project_id', projectIds);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ project_id: string; skill_name: string }>) {
    const list = map.get(row.project_id) ?? [];
    list.push(row.skill_name);
    map.set(row.project_id, list);
  }
  return map;
}

/** Resolves skill names to catalogue ids, creating catalogue rows if needed. */
/** The category values the app uses for a skill (public.skills.category is NOT NULL). */
export const SKILL_CATEGORIES = [
  'technical',
  'analytical',
  'business',
  'communication',
  'leadership',
  'tools',
  'domain',
  'soft_skills',
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

async function resolveSkillIds(
  skillNames: string[],
  category: SkillCategory = 'technical'
): Promise<Array<{ skill_id: string; skill_name: string }>> {
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
        .insert({ name, category })
        .select('id')
        .single();
      if (createError) throw createError;
      id = created?.id as string;
    }
    if (id) resolved.push({ skill_id: id, skill_name: name });
  }
  return resolved;
}

export async function listProjects(profileId: string): Promise<ProjectDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('projects')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as ProjectRow[];
  const skillMap = await skillsForProjects(rows.map((r) => r.id));
  return rows.map((row) => toDTO(row, skillMap.get(row.id) ?? []));
}

export async function getProject(
  profileId: string,
  projectId: string
): Promise<ProjectDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('projects')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ProjectRow;
  const skillMap = await skillsForProjects([row.id]);
  return toDTO(row, skillMap.get(row.id) ?? []);
}

export async function createProject(
  profileId: string,
  input: CreateProjectInput
): Promise<ProjectDTO> {
  const { data, error } = await getSupabaseServer()
    .from('projects')
    .insert({
      profile_id: profileId,
      title: input.title,
      goal: input.goal ?? null,
      description: input.description ?? null,
      difficulty: input.difficulty ?? null,
      status: input.status ?? null,
      repository_url: input.repositoryUrl ?? null,
      demo_url: input.demoUrl ?? null,
      documentation: input.documentation ?? null,
      tasks: input.tasks ?? [],
      deliverables: input.deliverables ?? [],
      category: input.category ?? 'personal',
      role: input.role ?? null,
      responsibilities: input.responsibilities ?? [],
      start_date: input.startDate ?? null,
      is_featured: input.isFeatured ?? false,
      include_in_portfolio: input.includeInPortfolio !== false,
      thumbnail_url: input.thumbnailUrl ?? null,
      screenshots: input.screenshots ?? [],
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  const row = data as ProjectRow;

  const skillLinks = await resolveSkillIds(input.skills ?? []);
  if (skillLinks.length > 0) {
    const { error: linkError } = await getSupabaseServer()
      .from('project_skills')
      .upsert(
        skillLinks.map((link) => ({
          project_id: row.id,
          skill_id: link.skill_id,
          skill_name: link.skill_name,
        })),
        { onConflict: 'project_id,skill_id' }
      );
    if (linkError) throw linkError;
  }

  return toDTO(row, skillLinks.map((l) => l.skill_name));
}

export async function updateProject(
  profileId: string,
  projectId: string,
  updates: UpdateProjectInput
): Promise<ProjectDTO | null> {
  // Ownership must be established before any child-table write. Without this
  // a skills-only PATCH for another user's project id would delete that user's
  // project_skills rows, because the parent row itself is not updated.
  const { data: owned, error: ownedError } = await getSupabaseServer()
    .from('projects')
    .select('id')
    .eq('profile_id', profileId)
    .eq('id', projectId)
    .maybeSingle();
  if (ownedError) throw ownedError;
  if (!owned) return null;

  const patch: Record<string, unknown> = {};
  if (updates.title !== undefined) patch.title = updates.title;
  if (updates.goal !== undefined) patch.goal = updates.goal ?? null;
  if (updates.description !== undefined) patch.description = updates.description ?? null;
  if (updates.difficulty !== undefined) patch.difficulty = updates.difficulty ?? null;
  if (updates.status !== undefined) patch.status = updates.status ?? null;
  if (updates.repositoryUrl !== undefined) patch.repository_url = updates.repositoryUrl ?? null;
  if (updates.demoUrl !== undefined) patch.demo_url = updates.demoUrl ?? null;
  if (updates.documentation !== undefined) patch.documentation = updates.documentation ?? null;
  if (updates.tasks !== undefined) patch.tasks = updates.tasks;
  if (updates.deliverables !== undefined) patch.deliverables = updates.deliverables;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.role !== undefined) patch.role = updates.role ?? null;
  if (updates.responsibilities !== undefined) patch.responsibilities = updates.responsibilities;
  if (updates.startDate !== undefined) patch.start_date = updates.startDate ?? null;
  if (updates.isFeatured !== undefined) patch.is_featured = updates.isFeatured;
  if (updates.includeInPortfolio !== undefined) patch.include_in_portfolio = updates.includeInPortfolio;
  if (updates.thumbnailUrl !== undefined) patch.thumbnail_url = updates.thumbnailUrl ?? null;
  if (updates.screenshots !== undefined) patch.screenshots = updates.screenshots;

  let row: ProjectRow | null = null;
  if (Object.keys(patch).length > 0) {
    const { data, error } = await getSupabaseServer()
      .from('projects')
      .update(patch)
      .eq('profile_id', profileId)
      .eq('id', projectId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    row = data as ProjectRow;
  }

  if (updates.skills !== undefined) {
    const skillLinks = await resolveSkillIds(updates.skills);
    const { error: clearError } = await getSupabaseServer()
      .from('project_skills')
      .delete()
      .eq('project_id', projectId);
    if (clearError) throw clearError;
    if (skillLinks.length > 0) {
      const { error: linkError } = await getSupabaseServer()
        .from('project_skills')
        .upsert(
          skillLinks.map((link) => ({
            project_id: projectId,
            skill_id: link.skill_id,
            skill_name: link.skill_name,
          })),
          { onConflict: 'project_id,skill_id' }
        );
      if (linkError) throw linkError;
    }
  }

  if (!row) {
    const existing = await getProject(profileId, projectId);
    return existing;
  }
  const skillMap = await skillsForProjects([row.id]);
  return toDTO(row, skillMap.get(row.id) ?? []);
}

export async function deleteProject(profileId: string, projectId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('projects')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', projectId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
