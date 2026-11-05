-- Storage bucket for portfolio screenshots, thumbnails, and certification documents.
--
-- Public read so that portfolio previews and certification proofs can be viewed,
-- but writes are strictly isolated to the user's own folder ({auth.uid()}/...).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-attachments',
  'portfolio-attachments',
  true,
  10485760, -- 10 MB
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public can read any object in the portfolio-attachments bucket
DROP POLICY IF EXISTS "portfolio_attachments_select_public" ON storage.objects;
CREATE POLICY "portfolio_attachments_select_public" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'portfolio-attachments');

-- Authenticated users can insert only into their own folder ({auth.uid()}/...)
DROP POLICY IF EXISTS "portfolio_attachments_insert_own" ON storage.objects;
CREATE POLICY "portfolio_attachments_insert_own" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'portfolio-attachments'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

-- Authenticated users can update only their own files
DROP POLICY IF EXISTS "portfolio_attachments_update_own" ON storage.objects;
CREATE POLICY "portfolio_attachments_update_own" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'portfolio-attachments'
    AND public.storage_object_owner(name) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'portfolio-attachments'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

-- Authenticated users can delete only their own files
DROP POLICY IF EXISTS "portfolio_attachments_delete_own" ON storage.objects;
CREATE POLICY "portfolio_attachments_delete_own" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'portfolio-attachments'
    AND public.storage_object_owner(name) = auth.uid()::text
  );

