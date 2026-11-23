// Typed client for the account's email preferences.
//
// The server owns consent, the unsubscribe token and the delivery category
// mapping. This module only names the shape the settings screen uses.

import { apiRequest as request } from './apiClient';

export interface EmailPreferences {
  emailEnabled: boolean;
  securityAlerts: boolean;
  billingUpdates: boolean;
  applicationUpdates: boolean;
  interviewUpdates: boolean;
  roadmapUpdates: boolean;
  jobAlerts: boolean;
  opportunityAlerts: boolean;
  learningUpdates: boolean;
  volunteeringUpdates: boolean;
  projectUpdates: boolean;
  assessmentUpdates: boolean;
  careerRecommendations: boolean;
  announcements: boolean;
  dailyDigest: boolean;
  weeklyDigest: boolean;
  digestHour: number;
  unsubscribedAll: boolean;
  unsubscribedAt: string | null;
  consentGrantedAt: string;
  consentUpdatedAt: string;
  consentSource: string;
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export type EmailPreferenceKey =
  | 'emailEnabled'
  | 'securityAlerts'
  | 'billingUpdates'
  | 'applicationUpdates'
  | 'interviewUpdates'
  | 'roadmapUpdates'
  | 'jobAlerts'
  | 'opportunityAlerts'
  | 'learningUpdates'
  | 'volunteeringUpdates'
  | 'projectUpdates'
  | 'assessmentUpdates'
  | 'careerRecommendations'
  | 'announcements'
  | 'dailyDigest'
  | 'weeklyDigest';

export async function fetchEmailPreferences(): Promise<EmailPreferences> {
  const response = await request<{ preferences: EmailPreferences }>('/api/email/preferences');
  return response.preferences;
}

export async function patchEmailPreferences(
  updates: Partial<Record<EmailPreferenceKey, boolean>> & {
    digestHour?: number;
    unsubscribeAll?: boolean;
  },
): Promise<EmailPreferences> {
  const response = await request<{ preferences: EmailPreferences }>('/api/email/preferences', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return response.preferences;
}
