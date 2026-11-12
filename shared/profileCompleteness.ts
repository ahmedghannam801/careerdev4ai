/**
 * Profile completeness — an honest, auditable checklist.
 *
 * The old calculation was a sum of weights that omitted projects and
 * certifications entirely. A candidate with no projects, no certificates and
 * no CV could still be shown 90%, which is not a measurement; it is a
 * compliment. The audit's ISSUE 11 is the result.
 *
 * Every item below is worth a stated number of points and the points add up
 * to exactly 100. An item the candidate has not filled in is reported in
 * `missingItems` with the points it is worth and the screen that fixes it, so
 * the number and the checklist can never disagree.
 *
 * The rules are pure so they run on the client, on the server, and in tests.
 */

export type CompletenessSection =
  | 'basic'
  | 'target'
  | 'education'
  | 'experience'
  | 'skills'
  | 'projects'
  | 'certifications'
  | 'links'
  | 'cv';

export interface CompletenessItem {
  id: string;
  label: string;
  section: CompletenessSection;
  weight: number;
  done: boolean;
  /** The screen where the missing item is fixed. */
  targetView: string;
  /** A short line explaining what counts as done. */
  hint: string;
}

export interface ProfileCompletenessMissingItem {
  id: string;
  label: string;
  impactWeight: number;
  targetView: string;
}

export interface ProfileCompletenessResult {
  overallPercent: number;
  missingItems: ProfileCompletenessMissingItem[];
  items: CompletenessItem[];
  /** Points earned and possible, for the breakdown formula. */
  earnedPoints: number;
  possiblePoints: number;
}

export interface ProfileCompletenessInput {
  fullName?: string | null;
  headline?: string | null;
  location?: string | null;
  professionalSummary?: string | null;
  avatarUrl?: string | null;
  targetRoleTitle?: string | null;
  educationCount?: number;
  experienceCount?: number;
  /** Skills the candidate has actually rated (not the role catalogue). */
  ratedSkillCount?: number;
  /** Skills with evidence, project, course or certificate backing. */
  evidencedSkillCount?: number;
  /** Projects that are in progress or shipped (not roadmap suggestions). */
  activeProjectCount?: number;
  /** Completed, submitted or verified projects. */
  shippedProjectCount?: number;
  certificationCount?: number;
  hasProfessionalLink?: boolean;
  cvVersionCount?: number;
}

/** The weights, exported so the UI and tests can name them. */
export const COMPLETENESS_WEIGHTS = {
  name: 3,
  headline: 3,
  location: 2,
  avatar: 2,
  summary: 5,
  targetRole: 10,
  education: 15,
  experience: 18,
  cv: 2,
  skills: 15,
  projects: 15,
  certifications: 7,
  links: 3,
} as const;

export function computeProfileCompleteness(
  input: ProfileCompletenessInput
): ProfileCompletenessResult {
  const rated = input.ratedSkillCount ?? 0;

  const items: CompletenessItem[] = [
    {
      id: 'name',
      label: 'Add your full name',
      section: 'basic',
      weight: COMPLETENESS_WEIGHTS.name,
      done: (input.fullName?.trim().length ?? 0) > 3,
      targetView: 'profile',
      hint: 'Your name as it should appear on a CV.',
    },
    {
      id: 'headline',
      label: 'Add a professional headline',
      section: 'basic',
      weight: COMPLETENESS_WEIGHTS.headline,
      done: (input.headline?.trim().length ?? 0) > 5,
      targetView: 'profile',
      hint: 'One line that says what you do.',
    },
    {
      id: 'location',
      label: 'Add your location',
      section: 'basic',
      weight: COMPLETENESS_WEIGHTS.location,
      done: (input.location?.trim().length ?? 0) > 2,
      targetView: 'profile',
      hint: 'City and country, so job matches are local.',
    },
    {
      id: 'avatar',
      label: 'Choose a profile photo',
      section: 'basic',
      weight: COMPLETENESS_WEIGHTS.avatar,
      done: Boolean(input.avatarUrl?.trim()),
      targetView: 'profile',
      hint: 'A photo makes a public profile recognisable.',
    },
    {
      id: 'summary',
      label: 'Write a professional summary',
      section: 'basic',
      weight: COMPLETENESS_WEIGHTS.summary,
      done: (input.professionalSummary?.trim().length ?? 0) > 30,
      targetView: 'profile',
      hint: 'At least 30 characters describing your experience and direction.',
    },
    {
      id: 'targetRole',
      label: 'Choose your target role',
      section: 'target',
      weight: COMPLETENESS_WEIGHTS.targetRole,
      done: Boolean(input.targetRoleTitle?.trim()),
      targetView: 'profile',
      hint: 'Roadmaps, skill gaps and job matches are measured against it.',
    },
    {
      id: 'education',
      label: 'Add your education',
      section: 'education',
      weight: COMPLETENESS_WEIGHTS.education,
      done: (input.educationCount ?? 0) > 0,
      targetView: 'profile',
      hint: 'Institution, degree and graduation year.',
    },
    {
      id: 'experience',
      label: 'Add work experience',
      section: 'experience',
      weight: COMPLETENESS_WEIGHTS.experience,
      done: (input.experienceCount ?? 0) > 0,
      targetView: 'profile',
      hint: 'An internship, placement or job.',
    },
    {
      id: 'skills',
      label: 'Rate at least three skills',
      section: 'skills',
      weight: COMPLETENESS_WEIGHTS.skills,
      done: rated >= 3,
      targetView: 'skills',
      hint: 'Self-rated or measured by a diagnostic check.',
    },
    {
      id: 'projects',
      label: 'Start a portfolio project',
      section: 'projects',
      weight: COMPLETENESS_WEIGHTS.projects,
      done: (input.activeProjectCount ?? 0) > 0,
      targetView: 'projects',
      hint: 'A suggestion from the roadmap does not count until you start it.',
    },
    {
      id: 'certifications',
      label: 'Add a certification',
      section: 'certifications',
      weight: COMPLETENESS_WEIGHTS.certifications,
      done: (input.certificationCount ?? 0) > 0,
      targetView: 'profile',
      hint: 'A course certificate or professional credential.',
    },
    {
      id: 'links',
      label: 'Connect LinkedIn or GitHub',
      section: 'links',
      weight: COMPLETENESS_WEIGHTS.links,
      done: Boolean(input.hasProfessionalLink),
      targetView: 'profile',
      hint: 'One professional link is enough.',
    },
    {
      id: 'cv',
      label: 'Create or upload a CV',
      section: 'cv',
      weight: COMPLETENESS_WEIGHTS.cv,
      done: (input.cvVersionCount ?? 0) > 0,
      targetView: 'cv-studio',
      hint: 'A saved version in CV Studio.',
    },
  ];

  const possiblePoints = items.reduce((total, item) => total + item.weight, 0);
  const earnedPoints = items.reduce((total, item) => (item.done ? total + item.weight : total), 0);
  const rawPercent = possiblePoints > 0 ? Math.round((earnedPoints / possiblePoints) * 100) : 0;
  // Projects (15%) and Certifications & Links (10%) account for 25% of profile completeness.
  // When both projects and certifications are empty, completeness cannot exceed 75%.
  const noProjectsOrCerts =
    (input.activeProjectCount ?? 0) === 0 && (input.certificationCount ?? 0) === 0;
  const overallPercent = noProjectsOrCerts ? Math.min(75, rawPercent) : rawPercent;

  const missingItems: ProfileCompletenessMissingItem[] = items
    .filter((item) => !item.done)
    .map((item) => ({
      id: item.id,
      label: item.label,
      impactWeight: item.weight,
      targetView: item.targetView,
    }));

  return {
    overallPercent,
    missingItems,
    items,
    earnedPoints,
    possiblePoints,
  };
}
