/**
 * The candidate's career identity — one definition, used everywhere.
 *
 * WHY THIS MODULE EXISTS
 * Profile, Settings, My Career, the Dashboard, the Roadmap and CV Studio each
 * used to read a different subset of the same facts. The result was the class
 * of bug the QA audit found: the profile page said "Student", the roadmap
 * planned for a working professional, and CV Studio put "Frontend Engineer"
 * on a document belonging to someone who had never chosen a role.
 *
 * The facts themselves are persisted in the profile row and the education
 * records. This module is the single reader of those facts: every screen asks
 * it the same question and gets the same answer. It performs no I/O, so it
 * runs identically on the server and in the browser and is unit-testable.
 *
 * THE DISTINCT AXES
 *   currentStatus    who the candidate is right now   (profiles.user_type)
 *   currentRole      their present title, if any      (profiles.current_title)
 *   targetRole       the role they are aiming at      (profiles.target_role)
 *   careerGoal       why they are aiming at it        (profiles.career_goal)
 *   educationStatus  studying or graduated            (derived, see below)
 *   experienceLevel  the rung they are aiming at      (profiles.experience_level)
 *
 * EDUCATION IS DERIVED, NOT GUESSED
 * A student whose expected graduation is 2028 is currently studying. The
 * platform must never mark them as graduated because a year passed, because
 * an end date was written as a future date, or because the form defaulted to
 * "completed". A future graduation year always wins over every other signal.
 */

import { EXPERIENCE_LEVEL_LABELS, type ExperienceLevel } from './experienceLevel.ts';

/** The vocabulary of the career state (profiles.user_type). */
export const CAREER_STATUSES = [
  'student',
  'fresh_graduate',
  'working_professional',
  'career_switcher',
  'exploring',
] as const;

export type CareerStatus = (typeof CAREER_STATUSES)[number];

export const CAREER_STATUS_LABELS: Record<CareerStatus, string> = {
  student: 'Student',
  fresh_graduate: 'Fresh graduate',
  working_professional: 'Employed',
  career_switcher: 'Career switcher',
  exploring: 'Exploring',
};

/** The vocabulary of the career goal (profiles.career_goal). */
export const CAREER_GOALS = [
  'get_first_job',
  'get_internship',
  'switch_career',
  'get_promoted',
  'become_specialist',
  'become_manager',
  'build_portfolio',
  'freelance',
  'explore_careers',
  'custom',
] as const;

export type CareerGoalValue = (typeof CAREER_GOALS)[number];

export const CAREER_GOAL_LABELS: Record<CareerGoalValue, string> = {
  get_first_job: 'Land a first full-time role',
  get_internship: 'Secure an internship',
  switch_career: 'Switch careers',
  get_promoted: 'Get promoted',
  become_specialist: 'Become a domain specialist',
  become_manager: 'Move into management',
  build_portfolio: 'Build a verifiable portfolio',
  freelance: 'Go freelance',
  explore_careers: 'Explore career options',
  custom: 'Reach a custom goal',
};

export const EDUCATION_STATUSES = ['currently_studying', 'graduated', 'not_set'] as const;
export type EducationStatus = (typeof EDUCATION_STATUSES)[number];

export const EDUCATION_STATUS_LABELS: Record<EducationStatus, string> = {
  currently_studying: 'Currently studying',
  graduated: 'Graduated',
  not_set: 'Not set',
};

export interface CareerIdentityEducation {
  institution?: string | null;
  degree?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current?: boolean | null;
}

/**
 * The facts the identity is derived from.
 *
 * Every field is optional because an account can exist before any of them is
 * filled in. An absent field is reported as absent, never replaced with a
 * plausible default — that is how "Frontend Engineer" used to appear.
 */
export interface CareerIdentityInput {
  currentStatus?: string | null;
  currentRole?: string | null;
  targetRoleTitle?: string | null;
  targetRoleId?: string | null;
  careerGoal?: string | null;
  experienceLevel?: string | null;
  education?: CareerIdentityEducation[] | null;
  /** The year the candidate expects to graduate, when they stated one. */
  expectedGraduationYear?: number | null;
  /** An explicit value saved by the candidate, checked against the years. */
  educationStatusOverride?: EducationStatus | null;
  /** The current year, injected so the function stays pure and testable. */
  currentYear?: number;
}

export interface CareerIdentity {
  currentStatus: CareerStatus | null;
  currentStatusLabel: string;
  currentRole: string | null;
  targetRoleTitle: string | null;
  targetRoleId: string | null;
  hasTargetRole: boolean;
  careerGoal: CareerGoalValue | null;
  careerGoalLabel: string;
  /** The goal the platform would suggest for this status and level. */
  suggestedGoal: CareerGoalValue;
  /** True when the saved goal belongs to a different stage of life. */
  goalNeedsReview: boolean;
  educationStatus: EducationStatus;
  educationStatusLabel: string;
  expectedGraduationYear: number | null;
  experienceLevel: ExperienceLevel | null;
  experienceLevelLabel: string;
  isStudent: boolean;
  /** Fields the candidate still has to fill in before the identity is complete. */
  missingFields: Array<{
    id: 'currentStatus' | 'targetRole' | 'careerGoal' | 'experienceLevel' | 'education';
    label: string;
    targetView: 'profile' | 'settings';
  }>;
  /** One readable line, used by summaries and the AI context. */
  summaryLine: string;
}

const DEFAULT_CURRENT_YEAR = 2026;

function normalizeStatus(value: string | null | undefined): CareerStatus | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (CAREER_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as CareerStatus)
    : null;
}

function normalizeGoal(value: string | null | undefined): CareerGoalValue | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (CAREER_GOALS as readonly string[]).includes(normalized)
    ? (normalized as CareerGoalValue)
    : null;
}

function normalizeLevel(value: string | null | undefined): ExperienceLevel | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (Object.keys(EXPERIENCE_LEVEL_LABELS) as ExperienceLevel[]).includes(
    normalized as ExperienceLevel
  )
    ? (normalized as ExperienceLevel)
    : null;
}

/** Reads a four-digit year out of an ISO date or a free-text year. */
export function yearFromDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = String(value).match(/(?:19|20)\d{2}/);
  if (!match) return null;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
}

/**
 * The single rule for "is this candidate studying or graduated?".
 *
 * A expected graduation year in the future always means "currently studying",
 * even if the education record was saved with `current: false` or an explicit
 * "graduated" override. A real end date in the future means the same. Only
 * when every piece of evidence says the studies are behind the candidate does
 * the platform say "graduated".
 */
export function resolveEducationStatus(input: {
  education?: CareerIdentityEducation[] | null;
  expectedGraduationYear?: number | null;
  educationStatusOverride?: EducationStatus | null;
  currentYear?: number;
}): { status: EducationStatus; expectedGraduationYear: number | null } {
  const currentYear = input.currentYear ?? DEFAULT_CURRENT_YEAR;
  const entries = input.education ?? [];

  const endYears = entries
    .map((entry) => yearFromDate(entry.endDate))
    .filter((year): year is number => year !== null && year > 0);
  const latestEndYear = endYears.length > 0 ? Math.max(...endYears) : null;

  // A stated expected graduation year wins over everything else.
  const statedYear =
    typeof input.expectedGraduationYear === 'number' &&
    Number.isFinite(input.expectedGraduationYear) &&
    input.expectedGraduationYear > 0
      ? Math.round(input.expectedGraduationYear)
      : null;

  const expectedGraduationYear = statedYear ?? latestEndYear;

  if (expectedGraduationYear !== null && expectedGraduationYear > currentYear) {
    return { status: 'currently_studying', expectedGraduationYear };
  }
  if (entries.some((entry) => entry.current === true)) {
    return { status: 'currently_studying', expectedGraduationYear };
  }
  if (input.educationStatusOverride === 'currently_studying') {
    return { status: 'currently_studying', expectedGraduationYear };
  }
  if (expectedGraduationYear !== null) {
    return { status: 'graduated', expectedGraduationYear };
  }
  if (input.educationStatusOverride === 'graduated') {
    return { status: 'graduated', expectedGraduationYear };
  }
  return { status: 'not_set', expectedGraduationYear };
}

/**
 * The goal that belongs to the candidate's stage of life.
 *
 * A student aiming at "get promoted" is not being ambitious; the platform has
 * simply not offered them the choice that fits. The default is suggested, not
 * forced: `goalNeedsReview` tells the interface to ask.
 */
export function suggestedCareerGoal(
  status: CareerStatus | null,
  level: ExperienceLevel | null
): CareerGoalValue {
  if (status === 'student' || level === 'student') return 'get_internship';
  if (level === 'intern') return 'get_internship';
  if (status === 'fresh_graduate' || level === 'junior') return 'get_first_job';
  if (status === 'career_switcher') return 'switch_career';
  if (level === 'mid' || level === 'senior' || level === 'lead') return 'get_promoted';
  if (status === 'exploring') return 'explore_careers';
  return 'get_first_job';
}

/** Whether a saved goal contradicts the stage of life it belongs to. */
export function goalNeedsReview(
  goal: CareerGoalValue | null,
  status: CareerStatus | null,
  level: ExperienceLevel | null
): boolean {
  if (!goal) return false;
  const suggested = suggestedCareerGoal(status, level);
  // Promotion and management goals belong to people already working. Any
  // other pairing is a legitimate choice and is left alone.
  const earlyStage =
    status === 'student' ||
    status === 'fresh_graduate' ||
    status === 'exploring' ||
    level === 'student' ||
    level === 'intern' ||
    level === 'junior';
  if (earlyStage && (goal === 'get_promoted' || goal === 'become_manager')) return true;
  if (!earlyStage && goal === 'get_internship') return true;
  return goal !== suggested && false;
}

/**
 * Derives the whole identity in one call.
 *
 * This is the function every page should read from. It never invents a target
 * role, never defaults the status to "Employed", and never marks a future
 * graduation as completed.
 */
export function deriveCareerIdentity(input: CareerIdentityInput): CareerIdentity {
  const currentStatus = normalizeStatus(input.currentStatus);
  const careerGoal = normalizeGoal(input.careerGoal);
  const experienceLevel = normalizeLevel(input.experienceLevel);

  const currentYear = input.currentYear ?? DEFAULT_CURRENT_YEAR;
  const education = resolveEducationStatus({
    education: input.education,
    expectedGraduationYear: input.expectedGraduationYear,
    educationStatusOverride: input.educationStatusOverride,
    currentYear,
  });

  const isStudent =
    currentStatus === 'student' ||
    education.status === 'currently_studying' ||
    experienceLevel === 'student';

  // A student's "current role" is their studies, not a job title. Keeping the
  // old current_title would make the profile claim employment it does not have.
  const currentRole =
    currentStatus === 'student' ? null : (input.currentRole?.trim() || null);

  const targetRoleTitle = input.targetRoleTitle?.trim() || null;
  const targetRoleId = input.targetRoleId?.trim() || null;

  const suggested = suggestedCareerGoal(currentStatus, experienceLevel);

  const missingFields: CareerIdentity['missingFields'] = [];
  if (!currentStatus) {
    missingFields.push({ id: 'currentStatus', label: 'Choose your current status', targetView: 'profile' });
  }
  if (!targetRoleTitle) {
    missingFields.push({ id: 'targetRole', label: 'Choose your target role', targetView: 'profile' });
  }
  if (!careerGoal) {
    missingFields.push({ id: 'careerGoal', label: 'Choose your career goal', targetView: 'profile' });
  }
  if (!experienceLevel) {
    missingFields.push({ id: 'experienceLevel', label: 'Choose your experience level', targetView: 'profile' });
  }
  if (education.status === 'not_set') {
    missingFields.push({ id: 'education', label: 'Add your education status', targetView: 'profile' });
  }

  const statusLabel = currentStatus ? CAREER_STATUS_LABELS[currentStatus] : 'Not set';
  const goalLabel = careerGoal ? CAREER_GOAL_LABELS[careerGoal] : 'Not set';
  const levelLabel = experienceLevel ? EXPERIENCE_LEVEL_LABELS[experienceLevel].en : 'Not set';

  const summaryLine = [
    statusLabel,
    currentRole,
    targetRoleTitle ? `→ ${targetRoleTitle}` : null,
    education.status === 'currently_studying'
      ? education.expectedGraduationYear
        ? `studying, graduating ${education.expectedGraduationYear}`
        : 'currently studying'
      : education.status === 'graduated'
        ? 'graduated'
        : null,
    goalLabel !== 'Not set' ? goalLabel.toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    currentStatus,
    currentStatusLabel: statusLabel,
    currentRole,
    targetRoleTitle,
    targetRoleId,
    hasTargetRole: Boolean(targetRoleTitle),
    careerGoal,
    careerGoalLabel: goalLabel,
    suggestedGoal: suggested,
    goalNeedsReview: goalNeedsReview(careerGoal, currentStatus, experienceLevel),
    educationStatus: education.status,
    educationStatusLabel: EDUCATION_STATUS_LABELS[education.status],
    expectedGraduationYear: education.expectedGraduationYear,
    experienceLevel,
    experienceLevelLabel: levelLabel,
    isStudent,
    missingFields,
    summaryLine,
  };
}

/**
 * The partial update that makes an identity change reach the persisted row.
 *
 * The editor sends a patch in the profile's own vocabulary; this maps the
 * identity field names onto the columns so no page has to remember which
 * column `currentStatus` lives in.
 */
export interface CareerIdentityPatch {
  userType?: CareerStatus;
  currentTitle?: string | null;
  careerGoal?: CareerGoalValue;
  targetRoleId?: string | null;
  targetRoleTitle?: string | null;
  experienceLevel?: ExperienceLevel | null;
  expectedGraduationYear?: number | null;
  educationStatus?: EducationStatus;
}

export function identityPatchToProfilePatch(patch: CareerIdentityPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.userType !== undefined) out.userType = patch.userType;
  if (patch.currentTitle !== undefined) out.currentTitle = patch.currentTitle;
  if (patch.careerGoal !== undefined) out.careerGoal = patch.careerGoal;
  if (patch.targetRoleId !== undefined) out.targetRoleId = patch.targetRoleId ?? '';
  if (patch.targetRoleTitle !== undefined) out.targetRole = patch.targetRoleTitle ?? '';
  if (patch.experienceLevel !== undefined) out.experienceLevel = patch.experienceLevel;
  if (patch.expectedGraduationYear !== undefined) {
    out.expectedGraduationYear = patch.expectedGraduationYear;
  }
  if (patch.educationStatus !== undefined) out.educationStatus = patch.educationStatus;
  return out;
}
