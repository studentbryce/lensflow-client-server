-- LensFlow: create Storage policies in a NEW disposable database only.
-- WARNING: WRITE OPERATION. NEVER run against original / production LensFlow.
-- Requires 03_storage_buckets: exactly four expected buckets, zero objects, zero Storage policies.
-- Security adjustment: client-media SELECT requires paid invoice + successful payment
-- with paid_at set, and restricts originals to explicitly downloadable media.
-- Policy synced to deployed definition on 2026-10-18; not replay-tested.
-- Safer path matching: compare UUID columns as text instead of casting untrusted
-- storage paths to uuid. Preserves the 16 original policy names and operations.
-- Do not upload real customer data. This script does not restore any files or application records.
-- IMPORTANT: This is a merged, path-qualified fresh-setup script. Its component policies
-- were tested previously, but this combined script has NOT been replay-tested end to end.
-- Review in a fresh disposable project before treating it as an approved migration.

BEGIN;

DO $preflight$
DECLARE
  bad_buckets integer;
BEGIN
  IF (SELECT COUNT(*) FROM storage.buckets) <> 4 THEN
    RAISE EXCEPTION 'Safety stop: expected exactly 4 buckets';
  END IF;
  WITH expected(id, name, is_public, max_bytes, mime) AS (
    VALUES
      ('client-media','client-media',false,524288000::bigint,ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']::text[]),
      ('photographer-website-media','photographer-website-media',true,52428800::bigint,ARRAY['image/jpeg','image/png','image/webp']::text[]),
      ('portfolio-media','portfolio-media',true,26214400::bigint,ARRAY['image/jpeg','image/png','image/webp']::text[]),
      ('service-media','service-media',true,26214400::bigint,ARRAY['image/jpeg','image/png','image/webp']::text[])
  )
  SELECT COUNT(*) INTO bad_buckets
  FROM expected e LEFT JOIN storage.buckets b ON b.id=e.id
  WHERE b.id IS NULL OR b.name IS DISTINCT FROM e.name
    OR b.public IS DISTINCT FROM e.is_public
    OR b.file_size_limit IS DISTINCT FROM e.max_bytes
    OR b.allowed_mime_types IS DISTINCT FROM e.mime;
  IF bad_buckets <> 0 THEN
    RAISE EXCEPTION 'Safety stop: bucket configuration mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects) THEN
    RAISE EXCEPTION 'Safety stop: expected no storage objects';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage') THEN
    RAISE EXCEPTION 'Safety stop: storage policies already exist';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND c.relname='objects' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Safety stop: storage.objects RLS is disabled';
  END IF;
  IF (SELECT COUNT(*) FROM pg_policies WHERE schemaname='public') <> 75 THEN
    RAISE EXCEPTION 'Safety stop: public RLS policy count is not the tested 75';
  END IF;
END
$preflight$;
-- Synced with deployed policy definition supplied on 2026-10-18.
-- Clients can SELECT canonical image previews, or originals only when both
-- gallery and individual-media download permissions are enabled.
CREATE POLICY "Clients can view purchased gallery media"
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'client-media'
  AND EXISTS (
    SELECT 1
    FROM public.media m
    JOIN public.galleries g
      ON g.gallery_id = m.gallery_id
     AND g.photographer_id = m.photographer_id
    JOIN public.clients c ON c.client_id = g.client_id
    WHERE c.user_id = auth.uid()
      AND g.is_published = true
      AND EXISTS (
        SELECT 1
        FROM public.invoices i
        JOIN public.payments p
          ON p.invoice_id = i.invoice_id
         AND p.client_id = g.client_id
        WHERE i.booking_id = g.booking_id
          AND i.client_id = g.client_id
          AND i.photographer_id = g.photographer_id
          AND i.status::text = 'paid'
          AND p.status::text = 'successful'
          AND p.paid_at IS NOT NULL
      )
      AND (
        (
          m.media_type::text = 'image'
          AND m.thumbnail_path = storage.objects.name
          AND m.thumbnail_path = (
            m.photographer_id::text || '/' || m.gallery_id::text
            || '/previews/' || m.media_id::text || '.webp'
          )
        )
        OR (
          g.allow_downloads = true
          AND m.is_downloadable = true
          AND m.storage_path = storage.objects.name
          AND m.storage_path LIKE (
            m.photographer_id::text || '/' || m.gallery_id::text || '/%'
          )
        )
      )
  )
);

CREATE POLICY "Photographers can delete portfolio media"
ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id = 'portfolio-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can delete service media"
ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id = 'service-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = 'services' AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can delete their client media"
ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id = 'client-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.photographer_profiles pp ON pp.photographer_id = g.photographer_id
    WHERE g.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND g.gallery_id::text = (storage.foldername(storage.objects.name))[2]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can delete website media"
ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id = 'photographer-website-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = ANY(ARRAY['hero','about']::text[]) AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can update portfolio media"
ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  bucket_id = 'portfolio-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'portfolio-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can update service media"
ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  bucket_id = 'service-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = 'services' AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'service-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = 'services' AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can update their client media"
ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  bucket_id = 'client-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.photographer_profiles pp ON pp.photographer_id = g.photographer_id
    WHERE g.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND g.gallery_id::text = (storage.foldername(storage.objects.name))[2]
      AND pp.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'client-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.photographer_profiles pp ON pp.photographer_id = g.photographer_id
    WHERE g.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND g.gallery_id::text = (storage.foldername(storage.objects.name))[2]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can update website media"
ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
USING (
  bucket_id = 'photographer-website-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = ANY(ARRAY['hero','about']::text[]) AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'photographer-website-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = ANY(ARRAY['hero','about']::text[]) AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can upload client media"
ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.photographer_profiles pp ON pp.photographer_id = g.photographer_id
    WHERE g.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND g.gallery_id::text = (storage.foldername(storage.objects.name))[2]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can upload portfolio media"
ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'portfolio-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can upload service media"
ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'service-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = 'services' AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can upload website media"
ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'photographer-website-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = ANY(ARRAY['hero','about']::text[]) AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can view service media"
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'service-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = 'services' AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can view their client media"
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'client-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND EXISTS (
    SELECT 1 FROM public.galleries g
    JOIN public.photographer_profiles pp ON pp.photographer_id = g.photographer_id
    WHERE g.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND g.gallery_id::text = (storage.foldername(storage.objects.name))[2]
      AND pp.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Photographers can view their website media"
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'photographer-website-media' AND array_length(storage.foldername(storage.objects.name),1) >= 2 AND (storage.foldername(storage.objects.name))[2] = ANY(ARRAY['hero','about']::text[]) AND EXISTS (
    SELECT 1 FROM public.photographer_profiles pp
    WHERE pp.photographer_id::text = (storage.foldername(storage.objects.name))[1]
      AND pp.user_id = (SELECT auth.uid())
  )
);
DO $postflight$
BEGIN
  IF (SELECT COUNT(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') <> 16 THEN
    RAISE EXCEPTION 'Safety stop: expected 16 storage.objects policies after migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND (tablename <> 'objects'
      OR permissive <> 'PERMISSIVE' OR roles <> ARRAY['authenticated']::name[])
  ) THEN
    RAISE EXCEPTION 'Safety stop: unexpected policy table, permissiveness or role';
  END IF;
END
$postflight$;

COMMIT;
-- Next: run verification queries and authenticated positive/negative Storage API tests.
