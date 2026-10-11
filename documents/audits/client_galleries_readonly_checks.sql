-- Milestone 11C read-only audit. Run each numbered query in Supabase SQL Editor.
-- 1. RLS enabled for all tables involved in gallery visibility/payment.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname='public' AND tablename IN ('clients','galleries','media','media_favourites','bookings','invoices','payments')
ORDER BY tablename;

-- 2. Client gallery/media and Storage SELECT policies (inspect expressions).
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname='public' AND tablename IN ('galleries','media','media_favourites','invoices','payments'))
   OR (schemaname='storage' AND tablename='objects' AND (policyname ILIKE '%client%' OR policyname ILIKE '%gallery%' OR policyname ILIKE '%media%'))
ORDER BY schemaname,tablename,policyname;

-- 3. Gallery/media foreign keys, uniqueness, and check constraints.
SELECT t.relname AS table_name, c.conname, c.contype, c.convalidated,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname IN ('galleries','media','media_favourites')
ORDER BY t.relname,c.conname;

-- 4. Fields used by API, preview and download authorization.
SELECT table_name,column_name,is_nullable,data_type
FROM information_schema.columns
WHERE table_schema='public' AND
 ((table_name='galleries' AND column_name IN ('gallery_id','photographer_id','client_id','booking_id','is_published','allow_downloads','name','updated_at')) OR
  (table_name='media' AND column_name IN ('media_id','gallery_id','photographer_id','media_type','file_name','storage_path','thumbnail_path','is_downloadable','uploaded_at')))
ORDER BY table_name,column_name;

-- 5. Informational: published and download-enabled gallery distribution.
SELECT is_published,allow_downloads,COUNT(*) AS gallery_count
FROM public.galleries GROUP BY is_published,allow_downloads
ORDER BY is_published,allow_downloads;

-- 6. Expected: orphan_media = 0.
SELECT COUNT(*) AS orphan_media
FROM public.media m LEFT JOIN public.galleries g ON g.gallery_id=m.gallery_id
WHERE g.gallery_id IS NULL;

-- 7. Expected: cross_owner_media = 0.
SELECT COUNT(*) AS cross_owner_media
FROM public.media m JOIN public.galleries g ON g.gallery_id=m.gallery_id
WHERE m.photographer_id IS DISTINCT FROM g.photographer_id;

-- 8. Expected: client-media bucket exists and public=false.
SELECT id, name, public AS is_public
FROM storage.buckets WHERE id='client-media';
