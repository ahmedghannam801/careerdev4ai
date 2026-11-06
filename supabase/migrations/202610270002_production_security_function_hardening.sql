-- Migration: 202610270002_production_security_function_hardening.sql
--
-- HISTORICAL CONTEXT & DUPLICATE RESOLUTION:
-- This migration was originally applied directly to Supabase Production under
-- migration version 20261023105343 (production_security_function_hardening).
-- When subsequently committed to git in commit f3cbe79 as 202610270002, both
-- version timestamps became recorded in the remote schema_migrations table.
--
-- To guarantee idempotent execution and ensure the security hardening SQL
-- cannot execute twice during any replay or fresh initialization, this file
-- is preserved as a verified no-op. The full functional hardening statements
-- reside authoritatively in 20261023105343_production_security_function_hardening.sql.

DO $$
BEGIN
    -- No-op: hardening was already applied in 20261023105343.
    NULL;
END $$;
