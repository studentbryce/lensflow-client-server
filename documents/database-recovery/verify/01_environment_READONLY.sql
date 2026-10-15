-- READ ONLY: Inspect the currently selected Supabase project before any database setup.
-- The SQL database name does not prove which Supabase project is selected.
-- Confirm the dashboard project name and project ref manually; NEVER use the original project.
SELECT current_database() AS database_name,
       current_user AS sql_role,
       current_setting('server_version') AS postgres_version,
       now() AS observed_at;

-- For an EMPTY fresh project before setup, review these counts and any existing objects.
-- For an already configured test project, nonzero counts are normal; do NOT replay setup scripts.
SELECT (SELECT count(*) FROM pg_tables WHERE schemaname='public') AS public_tables,
       (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS public_policies,
       (SELECT count(*) FROM storage.buckets) AS storage_buckets,
       (SELECT count(*) FROM storage.objects) AS storage_objects,
       (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') AS storage_object_policies;
