-- Harden the search path on the immutable CV quota constants.
-- The functions are safe for public execution, but a fixed path also keeps
-- their SQL dependencies independent of a caller's session search_path.
ALTER FUNCTION public.cv_ai_edit_limit() SET search_path = public, pg_temp;
ALTER FUNCTION public.cv_ai_edit_window_seconds() SET search_path = public, pg_temp;
