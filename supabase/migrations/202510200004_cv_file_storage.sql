-- Phase B.3.7.1 — CV file storage
--
-- Creates a PRIVATE Storage bucket for CV files and the RLS policies that keep
-- each user's files accessible only to that user.
--
-- Path convention: {user_id}/{file_id}.{ext}
--   The first path segment IS the owner id, so a policy can compare it with
--   auth.uid() and a user can never read another user's object — even if they
--   guess the file id.
--
-- The bucket is private (public = false): objects are reachable only through
-- an authenticated, policy-checked request (signed URLs or the storage API).

-- Private bucket for CV files.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cv-files',
  'cv-files',
  false,
  10485760, -- 10 MB, matching the existing multer limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Ownership helper: the first folder segment must equal the caller's id.
CREATE OR REPLACE FUNCTION public.storage_object_owner(object_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT (storage.foldername(object_name))[1];
$$;

-- SELECT: read your own objects (e.g. to create a signed download URL).
DROP POLICY IF EXISTS "cv_files_select_own" ON storage.objects;
CREATE POLICY "cv_files_select_own" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'cv-files'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

-- INSERT: upload only into your own folder.
DROP POLICY IF EXISTS "cv_files_insert_own" ON storage.objects;
CREATE POLICY "cv_files_insert_own" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cv-files'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

-- UPDATE: modify only your own objects.
DROP POLICY IF EXISTS "cv_files_update_own" ON storage.objects;
CREATE POLICY "cv_files_update_own" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'cv-files'
    AND public.storage_object_owner(name) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'cv-files'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

-- DELETE: remove only your own objects.
DROP POLICY IF EXISTS "cv_files_delete_own" ON storage.objects;
CREATE POLICY "cv_files_delete_own" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'cv-files'
    AND public.storage_object_owner(name) = auth.uid()::text
  );
