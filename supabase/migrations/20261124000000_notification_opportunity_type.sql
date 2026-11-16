-- Letting the notification table carry the notice about a new opportunity.
--
-- The opportunity pipeline tells a candidate that a new opportunity concerns
-- their career. That notice is a kind of notification in its own right, so the
-- table has to allow the kind — and the check constraint is what decides. A
-- kind that the constraint does not list is refused by the database, and the
-- refusal happens at the last step of the opportunity run: the records are
-- already written, and the run still fails.
--
-- The constraint is replaced rather than altered in place, because the list of
-- allowed kinds lives inside it. The new list is the old list plus
-- 'opportunity'. Nothing that was allowed before stops being allowed, so the
-- rows already in the table keep working, and a rollback is a matter of
-- dropping this constraint and recreating the previous one.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'interview', 'roadmap', 'application', 'achievement', 'system',
    'announcement', 'subscription', 'payment', 'payment_success',
    'payment_failed', 'subscription_expired', 'credits', 'referral',
    'opportunity'
  ]::text[]));
