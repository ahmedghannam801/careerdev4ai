// Typed client for the dedicated career-history and skill endpoints.
//
// These replace the aggregate /api/state write path (B.3.8 finding C-1):
// experiences, education and skill levels each have their own endpoint, so
// the frontend can never replace a collection wholesale with a stale payload.
//
// Every call is authenticated with the current Supabase access token; the
// server derives the owner from the verified token, never from the request.

// The shared client: the same Bearer header, JSON parsing and non-OK
// handling every API module uses.
import { apiRequest as request } from './apiClient';

export interface ExperienceDTO {
  id: string;
  role: string;
  company: string;
  employmentType: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface EducationDTO {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
}

export interface UserSkillDTO {
  id: string;
  user_id: string;
  skill_id: string;
  proficiency: number | null;
  years_experience: number | null;
  skill?: { id: string; name: string; category: string | null } | null;
}

export { ApiRequestError } from './apiClient';

// ---- Experiences ----

export async function fetchExperiences(): Promise<ExperienceDTO[]> {
  const data = await request<{ success: boolean; experiences: ExperienceDTO[] }>(
    '/api/experiences'
  );
  return data.experiences ?? [];
}

export async function postExperience(input: {
  role: string;
  company: string;
  employmentType?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  achievements?: string[];
}): Promise<ExperienceDTO> {
  const data = await request<{ success: boolean; experience: ExperienceDTO }>(
    '/api/experiences',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.experience;
}

export async function patchExperience(
  id: string,
  updates: Partial<{
    role: string;
    company: string;
    employmentType: string;
    location: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
    achievements: string[];
  }>
): Promise<ExperienceDTO> {
  const data = await request<{ success: boolean; experience: ExperienceDTO }>(
    `/api/experiences/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.experience;
}

export async function deleteExperience(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/experiences/${id}`, { method: 'DELETE' });
}

// ---- Education ----

export async function fetchEducations(): Promise<EducationDTO[]> {
  const data = await request<{ success: boolean; educations: EducationDTO[] }>(
    '/api/educations'
  );
  return data.educations ?? [];
}

export async function postEducation(input: {
  institution: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  gpa?: string;
  coursework?: string[];
}): Promise<EducationDTO> {
  const data = await request<{ success: boolean; education: EducationDTO }>(
    '/api/educations',
    { method: 'POST', body: JSON.stringify(input) }
  );
  return data.education;
}

export async function patchEducation(
  id: string,
  updates: Partial<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    description: string;
    gpa: string;
    coursework: string[];
  }>
): Promise<EducationDTO> {
  const data = await request<{ success: boolean; education: EducationDTO }>(
    `/api/educations/${id}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.education;
}

export async function deleteEducation(id: string): Promise<void> {
  await request<{ success: boolean }>(`/api/educations/${id}`, { method: 'DELETE' });
}

// ---- User skills ----

export async function fetchUserSkills(): Promise<UserSkillDTO[]> {
  const data = await request<{ success: boolean; skills: UserSkillDTO[] }>('/api/user-skills');
  return data.skills ?? [];
}

/**
 * Sets the caller's level for a skill, creating the catalogue entry when the
 * skill is not known yet.
 *
 * The level is `proficiency` (1-5 in the UI). The server validates the range
 * and resolves the skill name to a catalogue id.
 */
export async function postUserSkill(input: {
  name: string;
  proficiency: number;
  category?: string;
  yearsExperience?: number;
}): Promise<UserSkillDTO> {
  const data = await request<{ success: boolean; skill: UserSkillDTO }>('/api/user-skills', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.skill;
}

export async function deleteUserSkill(skillId: string): Promise<void> {
  await request<{ success: boolean }>(`/api/user-skills/${skillId}`, { method: 'DELETE' });
}
