-- Every new account starts with email preferences.
--
-- The infrastructure migration backfilled the accounts that existed when it
-- ran and made the API repair a missing row. A trigger is the better default:
-- the row exists before the first email is processed, so consent, the
-- unsubscribe token and the category switches are never temporarily absent.
--
-- `ON CONFLICT DO NOTHING` keeps a re-run and a concurrent API repair safe.

CREATE OR REPLACE FUNCTION public.create_email_preferences_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_email_preferences_for_profile()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_email_preferences_for_profile()
  TO service_role;

DROP TRIGGER IF EXISTS email_preferences_on_profile_created ON public.profiles;
CREATE TRIGGER email_preferences_on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_email_preferences_for_profile();

-- Repair any account created between the two migrations.
INSERT INTO public.email_preferences (user_id)
SELECT p.id FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;
