// Server persistence for the feedback invitation policy.
//
// The policy itself lives in `shared/feedback.ts`, which both halves import.
// This module only reads and writes the per-account memory in
// `public.user_preferences`; it makes no decision about when to invite.
import {
  FEEDBACK_POLICY,
  type FeedbackEventType,
  type FeedbackSource,
  type FeedbackState,
  EMPTY_FEEDBACK_STATE,
} from '../../shared/feedback.ts';
import {
  getPreferences,
  upsertFeedbackPreferences,
  type PreferencesRow,
} from './preferences.ts';

/** Maps a preferences row, or the absence of one, to the client shape. */
export function toFeedbackState(row: PreferencesRow | null): FeedbackState {
  if (!row) return EMPTY_FEEDBACK_STATE;
  return {
    lastShownAt: row.feedback_last_shown_at ?? null,
    lastDismissedAt: row.feedback_last_dismissed_at ?? null,
    lastOpenedAt: row.feedback_last_opened_at ?? null,
    cardDismissedAt: row.feedback_card_dismissed_at ?? null,
    sessionCount: row.feedback_session_count ?? 0,
    lastSessionAt: row.feedback_last_session_at ?? null,
  };
}

export async function getFeedbackState(userId: string): Promise<FeedbackState> {
  return toFeedbackState(await getPreferences(userId));
}

/**
 * Counts an active session.
 *
 * A session starts when there is no previous session, or when the previous one
 * started more than `sessionWindowMinutes` ago. A reload inside the window
 * therefore does not inflate the count, and two quick visits cannot unlock the
 * sessions-only path by themselves. The account-age rule in the shared policy
 * provides the second guard.
 */
export async function registerFeedbackSession(
  userId: string,
  now: number = Date.now()
): Promise<{ state: FeedbackState; counted: boolean }> {
  const row = await getPreferences(userId);
  const previous = row?.feedback_last_session_at ?? null;
  const previousStart = previous ? Date.parse(previous) : NaN;
  const windowMs = FEEDBACK_POLICY.sessionWindowMinutes * 60 * 1000;
  const isNewSession =
    !Number.isFinite(previousStart) || now - previousStart >= windowMs;

  if (!isNewSession) {
    return { state: toFeedbackState(row), counted: false };
  }

  const saved = await upsertFeedbackPreferences(userId, {
    feedback_session_count: (row?.feedback_session_count ?? 0) + 1,
    feedback_last_session_at: new Date(now).toISOString(),
  });
  return { state: toFeedbackState(saved), counted: true };
}

/**
 * Records one of the three permitted events.
 *
 * A dashboard-card impression is reported to analytics by the browser but does
 * not start the thirty-day automatic cooldown: the card is the permanent
 * entry point, not the contextual invitation. Showing it therefore leaves
 * `last_shown_at` untouched.
 */
export async function recordFeedbackEvent(
  userId: string,
  type: FeedbackEventType,
  source: FeedbackSource,
  now: number = Date.now()
): Promise<FeedbackState> {
  if (type === 'impression' && source === 'dashboard_card') {
    return getFeedbackState(userId);
  }

  const timestamp = new Date(now).toISOString();
  const updates =
    type === 'impression'
      ? { feedback_last_shown_at: timestamp }
      : type === 'dismissed'
        ? source === 'dashboard_card'
          ? { feedback_card_dismissed_at: timestamp }
          : { feedback_last_dismissed_at: timestamp }
        : { feedback_last_opened_at: timestamp };

  const saved = await upsertFeedbackPreferences(userId, updates);
  return toFeedbackState(saved);
}
