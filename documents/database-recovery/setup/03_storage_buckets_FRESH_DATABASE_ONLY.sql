-- LensFlow: create Storage buckets for a NEW disposable database only.
-- WRITE OPERATION: run ONLY in a NEW disposable Supabase project.
-- Never run against original/production LensFlow.
-- Prerequisites: storage.buckets and storage.objects must both be empty.
-- This deliberately does NOT create storage.objects rows, copy files, or grant access.
-- The SQL transaction rolls back if the expected empty state has changed.

BEGIN;

DO $new_storage$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets) THEN
    RAISE EXCEPTION 'Safety stop: storage.buckets is not empty. No changes applied.';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'Safety stop: storage.objects is not empty. No changes applied.';
  END IF;
END;
$new_storage$;

INSERT INTO storage.buckets
    (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('client-media', 'client-media', false, 524288000,
     ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']::text[]),
    ('photographer-website-media', 'photographer-website-media', true, 52428800,
     ARRAY['image/jpeg','image/png','image/webp']::text[]),
    ('portfolio-media', 'portfolio-media', true, 26214400,
     ARRAY['image/jpeg','image/png','image/webp']::text[]),
    ('service-media', 'service-media', true, 26214400,
     ARRAY['image/jpeg','image/png','image/webp']::text[]);

COMMIT;

-- Next: verify bucket settings, then review and apply 04_storage_policies_FRESH_DATABASE_ONLY.sql.
