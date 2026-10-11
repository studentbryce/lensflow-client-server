-- LensFlow COMP.7214 Milestone 11E — Client Reviews read-only database audit.
-- Execute each numbered SELECT separately in the Supabase SQL Editor.
-- No data is modified. Avoid sharing review text or personal details.

-- 1. RLS enabled on all relevant tables.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN
  ('reviews','bookings','clients','photographer_profiles','profiles','services')
ORDER BY tablename;

-- 2. Review policies, including public approved-only visibility and
-- client INSERT restrictions. Verify the client UPDATE policy has been removed.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'reviews'
ORDER BY cmd, policyname;

-- 3. Review and booking ownership constraints.
SELECT c.relname AS table_name, con.conname, con.contype, con.convalidated,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('reviews','bookings')
  AND (c.relname = 'reviews' OR con.conname LIKE '%ownership%' OR con.conname LIKE '%client%')
ORDER BY c.relname, con.conname;

-- 4. Review fields and nullability.
SELECT column_name, is_nullable, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'reviews'
ORDER BY ordinal_position;

-- 5. Database RPC, privileges and review-update triggers.
-- The RPC should be SECURITY DEFINER with a fixed search_path;
-- authenticated users should have EXECUTE, anon should not.
SELECT p.proname AS function_name,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'update_pending_review';

-- 6. Review status distribution (counts only).
SELECT status, COUNT(*) AS review_count
FROM public.reviews GROUP BY status ORDER BY status;

-- 7. Reviews with inconsistent booking ownership or missing bookings.
-- Expected: no rows.
SELECT r.review_id
FROM public.reviews r
LEFT JOIN public.bookings b ON b.booking_id = r.booking_id
WHERE b.booking_id IS NULL OR r.client_id IS DISTINCT FROM b.client_id
   OR r.photographer_id IS DISTINCT FROM b.photographer_id;

-- 8. Review integrity counters. Expected: all zero.
SELECT
  (SELECT COUNT(*) FROM public.reviews WHERE rating < 1 OR rating > 5) AS invalid_ratings,
  (SELECT COUNT(*) FROM (
    SELECT booking_id FROM public.reviews GROUP BY booking_id HAVING COUNT(*) > 1
  ) duplicate_bookings) AS duplicate_booking_reviews,
  (SELECT COUNT(*) FROM public.reviews r
    WHERE r.status IS NULL OR r.client_id IS NULL OR r.photographer_id IS NULL) AS incomplete_reviews;
