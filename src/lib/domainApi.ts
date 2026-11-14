// Typed client for the B.3.6 domain endpoints.
// Every call is authenticated with the current Supabase access token.
//
// The shared client: the same Bearer header, JSON parsing and non-OK
// handling every API module uses.
import { apiRequest as request } from './apiClient';

export interface ActivityDTO {
  id: string;
  actionType: string;
  title: string;
  subtitle: string | null;
  relatedObject: string | null;
  linkView: string | null;
  createdAt: string;
}

export interface SecondaryGoalDTO {
  id: string;
  title: string;
  description: string | null;
  priority: 'high' | 'medium' | 'low';
  deadline: string | null;
  status: 'active' | 'achieved' | 'paused';
  progressPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface CareerMilestoneDTO {
  id: string;
  title: string;
  category: string;
  dateAchieved: string;
  notes: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CoverLetterDTO {
  id: string;
  title: string;
  company: string;
  role: string;
  jobDescription: string | null;
  content: string;
  keyHighlights: string[];
  targetJobId: string | null;
  applicationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export { ApiRequestError } from './apiClient';

// ---- Activities ----
export async function fetchActivities(): Promise<ActivityDTO[]> {
  const data = await request<{ success: boolean; activities: ActivityDTO[] }>(
    '/api/activities'
  );
  return data.activities ?? [];
}

export async function postActivity(input: {
  actionType: string;
  title: string;
  subtitle?: string;
  relatedObject?: string;
  linkView?: string;
  idempotencyKey?: string;
}): Promise<ActivityDTO> {
  const data = await request<{ success: boolean; activity: ActivityDTO }>('/api/activities', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.activity;
}

// ---- Secondary Goals ----
export async function fetchSecondaryGoals(): Promise<SecondaryGoalDTO[]> {
  const data = await request<{ success: boolean; goals: SecondaryGoalDTO[] }>(
    '/api/secondary-goals'
  );
  return data.goals ?? [];
}

export async function postSecondaryGoal(input: {
  title: string;
  description?: string;
  priority?: string;
  deadline?: string;
  status?: string;
  progressPercent?: number;
}): Promise<SecondaryGoalDTO> {
  const data = await request<{ success: boolean; goal: SecondaryGoalDTO }>(
    '/api/secondary-goals',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.goal;
}

export async function patchSecondaryGoal(
  id: string,
  updates: Partial<{
    title: string;
    description: string;
    priority: string;
    deadline: string;
    status: string;
    progressPercent: number;
  }>
): Promise<SecondaryGoalDTO> {
  const data = await request<{ success: boolean; goal: SecondaryGoalDTO }>(
    `/api/secondary-goals/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.goal;
}

export async function deleteSecondaryGoal(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/secondary-goals/${id}`, { method: 'DELETE' });
}

// ---- Career Milestones ----
export async function fetchCareerMilestones(): Promise<CareerMilestoneDTO[]> {
  const data = await request<{ success: boolean; milestones: CareerMilestoneDTO[] }>(
    '/api/career-milestones'
  );
  return data.milestones ?? [];
}

export async function postCareerMilestone(input: {
  title: string;
  category: string;
  dateAchieved: string;
  notes?: string;
  verified?: boolean;
}): Promise<CareerMilestoneDTO> {
  const data = await request<{ success: boolean; milestone: CareerMilestoneDTO }>(
    '/api/career-milestones',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.milestone;
}

export async function patchCareerMilestone(
  id: string,
  updates: Partial<{
    title: string;
    category: string;
    dateAchieved: string;
    notes: string;
    verified: boolean;
  }>
): Promise<CareerMilestoneDTO> {
  const data = await request<{ success: boolean; milestone: CareerMilestoneDTO }>(
    `/api/career-milestones/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.milestone;
}

export async function deleteCareerMilestone(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/career-milestones/${id}`, { method: 'DELETE' });
}

// ---- Cover Letters ----
export async function fetchCoverLetters(): Promise<CoverLetterDTO[]> {
  const data = await request<{ success: boolean; coverLetters: CoverLetterDTO[] }>(
    '/api/cover-letters'
  );
  return data.coverLetters ?? [];
}

export async function postCoverLetter(input: {
  title: string;
  company: string;
  role: string;
  jobDescription?: string;
  content: string;
  keyHighlights?: string[];
  targetJobId?: string;
  applicationId?: string;
}): Promise<CoverLetterDTO> {
  const data = await request<{ success: boolean; coverLetter: CoverLetterDTO }>(
    '/api/cover-letters',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.coverLetter;
}

export async function patchCoverLetter(
  id: string,
  updates: Partial<{
    title: string;
    company: string;
    role: string;
    jobDescription: string;
    content: string;
    keyHighlights: string[];
    targetJobId: string;
    applicationId: string;
  }>
): Promise<CoverLetterDTO> {
  const data = await request<{ success: boolean; coverLetter: CoverLetterDTO }>(
    `/api/cover-letters/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.coverLetter;
}

export async function deleteCoverLetter(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/cover-letters/${id}`, { method: 'DELETE' });
}
