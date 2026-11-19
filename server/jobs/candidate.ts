// The candidate, read from the candidate's own record.
//
// WHY THIS EXISTS
// ---------------
// The platform already explains a match with five weighted factors and a
// sixth, semantic one. `explainJobMatch` needs more than a list of skill names
// to do that: it also needs the candidate's experience level, the kind of
// opportunity they are aiming at, their education level and where they are.
//
// The interface was building that picture in the browser, out of whatever the
// page happened to hold. That means two sources of truth for the same
// candidate, and a server that could only ever explain the skills.
//
// This module reads the candidate from the database — the record the
// candidate actually owns — and hands the matcher one picture of them. The
// server can then explain a match the same way the interface does, and a
// recommendation can be ranked without asking the browser anything.
//
// WHAT IT READS
// -------------
//   profiles    experience_level, target_opportunity_type, country, city,
//               location, headline, target_role
//   educations  the degrees, of which the highest sets the education level
//   user_skills the skills the candidate owns, through the skills catalogue
//
// Nothing is inferred. A field the candidate has not filled in is left null,
// and a factor that cannot be compared is reported as not evaluated rather
// than as a zero.

import { getSupabaseServer } from '../db/supabase.ts';
import { getUserSkills } from '../db/userSkills.ts';
import { educationLevelFromText } from '../../shared/jobMatching.ts';
import type { JobMatchCandidate } from '../../shared/jobMatching.ts';
import { EXPERIENCE_LEVELS, type ExperienceLevel } from '../../shared/experienceLevel.ts';
import {
  TARGET_OPPORTUNITY_TYPES,
  type TargetOpportunityType,
} from '../../shared/careerIdentity.ts';

export interface MatchCandidate extends JobMatchCandidate {
  /** The candidate's own headline, when they wrote one. */
  headline: string | null;
  /** The role the candidate is aiming at, when they chose one. */
  targetRole: string | null;
  /**
   * The candidate's record as one piece of text.
   *
   * This is what the semantic factor compares the posting with, so it carries
   * the whole record rather than the skills alone.
   */
  profileText: string;
}

/** An empty candidate: a record the candidate has not filled in yet. */
export function emptyMatchCandidate(): MatchCandidate {
  return {
    skillNames: [],
    experienceLevel: null,
    targetOpportunityType: null,
    educationLevel: null,
    country: null,
    city: null,
    headline: null,
    targetRole: null,
    profileText: '',
  };
}

function asExperienceLevel(value: unknown): ExperienceLevel | null {
  if (typeof value !== 'string') return null;
  const normalised = value.trim().toLowerCase() as ExperienceLevel;
  return EXPERIENCE_LEVELS.includes(normalised) ? normalised : null;
}

function asTargetOpportunityType(value: unknown): TargetOpportunityType | null {
  if (typeof value !== 'string') return null;
  const normalised = value.trim().toLowerCase() as TargetOpportunityType;
  return TARGET_OPPORTUNITY_TYPES.includes(normalised) ? normalised : null;
}

const EDUCATION_ORDER = ['high_school', 'bachelor', 'master', 'doctorate'] as const;

/**
 * The highest education level the candidate has recorded.
 *
 * The degrees are compared in the platform's own order, so a candidate with a
 * master's and a bachelor's is a master's candidate — which is what the
 * posting's requirement is compared against.
 */
export function highestEducationLevel(degrees: readonly (string | null | undefined)[]): JobMatchCandidate['educationLevel'] {
  const levels = degrees
    .map((degree) => educationLevelFromText(degree ?? ''))
    .filter((level): level is NonNullable<typeof level> => level !== null);

  if (!levels.length) return null;

  return levels.sort((a, b) => EDUCATION_ORDER.indexOf(b) - EDUCATION_ORDER.indexOf(a))[0];
}

/**
 * Reads the candidate's own record.
 *
 * A failure to read it is not a failure of the request: the vacancies are
 * still real, and only the explanation is missing. So the loader falls back
 * to an empty candidate and says so.
 */
export async function loadMatchCandidate(userId: string): Promise<MatchCandidate> {
  const supabase = getSupabaseServer();

  const [profileResult, educationResult, skillRows] = await Promise.all([
    supabase
      .from('profiles')
      .select('experience_level, target_opportunity_type, country, city, location, headline, target_role')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('educations').select('degree').eq('user_id', userId),
    getUserSkills(userId).catch((error) => {
      console.error('Failed to read the candidate\'s skills for matching:', error);
      return [] as Awaited<ReturnType<typeof getUserSkills>>;
    }),
  ]);

  if (profileResult.error) {
    console.error('Failed to read the candidate\'s profile for matching:', profileResult.error);
  }

  const profile = profileResult.data ?? null;

  // The skills the candidate owns. A skill with no proficiency has not been
  // claimed, so it is not part of the record.
  const skillNames = skillRows
    .map((row) => row.skill?.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

  const educationLevel = highestEducationLevel(
    (educationResult.data ?? []).map((row) => (row as { degree: string | null }).degree),
  );

  const country = profile?.country ?? null;
  const city = profile?.city ?? profile?.location ?? null;
  const headline = profile?.headline ?? null;
  const targetRole = profile?.target_role ?? null;

  const profileText = [headline, targetRole, ...skillNames].filter(Boolean).join('. ');

  return {
    skillNames,
    experienceLevel: asExperienceLevel(profile?.experience_level),
    targetOpportunityType: asTargetOpportunityType(profile?.target_opportunity_type),
    educationLevel,
    country,
    city,
    headline,
    targetRole,
    profileText,
  };
}
