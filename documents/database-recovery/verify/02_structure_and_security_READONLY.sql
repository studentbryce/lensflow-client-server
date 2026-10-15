-- LensFlow database structure and security verification. READ ONLY.
-- Confirm the selected disposable Supabase project before running.
-- Known expected baseline: 24 public tables, 24 RLS-enabled, 75 public
-- policies, 4 Storage buckets, 16 storage.objects policies.

-- 1. Main structural counts.
SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public') AS public_tables,
       (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity) AS public_tables_with_rls,
       (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS public_policies,
       (SELECT count(*) FROM storage.buckets) AS storage_buckets,
       (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') AS storage_object_policies;

-- 2. Any public tables with RLS disabled. Expected: no rows.
SELECT tablename FROM pg_tables
WHERE schemaname='public' AND NOT rowsecurity ORDER BY tablename;

-- 3. Three identity-protection triggers. Expected: 3 distinct trigger names.
-- Their database identifiers retain their historical suffixes; renaming them would alter the schema.
-- Multiple rows per trigger can appear for multi-event triggers; count distinct names.
SELECT DISTINCT event_object_table AS table_name, trigger_name
FROM information_schema.triggers
WHERE event_object_schema='public'
  AND trigger_name IN (
    'guard_profile_identity_13a',
    'guard_client_identity_13a',
    'guard_photographer_identity_13a'
  )
ORDER BY table_name, trigger_name;

-- 4. Security function metadata (not source code).
-- Expected: one row; review owner, security_definer and function_settings.
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_userbyid(p.proowner) AS function_owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='private' AND p.proname='is_published_photographer_13a';

-- 5. Foreign-key constraints that were added NOT VALID and never validated.
-- Expected: no rows. This does not replace row-level integrity testing.
SELECT n.nspname AS schema_name, c.relname AS table_name,
       con.conname AS constraint_name
FROM pg_constraint con
JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND con.contype='f' AND NOT con.convalidated
ORDER BY c.relname, con.conname;
