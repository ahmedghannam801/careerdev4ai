// The CV template API client.
//
// The catalogue, the apply decision, the unlock and the export authorisation are
// all server answers. The client renders what the server describes; it never
// decides for itself that a premium template is unlocked, and it never charges
// anything. The credits that buy a premium template are taken by the server.

import { apiRequest, ApiRequestError } from './apiClient';
import { getAccessToken } from './supabase';
import { apiUrl } from './native';
import type { CVProfile } from '../types/career';
import type { ResumeLanguage } from '../../shared/resumeLanguage';
import type {
  CvTemplateAccessResult,
  CvTemplateAdminRow,
  CvTemplateCategory,
  CvTemplateDefinition,
  CvTemplateStructure,
} from '../../shared/cvTemplates';

/**
 * A template as the catalogue presents it.
 *
 * The LAYOUT is included for every template, locked or not. Looking at a
 * template is free, and the gallery has to be able to draw the real document —
 * a placeholder tells the candidate nothing about what they would be buying.
 * The access decision beside it says what they may DO with the template.
 */
export interface CvTemplateWithAccess
  extends Omit<CvTemplateDefinition, 'structure'> {
  structure: CvTemplateStructure | null;
  access: CvTemplateAccessResult;
}

export interface CvTemplateCatalogResponse {
  success: boolean;
  categories: CvTemplateCategory[];
  templates: CvTemplateWithAccess[];
  currentTemplateId: string;
  enforcementEnabled: boolean;
}

export async function fetchCvTemplateCatalog(): Promise<CvTemplateCatalogResponse> {
  return apiRequest<CvTemplateCatalogResponse>('/api/cv-templates');
}

/**
 * Asks the server for a template's layout so that it can be previewed.
 *
 * Previewing is free. The server hands back the layout for every template,
 * because a candidate cannot judge a template they are not allowed to look at.
 */
export async function fetchCvTemplatePreview(
  templateId: string
): Promise<{ success: boolean; templateId: string; structure: CvTemplateStructure }> {
  return apiRequest(`/api/cv-templates/${encodeURIComponent(templateId)}/preview`);
}

export async function applyCvTemplate(
  templateId: string
): Promise<{ success: boolean; templateId: string; access: CvTemplateAccessResult }> {
  return apiRequest('/api/cv-templates/apply', {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  });
}

/**
 * Buys a premium template with AI credits.
 *
 * The server decides whether this candidate may buy it, what it costs, and
 * whether the balance covers it; it takes the credits and records the unlock
 * in the same request. The answer reports what was actually spent so the
 * interface can show it.
 */
export async function unlockCvTemplateWithCredits(
  templateId: string
): Promise<{
  success: boolean;
  templateId: string;
  creditsCharged: number;
  remainingBalance: number | null;
  access: CvTemplateAccessResult;
}> {
  return apiRequest(`/api/cv-templates/${encodeURIComponent(templateId)}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ templateId }),
  });
}

export async function authorizeCvTemplateExport(
  templateId: string
): Promise<{ success: boolean; allowed: boolean; access: CvTemplateAccessResult }> {
  return apiRequest(`/api/cv-templates/${encodeURIComponent(templateId)}/export/authorize`);
}

/**
 * Downloads the editable DOCX export.
 *
 * The response is a file, not JSON, so it is fetched directly with the same
 * Bearer header. A refusal still carries a JSON body and is surfaced with the
 * server's own message.
 */
export async function downloadCvTemplateDocx(input: {
  templateId: string;
  cv: CVProfile;
  language: ResumeLanguage;
  fileName?: string;
}): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    apiUrl(`/api/cv-templates/${encodeURIComponent(input.templateId)}/export/docx`),
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ cv: input.cv, language: input.language }),
    }
  );

  if (!res.ok) {
    let message = `Export failed with status ${res.status}`;
    let code: string | null = null;
    try {
      const payload = (await res.json()) as { error?: string; code?: string };
      if (payload?.error) message = payload.error;
      if (payload?.code) code = payload.code;
    } catch {
      // The server sent no JSON. The status is still the honest answer.
    }
    throw new ApiRequestError(res.status, message, code);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = input.fileName || 'CV.docx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the object URL is
  // revoked; revoking immediately cancels it in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

export interface AdminCvTemplateCatalogResponse {
  success: boolean;
  templates: CvTemplateDefinition[];
  rows: CvTemplateAdminRow[];
  categories: CvTemplateCategory[];
  adminTableAvailable: boolean;
}

export async function fetchAdminCvTemplates(): Promise<AdminCvTemplateCatalogResponse> {
  return apiRequest('/api/admin/cv-templates');
}

export interface AdminCvTemplateInput {
  templateId?: string;
  nameEn?: string | null;
  nameAr?: string | null;
  category?: string | null;
  tier?: 'free' | 'premium' | null;
  enabled?: boolean;
  featured?: boolean;
  sortOrder?: number | null;
  thumbnailUrl?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  baseTemplateId?: string | null;
}

export async function createAdminCvTemplate(
  input: AdminCvTemplateInput
): Promise<{ success: boolean; template: CvTemplateAdminRow }> {
  return apiRequest('/api/admin/cv-templates', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateAdminCvTemplate(
  templateId: string,
  input: AdminCvTemplateInput
): Promise<{ success: boolean; template: CvTemplateAdminRow }> {
  return apiRequest(`/api/admin/cv-templates/${encodeURIComponent(templateId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteAdminCvTemplate(
  templateId: string
): Promise<{ success: boolean; disabled?: boolean; deleted?: boolean }> {
  return apiRequest(`/api/admin/cv-templates/${encodeURIComponent(templateId)}`, {
    method: 'DELETE',
  });
}
