-- Milestone 13A: READ ONLY. Run in Supabase SQL Editor before considering migration.
-- A nonzero mismatch count must be investigated, not silently deleted or updated.
SELECT 'client_profile_role_mismatch' AS check_name, count(*) AS issues
FROM public.clients c JOIN public.profiles p ON p.user_id=c.user_id
WHERE p.role <> 'client'::public.user_role
UNION ALL
SELECT 'photographer_profile_role_mismatch', count(*)
FROM public.photographer_profiles pp JOIN public.profiles p ON p.user_id=pp.user_id
WHERE p.role <> 'photographer'::public.user_role
UNION ALL
SELECT 'users_with_both_client_and_photographer_records', count(*)
FROM public.clients c JOIN public.photographer_profiles pp ON pp.user_id=c.user_id;

SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('profiles','clients','photographer_profiles')
ORDER BY tablename,policyname;

SELECT table_name, privilege_type, grantee
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('profiles','clients','photographer_profiles')
AND grantee IN ('authenticated','anon')
ORDER BY table_name,grantee,privilege_type;
