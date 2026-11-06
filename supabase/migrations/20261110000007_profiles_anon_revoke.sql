-- Migration: 20261110000007_profiles_anon_revoke.sql
-- Description: Explicitly ensure anon role cannot read public.profiles table directly.
-- Grounded in Security Standard S-1 & 20261102000004.

REVOKE SELECT ON public.profiles FROM anon;

