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
  'hackathon',
  'entrepreneurship',
  'fellowship',
  'scholarship',
  'internship',
  'academic',
  'technology',
  'training',
  'bootcamp',
  'workshop',
  'webinar',
  'conference',
  'certification',
] as const;

export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const PARTICIPATION_MODES = ['onsite', 'online', 'hybrid', 'unspecified'] as const;
export type ParticipationMode = (typeof PARTICIPATION_MODES)[number];

/**
 * Where an opportunity stands in its life.
 *
 * The status is what the catalogue reads to answer "can I still do this?".
 * It is separate from `is_active`, which is the administrator's switch.
 */
export const OPPORTUNITY_STATUSES = [
  'upcoming',
  'open',
  'closing_soon',
  'closed',
  'archived',
  'verification_required',
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  upcoming: 'Upcoming',
  open: 'Open',
  closing_soon: 'Closing soon',
  closed: 'Closed',
  archived: 'Archived',
  verification_required: 'Verification required',
};

/** Whether a value names a known status, for server-side validation. */
export function isOpportunityStatus(value: unknown): value is OpportunityStatus {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_STATUSES as readonly string[]).includes(value)
  );
}

/** Whether a value names a known cost, for server-side validation. */
export function isOpportunityCostType(
  value: unknown
): value is OpportunityCostType {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_COST_TYPES as readonly string[]).includes(value)
  );
}

/** What an opportunity costs, when the source says. */
export const OPPORTUNITY_COST_TYPES = ['free', 'paid', 'unspecified'] as const;
export type OpportunityCostType = (typeof OPPORTUNITY_COST_TYPES)[number];

export const OPPORTUNITY_COST_LABELS: Record<OpportunityCostType, string> = {
  free: 'Free',
  paid: 'Paid',
  unspecified: 'Cost not stated',
};

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
  hackathon: 'Hackathon',
  entrepreneurship: 'Entrepreneurship',
  fellowship: 'Fellowship',
  scholarship: 'Scholarship',
  internship: 'Internship',
  academic: 'Academic',
  technology: 'Technology',
  training: 'Training programme',
  bootcamp: 'Bootcamp',
  workshop: 'Workshop',
  webinar: 'Webinar',
  conference: 'Conference',
  certification: 'Certification',
};

export const PARTICIPATION_LABELS: Record<ParticipationMode, string> = {
  onsite: 'On-site',
  online: 'Online',
  hybrid: 'Hybrid',
  unspecified: 'Not specified',
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
