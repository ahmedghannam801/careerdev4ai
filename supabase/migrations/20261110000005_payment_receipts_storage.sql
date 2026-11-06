-- Migration: 20261110000005_payment_receipts_storage.sql
-- Description: Private Supabase Storage bucket for Vodafone Cash and InstaPay payment receipts
--
-- Security rules:
-- - Bucket is STRICTLY PRIVATE (public = false)
-- - Upload limit: 5 MB (5,242,880 bytes)
-- - Allowed formats: JPEG, PNG
-- - Folder isolation: {auth.uid()}/{payment_request_id}/...
-- - Reads: Owner candidate can read own receipts; Active administrators can read for verification

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880, -- 5 MB
  ARRAY[
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated candidates can insert only into their own folder ({auth.uid()}/...)
DROP POLICY IF EXISTS "payment_receipts_insert_own" ON storage.objects;
CREATE POLICY "payment_receipts_insert_own" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

-- Authenticated candidates can read their own receipt files
DROP POLICY IF EXISTS "payment_receipts_select_own" ON storage.objects;
CREATE POLICY "payment_receipts_select_own" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND (
      public.storage_object_owner(name) = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.profile_id = auth.uid() AND au.status = 'active'
      )
    )
  );

-- Candidates cannot update receipts once submitted (preserves audit integrity)
-- No public SELECT

