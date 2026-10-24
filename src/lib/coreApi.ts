// The shared client: the same Bearer header, JSON parsing and non-OK
// handling every API module uses.
import { apiRequest as request } from './apiClient';

// Typed client for the B.3.7 core-domain endpoints.
// Every call is authenticated with the current Supabase access token.

export interface CvDTO {
  id: string;
  name: string;
  targetRoleTitle: string | null;
  storagePath: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CvVersionDTO {
  id: string;
  cvId: string;
  versionNumber: number;
  name: string;
  targetRoleTitle: string | null;
  profileJson: unknown;
  atsAnalysis: unknown;
  createdAt: string;
}

export interface ProjectDTO {
  id: string;
  title: string;
  goal: string | null;
  description: string | null;
  difficulty: string | null;
  status: string | null;
  repositoryUrl: string | null;
  demoUrl: string | null;
  documentation: string | null;
  tasks: string[];
  deliverables: string[];
  skills: string[];
  createdAt: string;
  completedAt: string | null;
}

export interface EvidenceDTO {
  id: string;
  title: string;
  type: string | null;
  description: string | null;
  url: string | null;
  verified: boolean;
  dateAdded: string | null;
  projectId: string | null;
  skillNames: string[];
}

export interface CertificationDTO {
  id: string;
  name: string;
  issuer: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  url: string | null;
  credentialId: string | null;
}

export interface LanguageDTO {
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

export interface CareerIdentityDTO {
  id: string;
  whoYouAre: string | null;
  whereYoureGoing: string | null;
  why: string | null;
  whatYoureMissing: string | null;
  whatYoureBuilding: string | null;
  howYourePresenting: string | null;
  whereApplying: string | null;
}

export interface SavedRoleDTO {
  id: string;
  roleId: string;
  title: string;
  category: string | null;
  level: string | null;
  payload: unknown;
  savedAt: string;
}

export interface JobApplicationDTO {
  id: string;
  jobId: string | null;
  company: string;
  role: string;
  location: string | null;
  workMode: string | null;
  stage: string;
  appliedDate: string | null;
  lastUpdated: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  notes: string | null;
  salaryDiscussed: string | null;
  interviewStageDetails: string | null;
  createdAt: string;
}

export interface InterviewSessionDTO {
  id: string;
  roleTitle: string | null;
  type: string | null;
  question: string;
  userAnswer: string | null;
  aiFeedback: unknown;
  createdAt: string;
}

// ---- CVs ----
export async function fetchCvs(): Promise<CvDTO[]> {
  const data = await request<{ success: boolean; cvs: CvDTO[] }>('/api/cvs');
  return data.cvs ?? [];
}

export async function postCv(input: {
  name: string;
  targetRoleTitle?: string;
}): Promise<CvDTO> {
  const data = await request<{ success: boolean; cv: CvDTO }>('/api/cvs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.cv;
}

export async function patchCv(
  id: string,
  updates: { name?: string; targetRoleTitle?: string; isActive?: boolean }
): Promise<CvDTO> {
  const data = await request<{ success: boolean; cv: CvDTO }>(`/api/cvs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.cv;
}

export async function deleteCv(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/cvs/${id}`, { method: 'DELETE' });
}

// ---- CV versions ----
export async function fetchCvVersions(): Promise<CvVersionDTO[]> {
  const data = await request<{ success: boolean; versions: CvVersionDTO[] }>('/api/cv-versions');
  return data.versions ?? [];
}

export async function postCvVersion(input: {
  cvId: string;
  name: string;
  targetRoleTitle?: string;
  profileJson: unknown;
  atsAnalysis?: unknown;
}): Promise<CvVersionDTO> {
  const data = await request<{ success: boolean; version: CvVersionDTO }>('/api/cv-versions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.version;
}

export async function patchCvVersion(
  id: string,
  updates: { name?: string; profileJson?: unknown; atsAnalysis?: unknown }
): Promise<CvVersionDTO> {
  const data = await request<{ success: boolean; version: CvVersionDTO }>(
    `/api/cv-versions/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.version;
}

export async function deleteCvVersion(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/cv-versions/${id}`, { method: 'DELETE' });
}

// ---- Projects ----
export async function fetchProjects(): Promise<ProjectDTO[]> {
  const data = await request<{ success: boolean; projects: ProjectDTO[] }>('/api/projects');
  return data.projects ?? [];
}

export async function postProject(input: {
  title: string;
  goal?: string;
  description?: string;
  difficulty?: string;
  status?: string;
  repositoryUrl?: string;
  demoUrl?: string;
  documentation?: string;
  tasks?: string[];
  deliverables?: string[];
  skills?: string[];
}): Promise<ProjectDTO> {
  const data = await request<{ success: boolean; project: ProjectDTO }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.project;
}

export async function patchProject(
  id: string,
  updates: Partial<{
    title: string;
    goal: string;
    description: string;
    difficulty: string;
    status: string;
    repositoryUrl: string;
    demoUrl: string;
    documentation: string;
    tasks: string[];
    deliverables: string[];
    skills: string[];
  }>
): Promise<ProjectDTO> {
  const data = await request<{ success: boolean; project: ProjectDTO }>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.project;
}

export async function deleteProject(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/projects/${id}`, { method: 'DELETE' });
}

// ---- Evidence ----
export async function fetchEvidence(): Promise<EvidenceDTO[]> {
  const data = await request<{ success: boolean; evidence: EvidenceDTO[] }>('/api/evidence');
  return data.evidence ?? [];
}

export async function postEvidence(input: {
  title: string;
  type?: string;
  description?: string;
  url?: string;
  verified?: boolean;
  dateAdded?: string;
  projectId?: string;
  skillNames?: string[];
}): Promise<EvidenceDTO> {
  const data = await request<{ success: boolean; evidence: EvidenceDTO }>('/api/evidence', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.evidence;
}

export async function patchEvidence(
  id: string,
  updates: Partial<{
    title: string;
    type: string;
    description: string;
    url: string;
    verified: boolean;
    dateAdded: string;
    projectId: string;
    skillNames: string[];
  }>
): Promise<EvidenceDTO> {
  const data = await request<{ success: boolean; evidence: EvidenceDTO }>(`/api/evidence/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.evidence;
}

export async function deleteEvidence(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/evidence/${id}`, { method: 'DELETE' });
}

// ---- Profile extensions ----
export async function fetchCertifications(): Promise<CertificationDTO[]> {
  const data = await request<{ success: boolean; certifications: CertificationDTO[] }>(
    '/api/certifications'
  );
  return data.certifications ?? [];
}

export async function postCertification(input: {
  name: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  url?: string;
  credentialId?: string;
}): Promise<CertificationDTO> {
  const data = await request<{ success: boolean; certification: CertificationDTO }>(
    '/api/certifications',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.certification;
}

export async function patchCertification(
  id: string,
  updates: Partial<{
    name: string;
    issuer: string;
    issueDate: string;
    expiryDate: string;
    url: string;
    credentialId: string;
  }>
): Promise<CertificationDTO> {
  const data = await request<{ success: boolean; certification: CertificationDTO }>(
    `/api/certifications/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.certification;
}

export async function deleteCertification(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/certifications/${id}`, { method: 'DELETE' });
}

export async function fetchLanguages(): Promise<LanguageDTO[]> {
  const data = await request<{ success: boolean; languages: LanguageDTO[] }>('/api/languages');
  return data.languages ?? [];
}

export async function postLanguage(input: {
  name: string;
  proficiency?: string;
}): Promise<LanguageDTO> {
  const data = await request<{ success: boolean; language: LanguageDTO }>('/api/languages', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.language;
}

export async function patchLanguage(
  id: string,
  updates: { name?: string; proficiency?: string }
): Promise<LanguageDTO> {
  const data = await request<{ success: boolean; language: LanguageDTO }>(`/api/languages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.language;
}

export async function deleteLanguage(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/languages/${id}`, { method: 'DELETE' });
}

export async function fetchProfileLinks(): Promise<ProfileLinkDTO[]> {
  const data = await request<{ success: boolean; links: ProfileLinkDTO[] }>('/api/profile-links');
  return data.links ?? [];
}

export async function postProfileLink(input: {
  kind: string;
  label?: string;
  url: string;
}): Promise<ProfileLinkDTO> {
  const data = await request<{ success: boolean; link: ProfileLinkDTO }>('/api/profile-links', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.link;
}

export async function patchProfileLink(
  id: string,
  updates: { kind?: string; label?: string; url?: string }
): Promise<ProfileLinkDTO> {
  const data = await request<{ success: boolean; link: ProfileLinkDTO }>(
    `/api/profile-links/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.link;
}

export async function deleteProfileLink(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/profile-links/${id}`, { method: 'DELETE' });
}

export async function fetchCareerIdentity(): Promise<CareerIdentityDTO | null> {
  const data = await request<{ success: boolean; identity: CareerIdentityDTO | null }>(
    '/api/career-identity'
  );
  return data.identity ?? null;
}

export async function putCareerIdentity(input: {
  whoYouAre?: string;
  whereYoureGoing?: string;
  why?: string;
  whatYoureMissing?: string;
  whatYoureBuilding?: string;
  howYourePresenting?: string;
  whereApplying?: string;
}): Promise<CareerIdentityDTO> {
  const data = await request<{ success: boolean; identity: CareerIdentityDTO }>(
    '/api/career-identity',
    { method: 'PUT', body: JSON.stringify(input) }
  );
  return data.identity;
}

// ---- Saved roles ----
export async function fetchSavedRoles(): Promise<SavedRoleDTO[]> {
  const data = await request<{ success: boolean; roles: SavedRoleDTO[] }>('/api/saved-roles');
  return data.roles ?? [];
}

export async function postSavedRole(input: {
  roleId: string;
  title: string;
  category?: string;
  level?: string;
  payload?: unknown;
}): Promise<SavedRoleDTO> {
  const data = await request<{ success: boolean; role: SavedRoleDTO }>('/api/saved-roles', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.role;
}

export async function deleteSavedRole(roleId: string): Promise<void> {
  await request<{ success: boolean }>(`/api/saved-roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE',
  });
}

// ---- Job applications ----
export async function fetchJobApplications(): Promise<JobApplicationDTO[]> {
  const data = await request<{ success: boolean; applications: JobApplicationDTO[] }>(
    '/api/job-applications'
  );
  return data.applications ?? [];
}

export async function postJobApplication(input: {
  jobId?: string;
  company: string;
  role: string;
  location?: string;
  workMode?: string;
  stage?: string;
  appliedDate?: string;
  nextAction?: string;
  nextActionDate?: string;
  notes?: string;
  salaryDiscussed?: string;
  interviewStageDetails?: string;
}): Promise<JobApplicationDTO> {
  const data = await request<{ success: boolean; application: JobApplicationDTO }>(
    '/api/job-applications',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.application;
}

export async function patchJobApplication(
  id: string,
  updates: Partial<{
    jobId: string;
    company: string;
    role: string;
    location: string;
    workMode: string;
    stage: string;
    appliedDate: string;
    nextAction: string;
    nextActionDate: string;
    notes: string;
    salaryDiscussed: string;
    interviewStageDetails: string;
  }>
): Promise<JobApplicationDTO> {
  const data = await request<{ success: boolean; application: JobApplicationDTO }>(
    `/api/job-applications/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.application;
}

export async function deleteJobApplication(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/job-applications/${id}`, { method: 'DELETE' });
}

// ---- Interview sessions ----
export async function fetchInterviewSessions(): Promise<InterviewSessionDTO[]> {
  const data = await request<{ success: boolean; sessions: InterviewSessionDTO[] }>(
    '/api/interviews'
  );
  return data.sessions ?? [];
}

export async function postInterviewSession(input: {
  roleTitle?: string;
  type?: string;
  question: string;
  userAnswer?: string;
  aiFeedback?: unknown;
}): Promise<InterviewSessionDTO> {
  const data = await request<{ success: boolean; session: InterviewSessionDTO }>('/api/interviews', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.session;
}

export async function patchInterviewSession(
  id: string,
  updates: Partial<{
    roleTitle: string;
    type: string;
    question: string;
    userAnswer: string;
    aiFeedback: unknown;
  }>
): Promise<InterviewSessionDTO> {
  const data = await request<{ success: boolean; session: InterviewSessionDTO }>(
    `/api/interviews/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.session;
}

export async function deleteInterviewSession(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/interviews/${id}`, { method: 'DELETE' });
}
