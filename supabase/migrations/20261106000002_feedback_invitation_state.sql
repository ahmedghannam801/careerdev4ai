-- Feedback invitations — the per-account memory of when we last asked.
--
-- WHY THIS FILE EXISTS
-- --------------------
-- The Google Form is the feedback destination. This migration holds only the
-- decision state that keeps the platform from asking too often, and it lives
-- beside the other account-owned settings in `public.user_preferences` so no
-- new table, and no new access path, is introduced.
--
-- WHAT THIS MIGRATION ADDS
-- ------------------------
--   * Two timestamps for the automatic contextual invitation: when it was
--     last shown and when the candidate last dismissed it. The seven-day
--     postponement is measured from the dismissal.
--   * One timestamp for the last time the form was opened, so a candidate who
--     already answered is not asked again during the same thirty-day period.
--   * One timestamp for the dashboard card's own dismissal. The card is a
--     permanent entry point, so dismissing it hides the card for a while but
--     never removes the menu and Settings routes to the form.
--   * A session counter, and the start of the session that was counted. Two
--     active sessions are one of the two ways to become eligible, so the count
--     has to survive a reload and follow the account across devices.
--
-- All timestamp columns are nullable: NULL means "this has never happened".
-- `feedback_session_count` is NOT NULL with a default so an existing row needs
-- no backfill. Nothing is destroyed, and row-level security is untouched —
-- every new column is covered by the existing owner-only policies on
-- `public.user_preferences`.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS feedback_last_shown_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_last_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_last_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_card_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_session_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feedback_last_session_at timestamptz;

-- A session counter can never be negative. The guard is cheap and it keeps a
-- bad write from turning the eligibility rule into a permanent "yes".
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_feedback_session_count_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_feedback_session_count_check
  CHECK (feedback_session_count >= 0);

COMMENT ON COLUMN public.user_preferences.feedback_last_shown_at IS
  'When the automatic contextual feedback invitation was last displayed.';
COMMENT ON COLUMN public.user_preferences.feedback_last_dismissed_at IS
  'When the candidate last dismissed a feedback invitation; postpones the next one by seven days.';
COMMENT ON COLUMN public.user_preferences.feedback_last_opened_at IS
  'When the feedback form was last opened from the product.';
COMMENT ON COLUMN public.user_preferences.feedback_card_dismissed_at IS
  'When the dashboard feedback card was dismissed; hides the card, never the permanent links.';
COMMENT ON COLUMN public.user_preferences.feedback_session_count IS
  'How many active sessions (30-minute window) this account has had.';
COMMENT ON COLUMN public.user_preferences.feedback_last_session_at IS
  'Start of the most recently counted active session.';
