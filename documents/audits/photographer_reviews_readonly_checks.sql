-- COMP.7214 — Milestone 12B: Photographer Reviews API Migration
-- READ-ONLY audit. Run each numbered SELECT separately in Supabase SQL Editor.

-- 1. Row-level security on relevant tables.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('reviews','bookings','clients','profiles','photographer_profiles','services','website_featured_reviews')
ORDER BY tablename;

-- 2. Review and featured-review RLS policies (including moderation restrictions).
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('reviews','website_featured_reviews')
ORDER BY tablename, policyname;

-- 3. Constraints protecting reviews, bookings and featured reviews.
SELECT t.relname AS table_name, c.conname, c.contype, c.convalidated,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN ('reviews','bookings','website_featured_reviews')
ORDER BY t.relname, c.conname;

-- 4. Review table column types and nullability.
SELECT column_name, is_nullable, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reviews'
ORDER BY ordinal_position;

-- 5. Moderation RPC configuration and execution privileges.
-- This verifies metadata; inspect the function body separately in final hardening.
SELECT p.proname AS function_name, p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'moderate_review';

-- 6. Review moderation status distribution.
SELECT status, COUNT(*) AS review_count
FROM public.reviews GROUP BY status ORDER BY status;

-- 7. Invalid ratings, duplicate booking reviews, or ownership mismatch.
SELECT
  (SELECT COUNT(*) FROM public.reviews WHERE rating < 1 OR rating > 5) AS invalid_ratings,
  (SELECT COUNT(*) FROM (SELECT booking_id FROM public.reviews GROUP BY booking_id HAVING COUNT(*) > 1) duplicates) AS duplicate_booking_reviews,
  (SELECT COUNT(*) FROM public.reviews r
   LEFT JOIN public.bookings b ON b.booking_id = r.booking_id
   WHERE b.booking_id IS NULL OR b.client_id IS DISTINCT FROM r.client_id
     OR b.photographer_id IS DISTINCT FROM r.photographer_id) AS mismatched_review_ownership;

-- 8. Website featured-review integrity after moderation/unpublishing.
SELECT
  (SELECT COUNT(*) FROM public.website_featured_reviews f
   LEFT JOIN public.reviews r ON r.review_id = f.review_id
   WHERE r.review_id IS NULL OR r.photographer_id IS DISTINCT FROM f.photographer_id) AS orphan_or_cross_owner_featured,
  (SELECT COUNT(*) FROM public.website_featured_reviews f
   JOIN public.reviews r ON r.review_id = f.review_id
   WHERE r.status <> 'approved'::public.review_status) AS featured_not_approved;
