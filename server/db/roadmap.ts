// Server persistence for the roadmap tables:
//   public.roadmaps -> public.roadmap_phases -> public.roadmap_milestones -> public.roadmap_tasks
//
// The roadmap tables are the source of truth for roadmap state. Progress is
// derived from task status (there is no separate progress table by design).
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export type RoadmapTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'blocked';

export const ROADMAP_TASK_STATUSES: RoadmapTaskStatus[] = [
  'not_started',
  'in_progress',
  'completed',
  'skipped',
  'blocked',
];

export interface RoadmapTaskDTO {
  id: string;
  title: string;
  description: string | null;
  status: RoadmapTaskStatus;
  skillId: string | null;
  skillName: string | null;
  deadline: string | null;
  resourceId: string | null;
  resourceTitle: string | null;
  evidenceId: string | null;
  estimatedHours: number | null;
  /**
   * The kind of work this step is: learning, practice, project or
   * application. It is what makes the time estimate break down honestly.
   */
  workKind: string | null;
  sortOrder: number;
  /** How hard this step is: foundational, intermediate or advanced. */
  difficulty: string | null;
  /** Titles of the steps that must be finished before this one. */
  prerequisites: string[];
  /** Every skill this step moves the user on. */
  skillNames: string[];
  /** Projects that demonstrate this step. */
  projectTitles: string[];
  /** Recommended learning resources, with their links. */
  resources: RoadmapResourceDTO[];
  /** Urgency of the gap this step closes. */
  priority: string | null;
  /** Plain-language reason this step is in this user's plan. */
  rationale: string | null;
}

/** A learning resource attached to a roadmap step. */
export interface RoadmapResourceDTO {
  id: string;
  title: string;
  provider: string;
  url: string;
  durationHours: number | null;
}

export interface RoadmapMilestoneDTO {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  /** Derived from the tasks' status — never stored. */
  completedTasksCount: number;
  tasks: RoadmapTaskDTO[];
}

export interface RoadmapPhaseDTO {
  id: string;
  phaseNumber: number;
  title: string;
  description: string | null;
  /** The role-specific outcome this phase works towards. */
  goal: string | null;
  isUnlocked: boolean;
  sortOrder: number;
  milestones: RoadmapMilestoneDTO[];
}

export interface RoadmapDTO {
  id: string;
  title: string;
  status: string;
  isEnrolled: boolean;
  targetRoleTitle: string | null;
  /** Catalogue slug of the role this roadmap was generated for. */
  targetRoleId: string | null;
  /** Catalogue slug of the role's domain. */
  domainId: string | null;
  /** How ready the user is for the role, 0..100. */
  readinessPct: number | null;
  /** Counts and totals describing the generated plan. */
  planSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  phases: RoadmapPhaseDTO[];
  /** Derived progress across every task in the roadmap. */
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
}

export interface CreateRoadmapInput {
  title: string;
  targetRoleTitle?: string;
  isEnrolled?: boolean;
  targetRoleId?: string;
  domainId?: string;
  readinessPct?: number;
  planSummary?: Record<string, unknown>;
}

export interface CreateRoadmapTaskInput {
  title: string;
  description?: string;
  status?: RoadmapTaskStatus;
  skillId?: string;
  skillName?: string;
  deadline?: string;
  resourceId?: string;
  resourceTitle?: string;
  evidenceId?: string;
  estimatedHours?: number;
  /** The kind of work this step is, for the additive time breakdown. */
  workKind?: string | null;
  difficulty?: string;
  prerequisites?: string[];
  skillNames?: string[];
  projectTitles?: string[];
  resources?: RoadmapResourceDTO[];
  priority?: string;
  rationale?: string;
}

/**
 * The shape the frontend sends when it persists a whole roadmap tree.
 *
 * It mirrors the frontend's `RoadmapPhase` view-model, minus the local-only
 * ids: the ids are assigned by the database.
 */
export interface RoadmapTreePhaseInput {
  phaseNumber: number;
  title: string;
  description?: string;
  /** The role-specific outcome this phase works towards. */
  goal?: string;
  isUnlocked?: boolean;
  milestones: Array<{
    title: string;
    description?: string;
    tasks: CreateRoadmapTaskInput[];
  }>;
}

interface RoadmapRow {
  id: string;
  title: string;
  status: string;
  is_enrolled: boolean;
  target_role_title: string | null;
  target_role_id: string | null;
  domain_id: string | null;
  readiness_pct: number | null;
  plan_summary: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface PhaseRow {
  id: string;
  roadmap_id: string;
  phase_number: number;
  title: string;
  description: string | null;
  goal: string | null;
  is_unlocked: boolean;
  sort_order: number;
}

interface MilestoneRow {
  id: string;
  phase_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

interface TaskRow {
  id: string;
  milestone_id: string;
  title: string;
  description: string | null;
  status: string;
  skill_id: string | null;
  skill_name: string | null;
  deadline: string | null;
  resource_id: string | null;
  resource_title: string | null;
  evidence_id: string | null;
  estimated_hours: number | null;
  work_kind: string | null;
  sort_order: number;
  difficulty: string | null;
  prerequisites: string[] | null;
  skill_names: string[] | null;
  project_titles: string[] | null;
  resources: RoadmapResourceDTO[] | null;
  priority: string | null;
  rationale: string | null;
}

/** Parses the `resources` jsonb column, tolerating an older shape. */
function toResourceDTOs(value: unknown): RoadmapResourceDTO[] {
  if (!Array.isArray(value)) return [];
  const out: RoadmapResourceDTO[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : null;
    const title = typeof record.title === 'string' ? record.title : null;
    if (!id || !title) continue;
    out.push({
      id,
      title,
      provider: typeof record.provider === 'string' ? record.provider : '',
      url: typeof record.url === 'string' ? record.url : '',
      durationHours:
        typeof record.durationHours === 'number' ? record.durationHours : null,
    });
  }
  return out;
}

function toTaskDTO(row: TaskRow): RoadmapTaskDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as RoadmapTaskStatus,
    skillId: row.skill_id,
    skillName: row.skill_name,
    deadline: row.deadline,
    resourceId: row.resource_id,
    resourceTitle: row.resource_title,
    evidenceId: row.evidence_id,
    estimatedHours: row.estimated_hours,
    workKind: row.work_kind,
    sortOrder: row.sort_order,
    difficulty: row.difficulty,
    prerequisites: row.prerequisites ?? [],
    skillNames: row.skill_names ?? [],
    projectTitles: row.project_titles ?? [],
    resources: toResourceDTOs(row.resources),
    priority: row.priority,
    rationale: row.rationale,
  };
}

function toMilestoneDTO(row: MilestoneRow, tasks: RoadmapTaskDTO[]): RoadmapMilestoneDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    completedTasksCount: tasks.filter((t) => t.status === 'completed').length,
    tasks,
  };
}

function toPhaseDTO(
  row: PhaseRow,
  milestones: RoadmapMilestoneDTO[]
): RoadmapPhaseDTO {
  return {
    id: row.id,
    phaseNumber: row.phase_number,
    title: row.title,
    description: row.description,
    goal: row.goal,
    isUnlocked: row.is_unlocked,
    sortOrder: row.sort_order,
    milestones,
  };
}

function toRoadmapDTO(
  row: RoadmapRow,
  phases: RoadmapPhaseDTO[]
): RoadmapDTO {
  const allTasks = phases.flatMap((p) => p.milestones.flatMap((m) => m.tasks));
  const completedTasks = allTasks.filter((t) => t.status === 'completed').length;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    isEnrolled: row.is_enrolled,
    targetRoleTitle: row.target_role_title,
    targetRoleId: row.target_role_id,
    domainId: row.domain_id,
    readinessPct: row.readiness_pct,
    planSummary: row.plan_summary ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    phases,
    totalTasks: allTasks.length,
    completedTasks,
    progressPercent:
      allTasks.length === 0 ? 0 : Math.round((completedTasks / allTasks.length) * 100),
  };
}

/** Loads the profile's roadmap with its full phase/milestone/task tree. */
export async function listRoadmaps(profileId: string): Promise<RoadmapDTO[]> {
  const { data: roadmapRows, error: roadmapError } = await getSupabaseServer()
    .from('roadmaps')
    .select('id, title, status, is_enrolled, target_role_title, target_role_id, domain_id, readiness_pct, plan_summary, created_at, updated_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (roadmapError) throw roadmapError;
  const roadmaps = (roadmapRows ?? []) as RoadmapRow[];
  if (roadmaps.length === 0) return [];

  const roadmapIds = roadmaps.map((r) => r.id);
  const { data: phaseRows, error: phaseError } = await getSupabaseServer()
    .from('roadmap_phases')
    .select('id, roadmap_id, phase_number, title, description, goal, is_unlocked, sort_order')
    .in('roadmap_id', roadmapIds)
    // Negative phase numbers are the staging representation used while a
    // replacement roadmap is being written. They are never part of the
    // roadmap the user sees.
    .gte('phase_number', 1)
    .order('sort_order', { ascending: true });
  if (phaseError) throw phaseError;
  const phases = (phaseRows ?? []) as PhaseRow[];
  if (phases.length === 0) return roadmaps.map((r) => toRoadmapDTO(r, []));

  const phaseIds = phases.map((p) => p.id);
  const { data: milestoneRows, error: milestoneError } = await getSupabaseServer()
    .from('roadmap_milestones')
    .select('id, phase_id, title, description, sort_order')
    .in('phase_id', phaseIds)
    .order('sort_order', { ascending: true });
  if (milestoneError) throw milestoneError;
  const milestones = (milestoneRows ?? []) as MilestoneRow[];

  const milestoneIds = milestones.map((m) => m.id);
  let tasks: TaskRow[] = [];
  if (milestoneIds.length > 0) {
    const { data: taskRows, error: taskError } = await getSupabaseServer()
      .from('roadmap_tasks')
      .select(
        'id, milestone_id, title, description, status, skill_id, skill_name, deadline, resource_id, resource_title, evidence_id, estimated_hours, work_kind, sort_order, difficulty, prerequisites, skill_names, project_titles, resources, priority, rationale'
      )
      .in('milestone_id', milestoneIds)
      .order('sort_order', { ascending: true });
    if (taskError) throw taskError;
    tasks = (taskRows ?? []) as TaskRow[];
  }

  const tasksByMilestone = new Map<string, RoadmapTaskDTO[]>();
  for (const task of tasks) {
    const list = tasksByMilestone.get(task.milestone_id) ?? [];
    list.push(toTaskDTO(task));
    tasksByMilestone.set(task.milestone_id, list);
  }

  const milestonesByPhase = new Map<string, RoadmapMilestoneDTO[]>();
  for (const milestone of milestones) {
    const list = milestonesByPhase.get(milestone.phase_id) ?? [];
    list.push(toMilestoneDTO(milestone, tasksByMilestone.get(milestone.id) ?? []));
    milestonesByPhase.set(milestone.phase_id, list);
  }

  const phasesByRoadmap = new Map<string, RoadmapPhaseDTO[]>();
  for (const phase of phases) {
    const list = phasesByRoadmap.get(phase.roadmap_id) ?? [];
    list.push(toPhaseDTO(phase, milestonesByPhase.get(phase.id) ?? []));
    phasesByRoadmap.set(phase.roadmap_id, list);
  }

  return roadmaps.map((r) => toRoadmapDTO(r, phasesByRoadmap.get(r.id) ?? []));
}

/** Returns the profile's roadmap (the app model is one roadmap per profile). */
export async function getRoadmap(profileId: string): Promise<RoadmapDTO | null> {
  const roadmaps = await listRoadmaps(profileId);
  return roadmaps[0] ?? null;
}

export async function createRoadmap(
  profileId: string,
  input: CreateRoadmapInput
): Promise<RoadmapDTO> {
  const { data, error } = await getSupabaseServer()
    .from('roadmaps')
    .insert({
      profile_id: profileId,
      title: input.title,
      status: 'active',
      is_enrolled: input.isEnrolled ?? false,
      target_role_title: input.targetRoleTitle ?? null,
      target_role_id: input.targetRoleId ?? null,
      domain_id: input.domainId ?? null,
      readiness_pct: input.readinessPct ?? null,
      plan_summary: input.planSummary ?? {},
      generated_at: new Date().toISOString(),
    })
    .select('id, title, status, is_enrolled, target_role_title, target_role_id, domain_id, readiness_pct, plan_summary, created_at, updated_at')
    .single();
  if (error) throw error;
  return toRoadmapDTO(data as RoadmapRow, []);
}

/**
 * Creates a phase on a roadmap owned by the given profile.
 *
 * Ownership: the roadmap must belong to the profile. A profile has at most one
 * roadmap (UNIQUE profile_id), so the roadmap id is the profile's roadmap.
 */
export async function addPhase(
  profileId: string,
  roadmapId: string,
  input: {
    phaseNumber: number;
    title: string;
    description?: string;
    goal?: string;
    isUnlocked?: boolean;
  }
): Promise<RoadmapPhaseDTO | null> {
  const { data: roadmap } = await getSupabaseServer()
    .from('roadmaps')
    .select('id')
    .eq('id', roadmapId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (!roadmap) return null;

  const { count } = await getSupabaseServer()
    .from('roadmap_phases')
    .select('id', { count: 'exact', head: true })
    .eq('roadmap_id', roadmapId);
  const sortOrder = count ?? 0;

  const { data, error } = await getSupabaseServer()
    .from('roadmap_phases')
    .insert({
      roadmap_id: roadmapId,
      phase_number: input.phaseNumber,
      title: input.title,
      description: input.description ?? null,
      goal: input.goal ?? null,
      is_unlocked: input.isUnlocked ?? true,
      sort_order: sortOrder,
    })
    .select('id, roadmap_id, phase_number, title, description, goal, is_unlocked, sort_order')
    .single();
  if (error) throw error;
  return toPhaseDTO(data as PhaseRow, []);
}

/**
 * Creates a milestone on a phase of a roadmap owned by the given profile.
 *
 * Ownership is proven by walking phase -> roadmap -> profile, so a caller
 * cannot attach a milestone to another user's phase.
 */
export async function addMilestone(
  profileId: string,
  phaseId: string,
  input: { title: string; description?: string }
): Promise<RoadmapMilestoneDTO | null> {
  const { data: phase } = await getSupabaseServer()
    .from('roadmap_phases')
    .select('id, roadmap_id')
    .eq('id', phaseId)
    .maybeSingle();
  if (!phase) return null;

  const { data: roadmap } = await getSupabaseServer()
    .from('roadmaps')
    .select('id, profile_id')
    .eq('id', (phase as { roadmap_id: string }).roadmap_id)
    .maybeSingle();
  if (!roadmap || (roadmap as { profile_id: string }).profile_id !== profileId) return null;

  const { count } = await getSupabaseServer()
    .from('roadmap_milestones')
    .select('id', { count: 'exact', head: true })
    .eq('phase_id', phaseId);
  const sortOrder = count ?? 0;

  const { data, error } = await getSupabaseServer()
    .from('roadmap_milestones')
    .insert({
      phase_id: phaseId,
      title: input.title,
      description: input.description ?? null,
      sort_order: sortOrder,
    })
    .select('id, phase_id, title, description, sort_order')
    .single();
  if (error) throw error;
  return toMilestoneDTO(data as MilestoneRow, []);
}

/**
 * A stable natural key for a roadmap task.
 *
 * Regenerating a roadmap produces a fresh tree, so the database ids change.
 * The key identifies "the same task" across regenerations: the skill it
 * targets plus its title. Both are produced deterministically by the
 * generator, so an unchanged task keeps its key.
 */
function taskProgressKey(skillName: string | null | undefined, title: string): string {
  return `${(skillName ?? '').trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

/**
 * Reads the progress on the profile's current roadmap.
 *
 * Used so a regenerated roadmap does not silently throw away work the
 * learner has already completed.
 */
async function captureTaskProgress(
  profileId: string
): Promise<Map<string, RoadmapTaskStatus>> {
  const progress = new Map<string, RoadmapTaskStatus>();
  const roadmap = await getRoadmap(profileId);
  if (!roadmap) return progress;

  for (const phase of roadmap.phases ?? []) {
    for (const milestone of phase.milestones ?? []) {
      for (const task of milestone.tasks ?? []) {
        progress.set(taskProgressKey(task.skillName, task.title), task.status);
      }
    }
  }
  return progress;
}

/**
 * Phase rows being staged for a replacement are inserted with a negative
 * phase number and a sort order above every real phase. `listRoadmaps` only
 * returns phase_number >= 1, so a half-written replacement is never visible to
 * the user, and a failed attempt can be deleted without touching the roadmap
 * they are currently using.
 */
const STAGING_SORT_BASE = 1_000_000;

interface TreePhase {
  phaseNumber: number;
  title: string;
  description?: string;
  goal?: string;
  isUnlocked?: boolean;
  milestones: Array<{
    title: string;
    description?: string;
    tasks: CreateRoadmapTaskInput[];
  }>;
}

interface InsertedTree {
  phaseRows: Array<{ id: string; sortOrder: number }>;
  milestoneCount: number;
  taskCount: number;
}

/**
 * Normalises the phase numbers of a generated tree. The generator produces
 * 1..N, but a malformed client payload must not make the final swap violate the
 * UNIQUE (roadmap_id, phase_number) constraint.
 */
function finalPhaseNumbers(phases: TreePhase[]): number[] {
  const used = new Set<number>();
  const numbers: number[] = [];
  for (let index = 0; index < phases.length; index += 1) {
    const requested = phases[index].phaseNumber;
    let candidate =
      Number.isInteger(requested) && requested > 0 ? requested : index + 1;
    while (used.has(candidate)) candidate += 1;
    used.add(candidate);
    numbers.push(candidate);
  }
  return numbers;
}

/**
 * Inserts a complete tree under an existing roadmap row. `staging` controls
 * only the phase_number/sort_order representation; milestones and tasks are
 * identical in both modes.
 */
async function insertRoadmapTree(
  roadmapId: string,
  phases: TreePhase[],
  priorProgress: Map<string, RoadmapTaskStatus>,
  staging: boolean
): Promise<InsertedTree> {
  const numbers = finalPhaseNumbers(phases);
  const phasePayloads = phases.map((phase, index) => ({
    roadmap_id: roadmapId,
    phase_number: staging ? -(index + 1) : numbers[index],
    title: phase.title,
    description: phase.description ?? null,
    goal: phase.goal ?? null,
    is_unlocked: phase.isUnlocked ?? true,
    sort_order: staging ? STAGING_SORT_BASE + index : index,
  }));

  const { data: insertedPhases, error: phaseError } = await getSupabaseServer()
    .from('roadmap_phases')
    .insert(phasePayloads)
    .select('id, phase_number, sort_order');
  if (phaseError) throw phaseError;

  const sortedPhases = ((insertedPhases ?? []) as Array<{
    id: string;
    sort_order: number;
  }>).sort((a, b) => a.sort_order - b.sort_order);
  if (sortedPhases.length !== phasePayloads.length) {
    throw new Error(
      `Roadmap phase insert returned ${sortedPhases.length} of ${phasePayloads.length} rows`
    );
  }

  const milestonePayloads: Array<{
    phase_id: string;
    title: string;
    description: string | null;
    sort_order: number;
  }> = [];
  for (let pIdx = 0; pIdx < phases.length; pIdx += 1) {
    const phaseRow = sortedPhases[pIdx];
    const milestones = phases[pIdx].milestones ?? [];
    for (let mIdx = 0; mIdx < milestones.length; mIdx += 1) {
      milestonePayloads.push({
        phase_id: phaseRow.id,
        title: milestones[mIdx].title,
        description: milestones[mIdx].description ?? null,
        sort_order: mIdx,
      });
    }
  }

  let insertedMilestones: Array<{ id: string; phase_id: string; sort_order: number }> = [];
  if (milestonePayloads.length > 0) {
    const { data, error: milestoneError } = await getSupabaseServer()
      .from('roadmap_milestones')
      .insert(milestonePayloads)
      .select('id, phase_id, sort_order');
    if (milestoneError) throw milestoneError;
    insertedMilestones = (data ?? []) as Array<{
      id: string;
      phase_id: string;
      sort_order: number;
    }>;
    if (insertedMilestones.length !== milestonePayloads.length) {
      throw new Error(
        `Roadmap milestone insert returned ${insertedMilestones.length} of ${milestonePayloads.length} rows`
      );
    }
  }

  const milestonesByPhase = new Map<string, Array<{ id: string; sort_order: number }>>();
  for (const milestone of insertedMilestones) {
    const list = milestonesByPhase.get(milestone.phase_id) ?? [];
    list.push({ id: milestone.id, sort_order: milestone.sort_order });
    milestonesByPhase.set(milestone.phase_id, list);
  }
  for (const list of milestonesByPhase.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  const taskPayloads: Array<{
    milestone_id: string;
    title: string;
    description: string | null;
    status: RoadmapTaskStatus;
    skill_id: string | null;
    skill_name: string | null;
    deadline: string | null;
    resource_id: string | null;
    resource_title: string | null;
    evidence_id: string | null;
    estimated_hours: number | null;
    work_kind: string | null;
    sort_order: number;
    difficulty: string | null;
    prerequisites: string[];
    skill_names: string[];
    project_titles: string[];
    resources: RoadmapResourceDTO[];
    priority: string | null;
    rationale: string | null;
  }> = [];

  for (let pIdx = 0; pIdx < phases.length; pIdx += 1) {
    const phaseRow = sortedPhases[pIdx];
    const phaseMilestones = milestonesByPhase.get(phaseRow.id) ?? [];
    const pInput = phases[pIdx];
    for (let mIdx = 0; mIdx < pInput.milestones.length; mIdx += 1) {
      const milestoneRow = phaseMilestones[mIdx];
      if (!milestoneRow) continue;
      const mInput = pInput.milestones[mIdx];
      for (let tIdx = 0; tIdx < (mInput.tasks ?? []).length; tIdx += 1) {
        const tInput = mInput.tasks[tIdx];
        const prior = priorProgress.get(taskProgressKey(tInput.skillName, tInput.title));
        const status = (
          prior && prior !== 'not_started' ? prior : (tInput.status ?? 'not_started')
        ) as RoadmapTaskStatus;

        taskPayloads.push({
          milestone_id: milestoneRow.id,
          title: tInput.title,
          description: tInput.description ?? null,
          status,
          skill_id: tInput.skillId ?? null,
          skill_name: tInput.skillName ?? null,
          deadline: tInput.deadline ?? null,
          resource_id: tInput.resourceId ?? null,
          resource_title: tInput.resourceTitle ?? null,
          evidence_id: tInput.evidenceId ?? null,
          estimated_hours: tInput.estimatedHours ?? null,
          work_kind: tInput.workKind ?? null,
          sort_order: tIdx,
          difficulty: tInput.difficulty ?? null,
          prerequisites: tInput.prerequisites ?? [],
          skill_names: tInput.skillNames ?? [],
          project_titles: tInput.projectTitles ?? [],
          resources: tInput.resources ?? [],
          priority: tInput.priority ?? null,
          rationale: tInput.rationale ?? null,
        });
      }
    }
  }

  if (taskPayloads.length > 0) {
    const { data, error: taskError } = await getSupabaseServer()
      .from('roadmap_tasks')
      .insert(taskPayloads)
      .select('id');
    if (taskError) throw taskError;
    if ((data ?? []).length !== taskPayloads.length) {
      throw new Error(
        `Roadmap task insert returned ${(data ?? []).length} of ${taskPayloads.length} rows`
      );
    }
  }

  return {
    phaseRows: sortedPhases.map((row) => ({ id: row.id, sortOrder: row.sort_order })),
    milestoneCount: insertedMilestones.length,
    taskCount: taskPayloads.length,
  };
}

/** Removes any staged (negative-numbered) phase left by an earlier attempt. */
async function cleanupStagedPhases(roadmapId: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from('roadmap_phases')
    .delete()
    .eq('roadmap_id', roadmapId)
    .lt('phase_number', 0);
  if (error) {
    console.warn('Failed to clean up staged roadmap phases:', error);
  }
}

/** Maps a persisted roadmap back to the input shape used to rebuild it. */
function roadmapDtoToTree(roadmap: RoadmapDTO): TreePhase[] {
  return roadmap.phases.map((phase) => ({
    phaseNumber: phase.phaseNumber,
    title: phase.title,
    description: phase.description ?? undefined,
    goal: phase.goal ?? undefined,
    isUnlocked: phase.isUnlocked,
    milestones: phase.milestones.map((milestone) => ({
      title: milestone.title,
      description: milestone.description ?? undefined,
      tasks: milestone.tasks.map((task) => ({
        title: task.title,
        description: task.description ?? undefined,
        status: task.status,
        skillId: task.skillId ?? undefined,
        skillName: task.skillName ?? undefined,
        deadline: task.deadline ?? undefined,
        resourceId: task.resourceId ?? undefined,
        resourceTitle: task.resourceTitle ?? undefined,
        evidenceId: task.evidenceId ?? undefined,
        estimatedHours: task.estimatedHours ?? undefined,
        workKind: task.workKind ?? undefined,
        difficulty: task.difficulty ?? undefined,
        prerequisites: task.prerequisites,
        skillNames: task.skillNames,
        projectTitles: task.projectTitles,
        resources: task.resources,
        priority: task.priority ?? undefined,
        rationale: task.rationale ?? undefined,
      })),
    })),
  }));
}

/**
 * Creates or replaces the profile's roadmap in stages.
 *
 * A profile has at most one roadmap (UNIQUE profile_id), so a replacement
 * cannot be inserted as a second roadmap. Instead the new tree is written
 * under the existing roadmap with negative phase numbers, which `listRoadmaps`
 * never returns. Only after every phase, milestone and task has been inserted
 * and counted does the old tree get deleted and the staged phases receive their
 * real phase numbers. If anything fails before that swap, the staged rows are
 * removed and the user's previous roadmap is untouched.
 *
 * The learner's task progress is preserved across the replacement by the
 * skill-name + title key used by `captureTaskProgress`.
 */
export async function createRoadmapWithTree(
  profileId: string,
  input: CreateRoadmapInput & { phases?: RoadmapTreePhaseInput[] }
): Promise<RoadmapDTO> {
  const priorProgress = await captureTaskProgress(profileId);
  const phasesInput = (input.phases ?? []) as TreePhase[];
  const existing = await getRoadmap(profileId);

  if (!existing) {
    const roadmap = await createRoadmap(profileId, input);
    if (phasesInput.length === 0) return roadmap;
    try {
      await insertRoadmapTree(roadmap.id, phasesInput, priorProgress, false);
      return (await getRoadmap(profileId)) ?? roadmap;
    } catch (error) {
      // No previous roadmap existed, so the only safe state is no roadmap at
      // all rather than a half-built tree.
      await deleteRoadmap(profileId);
      throw error;
    }
  }

  await cleanupStagedPhases(existing.id);
  const oldPhaseIds = existing.phases.map((phase) => phase.id);
  const previousMetadata = {
    title: existing.title,
    targetRoleTitle: existing.targetRoleTitle,
    targetRoleId: existing.targetRoleId,
    domainId: existing.domainId,
    readinessPct: existing.readinessPct,
    planSummary: existing.planSummary,
    isEnrolled: existing.isEnrolled,
  };

  let inserted: InsertedTree | null = null;
  let oldTreeDeleted = false;

  try {
    inserted = await insertRoadmapTree(existing.id, phasesInput, priorProgress, true);

    // The previous tree is removed only after every replacement row exists.
    // This must also happen for an intentionally empty tree: replacing a
    // roadmap with zero phases means the old phases are gone, not kept.
    if (oldPhaseIds.length > 0) {
      const { error: deleteError } = await getSupabaseServer()
        .from('roadmap_phases')
        .delete()
        .in('id', oldPhaseIds);
      if (deleteError) throw deleteError;
      oldTreeDeleted = true;
    }

    if (phasesInput.length > 0) {
      // Finalise phase numbers in one upsert statement, not N round trips.
      const numbers = finalPhaseNumbers(phasesInput);
      const finalRows = inserted.phaseRows.map((row, index) => ({
        id: row.id,
        roadmap_id: existing.id,
        phase_number: numbers[index],
        title: phasesInput[index].title,
        description: phasesInput[index].description ?? null,
        goal: phasesInput[index].goal ?? null,
        is_unlocked: phasesInput[index].isUnlocked ?? true,
        sort_order: index,
      }));
      const { error: finaliseError } = await getSupabaseServer()
        .from('roadmap_phases')
        .upsert(finalRows, { onConflict: 'id' });
      if (finaliseError) throw finaliseError;
    }

    const { error: metadataError } = await getSupabaseServer()
      .from('roadmaps')
      .update({
        title: input.title,
        target_role_title: input.targetRoleTitle ?? null,
        target_role_id: input.targetRoleId ?? null,
        domain_id: input.domainId ?? null,
        readiness_pct: input.readinessPct ?? null,
        plan_summary: input.planSummary ?? {},
        generated_at: new Date().toISOString(),
        is_enrolled: input.isEnrolled ?? previousMetadata.isEnrolled,
      })
      .eq('id', existing.id)
      .eq('profile_id', profileId);
    if (metadataError) throw metadataError;

    return (await getRoadmap(profileId)) ?? existing;
  } catch (error) {
    // Roll back to a state the user can keep using.
    try {
      if (!oldTreeDeleted) {
        await cleanupStagedPhases(existing.id);
      } else {
        // The old tree was deleted but finalisation failed. Remove every row
        // written by this attempt and rebuild the previous tree exactly as it
        // was, including task statuses.
        await getSupabaseServer()
          .from('roadmap_phases')
          .delete()
          .eq('roadmap_id', existing.id);
        await insertRoadmapTree(
          existing.id,
          roadmapDtoToTree(existing),
          new Map(),
          false
        );
      }
      await getSupabaseServer()
        .from('roadmaps')
        .update({
          title: previousMetadata.title,
          target_role_title: previousMetadata.targetRoleTitle,
          target_role_id: previousMetadata.targetRoleId,
          domain_id: previousMetadata.domainId,
          readiness_pct: previousMetadata.readinessPct,
          plan_summary: previousMetadata.planSummary,
          is_enrolled: previousMetadata.isEnrolled,
        })
        .eq('id', existing.id)
        .eq('profile_id', profileId);
    } catch (rollbackError) {
      console.error(
        'Roadmap replacement failed and the previous roadmap could not be restored:',
        rollbackError
      );
    }
    throw error;
  }
}

/** Enrols the profile in its roadmap (the app shows an enrolment gate). */
export async function enrollInRoadmap(profileId: string): Promise<RoadmapDTO | null> {
  const roadmap = await getRoadmap(profileId);
  if (!roadmap) return null;
  const { data, error } = await getSupabaseServer()
    .from('roadmaps')
    .update({ is_enrolled: true })
    .eq('profile_id', profileId)
    .eq('id', roadmap.id)
    .select('id, title, status, is_enrolled, target_role_title, target_role_id, domain_id, readiness_pct, plan_summary, created_at, updated_at')
    .single();
  if (error) throw error;
  return toRoadmapDTO(data as RoadmapRow, []);
}

/**
 * Resolves whether a task belongs to the given profile by walking
 * task -> milestone -> phase -> roadmap -> profile. Returns the task id only
 * when the whole chain is owned by the caller.
 */
async function taskBelongsToProfile(
  profileId: string,
  taskId: string
): Promise<boolean> {
  const { data: task, error: taskError } = await getSupabaseServer()
    .from('roadmap_tasks')
    .select('id, milestone_id')
    .eq('id', taskId)
    .maybeSingle();
  if (taskError) throw taskError;
  if (!task) return false;

  const { data: milestone, error: milestoneError } = await getSupabaseServer()
    .from('roadmap_milestones')
    .select('id, phase_id')
    .eq('id', (task as { milestone_id: string }).milestone_id)
    .maybeSingle();
  if (milestoneError) throw milestoneError;
  if (!milestone) return false;

  const { data: phase, error: phaseError } = await getSupabaseServer()
    .from('roadmap_phases')
    .select('id, roadmap_id')
    .eq('id', (milestone as { phase_id: string }).phase_id)
    .maybeSingle();
  if (phaseError) throw phaseError;
  if (!phase) return false;

  const { data: roadmap, error: roadmapError } = await getSupabaseServer()
    .from('roadmaps')
    .select('id, profile_id')
    .eq('id', (phase as { roadmap_id: string }).roadmap_id)
    .maybeSingle();
  if (roadmapError) throw roadmapError;
  if (!roadmap) return false;

  return (roadmap as { profile_id: string }).profile_id === profileId;
}

/** Sets a task's status — this is the progress mutation. */
export async function updateTaskStatus(
  profileId: string,
  taskId: string,
  status: RoadmapTaskStatus
): Promise<boolean> {
  const owned = await taskBelongsToProfile(profileId, taskId);
  if (!owned) return false;

  const { data, error } = await getSupabaseServer()
    .from('roadmap_tasks')
    .update({ status })
    .eq('id', taskId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Adds a task to a milestone of the profile's roadmap. */
export async function addTask(
  profileId: string,
  phaseId: string,
  milestoneId: string,
  input: CreateRoadmapTaskInput
): Promise<RoadmapTaskDTO | null> {
  // Ownership: the milestone must belong to a phase of a roadmap of this profile.
  const { data: milestone, error: milestoneError } = await getSupabaseServer()
    .from('roadmap_milestones')
    .select('id, phase_id, title, description, sort_order')
    .eq('id', milestoneId)
    .eq('phase_id', phaseId)
    .maybeSingle();
  if (milestoneError) throw milestoneError;
  if (!milestone) return null;

  const { data: phase, error: phaseError } = await getSupabaseServer()
    .from('roadmap_phases')
    .select('id, roadmap_id')
    .eq('id', phaseId)
    .maybeSingle();
  if (phaseError) throw phaseError;
  if (!phase) return null;

  const { data: roadmap, error: roadmapError } = await getSupabaseServer()
    .from('roadmaps')
    .select('id, profile_id')
    .eq('id', (phase as { roadmap_id: string }).roadmap_id)
    .maybeSingle();
  if (roadmapError) throw roadmapError;
  if (!roadmap || (roadmap as { profile_id: string }).profile_id !== profileId) return null;

  const { count } = await getSupabaseServer()
    .from('roadmap_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('milestone_id', milestoneId);
  const sortOrder = count ?? 0;

  const { data, error } = await getSupabaseServer()
    .from('roadmap_tasks')
    .insert({
      milestone_id: milestoneId,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'not_started',
      skill_id: input.skillId ?? null,
      skill_name: input.skillName ?? null,
      deadline: input.deadline ?? null,
      resource_id: input.resourceId ?? null,
      resource_title: input.resourceTitle ?? null,
      evidence_id: input.evidenceId ?? null,
      estimated_hours: input.estimatedHours ?? null,
      work_kind: input.workKind ?? null,
      sort_order: sortOrder,
    })
    .select(
      'id, milestone_id, title, description, status, skill_id, skill_name, deadline, resource_id, resource_title, evidence_id, estimated_hours, work_kind, sort_order'
    )
    .single();
  if (error) throw error;
  return toTaskDTO(data as TaskRow);
}

export async function deleteRoadmap(profileId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('roadmaps')
    .delete()
    .eq('profile_id', profileId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
