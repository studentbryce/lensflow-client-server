-- COMP.7214 Milestone 9F — READ ONLY verification in Supabase SQL Editor.
-- Shared DB: these queries change NOTHING. Do not paste any ALTER/DROP/CREATE statements.

-- A. Booking protection constraints should both be present and validated.
SELECT conname AS constraint_name, contype AS constraint_type, convalidated AS is_validated,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.bookings'::regclass
  AND conname IN ('bookings_valid_time_range', 'bookings_no_active_overlap')
ORDER BY conname;

-- B. Row-level security should be enabled for the booking and availability tables.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('bookings', 'clients', 'profiles', 'photographer_profiles',
                    'availability_rules', 'availability_exceptions')
ORDER BY tablename;

-- C. Inspect effective policies for relevant tables (review the USING / WITH CHECK expressions).
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('bookings', 'availability_rules', 'availability_exceptions')
ORDER BY tablename, policyname;

-- D. Verify the privacy-preserving busy-times function exists and is security definer.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       pg_get_function_result(p.oid) AS return_type,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_booking_busy_times';

-- E. Active booking overlaps (should return zero rows). Uses a self-join and does not modify data.
SELECT a.booking_id AS first_booking, b.booking_id AS overlapping_booking,
       a.photographer_id, a.booking_date
FROM public.bookings a
JOIN public.bookings b
  ON a.photographer_id = b.photographer_id
 AND a.booking_date = b.booking_date
 AND a.booking_id < b.booking_id
 AND a.start_time < b.end_time
 AND b.start_time < a.end_time
WHERE a.status IN ('pending', 'confirmed')
  AND b.status IN ('pending', 'confirmed')
LIMIT 25;

-- F. Invalid time ranges (should return zero rows).
SELECT booking_id, photographer_id, booking_date, start_time, end_time
FROM public.bookings WHERE start_time >= end_time LIMIT 25;
