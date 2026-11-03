// The shared client: the same Bearer header, JSON parsing and non-OK
// handling every API module uses.
import { apiRequest as request } from './apiClient';
import type { OnboardingStatus } from '../../shared/onboarding';

// Typed client for the B.3.7.1 roadmap and profile endpoints.
// Every call is authenticated with the current Supabase access token.

export type RoadmapTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'blocked';

/** A learning resource attached to a roadmap step. */
export interface RoadmapResourceDTO {
  id: string;
  title: string;
  provider: string;
  url: string;
  durationHours: number | null;
}

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
  /** How hard this step is. */
  difficulty: string | null;
  /** Titles of the steps that must be finished first. */
  prerequisites: string[];
  /** Every skill this step moves the user on. */
  skillNames: string[];
  /** Projects that demonstrate this step. */
  projectTitles: string[];
  /** Recommended learning resources, with their links. */
  resources: RoadmapResourceDTO[];
  /** Urgency of the gap this step closes. */
  priority: string | null;
  /** Plain-language reason this step is in the plan. */
  rationale: string | null;
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
  description: string | null;
  /** The skills and tools the certificate produced. */
  skills: string[];
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
  yearsOfExperience: string | null;
  headline: string | null;
  bio: string | null;
  professionalSummary: string | null;
  careerGoal: string | null;
  customGoalText: string | null;
  targetRole: string | null;
  targetIndustry: string | null;
  /**
   * The catalogue id of the selected target role (level 2).
   *
   * `targetRole` stores the role's canonical title; this is its stable id.
   */
  targetRoleId: string | null;
  /**
   * The parent career domain of the selected target role (level 1).
   *
   * Derived from the selected role through the career catalogue, so the
   * hierarchy can never disagree with the specialisation that was chosen.
   */
  targetRoleDomain: string | null;
  userType: string | null;
  onboardingCompleted: boolean;
  onboardingStatus: OnboardingStatus;
  onboardingStep: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  certifications: ProfileCertificationDTO[];
  languages: ProfileLanguageDTO[];
  links: ProfileLinkDTO[];
  careerIdentity: ProfileCareerIdentityDTO | null;
}

// ---- Roadmap ----
export async function fetchRoadmap(): Promise<RoadmapDTO | null> {
  const data = await request<{ success: boolean; roadmap: RoadmapDTO | null }>('/api/roadmap');
  return data.roadmap ?? null;
}

/**
 * Creates (or replaces) the caller's roadmap, optionally with its whole
 * phase -> milestone -> task tree.
 *
 * A profile has at most one roadmap, so this replaces any existing one. The
 * returned roadmap carries the REAL database ids, so the caller can address
 * the persisted rows afterwards.
 */
export async function createRoadmap(input: {
  title: string;
  targetRoleTitle?: string;
  isEnrolled?: boolean;
  phases?: Array<{
    phaseNumber: number;
    title: string;
    description?: string;
    isUnlocked?: boolean;
    milestones: Array<{
      title: string;
      description?: string;
      tasks: Array<{
        title: string;
        description?: string;
        status?: RoadmapTaskStatus;
        skillName?: string;
        deadline?: string;
        estimatedHours?: number;
      }>;
    }>;
  }>;
}): Promise<RoadmapDTO | null> {
  const data = await request<{ success: boolean; roadmap: RoadmapDTO | null }>('/api/roadmap', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.roadmap ?? null;
}

/**
 * Regenerates the roadmap on the server from the user's current target role
 * and their own skill ratings.
 *
 * The plan is built by the shared generator on the server, so the roadmap a
 * user sees is the one the API and the AI context both read. Existing task
 * progress is preserved by the server.
 */
export async function generatePersonalizedRoadmap(): Promise<RoadmapDTO | null> {
  const data = await request<{ success: boolean; roadmap: RoadmapDTO | null }>(
    '/api/roadmap/generate',
    { method: 'POST', body: JSON.stringify({}) }
  );
  return data.roadmap ?? null;
}

/** Deletes the caller's persisted roadmap. */
export async function deleteRoadmap(): Promise<boolean> {
  await request<{ success: boolean }>('/api/roadmap', { method: 'DELETE' });
  return true;
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
