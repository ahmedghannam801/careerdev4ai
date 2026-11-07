// Typed client for the administrative API.
//
// The server is the authority: every function here sends the current Supabase
// access token, and the server re-loads the caller's admin row and checks the
// permission for the route. The types mirror the JSON shapes the server
// returns; they are not a grant of access.

import { apiRequest as request } from './apiClient';
import type { LearningCourse } from '../types/learning';
import type { VolunteerOpportunity } from './personalizationApi';
import type {
  AnnouncementCategory,
  AnnouncementStatus,
  AnnouncementPriority,
  AudienceRuleGroup,
} from '../../shared/admin';

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
  imageUrl: string | null;
  thumbnailUrl: string | null;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audienceType: AdminAudience['type'];
  audienceValues: string[];
  audienceRules: AudienceRuleGroup[];
  audienceSummary: string | null;
  ctaText: string | null;
  ctaUrl: string | null;
  linkView: string | null;
  createdBy: string | null;
  createdByName: string | null;
  publishAt: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  recipientCount: number;
  stats: {
    deliveredCount: number;
    readCount: number;
    clickedCount: number;
    readRate: number;
    clickRate: number;
  };
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

export interface AdminUserSummary {  id: string;
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

/** The numbers of one period. */
export interface TrafficPeriod {
  activeUsers: number;
  sessions: number;
  pageViews: number;
}

/** A row of the traffic-source report. */
export interface TrafficSource {
  source: string;
  channel: string;
  sessions: number;
  users: number;
}

/** A row of the top-pages report. */
export interface TrafficPage {
  path: string;
  title: string;
  views: number;
  users: number;
}

/** A row of the devices report. */
export interface TrafficDevice {
  device: string;
  sessions: number;
  users: number;
}

/** A row of the geography report. */
export interface TrafficCountry {
  country: string;
  users: number;
  sessions: number;
}

/** A step of the conversion funnel. */
export interface TrafficFunnelStep {
  step: string;
  event: string;
  count: number;
  users: number;
  rate: number;
}

/**
 * The traffic report of the Google Analytics property.
 *
 * `connected` is false when the property is not wired up on this deployment.
 * The panel then explains what to add rather than showing empty numbers.
 */
export interface TrafficReport {
  connected: boolean;
  propertyId?: string;
  measuredAt: string;
  today: TrafficPeriod;
  last7Days: TrafficPeriod;
  last30Days: TrafficPeriod;
  totals: {
    totalUsers: number;
    newUsers: number;
    returningUsers: number;
  };
  sources: TrafficSource[];
  topPages: TrafficPage[];
  devices: TrafficDevice[];
  countries: TrafficCountry[];
  funnel: TrafficFunnelStep[];
  message?: string;
}

export async function fetchAdminMe(): Promise<AdminDTO | null> {
  const data = await request<{ admin: AdminDTO | null }>('/api/admin/me');
  return data.admin ?? null;
}

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  const data = await request<{ analytics: AdminAnalytics }>('/api/admin/analytics');
  return data.analytics;
}

/** Reads the traffic report of the Google Analytics property. */
export async function fetchTrafficReport(): Promise<TrafficReport> {
  const data = await request<{ traffic: TrafficReport }>('/api/admin/analytics/traffic');
  return data.traffic;
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
  category: AnnouncementCategory;
  priority: AdminAnnouncement['priority'];
  audienceType: AdminAudience['type'];
  audienceValues: string[];
  audienceRules: AudienceRuleGroup[];
  linkView?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  publishAt?: string | null;
  expiresAt?: string | null;
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

/** Previews the audience with the same resolver delivery will use. */
export async function previewAnnouncement(input: {
  audienceType?: AdminAudience['type'];
  audienceValues?: string[];
  audienceRules?: AudienceRuleGroup[];
}): Promise<{ count: number; summary: string }> {
  const data = await request<{ preview: { count: number; summary: string } }>(
    '/api/admin/announcements/preview',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.preview;
}

export async function scheduleAnnouncement(
  id: string,
  publishAt: string
): Promise<AdminAnnouncement> {
  const data = await request<{ announcement: AdminAnnouncement }>(
    `/api/admin/announcements/${encodeURIComponent(id)}/schedule`,
    { method: 'POST', body: JSON.stringify({ publishAt }) }
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

/* -------------------------------------------------------------------------- */
/* Subscriptions, Payments & Revenue Admin Endpoints                          */
/* -------------------------------------------------------------------------- */

export interface AdminSubscriptionRow {
  id: string;
  profile_id: string;
  plan_id: string;
  billing_cycle: string;
  status: string;
  current_period_starts_at: string;
  current_period_ends_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  subscription_plans?: {
    code: string;
    name_en: string;
    name_ar: string;
    price_monthly_piasters: number;
    price_annual_piasters: number;
  };
  profiles?: {
    full_name: string | null;
    username: string | null;
  };
}

export interface AdminPaymentRow {
  id: string;
  profile_id: string;
  plan_id: string;
  billing_cycle: string;
  original_amount_piasters: number;
  discount_amount_piasters: number;
  amount_piasters: number;
  currency: string;
  payment_method: string;
  status: string;
  transaction_reference: string | null;
  sender_phone_or_handle: string | null;
  receipt_storage_path: string | null;
  receipt_filename: string | null;
  risk_score: number;
  risk_flags: string[];
  temporary_access_granted_at: string | null;
  temporary_access_expires_at: string | null;
  review_notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  subscription_plans?: {
    code: string;
    name_en: string;
    name_ar: string;
  };
  profiles?: {
    full_name: string | null;
    username: string | null;
  };
}

export interface AdminStripeInvoiceRow {
  id: string;
  number: string | null;
  status: string | null;
  amountPaidPiasters: number;
  amountDuePiasters: number;
  currency: string;
  livemode: boolean;
  paid: boolean;
  planCode: string | null;
  purchaseKind: string | null;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
}

export interface AdminStripeRefundRow {
  id: string;
  amountPiasters: number;
  currency: string;
  status: string | null;
  reason: string | null;
  livemode: boolean;
  createdAt: string | null;
  invoiceId: string | null;
}

export interface AdminStripeRevenue {
  available: boolean;
  /** True when the server is using a `sk_test_...` key. */
  testMode: boolean;
  paidInvoiceCount: number;
  paidGrossPiasters: number;
  refundedPiasters: number;
  testInvoiceCount: number;
  pendingInvoiceCount: number;
  failedInvoiceCount: number;
  subscriptionRevenuePiasters: number;
  packRevenuePiasters: number;
  recentInvoices: AdminStripeInvoiceRow[];
  recentRefunds: AdminStripeRefundRow[];
  disputeCount: number;
  disputedPiasters: number;
}

export interface AdminOfflineTransaction {
  reference: string | null;
  method: string;
  amountPiasters: number;
  status: string;
  paidAt: string | null;
  createdAt: string | null;
}

export interface AdminOfflineRevenue {
  refundedPiasters: number;
  refundCount: number;
  pendingCount: number;
  failedCount: number;
  recentTransactions: AdminOfflineTransaction[];
}

export interface AdminRevenueMetrics {
  dateRange: { from: string | null; to: string | null };
  totalCollectedPiasters: number;
  grossCollectedPiasters: number;
  refundedPiasters: number;
  totalCollectedEgp: number;
  transactionCount: number;
  breakdownByMethodPiasters: Record<string, number>;
  breakdownByPlanPiasters: Record<string, number>;
  breakdownByCyclePiasters: Record<string, number>;
  breakdownBySourcePiasters: Record<string, number>;
  pendingPaymentCount: number;
  failedPaymentCount: number;
  refundCount: number;
  stripe?: AdminStripeRevenue;
  offline?: AdminOfflineRevenue;
}

export async function fetchAdminSubscriptions(): Promise<AdminSubscriptionRow[]> {
  const data = await request<{ subscriptions: AdminSubscriptionRow[] }>('/api/admin/subscriptions');
  return data.subscriptions ?? [];
}

export async function fetchAdminPayments(status?: string): Promise<AdminPaymentRow[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await request<{ payments: AdminPaymentRow[] }>(`/api/admin/payments${query}`);
  return data.payments ?? [];
}

export async function confirmAdminPayment(
  paymentId: string,
  notes?: string
): Promise<{ success: boolean; subscriptionId?: string }> {
  return request<{ success: boolean; subscriptionId?: string }>(
    `/api/admin/payments/${encodeURIComponent(paymentId)}/confirm`,
    {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }
  );
}

export async function rejectAdminPayment(
  paymentId: string,
  reason: string,
  notes?: string
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(
    `/api/admin/payments/${encodeURIComponent(paymentId)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason, notes }),
    }
  );
}

export async function restoreAdminPayment(
  paymentId: string,
  notes?: string
): Promise<{ success: boolean; subscriptionId?: string }> {
  return request<{ success: boolean; subscriptionId?: string }>(
    `/api/admin/payments/${encodeURIComponent(paymentId)}/restore`,
    {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }
  );
}

export async function fetchAdminRevenue(filter?: {
  from?: string;
  to?: string;
}): Promise<AdminRevenueMetrics> {
  const params = new URLSearchParams();
  if (filter?.from) params.set('from', filter.from);
  if (filter?.to) params.set('to', filter.to);
  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ metrics: AdminRevenueMetrics }>(`/api/admin/revenue${query}`);
  return data.metrics;
}

export async function grantAdminCredits(
  profileId: string,
  amount: number,
  reason: string
): Promise<{ success: boolean; grantedCredits: number }> {
  return request<{ success: boolean; grantedCredits: number }>('/api/admin/credits/grant', {
    method: 'POST',
    body: JSON.stringify({ profileId, amount, reason }),
  });
}
