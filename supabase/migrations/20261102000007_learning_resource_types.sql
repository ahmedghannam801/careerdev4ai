-- Learning resource types, certificates and featured/popularity signals.
--
-- The catalogue is video-first now, but the database still stores the original
-- `format` (course, playlist, tutorial, video, ...). A learner needs a clearer
-- type: Video Course, Video Playlist, Course, Article, Documentation, PDF,
-- Book, Workshop or Lecture.
--
-- The type is backfilled conservatively from what the row already says. A
-- YouTube watch URL is a Video Course; a YouTube playlist is a Video Playlist;
-- a `tutorial` row is an Article; a documentation host is Documentation. No
-- resource is relabelled as a video unless its URL really is one.
--
-- Certificate fields are equally conservative. `has_certificate` is only true
-- when the catalogue already says a certificate exists (a professional
-- certificate, a learning path, or a free course with a paid certificate).
-- `certificate_included` is only true when the existing availability says the
-- certificate itself is free. Nothing is invented.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS resource_type text,
  ADD COLUMN IF NOT EXISTS has_certificate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS certificate_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS popularity integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 1. Resource type
-- ---------------------------------------------------------------------------

UPDATE public.courses
SET resource_type = CASE
    WHEN url ILIKE '%youtube.com/playlist%' OR url ILIKE '%youtu.be/%?list=%' THEN 'video_playlist'
    WHEN url ILIKE '%youtube.com/watch%' OR url ILIKE '%youtu.be/%' OR url ILIKE '%youtube.com/embed/%' THEN 'video_course'
    WHEN lower(format) = 'playlist' THEN 'video_playlist'
    WHEN lower(format) = 'video' THEN 'video_course'
    WHEN lower(format) = 'professional_certificate' OR lower(format) = 'learning_path' THEN 'course'
    WHEN lower(format) = 'workshop' THEN 'workshop'
    WHEN lower(format) = 'lecture' THEN 'lecture'
    WHEN url ILIKE '%.pdf' OR title ILIKE '%.pdf%' OR title ILIKE '%(pdf)%' THEN 'pdf'
    WHEN provider ILIKE '%documentation%' OR provider ILIKE '%docs%' OR url ILIKE '%/docs%' THEN 'documentation'
    WHEN lower(format) = 'tutorial' THEN 'article'
    ELSE 'course'
  END
WHERE resource_type IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Certificates
-- ---------------------------------------------------------------------------

UPDATE public.courses
SET has_certificate = true
WHERE has_certificate = false
  AND (
    lower(format) IN ('professional_certificate', 'learning_path')
    OR availability = 'free_course_paid_certificate'
  );

UPDATE public.courses
SET certificate_included = true
WHERE certificate_included = false
  AND has_certificate = true
  AND availability IN ('free', 'youtube_free')
  AND lower(format) = 'professional_certificate';

-- ---------------------------------------------------------------------------
-- 3. Popularity and featured rows
--
-- Popularity is the rating count the provider already publishes. It is never
-- estimated. A featured row is a curation decision, so it starts empty.
-- ---------------------------------------------------------------------------

UPDATE public.courses
SET popularity = GREATEST(popularity, coalesce(rating_count, 0))
WHERE popularity = 0 AND coalesce(rating_count, 0) > 0;

CREATE INDEX IF NOT EXISTS idx_courses_resource_type
  ON public.courses(resource_type);

CREATE INDEX IF NOT EXISTS idx_courses_featured_popularity
  ON public.courses(is_featured DESC, popularity DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'courses_resource_type_check'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT courses_resource_type_check
      CHECK (resource_type IS NULL OR resource_type IN (
        'video_course', 'video_playlist', 'course', 'article', 'documentation',
        'pdf', 'book', 'workshop', 'lecture'
      )) NOT VALID;
  END IF;
END $$;
