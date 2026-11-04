-- Announcement delivery uniqueness
--
-- Publishing an announcement inserts one notification per recipient and then
-- writes the delivery ledger. Two concurrent publishes (for example an
-- administrator pressing Publish while the server-side scheduler tick runs)
-- could both read "no notification yet" and both insert, leaving a duplicate
-- inbox row for the same person.
--
-- A unique index on (announcement_id, profile_id) makes the database the final
-- arbiter. Notifications that are not announcement deliveries keep
-- announcement_id NULL, and PostgreSQL treats NULLs as distinct in a unique
-- index, so ordinary notifications are unaffected.
--
-- Any duplicates that a previous race already created are collapsed first:
-- the oldest notification is kept, and every delivery pointing at a duplicate
-- is repointed at the keeper before the duplicate is removed. No delivery row
-- is deleted.

WITH ranked AS (
  SELECT
    id,
    announcement_id,
    profile_id,
    first_value(id) OVER (
      PARTITION BY announcement_id, profile_id
      ORDER BY created_at ASC, id ASC
    ) AS keeper_id,
    row_number() OVER (
      PARTITION BY announcement_id, profile_id
      ORDER BY created_at ASC, id ASC
    ) AS position
  FROM public.notifications
  WHERE announcement_id IS NOT NULL
)
UPDATE public.announcement_deliveries AS delivery
SET notification_id = ranked.keeper_id
FROM ranked
WHERE delivery.notification_id = ranked.id
  AND ranked.position > 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY announcement_id, profile_id
      ORDER BY created_at ASC, id ASC
    ) AS position
  FROM public.notifications
  WHERE announcement_id IS NOT NULL
)
DELETE FROM public.notifications AS notification
USING ranked
WHERE notification.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_announcement_recipient_key
  ON public.notifications(announcement_id, profile_id);
