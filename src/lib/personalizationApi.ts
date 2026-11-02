// Client for the personalisation APIs.
//
// These endpoints were added alongside the server-side roadmap generator, the
// volunteer opportunities catalogue, the skill gap engine, the CV builder and
// the guided tour state. They are kept in one module so the shapes the UI
// depends on are declared once.

import { apiRequest } from './apiClient';
import type {
  OpportunityAudience,
  OpportunityKind,
  ParticipationMode,
} from '../../shared/opportunities';

/** A skill the user still needs to close for their target role. */
export interface SkillGapEntry {
  name: string;
  category: string;
  requiredLevel: number;
  currentLevel: number;
  gap: number;
  required: boolean;
  priority: 'critical' | 'high' | 'medium' | 'low' | 'sufficient';
  weight: number;
}

export interface SkillGapSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  sufficient: number;
  total: number;
  open: number;
  openRequired: number;
  openPreferred: number;
  readinessPct: number;
}

export interface SkillGapResponse {
  success: boolean;
  roleId: string | null;
  roleTitle: string | null;
  gaps: SkillGapEntry[];
  summary: SkillGapSummary;
}

/** A learning resource attached to a roadmap step. */
export interface RoadmapResource {
  id: string;
  title: string;
  provider: string;
  url: string;
  durationHours: number | null;
}

export interface RoadmapTask {
  id: string;
  title: string;
  description: string | null;
  status: 'not_started' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
  skillId: string | null;
  skillName: string | null;
  deadline: string | null;
  resourceId: string | null;
  resourceTitle: string | null;
  estimatedHours: number | null;
  sortOrder: number;
  difficulty: string | null;
  prerequisites: string[];
  skillNames: string[];
  projectTitles: string[];
  resources: RoadmapResource[];
  priority: string | null;
  rationale: string | null;
}

export interface RoadmapMilestone {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  completedTasksCount: number;
  tasks: RoadmapTask[];
}

export interface RoadmapPhase {
  id: string;
  phaseNumber: number;
  title: string;
  description: string | null;
  goal: string | null;
  isUnlocked: boolean;
  sortOrder: number;
  milestones: RoadmapMilestone[];
}

export interface Roadmap {
  id: string;
  title: string;
  status: string;
  isEnrolled: boolean;
  targetRoleTitle: string | null;
  targetRoleId: string | null;
  domainId: string | null;
  readinessPct: number | null;
  planSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  phases: RoadmapPhase[];
  totalTasks: number;
  completedTasks: number;
  progressPercent: number;
}

/** The generated plan, before or alongside persistence. */
export interface RoadmapPlan {
  title: string;
  description: string;
  domainId: string;
  targetRoleId: string;
  targetRoleTitle: string;
  phases: RoadmapPhase[];
  summary: {
    totalTasks: number;
    estimatedHours: number;
    readinessPct: number;
    openGaps: number;
    openPreferredGaps: number;
    coveredSkills: string[];
    tasksByPriority: Record<string, number>;
  };
}

export interface PersonalizedRoadmapResponse {
  success: boolean;
  roadmap: Roadmap | null;
  plan: RoadmapPlan | null;
  regenerated: boolean;
}

/** A volunteering opportunity from the real catalogue. */
export interface VolunteerOpportunity {
  id: string;
  title: string;
  organization: string;
  description: string;
  category: string;
  location: string;
  isRemote: boolean;
  commitment: string | null;
  applicationUrl: string;
  skillsGained: string[];
  requiredSkills: string[];
  roleSlugs: string[];
  domainIds: string[];
  verificationStatus: string;
  verifiedAt: string | null;
  country: string;
  languages: string[];
  opportunityType: string;
  deadline: string | null;
  kind: OpportunityKind;
  participationMode: ParticipationMode;
  audiences: OpportunityAudience[];
  eligibility: string | null;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  organizationType: string | null;
  tags: string[];
  isFeatured: boolean;
  relevance: number;
  relevanceReason: string | null;
  closesGap: boolean;
  saved: boolean;
  live: boolean;
}

export interface VolunteerOpportunitiesResponse {
  success: boolean;
  opportunities: VolunteerOpportunity[];
  total: number;
  categories: string[];
}

/** A CV assembled from the user's own records. */
export interface BuiltCv {
  fullName: string | null;
  targetRole: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: { label: string; url: string }[];
  summary: string | null;
  experiences: Array<{
    id: string;
    role: string;
    company: string;
    employmentType: string | null;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description: string | null;
  }>;
  educations: Array<{
    id: string;
    institution: string;
    degree: string | null;
    field: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description: string | null;
  }>;
  projects: Array<{
    id: string;
    title: string;
    goal: string | null;
    description: string | null;
    difficulty: string | null;
    repositoryUrl: string | null;
    demoUrl: string | null;
    documentation: string | null;
  }>;
  volunteering: Array<{
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
  }>;
  skills: Array<{ name: string; level: number }>;
  certifications: Array<{
    id: string;
    name: string;
    issuer: string | null;
    issueDate: string | null;
    url: string | null;
  }>;
  courses: Array<{ id: string; title: string; provider: string; url: string; level: string }>;
  /** What the CV cannot say because the user has not supplied it. */
  missing: string[];
  counts: {
    experiences: number;
    educations: number;
    projects: number;
    volunteering: number;
    skills: number;
    certifications: number;
    courses: number;
  };
}

/** Loads the personalised roadmap, generating it when it is missing or stale. */
export async function fetchPersonalizedRoadmap(): Promise<PersonalizedRoadmapResponse> {
  return apiRequest<PersonalizedRoadmapResponse>('/api/roadmap/personalized');
}

/** Regenerates the roadmap from the user's current role and skill ratings. */
export async function regenerateRoadmap(): Promise<PersonalizedRoadmapResponse> {
  return apiRequest<PersonalizedRoadmapResponse>('/api/roadmap/generate', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** Loads the skill gap picture for the user's target role. */
export async function fetchSkillGaps(): Promise<SkillGapResponse> {
  return apiRequest<SkillGapResponse>('/api/skill-gaps');
}

/** Loads the volunteer opportunities catalogue, ranked for the user. */
export async function fetchVolunteerOpportunities(): Promise<VolunteerOpportunitiesResponse> {
  return apiRequest<VolunteerOpportunitiesResponse>('/api/volunteer/opportunities');
}

/** Saves an opportunity for the user. */
export async function saveVolunteerOpportunity(id: string): Promise<void> {
  await apiRequest(`/api/volunteer/opportunities/${encodeURIComponent(id)}/save`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** Removes a saved opportunity. */
export async function unsaveVolunteerOpportunity(id: string): Promise<void> {
  await apiRequest(`/api/volunteer/opportunities/${encodeURIComponent(id)}/save`, {
    method: 'DELETE',
  });
}

/** Builds a CV from the user's own records. */
export async function fetchBuiltCv(): Promise<{ success: boolean; cv: BuiltCv }> {
  return apiRequest<{ success: boolean; cv: BuiltCv }>('/api/cv/build');
}

/** The guide keys the user has already dismissed. */
export async function fetchDismissedGuides(): Promise<string[]> {
  const response = await apiRequest<{ success: boolean; dismissed: string[] }>('/api/guides');
  return response.dismissed ?? [];
}

/** Records that the user has seen a guide. */
export async function dismissGuide(key: string): Promise<void> {
  await apiRequest(`/api/guides/${encodeURIComponent(key)}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
