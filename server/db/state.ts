// Mapping between the application state payload and the verified PostgreSQL schema.
//
// Verified remote tables (public): profiles, user_preferences, user_skills, skills,
// educations, experiences.
//
// NOTE: the payload contains fields with no column in the current schema.
// Those are reported by unmappedStateFields() rather than silently dropped.
import { getSupabaseServer } from './supabase';
import { getProfile, upsertProfile } from './profiles';
import { getPreferences, upsertPreferences } from './preferences';
import { getUserSkills, upsertUserSkill, DEFAULT_SKILL_CATEGORY } from './userSkills';

export interface StatePayload {
  profile?: any;
  targetRole?: any;
  savedRoles?: any[];
  skills?: any[];
  roadmapPhases?: any[];
  projects?: any[];
  evidenceItems?: any[];
  activeCV?: any;
  cvVersions?: any[];
  applications?: any[];
  interviewSessions?: any[];
  settings?: any;
}

const UNMAPPED_TOP_LEVEL = [
  'savedRoles',
  'roadmapPhases',
  'projects',
  'evidenceItems',
  'activeCV',
  'cvVersions',
  'applications',
  'interviewSessions',
];

const UNMAPPED_PROFILE_FIELDS = [
  'email',
  'location',
  'city',
  'country',
  'currentTitle',
  'currentCompany',
  'currentPosition',
  'headline',
  'professionalSummary',
  'careerIdentity',
  'careerState',
  'certifications',
  'languages',
  'links',
  'preferredName',
  'preferredLanguage',
  'timezone',
  'yearsOfExperience',
  'isPublic',
];

const UNMAPPED_SETTINGS_FIELDS = [
  'allowAiContextLearning',
  'emailAlerts',
  'interviewReminders',
  'roadmapReminders',
  'weeklyProgressSummary',
];

export function unmappedStateFields(payload: StatePayload): string[] {
  const out: string[] = [];
  const top = payload as Record<string, any>;
  for (const key of UNMAPPED_TOP_LEVEL) {
    if (top[key] !== undefined && top[key] !== null) out.push(key);
  }
  const p = (payload.profile || {}) as Record<string, any>;
  for (const key of UNMAPPED_PROFILE_FIELDS) {
    if (p[key] !== undefined && p[key] !== null) out.push('profile.' + key);
  }
  const s = (payload.settings || {}) as Record<string, any>;
  for (const key of UNMAPPED_SETTINGS_FIELDS) {
    if (s[key] !== undefined && s[key] !== null) out.push('settings.' + key);
  }
  return out;
}

function toDate(value: any): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export async function saveState(
  userId: string,
  payload: StatePayload
): Promise<{ unmappedCollections: string[] }> {
  const p = payload.profile || {};
  const s = payload.settings || {};
  const unmappedCollections: string[] = [];

  const profileUpdates: Record<string, any> = {};
  if (p.fullName !== undefined) profileUpdates.full_name = p.fullName ?? null;
  if (p.name !== undefined && p.fullName === undefined) profileUpdates.full_name = p.name ?? null;
  if (p.username !== undefined) profileUpdates.username = p.username ?? null;
  if (p.avatarUrl !== undefined) profileUpdates.avatar_url = p.avatarUrl ?? null;
  if (p.phone !== undefined) profileUpdates.phone = p.phone ?? null;
  if (p.bio !== undefined) profileUpdates.bio = p.bio ?? null;
  if (p.careerGoal !== undefined) profileUpdates.career_goal = p.careerGoal ?? null;
  if (p.industry !== undefined) profileUpdates.target_industry = p.industry ?? null;
  if (p.onboardingCompleted !== undefined) profileUpdates.onboarding_completed = !!p.onboardingCompleted;
  if (payload.targetRole?.title !== undefined) profileUpdates.target_role = payload.targetRole.title;
  if (Object.keys(profileUpdates).length > 0) {
    await upsertProfile(userId, profileUpdates);
  }

  const prefUpdates: Record<string, any> = {};
  if (s.theme !== undefined) prefUpdates.theme = s.theme;
  if (s.language !== undefined) prefUpdates.language = s.language;
  if (s.notificationsEnabled !== undefined) prefUpdates.notifications_enabled = !!s.notificationsEnabled;
  if (s.emailAlerts !== undefined) prefUpdates.notifications_enabled = !!s.emailAlerts;
  if (Object.keys(prefUpdates).length > 0) {
    await upsertPreferences(userId, prefUpdates);
  }

  // `experiences` and `educations` are NOT written here any more.
  //
  // This endpoint used to DELETE every one of the caller's rows in both tables
  // and re-insert whatever the payload contained. Combined with the frontend's
  // demo-seeded initial profile and its unconditional auto-sync, that replaced
  // a real user's employment and education history with the demo persona
  // (B.3.8 finding C-1).
  //
  // The aggregate endpoint is now a compatibility shim for the single-value
  // profile and preferences columns only. The collections are owned by
  // /api/experiences and /api/educations, and are reported as unmapped so the
  // caller can see they were not applied here.
  if (Array.isArray(p.experiences)) {
    unmappedCollections.push('experiences');
  }
  if (Array.isArray(p.education)) {
    unmappedCollections.push('education');
  }

  if (Array.isArray(payload.skills)) {
    for (const sk of payload.skills) {
      if (!sk || !sk.name) continue;
      let skillId: string | null = null;
      const { data: found } = await getSupabaseServer()
        .from('skills')
        .select('id')
        .eq('name', sk.name)
        .maybeSingle();
      if (found) {
        skillId = found.id as string;
      } else {
        const { data: created } = await getSupabaseServer()
          .from('skills')
          .insert({ name: sk.name, category: sk.category ?? DEFAULT_SKILL_CATEGORY })
          .select('id')
          .single();
        skillId = created?.id ?? null;
      }
      if (skillId) {
        await upsertUserSkill(userId, skillId, {
          proficiency: sk.currentLevel ?? sk.level ?? null,
          years_experience: sk.yearsExperience ?? null,
        });
      }
    }
  }

  return { unmappedCollections };
}

export async function loadState(userId: string): Promise<any> {
  const profile = await getProfile(userId);
  const preferences = await getPreferences(userId);
  const userSkills = await getUserSkills(userId);

  const { data: experiences } = await getSupabaseServer()
    .from('experiences')
    .select('*')
    .eq('user_id', userId);
  const { data: educations } = await getSupabaseServer()
    .from('educations')
    .select('*')
    .eq('user_id', userId);

  return {
    profile: profile
      ? {
          id: profile.id,
          name: profile.full_name,
          fullName: profile.full_name,
          username: profile.username,
          avatarUrl: profile.avatar_url,
          phone: profile.phone,
          bio: profile.bio,
          careerGoal: profile.career_goal,
          industry: profile.target_industry,
          targetRole: profile.target_role,
          onboardingCompleted: profile.onboarding_completed,
          experiences: (experiences ?? []).map((e: any) => ({
            id: e.id,
            company: e.company,
            role: e.job_title,
            location: e.location,
            description: e.description,
            startDate: e.start_date,
            endDate: e.end_date,
            isCurrent: e.is_current,
          })),
          education: (educations ?? []).map((e: any) => ({
            id: e.id,
            institution: e.institution,
            degree: e.degree,
            field: e.field_of_study,
            startDate: e.start_date,
            endDate: e.end_date,
            isCurrent: e.is_current,
          })),
        }
      : null,
    settings: preferences
      ? {
          theme: preferences.theme,
          language: preferences.language,
          notificationsEnabled: preferences.notifications_enabled,
        }
      : null,
    skills: userSkills.map((us: any) => ({
      id: us.skill_id,
      name: us.skill?.name,
      category: us.skill?.category,
      currentLevel: us.proficiency,
      yearsExperience: us.years_experience,
    })),
  };
}
