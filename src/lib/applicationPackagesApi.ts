import { apiRequest } from './apiClient';

export interface ApplicationPackageDTO {
  id: string;
  profileId: string;
  jobTitle: string | null;
  company: string | null;
  jobDescription: string;
  analysis: unknown;
  matchAnalysis: unknown;
  matchScore: number;
  language: string | null;
  sourceCvId: string | null;
  tailoredCvId: string | null;
  tailoredCvVersionId: string | null;
  coverLetterId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateApplicationPackage = Pick<
  ApplicationPackageDTO,
  'jobTitle' | 'company' | 'jobDescription' | 'analysis' | 'matchAnalysis' | 'matchScore' | 'language' | 'sourceCvId' | 'tailoredCvVersionId' | 'coverLetterId'
>;

export async function saveApplicationPackage(input: CreateApplicationPackage): Promise<ApplicationPackageDTO> {
  const response = await apiRequest<{ success: boolean; package: ApplicationPackageDTO }>(
    '/api/application-packages',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return response.package;
}

export async function updateApplicationPackage(
  id: string,
  updates: Partial<Pick<ApplicationPackageDTO, 'jobTitle' | 'company' | 'sourceCvId' | 'tailoredCvVersionId' | 'coverLetterId' | 'analysis' | 'matchAnalysis' | 'matchScore'>>
): Promise<ApplicationPackageDTO> {
  const response = await apiRequest<{ success: boolean; package: ApplicationPackageDTO }>(
    `/api/application-packages/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return response.package;
}

export async function listApplicationPackages(): Promise<ApplicationPackageDTO[]> {
  const response = await apiRequest<{ success: boolean; packages: ApplicationPackageDTO[] }>(
    '/api/application-packages'
  );
  return response.packages ?? [];
}
