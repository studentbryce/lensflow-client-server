-- COMP.7214 Milestone 10F — READ ONLY checks. Run separately in Supabase SQL Editor.
-- 1. RLS enabled on website and portfolio tables.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables WHERE schemaname='public' AND tablename IN
('photographer_profiles','website_settings','website_content','website_featured_reviews','portfolio_items','reviews','media','galleries')
ORDER BY tablename;

-- 2. Website and portfolio ownership policies.
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN
('photographer_profiles','website_settings','website_content','website_featured_reviews','portfolio_items')
ORDER BY tablename,policyname;

-- 3. Constraints on website and portfolio data.
SELECT c.relname AS table_name,con.conname,con.contype,con.convalidated,
pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
('photographer_profiles','website_settings','website_content','website_featured_reviews','portfolio_items')
ORDER BY c.relname,con.conname;

-- 4. Storage bucket configuration.
SELECT id,name,public,file_size_limit,allowed_mime_types FROM storage.buckets
WHERE id IN ('photographer-website-media','portfolio-media','client-media') ORDER BY id;

-- 5. Storage RLS policies for website/portfolio media.
SELECT policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
AND (qual ILIKE '%portfolio-media%' OR qual ILIKE '%photographer-website-media%'
OR with_check ILIKE '%portfolio-media%' OR with_check ILIKE '%photographer-website-media%')
ORDER BY policyname;

-- 6. Duplicate website slug values (expected: no rows).
SELECT slug,COUNT(*) AS occurrences FROM public.photographer_profiles
WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*)>1;

-- 7. Duplicate portfolio order positions per photographer (expected: no rows if unique ordering intended).
SELECT photographer_id,display_order,COUNT(*) AS occurrences FROM public.portfolio_items
GROUP BY photographer_id,display_order HAVING COUNT(*)>1;

-- 8. Orphaned featured reviews (expected: no rows).
SELECT f.photographer_id,f.review_id FROM public.website_featured_reviews f
LEFT JOIN public.reviews r ON r.review_id=f.review_id AND r.photographer_id=f.photographer_id
WHERE r.review_id IS NULL;
