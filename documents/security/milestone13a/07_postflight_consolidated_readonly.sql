-- LensFlow Milestone 13A postflight verification: READ-ONLY.
-- Run on LensFlow-Recovery-Test after consolidated replay or staged 02+05 patches.
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema='public' AND trigger_name IN (
  'guard_profile_identity_13a','guard_client_identity_13a','guard_photographer_identity_13a'
)
ORDER BY table_name;

SELECT n.nspname AS schema_name, p.proname, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer, p.proconfig AS function_settings
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='private' AND p.proname='is_published_photographer_13a';

SELECT policyname, cmd, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='clients'
  AND policyname='Clients can create their own client record';

SELECT 'application_tables' AS component, COUNT(*) AS actual FROM pg_tables WHERE schemaname='public'
UNION ALL
SELECT 'rls_enabled_tables', COUNT(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity
UNION ALL
SELECT 'rls_policies', COUNT(*) FROM pg_policies WHERE schemaname='public';
-- Expected after baseline+13A: 24 tables, 24 RLS enabled, 75 policies.
-- Security function must be owned by a trusted RLS-bypassing role; if not, STOP.
