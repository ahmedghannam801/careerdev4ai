// The CV template API client.
//
// The catalogue, the apply decision and the export authorisation are all
// server answers. The client renders the lock the server describes; it never
// decides for itself that a premium template is unlocked.

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
} from '../../shared/cvTemplates';

export interface CvTemplateWithAccess extends CvTemplateDefinition {
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

export async function applyCvTemplate(
  templateId: string
): Promise<{ success: boolean; templateId: string; access: CvTemplateAccessResult }> {
  return apiRequest('/api/cv-templates/apply', {
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
