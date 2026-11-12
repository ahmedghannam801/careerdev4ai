// Aggregate profile read/write across the profile and profile-extension tables.
//
// public.profiles              -> the single-value profile fields
// public.profile_certifications, profile_languages, profile_links,
// public.profile_career_identity -> the multi-value / nested extensions
//
// Ownership: profileId is always the id verified from the caller's Supabase JWT.
import { getSupabaseServer } from './supabase';
import {
  listCertifications,
  listLanguages,
  listProfileLinks,
  getCareerIdentity,
  type CertificationDTO,
  type LanguageDTO,
  type ProfileLinkDTO,
  type CareerIdentityDTO,
} from './profileExtensions';
import { resolveTargetRole } from '../../shared/targetRoleSelection.ts';
import type { OnboardingStatus } from '../../shared/onboarding.ts';

export interface ProfileDTO {
  id: string;
  fullName: string | null;
  preferredName: string | null;
  username: string | null;
  avatarUrl: string | null;
  phone: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  currentTitle: string | null;
  currentPosition: string | null;
  currentCompany: string | null;
  yearsOfExperience: string | null;
  headline: string | null;
  bio: string | null;
  professionalSummary: string | null;
  careerGoal: string | null;
  customGoalText: string | null;
  targetRole: string | null;
  targetIndustry: string | null;
  /**
   * The catalogue id of the selected target role.
   *
   * `targetRole` stores the role's canonical title; the id is the stable
   * identifier of the same catalogue entry.
   */
  targetRoleId: string | null;
  /**
   * The parent career domain of the selected target role (level 1).
   *
   * Derived from the selected role through the career catalogue, so the
   * hierarchy can never disagree with the specialisation that was chosen.
   */
  targetRoleDomain: string | null;
  userType: string | null;
  /**
   * The candidate's TARGET experience level.
   *
   * This is the level they are aiming at (student, intern, junior, mid,
   * senior, lead) and it is deliberately separate from `userType`, which
   * records the career state they are in right now.
   */
  experienceLevel: string | null;
  /** currently_studying | graduated | not_set, as stated by the candidate. */
  educationStatus: string | null;
  /** The year the candidate expects to graduate, when they stated one. */
  expectedGraduationYear: number | null;
  onboardingCompleted: boolean;
  /**
   * The authoritative first-time onboarding state.
   *
   * The legacy boolean above is kept in sync for older clients, but this is
   * what distinguishes "never started" from "skipped".
   */
  onboardingStatus: OnboardingStatus;
  /** The step the user reached, so a resumed flow reopens where it stopped. */
  onboardingStep: number;
  onboardingUpdatedAt: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  certifications: CertificationDTO[];
  languages: LanguageDTO[];
  links: ProfileLinkDTO[];
  careerIdentity: CareerIdentityDTO | null;
}

export interface UpdateProfileInput {
  fullName?: string;
  preferredName?: string;
  username?: string;
  avatarUrl?: string;
  phone?: string;
  location?: string;
  city?: string;
  country?: string;
  timezone?: string;
  currentTitle?: string;
  currentPosition?: string;
  currentCompany?: string;
  yearsOfExperience?: string;
  headline?: string;
  bio?: string;
  professionalSummary?: string;
  careerGoal?: string;
  customGoalText?: string;
  targetRole?: string;
  targetIndustry?: string;
  userType?: string;
  /**
   * The target experience level. `undefined` leaves it alone; `null` clears
   * it. It is a vocabulary of its own, validated by the caller.
   */
  experienceLevel?: string | null;
  /** currently_studying | graduated | not_set. */
  educationStatus?: string | null;
  expectedGraduationYear?: number | null;
  onboardingCompleted?: boolean;
  onboardingStatus?: OnboardingStatus;
  onboardingStep?: number;
  isPublic?: boolean;
  /** The professional links, in the shape the frontend already uses. */
  links?: Record<string, string | undefined>;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  preferred_name: string | null;
  username: string | null;
  avatar_url: string | null;
  phone: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  current_title: string | null;
  current_position: string | null;
  current_company: string | null;
  years_of_experience: string | null;
  headline: string | null;
  bio: string | null;
  professional_summary: string | null;
  career_goal: string | null;
  custom_goal_text: string | null;
  target_role: string | null;
  target_industry: string | null;
  user_type: string | null;
  experience_level: string | null;
  education_status: string | null;
  expected_graduation_year: number | null;
  onboarding_completed: boolean;
  onboarding_status: OnboardingStatus | null;
  onboarding_step: number | null;
  onboarding_updated_at: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, full_name, preferred_name, username, avatar_url, phone, location, city, country, timezone, current_title, current_position, current_company, years_of_experience, headline, bio, professional_summary, career_goal, custom_goal_text, target_role, target_industry, user_type, experience_level, education_status, expected_graduation_year, onboarding_completed, onboarding_status, onboarding_step, onboarding_updated_at, is_public, created_at, updated_at';

/** The profile row + its extension rows, as one typed DTO. */
export async function getProfileDto(profileId: string): Promise<ProfileDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('profiles')
    .select(SELECT_COLUMNS)
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ProfileRow;

  const [certifications, languages, links, careerIdentity] = await Promise.all([
    listCertifications(profileId),
    listLanguages(profileId),
    listProfileLinks(profileId),
    getCareerIdentity(profileId),
  ]);

  const targetRole = resolveTargetRole(row.target_role);

  return {
    id: row.id,
    fullName: row.full_name,
    preferredName: row.preferred_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    location: row.location,
    city: row.city,
    country: row.country,
    timezone: row.timezone,
    currentTitle: row.current_title,
    currentPosition: row.current_position,
    currentCompany: row.current_company,
    yearsOfExperience: row.years_of_experience,
    headline: row.headline,
    bio: row.bio,
    professionalSummary: row.professional_summary,
    careerGoal: row.career_goal,
    customGoalText: row.custom_goal_text,
    targetRole: row.target_role,
    targetIndustry: row.target_industry,
    // The parent domain is a function of the selected role, not a second
    // stored fact: the catalogue is the single source of truth for the
    // hierarchy, so the two can never drift apart.
    targetRoleId: targetRole?.id ?? null,
    targetRoleDomain: targetRole?.domainId ?? null,
    userType: row.user_type,
    experienceLevel: row.experience_level,
    educationStatus: row.education_status,
    expectedGraduationYear: row.expected_graduation_year,
    onboardingCompleted: row.onboarding_completed,
    onboardingStatus: row.onboarding_status ?? (row.onboarding_completed ? 'completed' : 'not_started'),
    onboardingStep: row.onboarding_step ?? 0,
    onboardingUpdatedAt: row.onboarding_updated_at,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    certifications,
    languages,
    links,
    careerIdentity,
  };
}

/** Applies the validated single-value profile fields. */
export async function updateProfileDto(
  profileId: string,
  input: UpdateProfileInput
): Promise<ProfileDTO | null> {
  const patch: Record<string, unknown> = {};
  const map: Array<[keyof UpdateProfileInput, string]> = [
    ['fullName', 'full_name'],
    ['preferredName', 'preferred_name'],
    ['username', 'username'],
    ['avatarUrl', 'avatar_url'],
    ['phone', 'phone'],
    ['location', 'location'],
    ['city', 'city'],
    ['country', 'country'],
    ['timezone', 'timezone'],
    ['currentTitle', 'current_title'],
    ['currentPosition', 'current_position'],
    ['currentCompany', 'current_company'],
    ['yearsOfExperience', 'years_of_experience'],
    ['headline', 'headline'],
    ['bio', 'bio'],
    ['professionalSummary', 'professional_summary'],
    ['careerGoal', 'career_goal'],
    ['customGoalText', 'custom_goal_text'],
    ['targetRole', 'target_role'],
    ['targetIndustry', 'target_industry'],
    ['userType', 'user_type'],
    ['experienceLevel', 'experience_level'],
    ['educationStatus', 'education_status'],
    ['expectedGraduationYear', 'expected_graduation_year'],
  ];
  for (const [key, column] of map) {
    if (input[key] !== undefined) patch[column] = input[key] ?? null;
  }
  if (input.onboardingCompleted !== undefined) {
    patch.onboarding_completed = input.onboardingCompleted;
  }
  if (input.onboardingStatus !== undefined) {
    patch.onboarding_status = input.onboardingStatus;
    // Keep the legacy boolean consistent so an older client (or a direct
    // query) sees the same answer the status gives.
    patch.onboarding_completed = input.onboardingStatus === 'completed';
    patch.onboarding_updated_at = new Date().toISOString();
  }
  if (input.onboardingStep !== undefined) {
    patch.onboarding_step = Math.max(0, Math.floor(input.onboardingStep));
    patch.onboarding_updated_at = new Date().toISOString();
  }
  if (input.isPublic !== undefined) patch.is_public = input.isPublic;

  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await getSupabaseServer()
      .from('profiles')
      .update(patch)
      .eq('id', profileId);
    if (error) throw error;
  }

  if (input.links !== undefined) {
    await replaceProfileLinks(profileId, input.links);
  }

  return getProfileDto(profileId);
}

/**
 * Replaces the profile's links with the supplied set.
 * A kind that is present but empty is removed; a kind with a value is
 * upserted on the (profile_id, kind) unique key.
 */
async function replaceProfileLinks(
  profileId: string,
  links: Record<string, string | undefined>
): Promise<void> {
  const client = getSupabaseServer();

  const { data: existing, error: listError } = await client
    .from('profile_links')
    .select('id, kind')
    .eq('profile_id', profileId);
  if (listError) throw listError;

  const wanted = new Map<string, string>();
  for (const [kind, url] of Object.entries(links)) {
    const trimmed = typeof url === 'string' ? url.trim() : '';
    if (trimmed) wanted.set(kind, trimmed);
  }

  const existingKinds = new Set((existing ?? []).map((row: { kind: string }) => row.kind));
  const toDelete = [...existingKinds].filter((kind) => !wanted.has(kind));
  if (toDelete.length > 0) {
    const { error: deleteError } = await client
      .from('profile_links')
      .delete()
      .eq('profile_id', profileId)
      .in('kind', toDelete);
    if (deleteError) throw deleteError;
  }

  for (const [kind, url] of wanted) {
    if (!existingKinds.has(kind)) {
      const { error: insertError } = await client
        .from('profile_links')
        .insert({ profile_id: profileId, kind, url });
      if (insertError) throw insertError;
    } else {
      const { error: updateError } = await client
        .from('profile_links')
        .update({ url })
        .eq('profile_id', profileId)
        .eq('kind', kind);
      if (updateError) throw updateError;
    }
  }
}
