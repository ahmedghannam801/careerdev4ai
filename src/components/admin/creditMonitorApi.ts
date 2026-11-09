/**
 * The client of the AI-credit and CV-activity monitor.
 *
 * The monitor reads four endpoints of its own and shares nothing with the
 * other admin panels, so it carries its own typed client instead of growing
 * the shared admin client with a report only one screen uses.
 */

import { apiRequest } from '../../lib/apiClient';

export interface CreditDayRow {
  day: string;
  accountsGranted: number;
  creditsGranted: number;
  creditsUnused: number;
  accountsWithCredits: number;
  creditsConsumed: number;
  creditsRefunded: number;
  learningHubConsumed: number;
}

export interface CreditSummary {
  success: true;
  window: { days: number; from: string; to: string; timezone: string };
  today: {
    day: string;
    accountsGranted: number;
    creditsGranted: number;
    creditsUnused: number;
    creditsConsumed: number;
    creditsRefunded: number;
    learningHubConsumed: number;
  };
  totals: {
    accountsGranted: number;
    creditsGranted: number;
    creditsUnused: number;
    creditsConsumed: number;
    creditsRefunded: number;
    learningHubConsumed: number;
    learningHubShare: number;
    accountsWithBalance: number;
    accountsObserved: number;
    balanceScanTruncated: boolean;
    ledgerScanTruncated: boolean;
  };
  daily: CreditDayRow[];
  consumptionByAction: { action: string; credits: number; operations: number }[];
  learningHub: {
    actionType: string;
    creditsConsumed: number;
    shareOfConsumption: number;
  };
}

export interface CreditFailureRow {
  id: string;
  profileId: string;
  candidateName: string | null;
  candidateUsername: string | null;
  aiActionType: string | null;
  creditsAttempted: number;
  refunded: boolean;
  failureReason: string | null;
  httpStatus: number | null;
  createdAt: string;
}

export interface CreditLedgerEntry {
  id: string;
  profileId: string;
  candidateName: string | null;
  candidateUsername: string | null;
  amount: number;
  runningBalance: number;
  operation: string;
  sourceType: string;
  aiActionType: string | null;
  description: string | null;
  createdAt: string;
}

export interface CvActivity {
  success: true;
  window: { days: number; from: string; to: string; timezone: string };
  totals: {
    cvsCreated: number;
    freeTemplates: number;
    premiumTemplates: number;
    withoutTemplate: number;
    cvCreditsConsumed: number;
    cvOperations: number;
  };
  daily: { day: string; cvsCreated: number; freeTemplates: number; premiumTemplates: number }[];
  topTemplates: {
    templateId: string;
    nameEn: string | null;
    nameAr: string | null;
    tier: string | null;
    cvsCreated: number;
  }[];
  creditConsumption: { action: string; credits: number; operations: number }[];
}

/** The credit summary of the window. */
export async function fetchCreditSummary(days: number): Promise<CreditSummary> {
  const data = await apiRequest<CreditSummary>(`/api/admin/credits/summary?days=${days}`);
  return data;
}

/** The most recent failed credit operations. */
export async function fetchCreditFailures(
  limit = 50
): Promise<{ success: true; available: boolean; failures: CreditFailureRow[] }> {
  return apiRequest(`/api/admin/credits/failures?limit=${limit}`);
}

/** A filtered page of the credit ledger. */
export async function fetchCreditLedger(filters: {
  limit?: number;
  offset?: number;
  action?: string;
  operation?: string;
}): Promise<{ success: true; limit: number; offset: number; entries: CreditLedgerEntry[] }> {
  const params = new URLSearchParams();
  params.set('limit', String(filters.limit ?? 100));
  params.set('offset', String(filters.offset ?? 0));
  if (filters.action) params.set('action', filters.action);
  if (filters.operation) params.set('operation', filters.operation);
  return apiRequest(`/api/admin/credits/ledger?${params.toString()}`);
}

/** The CV activity of the window. */
export async function fetchCvActivity(days: number): Promise<CvActivity> {
  const data = await apiRequest<CvActivity>(`/api/admin/cv/activity?days=${days}`);
  return data;
}
