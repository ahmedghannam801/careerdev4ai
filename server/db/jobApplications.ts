// Server persistence for public.job_applications.
//
// An application tracks the user's pipeline for one job. `job_id` is an
// opaque external job reference (or a client-generated one for a manually
// added application), so it stays a string. The current release has no live
// job feed.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';

export type ApplicationStage =
  | 'saved'
  | 'applied'
  | 'screening'
  | 'interview'
  | 'technical'
  | 'final'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export const APPLICATION_STAGES: ApplicationStage[] = [
  'saved',
  'applied',
  'screening',
  'interview',
  'technical',
  'final',
  'offer',
  'rejected',
  'withdrawn',
];

export interface JobApplicationDTO {
  id: string;
  jobId: string | null;
  company: string;
  role: string;
  location: string | null;
  workMode: string | null;
  stage: string;
  appliedDate: string | null;
  lastUpdated: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  notes: string | null;
  salaryDiscussed: string | null;
  interviewStageDetails: string | null;
  createdAt: string;
}

export interface CreateJobApplicationInput {
  jobId?: string;
  company: string;
  role: string;
  location?: string;
  workMode?: string;
  stage?: ApplicationStage;
  appliedDate?: string;
  nextAction?: string;
  nextActionDate?: string;
  notes?: string;
  salaryDiscussed?: string;
  interviewStageDetails?: string;
}

export type UpdateJobApplicationInput = Partial<CreateJobApplicationInput>;

interface JobApplicationRow {
  id: string;
  job_id: string | null;
  company: string;
  role: string;
  location: string | null;
  work_mode: string | null;
  stage: string;
  applied_date: string | null;
  last_updated: string | null;
  next_action: string | null;
  next_action_date: string | null;
  notes: string | null;
  salary_discussed: string | null;
  interview_stage_details: string | null;
  created_at: string;
}

const SELECT_COLUMNS =
  'id, job_id, company, role, location, work_mode, stage, applied_date, last_updated, next_action, next_action_date, notes, salary_discussed, interview_stage_details, created_at';

function toDTO(row: JobApplicationRow): JobApplicationDTO {
  return {
    id: row.id,
    jobId: row.job_id,
    company: row.company,
    role: row.role,
    location: row.location,
    workMode: row.work_mode,
    stage: row.stage,
    appliedDate: row.applied_date,
    lastUpdated: row.last_updated,
    nextAction: row.next_action,
    nextActionDate: row.next_action_date,
    notes: row.notes,
    salaryDiscussed: row.salary_discussed,
    interviewStageDetails: row.interview_stage_details,
    createdAt: row.created_at,
  };
}

export async function listJobApplications(
  profileId: string
): Promise<JobApplicationDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('job_applications')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as JobApplicationRow[]).map(toDTO);
}

export async function getJobApplication(
  profileId: string,
  applicationId: string
): Promise<JobApplicationDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('job_applications')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', applicationId)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as JobApplicationRow) : null;
}

export async function createJobApplication(
  profileId: string,
  input: CreateJobApplicationInput
): Promise<JobApplicationDTO> {
  const { data, error } = await getSupabaseServer()
    .from('job_applications')
    .insert({
      profile_id: profileId,
      job_id: input.jobId ?? null,
      company: input.company,
      role: input.role,
      location: input.location ?? null,
      work_mode: input.workMode ?? null,
      stage: input.stage ?? 'saved',
      applied_date: input.appliedDate ?? null,
      last_updated: new Date().toISOString().split('T')[0],
      next_action: input.nextAction ?? null,
      next_action_date: input.nextActionDate ?? null,
      notes: input.notes ?? null,
      salary_discussed: input.salaryDiscussed ?? null,
      interview_stage_details: input.interviewStageDetails ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as JobApplicationRow);
}

export async function updateJobApplication(
  profileId: string,
  applicationId: string,
  updates: UpdateJobApplicationInput
): Promise<JobApplicationDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.jobId !== undefined) patch.job_id = updates.jobId ?? null;
  if (updates.company !== undefined) patch.company = updates.company;
  if (updates.role !== undefined) patch.role = updates.role;
  if (updates.location !== undefined) patch.location = updates.location ?? null;
  if (updates.workMode !== undefined) patch.work_mode = updates.workMode ?? null;
  if (updates.stage !== undefined) patch.stage = updates.stage;
  if (updates.appliedDate !== undefined) patch.applied_date = updates.appliedDate ?? null;
  if (updates.nextAction !== undefined) patch.next_action = updates.nextAction ?? null;
  if (updates.nextActionDate !== undefined)
    patch.next_action_date = updates.nextActionDate ?? null;
  if (updates.notes !== undefined) patch.notes = updates.notes ?? null;
  if (updates.salaryDiscussed !== undefined)
    patch.salary_discussed = updates.salaryDiscussed ?? null;
  if (updates.interviewStageDetails !== undefined)
    patch.interview_stage_details = updates.interviewStageDetails ?? null;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates the NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;
  patch.last_updated = new Date().toISOString().split('T')[0];

  const { data, error } = await getSupabaseServer()
    .from('job_applications')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', applicationId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as JobApplicationRow) : null;
}

export async function deleteJobApplication(
  profileId: string,
  applicationId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('job_applications')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', applicationId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
