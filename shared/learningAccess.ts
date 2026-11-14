/**
 * How a learner can actually reach the content of a learning resource.
 *
 * The catalogue used to reduce availability to three buckets, and a course
 * that was "free to audit" or "the first chapter is free" wore the same
 * badge as a course anyone could finish for nothing. That is the kind of
 * small lie that costs a candidate an afternoon and a fee, so the access
 * model here is explicit about four things:
 *
 *   100% Free              the content and the certificate are both free;
 *   Free Audit (Cert Paid) the content is free, the certificate is not;
 *   Free Trial / Limited   only part of the content is free;
 *   Paid Subscription      the content itself is behind a paywall.
 *
 * Two rules follow from that and are enforced everywhere:
 *
 *   - a resource is only labelled "100% Free" when it really is;
 *   - the "Free only" filter keeps the resources whose CORE learning content
 *     can be completed for nothing, and drops the ones whose content is
 *     behind a paywall.
 */

/** The access tiers a learner can act on. */
export type LearningAccessTier = 'free' | 'free_audit' | 'free_trial' | 'paid';

/** The availability vocabulary the catalogue stores. */
export type LearningAvailability =
  | 'free'
  | 'free_with_limitations'
  | 'audit'
  | 'free_course_paid_certificate'
  | 'paid'
  | 'youtube_free'
  | string;

/** The badge text for each tier. Deliberately explicit: never just "Free". */
export const ACCESS_TIER_LABELS: Record<LearningAccessTier, string> = {
  free: '100% Free',
  free_audit: 'Free Audit (Certificate Paid)',
  free_trial: 'Free Trial / Limited',
  paid: 'Paid Subscription',
};

/** The short badge form, for the tight space on a card. */
export const ACCESS_TIER_BADGES: Record<LearningAccessTier, string> = {
  free: '100% FREE',
  free_audit: 'FREE AUDIT',
  free_trial: 'FREE TRIAL',
  paid: 'PAID',
};

/**
 * What each tier means, in plain words.
 *
 * This is shown on the card itself, not hidden in a tooltip: a candidate
 * should know what they are signing up for before they click.
 */
export const ACCESS_TIER_LIMITS: Record<LearningAccessTier, string> = {
  free: 'Free to access and free to finish, including the certificate.',
  free_audit: 'The learning content is free, but the certificate is not included.',
  free_trial: 'Only part of the content is free — the rest needs a paid subscription.',
  paid: 'The content needs a paid subscription.',
};

/**
 * The access tier of a resource.
 *
 * The catalogue's vocabulary is collapsed onto the four tiers. Anything the
 * catalogue does not describe is treated as paid, so an unknown resource is
 * never presented as free by accident.
 */
export function accessTier(availability: LearningAvailability | null | undefined): LearningAccessTier {
  switch ((availability ?? '').trim().toLowerCase()) {
    case 'free':
    case 'youtube_free':
      return 'free';
    case 'audit':
    case 'free_course_paid_certificate':
      return 'free_audit';
    case 'free_with_limitations':
      return 'free_trial';
    case 'paid':
      return 'paid';
    default:
      return 'paid';
  }
}

/** The badge text for a resource. */
export function accessTierLabel(availability: LearningAvailability | null | undefined): string {
  return ACCESS_TIER_LABELS[accessTier(availability)];
}

/** The short badge form for a resource. */
export function accessTierBadge(availability: LearningAvailability | null | undefined): string {
  return ACCESS_TIER_BADGES[accessTier(availability)];
}

/** What the badge means, in plain words. */
export function accessTierLimit(
  availability: LearningAvailability | null | undefined
): string {
  return ACCESS_TIER_LIMITS[accessTier(availability)];
}

/**
 * True when the whole resource — content and certificate — is free.
 *
 * This is the only case that may be called "100% Free".
 */
export function isFullyFree(availability: LearningAvailability | null | undefined): boolean {
  return accessTier(availability) === 'free';
}

/**
 * True when the CORE learning content can be completed for nothing.
 *
 * A resource whose certificate costs money still teaches everything, so it
 * qualifies. A resource whose content is behind a paywall — the first
 * chapter is free, the rest is not — does not, because the learner cannot
 * finish it.
 *
 * This is what the "Free only" filter uses.
 */
export function isFreeOnlyEligible(
  availability: LearningAvailability | null | undefined
): boolean {
  const tier = accessTier(availability);
  return tier === 'free' || tier === 'free_audit';
}

/**
 * The badge that says whether the resource hands over a certificate.
 *
 * A learner planning a portfolio needs to know this before they spend an
 * afternoon on it.
 */
export function certificateBadge(hasCertificate: boolean | null | undefined): string {
  return hasCertificate ? 'Includes Certificate' : 'Learning Content Only (No Certificate)';
}

/**
 * How many weeks a resource takes at the learner's pace.
 *
 * The number is rounded up, because "about three weeks" that ends up being
 * four is how a plan stops being trusted. A resource with no recorded
 * duration has no honest estimate, so it has none.
 */
export function estimatedCompletionWeeks(
  totalHours: number | null | undefined,
  weeklyHours: number | null | undefined
): number | null {
  const hours = Number(totalHours);
  const pace = Number(weeklyHours);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  if (!Number.isFinite(pace) || pace <= 0) return null;
  return Math.ceil(hours / pace);
}

/**
 * The sentence that explains the pace.
 *
 * "15h required at 5h/week is about 3 weeks." The learner can check the
 * arithmetic, which is the point.
 */
export function completionPaceLabel(
  totalHours: number | null | undefined,
  weeklyHours: number | null | undefined
): string | null {
  const weeks = estimatedCompletionWeeks(totalHours, weeklyHours);
  if (weeks === null) return null;
  const hours = Math.round(Number(totalHours));
  const pace = Math.round(Number(weeklyHours));
  return `${hours}h at ${pace}h/week is about ${weeks} week${weeks === 1 ? '' : 's'}.`;
}

/**
 * One course, and the shelf it belongs to.
 */
export interface LearningShelf<T> {
  /** The shelf's id, used for ordering. */
  id: string;
  /** The courses the shelf would like to show. */
  courses: T[];
}

/**
 * Gives every course to exactly one shelf.
 *
 * The Learning Hub shows the same catalogue through several lenses — the
 * target role, the skill gap, free, new, popular. A course that answered to
 * three of them appeared three times on one page, which made the page look
 * bigger than it was and made the learner hunt for the same course.
 *
 * The shelves are given in priority order, and each course goes to the first
 * shelf that wants it.
 */
export function dedupeAcrossShelves<T>(
  shelves: LearningShelf<T>[],
  idOf: (course: T) => string
): LearningShelf<T>[] {
  const seen = new Set<string>();

  return shelves.map((shelf) => {
    const kept: T[] = [];
    for (const course of shelf.courses) {
      const id = idOf(course);
      if (seen.has(id)) continue;
      seen.add(id);
      kept.push(course);
    }
    return { id: shelf.id, courses: kept };
  });
}
