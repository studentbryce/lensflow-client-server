-- Milestone 13A: READ ONLY. Run after applying to disposable Supabase project.
SELECT event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema='public' AND trigger_name LIKE 'guard_%_13a'
ORDER BY event_object_table, trigger_name;

SELECT policyname, cmd, with_check FROM pg_policies
WHERE schemaname='public' AND tablename='clients'
AND policyname='Clients can create their own client record';

SELECT n.nspname AS schema_name,p.proname AS function_name,p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='private' AND p.proname IN
('guard_profile_identity_13a','guard_client_identity_13a','guard_photographer_identity_13a')
ORDER BY p.proname;
