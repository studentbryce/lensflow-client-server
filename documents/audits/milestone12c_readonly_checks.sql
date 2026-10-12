-- LensFlow COMP.7214 Milestone 12C: run EACH numbered query separately in Supabase SQL Editor.
-- Read-only: no CREATE, ALTER, INSERT, UPDATE or DELETE statements.

-- 1. RLS enabled on public website and onboarding tables (all should be true).
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('photographer_profiles','profiles','clients','website_settings',
                    'website_content','portfolio_items','services','reviews','website_featured_reviews')
ORDER BY tablename;

-- 2. Review policies controlling public visibility and account creation/updates.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('photographer_profiles','profiles','clients','website_settings',
                    'website_content','portfolio_items','services','reviews','website_featured_reviews')
ORDER BY tablename, policyname;

-- 3. Anonymous SELECT privileges (important: anon key must not access private account tables).
SELECT t.table_name,
       has_table_privilege('anon', format('%I.%I','public',t.table_name), 'SELECT') AS anon_can_select,
       has_table_privilege('authenticated', format('%I.%I','public',t.table_name), 'SELECT') AS authenticated_can_select
FROM information_schema.tables t
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  AND t.table_name IN ('photographer_profiles','profiles','clients','website_settings',
                       'website_content','portfolio_items','services','reviews','website_featured_reviews')
ORDER BY t.table_name;

-- 4. Public reviews RPC configuration: anon and authenticated need EXECUTE, search_path hardened.
SELECT p.proname AS function_name, p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('get_public_reviews','get_featured_reviews')
ORDER BY p.proname;

-- 5. Public website publication and content counts (not an access simulation).
SELECT
  (SELECT count(*) FROM public.photographer_profiles WHERE published = true) AS published_photographers,
  (SELECT count(*) FROM public.photographer_profiles WHERE published = false) AS unpublished_photographers,
  (SELECT count(*) FROM public.website_content WHERE published = true) AS published_content,
  (SELECT count(*) FROM public.portfolio_items WHERE published = true) AS published_portfolio,
  (SELECT count(*) FROM public.services WHERE is_active = true) AS active_services,
  (SELECT count(*) FROM public.reviews WHERE status = 'approved') AS approved_reviews;

-- 6. Onboarding uniqueness constraints, plus role/ownership FK integrity.
SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype,
       c.convalidated, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid IN ('public.profiles'::regclass, 'public.clients'::regclass,
                     'public.photographer_profiles'::regclass)
  AND c.contype IN ('p','u','f','c')
ORDER BY table_name, c.conname;

-- 7. Existing account consistency: each user must not have both roles; duplicates should be 0.
SELECT
  (SELECT count(*) FROM (
    SELECT user_id FROM public.profiles GROUP BY user_id HAVING count(*) > 1
  ) d) AS duplicate_profiles,
  (SELECT count(*) FROM (
    SELECT user_id FROM public.clients GROUP BY user_id HAVING count(*) > 1
  ) d) AS duplicate_client_users,
  (SELECT count(*) FROM (
    SELECT user_id FROM public.photographer_profiles GROUP BY user_id HAVING count(*) > 1
  ) d) AS duplicate_photographer_users,
  (SELECT count(*) FROM public.profiles p
    JOIN public.clients c ON c.user_id = p.user_id
    WHERE p.role <> 'client') AS client_role_mismatches,
  (SELECT count(*) FROM public.profiles p
    JOIN public.photographer_profiles f ON f.user_id = p.user_id
    WHERE p.role <> 'photographer') AS photographer_role_mismatches;

-- 8. Account profile INSERT/UPDATE policy inventory for final security hardening.
-- IMPORTANT: ownership RLS alone does NOT prevent users from changing profiles.role.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles','clients','photographer_profiles')
  AND cmd IN ('INSERT','UPDATE','ALL')
ORDER BY tablename, cmd, policyname;
