-- LensFlow Storage configuration and inventory checks. READ ONLY.
-- Run after the database and identity checks are reviewed.

-- 1. Bucket restrictions.
SELECT id AS bucket_id, public AS is_public, file_size_limit, allowed_mime_types
FROM storage.buckets ORDER BY id;

-- 2. Object counts (Storage metadata is not a file-content backup).
SELECT b.id AS bucket_id, count(o.id) AS object_count
FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id=b.id
GROUP BY b.id ORDER BY b.id;

-- 3. Storage policy names and commands (no policy body).
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;

-- 4. Storage object rows pointing to a missing bucket. Expected: 0.
SELECT count(*) AS objects_without_bucket
FROM storage.objects o LEFT JOIN storage.buckets b ON b.id=o.bucket_id
WHERE b.id IS NULL;
