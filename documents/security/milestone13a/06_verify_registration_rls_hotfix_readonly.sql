-- Run in LensFlow-Recovery-Test after applying 05_...sql.
-- Expected: function SECURITY DEFINER = true; owner postgres (or another
-- trusted role that bypasses RLS); clients INSERT policy uses helper.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'private'
  AND p.proname = 'is_published_photographer_13a';

SELECT policyname, cmd, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clients'
  AND policyname = 'Clients can create their own client record';

-- Should return 3 guard triggers, unchanged.
SELECT event_object_table AS table_name, trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND trigger_name LIKE 'guard_%_13a'
ORDER BY event_object_table;
