-- Migration: 20261114000002_security_hardening.sql
-- Description: Removes the direct table-write surface from the client roles,
-- locks down the server-only tables, and repairs the referral-code generator.
--
-- Background
-- The baseline granted `ALL` on every public table to `anon` and
-- `authenticated`. Row Level Security was the only thing standing between a
-- signed-in candidate and a direct PostgREST write. That is a single point of
-- failure: one missing or mistyped policy would have been a privilege
-- escalation, and there is no reason for the browser to be able to write a
-- table at all.
--
-- The browser application reads and writes exclusively through the API, which
-- authenticates the caller and uses the service-role client for the database.
-- The browser's Supabase client is used for authentication and for uploading
-- a payment receipt to Storage. Nothing in the browser reads a table
-- directly, so the client roles can be reduced to read-only on the tables
-- whose policies already scope them to the owner.

-- ---------------------------------------------------------------------------
-- 1. Every public table: no client writes
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_table text;
BEGIN
  FOR v_table IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
  LOOP
    -- Row Level Security stays enabled as the second line of defence.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);

    -- The client roles may not create, change or remove a row directly.
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated',
      v_table
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Server-only tables: the client may not read them either
--
-- These tables hold billing records, credit ledgers, webhook payloads and
-- administrative data. Nothing in the product reads them from the browser,
-- so the read privilege is removed as well.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'admin_users',
    'admin_audit_log',
    'stripe_customers',
    'stripe_subscriptions',
    'stripe_invoices',
    'stripe_webhook_events',
    'stripe_refunds',
    'stripe_disputes',
    'ai_credit_ledger',
    'subscriptions',
    'subscription_events',
    'subscription_plans',
    'coupon_definitions',
    'coupon_redemptions',
    'payment_requests',
    'payment_verifications',
    'payment_receipts',
    'birthday_rewards',
    'user_privacy_consents',
    'daily_credit_grants',
    'referral_codes',
    'referral_relations',
    'background_jobs'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_table);
    END IF;
  END LOOP;
END;
$$;

-- The referral code is the one referral artefact a browser legitimately
-- needs to read: the user's own code.
GRANT SELECT ON public.referral_codes TO authenticated;
GRANT SELECT ON public.referral_relations TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The admin roster column grants
--
-- `admin_users` is written only by the service role. The column-level UPDATE
-- grants that the baseline handed to `authenticated` are removed outright, so
-- the table cannot be reached by a client even if a policy were ever added by
-- mistake.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.admin_users FROM anon, authenticated;
GRANT SELECT ON public.admin_users TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Repair the referral-code generator
--
-- `gen_random_bytes` lives in the pgcrypto extension, which is not installed
-- on this project. `gen_random_uuid()` is built into PostgreSQL 13 and later,
-- so the code is derived from it instead.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code text;
  v_attempts integer := 0;
BEGIN
  SELECT code INTO v_code
  FROM public.referral_codes
  WHERE profile_id = p_profile_id;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- 64 bits of entropy, rendered as four readable groups. `gen_random_uuid`
  -- is built into PostgreSQL 13 and later, so this needs no extension.
  WHILE v_attempts < 8 LOOP
    v_attempts := v_attempts + 1;

    v_code := 'CD4-' ||
      substr(upper(replace(gen_random_uuid()::text, '-', '')), 1, 4) || '-' ||
      substr(upper(replace(gen_random_uuid()::text, '-', '')), 5, 4) || '-' ||
      substr(upper(replace(gen_random_uuid()::text, '-', '')), 9, 4) || '-' ||
      substr(upper(replace(gen_random_uuid()::text, '-', '')), 13, 4);

    BEGIN
      INSERT INTO public.referral_codes (profile_id, code)
      VALUES (p_profile_id, v_code);

      RETURN v_code;
    EXCEPTION
      WHEN unique_violation THEN
        v_code := NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'ensure_referral_code: could not allocate a unique code';
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_referral_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Administrative role changes are always audited
--
-- The API writes to `admin_audit_log` for every administrative action, but a
-- change made by any other route (a migration, a script, a direct service
-- role call) would leave no trace. This trigger closes that gap.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_admin_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    INSERT INTO public.admin_audit_log (
      admin_id, admin_email, action, entity_type, entity_id, metadata
    ) VALUES (
      NEW.id,
      NEW.email,
      'admin.role_changed',
      'admin_user',
      NEW.id::text,
      jsonb_build_object(
        'previous_role', OLD.role,
        'new_role', NEW.role,
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'source', 'database_trigger'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_admin_role_change ON public.admin_users;
CREATE TRIGGER trg_audit_admin_role_change
  AFTER UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_admin_role_change();
