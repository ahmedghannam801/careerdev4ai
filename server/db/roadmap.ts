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
  sortOrder: number;
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
  created_at: string;
  updated_at: string;
}

interface PhaseRow {
  id: string;
  roadmap_id: string;
  phase_number: number;
  title: string;
  description: string | null;
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
  sort_order: number;
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
    sortOrder: row.sort_order,
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
    .select('id, title, status, is_enrolled, target_role_title, created_at, updated_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (roadmapError) throw roadmapError;
  const roadmaps = (roadmapRows ?? []) as RoadmapRow[];
  if (roadmaps.length === 0) return [];

  const roadmapIds = roadmaps.map((r) => r.id);
  const { data: phaseRows, error: phaseError } = await getSupabaseServer()
    .from('roadmap_phases')
    .select('id, roadmap_id, phase_number, title, description, is_unlocked, sort_order')
    .in('roadmap_id', roadmapIds)
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
        'id, milestone_id, title, description, status, skill_id, skill_name, deadline, resource_id, resource_title, evidence_id, estimated_hours, sort_order'
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
    })
    .select('id, title, status, is_enrolled, target_role_title, created_at, updated_at')
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
  input: { phaseNumber: number; title: string; description?: string; isUnlocked?: boolean }
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
      is_unlocked: input.isUnlocked ?? true,
      sort_order: sortOrder,
    })
    .select('id, roadmap_id, phase_number, title, description, is_unlocked, sort_order')
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
 * Creates a complete roadmap — phases, milestones and tasks — in one call.
 *
 * The frontend used to generate this tree locally and never persist it, which
 * meant a new user had no roadmap row at all. The tree is written bottom-up so
 * every foreign key is satisfied in order, and the returned DTO carries the
 * REAL database ids so the client can address the persisted rows.
 *
 * A profile has at most one roadmap (UNIQUE profile_id), so an existing
 * roadmap is replaced: its phases cascade away with it. The learner’s
 * progress is NOT lost — the status of every task that still exists in the
 * new tree is carried across, keyed by skill name and title.
 */
export async function createRoadmapWithTree(
  profileId: string,
  input: CreateRoadmapInput & { phases?: RoadmapTreePhaseInput[] }
): Promise<RoadmapDTO> {
  const priorProgress = await captureTaskProgress(profileId);

  const existing = await getRoadmap(profileId);
  if (existing) {
    await deleteRoadmap(profileId);
  }

  const roadmap = await createRoadmap(profileId, input);
  const phasesInput = input.phases ?? [];

  if (phasesInput.length === 0) {
    return roadmap;
  }

  // 1. Batch insert phases
  const phasePayloads = phasesInput.map((phaseInput, index) => ({
    roadmap_id: roadmap.id,
    phase_number: phaseInput.phaseNumber,
    title: phaseInput.title,
    description: phaseInput.description ?? null,
    is_unlocked: phaseInput.isUnlocked ?? true,
    sort_order: index,
  }));

  const { data: insertedPhases, error: phaseError } = await getSupabaseServer()
    .from('roadmap_phases')
    .insert(phasePayloads)
    .select('id, phase_number, sort_order');
  if (phaseError) throw phaseError;

  const sortedPhases = ((insertedPhases ?? []) as Array<{ id: string; sort_order: number }>)
    .sort((a, b) => a.sort_order - b.sort_order);

  // 2. Prepare and batch insert milestones
  const milestonePayloads: Array<{
    phase_id: string;
    title: string;
    description: string | null;
    sort_order: number;
  }> = [];

  for (let pIdx = 0; pIdx < phasesInput.length; pIdx++) {
    const phaseInput = phasesInput[pIdx];
    const phaseRow = sortedPhases[pIdx];
    if (!phaseRow) continue;

    const milestones = phaseInput.milestones ?? [];
    for (let mIdx = 0; mIdx < milestones.length; mIdx++) {
      const mInput = milestones[mIdx];
      milestonePayloads.push({
        phase_id: phaseRow.id,
        title: mInput.title,
        description: mInput.description ?? null,
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
    insertedMilestones = (data ?? []) as Array<{ id: string; phase_id: string; sort_order: number }>;
  }

  // Group milestones by phase_id and sort_order
  const milestonesByPhase = new Map<string, Array<{ id: string; sort_order: number }>>();
  for (const m of insertedMilestones) {
    const list = milestonesByPhase.get(m.phase_id) ?? [];
    list.push(m);
    milestonesByPhase.set(m.phase_id, list);
  }
  for (const list of milestonesByPhase.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order);
  }

  // 3. Prepare and batch insert tasks
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
    sort_order: number;
  }> = [];

  for (let pIdx = 0; pIdx < phasesInput.length; pIdx++) {
    const phaseRow = sortedPhases[pIdx];
    if (!phaseRow) continue;
    const phaseMilestones = milestonesByPhase.get(phaseRow.id) ?? [];

    const pInput = phasesInput[pIdx];
    for (let mIdx = 0; mIdx < (pInput.milestones ?? []).length; mIdx++) {
      const milestoneRow = phaseMilestones[mIdx];
      if (!milestoneRow) continue;

      const mInput = pInput.milestones[mIdx];
      for (let tIdx = 0; tIdx < (mInput.tasks ?? []).length; tIdx++) {
        const tInput = mInput.tasks[tIdx];
        const prior = priorProgress.get(taskProgressKey(tInput.skillName, tInput.title));
        const status = (prior && prior !== 'not_started' ? prior : (tInput.status ?? 'not_started')) as RoadmapTaskStatus;

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
          sort_order: tIdx,
        });
      }
    }
  }

  if (taskPayloads.length > 0) {
    const { error: taskError } = await getSupabaseServer()
      .from('roadmap_tasks')
      .insert(taskPayloads);
    if (taskError) throw taskError;
  }

  return (await getRoadmap(profileId)) ?? roadmap;
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
    .select('id, title, status, is_enrolled, target_role_title, created_at, updated_at')
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
      sort_order: sortOrder,
    })
    .select(
      'id, milestone_id, title, description, status, skill_id, skill_name, deadline, resource_id, resource_title, evidence_id, estimated_hours, sort_order'
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
