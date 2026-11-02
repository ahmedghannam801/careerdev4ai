/**
 * Opportunity & Activity vocabulary.
 *
 * The platform started with a volunteering catalogue. It is now the broader
 * Opportunities & Activities ecosystem: volunteering, student activity, youth
 * programmes, career development, competitions, entrepreneurship, fellowships,
 * internships, academic and technology programmes.
 *
 * The vocabulary lives here so the catalogue, the API, the filters and the
 * admin editor all agree on the same values. A value that is not in these
 * lists is rejected by the server rather than silently stored.
 */

export const OPPORTUNITY_KINDS = [
  'volunteering',
  'student_activity',
  'youth_program',
  'career_development',
  'competition',
  'entrepreneurship',
  'fellowship',
  'internship',
  'academic',
  'technology',
] as const;

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const PARTICIPATION_MODES = ['onsite', 'online', 'hybrid'] as const;
export type ParticipationMode = (typeof PARTICIPATION_MODES)[number];

export const OPPORTUNITY_AUDIENCES = [
  'university_students',
  'fresh_graduates',
  'youth',
  'professionals',
  'women',
  'everyone',
] as const;
export type OpportunityAudience = (typeof OPPORTUNITY_AUDIENCES)[number];

export const OPPORTUNITY_LABELS: Record<OpportunityKind, string> = {
  volunteering: 'Volunteering',
  student_activity: 'Student activity',
  youth_program: 'Youth programme',
  career_development: 'Career development',
  competition: 'Competition',
  entrepreneurship: 'Entrepreneurship',
  fellowship: 'Fellowship',
  internship: 'Internship',
  academic: 'Academic',
  technology: 'Technology',
};

export const PARTICIPATION_LABELS: Record<ParticipationMode, string> = {
  onsite: 'On-site',
  online: 'Online',
  hybrid: 'Hybrid',
};

/**
 * The verification states an administrator can set.
 *
 * `http` is the legacy value the original catalogue used for "the URL was
 * reachable". It is kept so existing rows remain valid; the review states are
 * additive.
 */
export const OPPORTUNITY_VERIFICATION_STATUSES = [
  'http',
  'pending',
  'verified',
  'rejected',
] as const;
export type OpportunityVerificationStatus =
  (typeof OPPORTUNITY_VERIFICATION_STATUSES)[number];

export function isOpportunityVerificationStatus(
  value: string
): value is OpportunityVerificationStatus {
  return (OPPORTUNITY_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export const AUDIENCE_LABELS: Record<OpportunityAudience, string> = {
  university_students: 'University students',
  fresh_graduates: 'Fresh graduates',
  youth: 'Youth',
  professionals: 'Professionals',
  women: 'Women',
  everyone: 'Everyone',
};

/**
 * Older catalogue rows only had `category`. This maps the existing category
 * vocabulary onto the broader kind so nothing disappears from the ecosystem.
 */
export function kindForCategory(category: string): OpportunityKind {
  switch ((category ?? '').toLowerCase()) {
    case 'community':
      return 'student_activity';
    case 'youth':
      return 'youth_program';
    case 'career':
    case 'career-development':
      return 'career_development';
    case 'competition':
    case 'hackathon':
      return 'competition';
    case 'entrepreneurship':
    case 'startup':
      return 'entrepreneurship';
    case 'fellowship':
    case 'scholarship':
      return 'fellowship';
    case 'internship':
      return 'internship';
    case 'academic':
    case 'research':
      return 'academic';
    case 'technology':
    case 'tech':
    case 'data':
      return 'technology';
    default:
      return 'volunteering';
  }
}

/** Whether a value names a known kind, for server-side validation. */
export function isOpportunityKind(value: string): value is OpportunityKind {
  return (OPPORTUNITY_KINDS as readonly string[]).includes(value);
}

export function isParticipationMode(value: string): value is ParticipationMode {
  return (PARTICIPATION_MODES as readonly string[]).includes(value);
}

export function isOpportunityAudience(value: string): value is OpportunityAudience {
  return (OPPORTUNITY_AUDIENCES as readonly string[]).includes(value);
}

/** Normalises an audience array, dropping unknown values. */
export function normalizeAudiences(values: unknown): OpportunityAudience[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .filter(isOpportunityAudience)
    )
  );
}

/** A deadline is only shown while it is in the future. */
export function isLiveOpportunity(opportunity: {
  isActive?: boolean;
  deadline?: string | null;
}): boolean {
  if (opportunity.isActive === false) return false;
  if (!opportunity.deadline) return true;
  const deadline = new Date(`${opportunity.deadline}T23:59:59`);
  return Number.isFinite(deadline.getTime()) && deadline.getTime() >= Date.now();
}
