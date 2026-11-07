-- Migration: 20261107000001_bootstrap_primary_super_admin.sql
-- Description: Bootstraps ahmedghannam801@gmail.com as primary Super Admin.
--
-- Defense-in-depth:
-- 1. Verifies that the user exists in auth.users and public.profiles.
-- 2. Inserts or updates the row in public.admin_users with role 'super_admin'.
-- 3. Does not remove ahdabdalla77@gmail.com (protects against last-super-admin lockout).
-- 4. Records the bootstrap event in public.admin_audit_log if admin record exists.

DO $$
DECLARE
  v_profile_id uuid;
  v_email text := 'ahmedghannam801@gmail.com';
  v_admin_id uuid;
BEGIN
  -- 1. Resolve profile_id from auth.users joined with public.profiles
  --    The email must be confirmed: an unconfirmed signup that happens to use
  --    the owner's address must never receive administrative rights.
  SELECT p.id INTO v_profile_id
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(v_email)
    AND u.email_confirmed_at IS NOT NULL
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE NOTICE 'Target Super Admin user % does not exist in auth.users/profiles yet, or its email is not confirmed. Bootstrap deferred until user registers and confirms.', v_email;
    RETURN;
  END IF;

  -- 2. Upsert the admin_users record.
  --    The upsert only ever CREATES the bootstrap administrator. It never
  --    re-promotes an existing row: if an operator demotes or disables this
  --    account, re-running this migration must not silently restore it.
  INSERT INTO public.admin_users (
    profile_id,
    email,
    full_name,
    role,
    status,
    permissions
  )
  VALUES (
    v_profile_id,
    lower(v_email),
    'Ahmed Ghannam',
    'super_admin',
    'active',
    '{}'::text[] -- Empty array inherits all permissions for super_admin
  )
  ON CONFLICT (profile_id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = now()
    WHERE admin_users.role = 'super_admin'
      AND admin_users.status = 'active'
  RETURNING id INTO v_admin_id;

  -- 3. Record in admin_audit_log for audit accountability
  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.admin_audit_log (
      admin_id,
      admin_email,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      v_admin_id,
      lower(v_email),
      'admin.bootstrapped',
      'admin_user',
      v_admin_id::text,
      jsonb_build_object(
        'reason', 'Primary platform owner bootstrap via migration 20261107000001',
        'assigned_role', 'super_admin',
        'profile_id', v_profile_id
      )
    );
  END IF;

  RAISE NOTICE 'Successfully bootstrapped % (profile_id: %) as Super Admin.', v_email, v_profile_id;
END;
$$;

