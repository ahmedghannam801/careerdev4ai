import { getAccessToken } from './supabase';

// Typed client for the B.3.7.1 roadmap and profile endpoints.
// Every call is authenticated with the current Supabase access token.

export type RoadmapTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'blocked';

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
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
}

export interface ProfileCertificationDTO {
  id: string;
  name: string;
  issuer: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  url: string | null;
  credentialId: string | null;
}

export interface ProfileLanguageDTO {
  id: string;
  name: string;
  proficiency: string | null;
}

export interface ProfileLinkDTO {
  id: string;
  kind: string;
  label: string | null;
  url: string;
}

export interface ProfileCareerIdentityDTO {
  id: string;
  whoYouAre: string | null;
  whereYoureGoing: string | null;
  why: string | null;
  whatYoureMissing: string | null;
  whatYoureBuilding: string | null;
  howYourePresenting: string | null;
  whereApplying: string | null;
}

export interface ProfileDTO {
  id: string;
  fullName: string | null;
  preferredName: string | null;
  username: string | null;
  avatarUrl: string | null;
  phone: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  currentTitle: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
  headline: string | null;
  bio: string | null;
  professionalSummary: string | null;
  careerGoal: string | null;
  customGoalText: string | null;
  targetRole: string | null;
  targetIndustry: string | null;
  userType: string | null;
  onboardingCompleted: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  certifications: ProfileCertificationDTO[];
  languages: ProfileLanguageDTO[];
  links: ProfileLinkDTO[];
  careerIdentity: ProfileCareerIdentityDTO | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return payload as T;
}

// ---- Roadmap ----
export async function fetchRoadmap(): Promise<RoadmapDTO | null> {
  const data = await request<{ success: boolean; roadmap: RoadmapDTO | null }>('/api/roadmap');
  return data.roadmap ?? null;
}

export async function patchRoadmapTaskStatus(
  taskId: string,
  status: RoadmapTaskStatus
): Promise<RoadmapDTO | null> {
  const data = await request<{ success: boolean; roadmap: RoadmapDTO | null }>(
    `/api/roadmap/tasks/${taskId}`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
  return data.roadmap ?? null;
}

export async function enrollInRoadmap(): Promise<RoadmapDTO | null> {
  const data = await request<{ success: boolean; roadmap: RoadmapDTO | null }>(
    '/api/roadmap/enroll',
    { method: 'POST' }
  );
  return data.roadmap ?? null;
}

export async function addRoadmapTask(
  phaseId: string,
  milestoneId: string,
  task: { title: string; description?: string; status?: RoadmapTaskStatus }
): Promise<RoadmapTaskDTO | null> {
  const data = await request<{ success: boolean; task: RoadmapTaskDTO | null }>(
    `/api/roadmap/phases/${phaseId}/milestones/${milestoneId}/tasks`,
    { method: 'POST', body: JSON.stringify(task) }
  );
  return data.task ?? null;
}

// ---- Profile ----
export async function fetchProfile(): Promise<ProfileDTO | null> {
  const data = await request<{ success: boolean; profile: ProfileDTO | null }>('/api/profile');
  return data.profile ?? null;
}

export async function patchProfile(updates: Partial<ProfileDTO>): Promise<ProfileDTO | null> {
  const data = await request<{ success: boolean; profile: ProfileDTO | null }>('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.profile ?? null;
}
