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

/* -------------------------------------------------------------------------- */
/* The two pillars                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The two things a candidate is looking for, which are not the same thing.
 *
 * One is employment: a job, or an internship, which is a role somebody is
 * hired into. The other is an activity or a course: volunteering, a student
 * programme, a training course, a competition, a scholarship. They are
 * advertised by different organisations, they are found in different places,
 * and they are read by a candidate with a different question in mind.
 *
 * Mixing them is how a feed ends up offering a vacancy to somebody looking for
 * a course. The pillar is therefore a property of the RECORD, stored with it
 * and filtered on in the database, rather than a decision the interface makes
 * about what it would like to show.
 */
export const OPPORTUNITY_PILLARS = ['jobs', 'opportunities'] as const;
export type OpportunityPillar = (typeof OPPORTUNITY_PILLARS)[number];

export const OPPORTUNITY_PILLAR_LABELS: Record<OpportunityPillar, string> = {
  jobs: 'Live Jobs & Internship',
  opportunities: 'Volunteer & Training Opportunities',
};

/**
 * The kinds that are employment.
 *
 * An internship is a role somebody is taken on to do for a period of paid or
 * unpaid work under supervision, which is why it belongs with the vacancies
 * rather than with the activities. Everything else in the vocabulary is
 * something a candidate joins, attends or studies.
 */
export const EMPLOYMENT_OPPORTUNITY_KINDS: readonly OpportunityKind[] = ['internship'];

/**
 * The kinds that are training.
 *
 * A training programme, a bootcamp, a workshop, a webinar and a certification
 * are all ways of learning something, which is what puts them on the same
 * side of the line as volunteering.
 */
export const TRAINING_OPPORTUNITY_KINDS: readonly OpportunityKind[] = [
  'training',
  'bootcamp',
  'workshop',
  'webinar',
  'certification',
];

/**
 * The pillar a kind belongs to.
 *
 * This is the ONE place the rule is written. The database stores the answer
 * beside the row, the API filters on it, and the interface reads it.
 */
export function pillarForKind(kind: OpportunityKind): OpportunityPillar {
  return EMPLOYMENT_OPPORTUNITY_KINDS.includes(kind) ? 'jobs' : 'opportunities';
}

/** Whether a value names a known pillar, for server-side validation. */
export function isOpportunityPillar(value: unknown): value is OpportunityPillar {
  return (
    typeof value === 'string' &&
    (OPPORTUNITY_PILLARS as readonly string[]).includes(value)
  );
}

/**
 * Whether a kind is a training programme.
 *
 * The kind decides it, not a free-text tag: a tag can say anything, and the
 * filter has to be the same answer every time it is asked.
 */
export function isTrainingOpportunityKind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return (TRAINING_OPPORTUNITY_KINDS as readonly string[]).includes(kind);
}

/**
 * The kinds that belong to a pillar.
 *
 * Useful for a query that asks for the whole pillar without naming every
 * kind, and for the administration screen, which shows what is where.
 */
export function kindsForPillar(pillar: OpportunityPillar): OpportunityKind[] {
  return OPPORTUNITY_KINDS.filter((kind) => pillarForKind(kind) === pillar);
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
