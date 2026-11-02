// Typed client for the administrative API.
//
// The server is the authority: every function here sends the current Supabase
// access token, and the server re-loads the caller's admin row and checks the
// permission for the route. The types mirror the JSON shapes the server
// returns; they are not a grant of access.

import { apiRequest as request } from './apiClient';
import type { LearningCourse } from '../types/learning';
import type { VolunteerOpportunity } from './personalizationApi';

export interface AdminDTO {
  id: string;
  profileId: string;
  email: string;
  fullName: string | null;
  role: 'super_admin' | 'content_admin' | 'opportunity_admin' | 'moderator';
  status: 'active' | 'disabled';
  permissions: string[];
  createdBy: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAudience {
  type: 'all' | 'users' | 'target_role' | 'target_industry' | 'user_type' | 'country';
  values: string[];
}

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'important' | 'urgent';
  status: 'draft' | 'published' | 'archived';
  audienceType: AdminAudience['type'];
  audienceValues: string[];
  linkView: string | null;
  createdBy: string | null;
  createdByName: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  recipientCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAnalytics {
  users: number;
  admins: number;
  courses: number;
  opportunities: number;
  learningItems: number;
  completedLearning: number;
  notifications: number;
  announcements: number;
  publishedAnnouncements: number;
  activeOpportunities: number;
}

export interface AdminUserSummary {
  id: string;
  fullName: string | null;
  username: string | null;
  targetRole: string | null;
  targetIndustry: string | null;
  userType: string | null;
  country: string | null;
}

export interface AdminAuditEntry {
  id: string;
  adminEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function fetchAdminMe(): Promise<AdminDTO | null> {
  const data = await request<{ admin: AdminDTO | null }>('/api/admin/me');
  return data.admin ?? null;
}

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const data = await request<{ analytics: AdminAnalytics }>('/api/admin/analytics');
  return data.analytics;
}

export async function fetchAdmins(): Promise<AdminDTO[]> {
  const data = await request<{ admins: AdminDTO[] }>('/api/admin/admins');
  return data.admins ?? [];
}

export async function createAdmin(input: {
  email: string;
  role: AdminDTO['role'];
  permissions?: string[];
}): Promise<AdminDTO> {
  const data = await request<{ admin: AdminDTO }>('/api/admin/admins', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.admin;
}

export async function patchAdmin(
  id: string,
  patch: {
    role?: AdminDTO['role'];
    status?: AdminDTO['status'];
    permissions?: string[];
    fullName?: string | null;
  }
): Promise<AdminDTO> {
  const data = await request<{ admin: AdminDTO }>(
    `/api/admin/admins/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) }
  );
  return data.admin;
}

export async function deleteAdmin(id: string): Promise<void> {
  await request(`/api/admin/admins/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchAdminAnnouncements(): Promise<AdminAnnouncement[]> {
  const data = await request<{ announcements: AdminAnnouncement[] }>(
    '/api/admin/announcements'
  );
  return data.announcements ?? [];
}

export interface AnnouncementInput {
  title: string;
  body: string;
  priority: AdminAnnouncement['priority'];
  audienceType: AdminAudience['type'];
  audienceValues: string[];
  linkView?: string | null;
}

export async function createAnnouncement(
  input: AnnouncementInput
): Promise<AdminAnnouncement> {
  const data = await request<{ announcement: AdminAnnouncement }>(
    '/api/admin/announcements',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.announcement;
}

export async function patchAnnouncement(
  id: string,
  input: Partial<AnnouncementInput>
): Promise<AdminAnnouncement> {
  const data = await request<{ announcement: AdminAnnouncement }>(
    `/api/admin/announcements/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  );
  return data.announcement;
}

export async function publishAnnouncement(id: string): Promise<AdminAnnouncement> {
  const data = await request<{ announcement: AdminAnnouncement }>(
    `/api/admin/announcements/${encodeURIComponent(id)}/publish`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return data.announcement;
}

export async function archiveAnnouncement(id: string): Promise<AdminAnnouncement> {
  const data = await request<{ announcement: AdminAnnouncement }>(
    `/api/admin/announcements/${encodeURIComponent(id)}/archive`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return data.announcement;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await request(`/api/admin/announcements/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function searchAdminUsers(query: string): Promise<AdminUserSummary[]> {
  const data = await request<{ users: AdminUserSummary[] }>(
    `/api/admin/users?query=${encodeURIComponent(query)}`
  );
  return data.users ?? [];
}

export async function fetchAdminAudit(limit = 100): Promise<AdminAuditEntry[]> {
  const data = await request<{ entries: AdminAuditEntry[] }>(
    `/api/admin/audit?limit=${limit}`
  );
  return data.entries ?? [];
}

export async function fetchAdminOpportunities(): Promise<VolunteerOpportunity[]> {
  const data = await request<{ opportunities: VolunteerOpportunity[] }>(
    '/api/admin/opportunities'
  );
  return data.opportunities ?? [];
}

export async function patchAdminOpportunity(
  id: string,
  patch: {
    isActive?: boolean;
    isFeatured?: boolean;
    verificationStatus?: 'http' | 'pending' | 'verified' | 'rejected';
    deadline?: string | null;
  }
): Promise<VolunteerOpportunity> {
  const data = await request<{ opportunity: VolunteerOpportunity }>(
    `/api/admin/opportunities/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) }
  );
  return data.opportunity;
}

export async function fetchAdminLearning(): Promise<LearningCourse[]> {
  const data = await request<{ courses: LearningCourse[] }>('/api/admin/learning');
  return data.courses ?? [];
}

/**
 * Records a moderation report. The server persists it in the audit trail, so a
 * Super Admin can review it; a report is not a client-only toast.
 */
export async function reportAdminIssue(input: {
  entityType: 'announcement' | 'opportunity' | 'course' | 'profile' | 'other';
  entityId?: string;
  reason: string;
}): Promise<void> {
  await request('/api/admin/reports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function patchAdminCourse(
  id: string,
  patch: {
    isFeatured?: boolean;
    resourceType?: LearningCourse['resourceType'] | null;
    hasCertificate?: boolean;
    certificateIncluded?: boolean;
    thumbnailUrl?: string | null;
  }
): Promise<LearningCourse> {
  const data = await request<{ course: LearningCourse }>(
    `/api/admin/learning/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) }
  );
  return data.course;
}
