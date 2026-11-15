// Authenticated client for the Career Experience Hub endpoints.
//
// The catalogue is public. Every user-state call is authenticated with the
// current Supabase access token, exactly like the other domain APIs.
import { apiRequest as request } from './apiClient';
import type {
  CareerExperience,
  ExperienceCertificate,
  ExperienceProgress,
  ExperienceProgressStatus,
} from '../../shared/careerExperience';

export async function fetchExperienceCatalog(): Promise<CareerExperience[]> {
  const data = await request<{ experiences: CareerExperience[] }>(
    '/api/career-experiences/catalog'
  );
  return data.experiences ?? [];
}

export interface ExperienceState {
  progress: ExperienceProgress[];
  certificates: ExperienceCertificate[];
}

export async function fetchExperienceState(): Promise<ExperienceState> {
  const data = await request<ExperienceState>('/api/career-experiences/me');
  return {
    progress: data.progress ?? [],
    certificates: data.certificates ?? [],
  };
}

export async function saveExperienceProgress(
  experienceId: string,
  status: ExperienceProgressStatus,
  saved?: boolean
): Promise<ExperienceProgress> {
  const data = await request<{ progress: ExperienceProgress }>(
    `/api/career-experiences/${encodeURIComponent(experienceId)}/progress`,
    {
      method: 'PUT',
      body: JSON.stringify({ status, saved }),
    }
  );
  return data.progress;
}

export async function removeExperienceProgress(experienceId: string): Promise<void> {
  await request<{ success: boolean }>(
    `/api/career-experiences/${encodeURIComponent(experienceId)}/progress`,
    { method: 'DELETE' }
  );
}

export async function saveExperienceCertificate(
  experienceId: string,
  certificateUrl: string
): Promise<ExperienceCertificate> {
  const data = await request<{ certificate: ExperienceCertificate }>(
    `/api/career-experiences/${encodeURIComponent(experienceId)}/certificate`,
    {
      method: 'PUT',
      body: JSON.stringify({ certificateUrl }),
    }
  );
  return data.certificate;
}

export async function removeExperienceCertificate(experienceId: string): Promise<void> {
  await request<{ success: boolean }>(
    `/api/career-experiences/${encodeURIComponent(experienceId)}/certificate`,
    { method: 'DELETE' }
  );
}
