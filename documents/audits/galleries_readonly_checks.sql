-- Milestone 10E: READ-ONLY audit, safe for shared LensFlow Supabase database.
-- Run each numbered SELECT separately and share the results.
-- 1. Gallery, media, related data RLS enabled?
SELECT schemaname,tablename,rowsecurity AS rls_enabled FROM pg_tables
WHERE schemaname='public' AND tablename IN ('galleries','media','media_favourites','clients','bookings','profiles') ORDER BY tablename;

-- 2. Gallery and media policies: ensure photographer ownership and client restrictions.
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('galleries','media','media_favourites') ORDER BY tablename,policyname;

-- 3. Relevant uniqueness, FK, and CHECK constraints.
SELECT t.relname AS table_name,c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname IN ('galleries','media','media_favourites')
AND c.contype IN ('f','u','p','c') ORDER BY t.relname,c.conname;

-- 4. Private bucket setting (client-media should not be public).
SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='client-media';

-- 5. Storage object policy definitions (inspect owner path constraints).
SELECT policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;

-- 6. Galleries whose booking/client/photographer links are inconsistent.
SELECT g.gallery_id,g.photographer_id,g.client_id,g.booking_id FROM public.galleries g
LEFT JOIN public.bookings b ON b.booking_id=g.booking_id
LEFT JOIN public.clients c ON c.client_id=g.client_id
WHERE b.booking_id IS NULL OR c.client_id IS NULL OR b.photographer_id IS DISTINCT FROM g.photographer_id
OR b.client_id IS DISTINCT FROM g.client_id OR c.photographer_id IS DISTINCT FROM g.photographer_id LIMIT 25;

-- 7. Media rows with inconsistent gallery/photographer ownership.
SELECT m.media_id,m.gallery_id,m.photographer_id,g.photographer_id AS gallery_photographer_id
FROM public.media m LEFT JOIN public.galleries g ON g.gallery_id=m.gallery_id
WHERE g.gallery_id IS NULL OR m.photographer_id IS DISTINCT FROM g.photographer_id LIMIT 25;

-- 8. Duplicate galleries for a single booking (should return no rows).
SELECT photographer_id,booking_id,count(*) AS gallery_count FROM public.galleries
GROUP BY photographer_id,booking_id HAVING count(*)>1 LIMIT 25;
