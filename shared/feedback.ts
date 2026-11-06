/**
 * Feedback invitation policy.
 *
 * The feedback form itself is Google's; this module only decides WHEN the
 * platform may invite somebody to open it, and remembers that decision.
 *
 * The rules are deliberately conservative:
 *
 *   * an invitation is never shown during onboarding, an assessment, an
 *     interview or CV editing;
 *   * a new account is never invited immediately — an hour has to pass;
 *   * either two active sessions or one meaningful completed action is
 *     required before the first invitation;
 *   * one automatic invitation per 30 days, and a dismissal postpones the next
 *     one for 7 days;
 *   * opening the form is the end of the automatic sequence for this period.
 *
 * The state is per account (it lives in `public.user_preferences`), so the
 * caps hold across devices. A visitor who has no account is never invited
 * automatically.
 */

/**
 * The exact Google Form supplied for CareerDev4AI feedback.
 *
 * It is kept here as one constant so the dashboard card, the contextual
 * invitation, the account menu and Settings all open the same destination.
 * No profile value is ever appended to this URL.
 */
export const FEEDBACK_FORM_URL = 'https://forms.gle/fhhiyJSM55vUgnWY6';

/** The surfaces that can open the form. The value is reported in analytics. */
export const FEEDBACK_SOURCES = [
  'dashboard_card',
  'contextual_invitation',
  'account_menu',
  'settings',
] as const;

export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/** The only events the invitation is allowed to record. */
export const FEEDBACK_EVENT_TYPES = ['impression', 'dismissed', 'opened'] as const;

export type FeedbackEventType = (typeof FEEDBACK_EVENT_TYPES)[number];

/** The persisted invitation state, as the browser sees it. */
export interface FeedbackState {
  /** When an automatic invitation was last displayed. */
  lastShownAt: string | null;
  /** When the user last dismissed an invitation. */
  lastDismissedAt: string | null;
  /** When the user last opened the form from an invitation. */
  lastOpenedAt: string | null;
  /** When the dashboard card was last dismissed. */
  cardDismissedAt: string | null;
  /** How many active sessions the account has had. */
  sessionCount: number;
  /** The start of the most recently counted session. */
  lastSessionAt: string | null;
}

export const EMPTY_FEEDBACK_STATE: FeedbackState = {
  lastShownAt: null,
  lastDismissedAt: null,
  lastOpenedAt: null,
  cardDismissedAt: null,
  sessionCount: 0,
  lastSessionAt: null,
};

/** The policy numbers, in one place so the client and tests agree. */
export const FEEDBACK_POLICY = {
  /** Minimum time between two automatic invitations. */
  automaticCooldownDays: 30,
  /** A dismissal postpones the next automatic invitation by this long. */
  dismissalPostponeDays: 7,
  /** A dismissed dashboard card stays hidden for this long. */
  cardDismissalDays: 30,
  /** No automatic invitation during the first hour of an account's life. */
  minimumAccountAgeHours: 1,
  /** The sessions-only path waits a day, so two quick reloads are not enough. */
  sessionOnlyAccountAgeHours: 24,
  /** Two active sessions are enough, when there is no completed action. */
  minimumActiveSessions: 2,
  /** Two visits this far apart count as two active sessions. */
  sessionWindowMinutes: 30,
} as const;

/**
 * The screens on which a contextual invitation may appear.
 *
 * The dashboard is intentionally absent: it carries the permanent card, and
 * showing a second invitation over it would be a duplicate. Assessment,
 * interviews and CV Studio are absent because they are focused tasks; an
 * invitation must never interrupt them.
 */
export const CONTEXTUAL_FEEDBACK_VIEWS = [
  'my-career',
  'roadmap',
  'skills',
  'progress',
  'learning',
  'projects',
  'volunteer',
  'evidence',
  'documents',
  'jobs',
  'applications',
  'profile',
  'activity',
  'settings',
] as const;

export function isContextualFeedbackView(view: string): boolean {
  return (CONTEXTUAL_FEEDBACK_VIEWS as readonly string[]).includes(view);
}

/** Narrows an untrusted value to a known source. */
export function isFeedbackSource(value: unknown): value is FeedbackSource {
  return (
    typeof value === 'string' &&
    (FEEDBACK_SOURCES as readonly string[]).includes(value)
  );
}

/** Narrows an untrusted value to one of the three permitted events. */
export function isFeedbackEventType(value: unknown): value is FeedbackEventType {
  return (
    typeof value === 'string' &&
    (FEEDBACK_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** The number of milliseconds in one day. */
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function elapsed(now: number, value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return now - parsed;
}

/** The dashboard card is hidden for a period after an explicit dismissal. */
export function isFeedbackCardVisible(state: FeedbackState, now: number): boolean {
  const sinceDismissal = elapsed(now, state.cardDismissedAt);
  if (sinceDismissal === null) return true;
  return sinceDismissal >= FEEDBACK_POLICY.cardDismissalDays * DAY_MS;
}

/** The engagement signals the platform already knows, without new tracking. */
export interface MeaningfulActionInput {
  completedRoadmapTasks: number;
  completedLearningItems: number;
  cvCount: number;
  optimizedCvCount: number;
  applicationsCount: number;
  projectsCount: number;
  assessmentAttempts: number;
}

/**
 * Counts the completed actions that make somebody eligible for feedback.
 *
 * Every value comes from data the user created by using the platform. Nothing
 * here is a page view or a click; these are real outcomes.
 */
export function countMeaningfulActions(input: MeaningfulActionInput): number {
  return (
    (input.completedRoadmapTasks > 0 ? 1 : 0) +
    (input.completedLearningItems > 0 ? 1 : 0) +
    (input.cvCount > 0 ? 1 : 0) +
    (input.optimizedCvCount > 0 ? 1 : 0) +
    (input.applicationsCount > 0 ? 1 : 0) +
    (input.projectsCount > 0 ? 1 : 0) +
    (input.assessmentAttempts > 0 ? 1 : 0)
  );
}

export interface FeedbackEligibilityInput {
  now: number;
  accountCreatedAt: string | null;
  state: FeedbackState;
  meaningfulActionCount: number;
  invitationSeenThisSession: boolean;
  isAuthenticated: boolean;
  isOnboarding: boolean;
  isContextualView: boolean;
}

export interface FeedbackEligibility {
  eligible: boolean;
  /** Why the answer is no. Useful in tests and in a development console. */
  reason:
    | 'eligible'
    | 'not_ready'
    | 'anonymous'
    | 'onboarding'
    | 'focused_task'
    | 'already_invited_this_session'
    | 'account_too_new'
    | 'not_enough_engagement'
    | 'dismissed_recently'
    | 'shown_recently'
    | 'opened_recently';
}

/**
 * Decides whether the automatic contextual invitation may be shown.
 *
 * This is the ONLY implementation of the frequency policy. The provider, the
 * dashboard card and the host all call it, so the rule cannot drift between
 * screens.
 */
export function evaluateFeedbackEligibility(
  input: FeedbackEligibilityInput
): FeedbackEligibility {
  if (!input.isAuthenticated) return { eligible: false, reason: 'anonymous' };
  if (input.isOnboarding) return { eligible: false, reason: 'onboarding' };
  if (!input.isContextualView) return { eligible: false, reason: 'focused_task' };
  if (input.invitationSeenThisSession) {
    return { eligible: false, reason: 'already_invited_this_session' };
  }

  const accountAge = elapsed(input.now, input.accountCreatedAt);
  if (accountAge === null || accountAge < FEEDBACK_POLICY.minimumAccountAgeHours * HOUR_MS) {
    return { eligible: false, reason: 'account_too_new' };
  }

  const hasMeaningfulAction = input.meaningfulActionCount > 0;
  const hasTwoSessions =
    input.state.sessionCount >= FEEDBACK_POLICY.minimumActiveSessions &&
    accountAge >= FEEDBACK_POLICY.sessionOnlyAccountAgeHours * HOUR_MS;

  if (!hasMeaningfulAction && !hasTwoSessions) {
    return { eligible: false, reason: 'not_enough_engagement' };
  }

  const sinceDismissal = elapsed(input.now, input.state.lastDismissedAt);
  if (
    sinceDismissal !== null &&
    sinceDismissal < FEEDBACK_POLICY.dismissalPostponeDays * DAY_MS
  ) {
    return { eligible: false, reason: 'dismissed_recently' };
  }

  const sinceShown = elapsed(input.now, input.state.lastShownAt);
  if (sinceShown !== null && sinceShown < FEEDBACK_POLICY.automaticCooldownDays * DAY_MS) {
    return { eligible: false, reason: 'shown_recently' };
  }

  const sinceOpened = elapsed(input.now, input.state.lastOpenedAt);
  if (sinceOpened !== null && sinceOpened < FEEDBACK_POLICY.automaticCooldownDays * DAY_MS) {
    return { eligible: false, reason: 'opened_recently' };
  }

  return { eligible: true, reason: 'eligible' };
}

/**
 * Applies an event locally, so the UI reacts immediately and a failed request
 * does not leave a stale card or a duplicate invitation on screen.
 */
export function applyFeedbackEvent(
  state: FeedbackState,
  type: FeedbackEventType,
  source: FeedbackSource,
  at: number
): FeedbackState {
  const timestamp = new Date(at).toISOString();
  switch (type) {
    case 'impression':
      // The dashboard card is a permanent entry point, not the automatic
      // invitation. Seeing it must not start the thirty-day cooldown.
      return source === 'dashboard_card'
        ? state
        : { ...state, lastShownAt: timestamp };
    case 'dismissed':
      return {
        ...state,
        // Dismissing the dashboard card hides the card. It says nothing about
        // the contextual invitation, so it does not postpone that one.
        lastDismissedAt:
          source === 'dashboard_card' ? state.lastDismissedAt : timestamp,
        cardDismissedAt: source === 'dashboard_card' ? timestamp : state.cardDismissedAt,
      };
    case 'opened':
      return { ...state, lastOpenedAt: timestamp };
  }
}
