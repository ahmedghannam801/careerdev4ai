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
import type { EvidenceDTO } from './coreApi';

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
  /** The level a diagnostic knowledge check measured (1-5). */
  assessed_level?: number | null;
  /** The raw percentage the assessment scored (0-100). */
  assessment_score?: number | null;
  /** When the assessment was taken. */
  assessment_at?: string | null;
  /** The evidence backing this skill. */
  evidence_sources?: string[] | null;
  skill?: { id: string; name: string; category: string | null } | null;
}

/**
 * The structured skill the server returns after a write.
 *
 * The three levels are kept apart on purpose: what the candidate claims,
 * what a diagnostic check measured, and what the platform can prove from the
 * records the candidate holds.
 */
export interface StoredSkillDTO {
  skillId: string;
  name: string;
  category: string;
  selfReportedLevel: number | null;
  assessedLevel: number | null;
  assessmentScore: number | null;
  assessmentAt: string | null;
  evidenceSources: string[];
  effectiveLevel: number;
  evidenceLevel: number | null;
  /** The strongest signal behind the record (verified evidence, assessment, claim, estimate). */
  source?: 'verified_evidence' | 'assessment' | 'self_reported' | 'ai_estimated';
}

/**
 * What the recalculation found after a skill change.
 *
 * The priorities are ranked by the same algorithm the roadmap uses for its
 * first recommended step, so "My Career" and the roadmap never disagree about
 * what to do next.
 */
export interface SkillRecalculationDTO {
  roadmapRegenerated: boolean;
  readinessPct: number | null;
  openGaps: number | null;
  priorities: Array<{
    id: string;
    skillName: string;
    category: string;
    requiredLevel: number;
    currentLevel: number;
    gap: number;
    priority: string;
    required: boolean;
    why: string;
    action: string;
    estimatedHours: number;
    view: string;
  }>;
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
 * The level is `proficiency` (1-5 in the UI). The server validates the range,
 * resolves the skill name to a catalogue id, stores the self-report beside the
 * existing evidence, and recalculates the readiness figure, the blockers and
 * the roadmap before answering.
 */
export async function postUserSkill(input: {
  name: string;
  proficiency: number;
  category?: string;
  yearsExperience?: number;
}): Promise<{ skill: StoredSkillDTO; recalculation: SkillRecalculationDTO }> {
  const data = await request<{
    success: boolean;
    skillRecord: StoredSkillDTO;
    recalculation: SkillRecalculationDTO;
  }>('/api/user-skills', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return { skill: data.skillRecord, recalculation: data.recalculation };
}

/**
 * Stores the result of a diagnostic knowledge check.
 *
 * The result is kept as EVIDENCE beside the candidate's own self-report: the
 * effective level becomes the stronger of the two, so a finished check closes
 * a gap immediately without overwriting what the candidate said about
 * themselves.
 *
 * No tokens are spent here. Measuring a skill is not an AI action.
 */
export async function postSkillAssessment(input: {
  name: string;
  level: number;
  score: number;
  category?: string;
}): Promise<{
  skill: StoredSkillDTO;
  recalculation: SkillRecalculationDTO;
  evidence?: EvidenceDTO | null;
}> {
  const data = await request<{
    success: boolean;
    skillRecord: StoredSkillDTO;
    recalculation: SkillRecalculationDTO;
    evidence?: EvidenceDTO | null;
  }>('/api/user-skills/assessment', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return {
    skill: data.skillRecord,
    recalculation: data.recalculation,
    evidence: data.evidence ?? null,
  };
}

/**
 * Reads the skill gap picture for the user's target role.
 *
 * The priorities come back ranked by the same algorithm the roadmap uses for
 * its first recommended step, so "My Career" and the roadmap always agree
 * about what to do next.
 */
export async function fetchSkillGaps(): Promise<SkillRecalculationDTO | null> {
  try {
    const data = await request<{
      success: boolean;
      summary?: { readinessPct?: number; open?: number };
      priorities?: SkillRecalculationDTO['priorities'];
    }>('/api/skill-gaps');
    return {
      roadmapRegenerated: false,
      readinessPct: data.summary?.readinessPct ?? null,
      openGaps: data.summary?.open ?? null,
      priorities: data.priorities ?? [],
    };
  } catch {
    // A candidate with no target role has no gaps. The server answers 404 in
    // that case, which is a normal state rather than a failure.
    return null;
  }
}

/**
 * Recalculates the roadmap, the blockers and the readiness figure.
 *
 * The write paths already do this automatically. This is the explicit
 * re-sync control, kept as a secondary fallback.
 */
export async function recalculateSkillDependents(): Promise<SkillRecalculationDTO> {
  const data = await request<{ success: boolean; recalculation: SkillRecalculationDTO }>(
    '/api/user-skills/recalculate',
    { method: 'POST', body: JSON.stringify({}) }
  );
  return data.recalculation;
}

export async function deleteUserSkill(skillId: string): Promise<void> {
  await request<{ success: boolean }>(`/api/user-skills/${skillId}`, { method: 'DELETE' });
}
