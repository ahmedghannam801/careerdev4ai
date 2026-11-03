/**
 * The persisted first-time onboarding state.
 *
 * The platform already stored `onboarding_completed` on the profile. That
 * boolean could not tell "never started" from "skipped", so a user who chose
 * to skip was shown the whole wizard again on every sign-in. The status is the
 * authoritative value now; the legacy boolean is kept in sync for older
 * clients and for rows written before the status column existed.
 */

export type OnboardingStatus = 'not_started' | 'started' | 'completed' | 'skipped';

export const ONBOARDING_STATUSES: OnboardingStatus[] = [
  'not_started',
  'started',
  'completed',
  'skipped',
];

export function isOnboardingStatus(value: unknown): value is OnboardingStatus {
  return typeof value === 'string' && ONBOARDING_STATUSES.includes(value as OnboardingStatus);
}

/**
 * True when the application should take the user to the onboarding flow
 * without being asked.
 *
 * A skipped flow is deliberately not forced: the user made a choice and can
 * reopen it from Settings. A completed flow is obviously not forced.
 */
export function shouldForceOnboarding(input: {
  status: OnboardingStatus;
  /** The legacy flag, used when a row has no status value yet. */
  completed?: boolean;
}): boolean {
  if (input.status === 'completed' || input.status === 'skipped') return false;
  if (input.status === 'not_started' && input.completed === true) return false;
  return true;
}

/**
 * The legacy boolean value that matches a status.
 *
 * `skipped` is not the same as `completed`, so a skipped user keeps the
 * legacy flag false; the status is what prevents the repeat.
 */
export function onboardingCompletedForStatus(status: OnboardingStatus): boolean {
  return status === 'completed';
}
