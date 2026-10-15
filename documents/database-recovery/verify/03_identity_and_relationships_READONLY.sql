-- LensFlow identity and relationship integrity checks. READ ONLY.
-- Run after structure verification. Counts only; no emails or credentials.

-- 1. Disposable identity/profile counts (do NOT expect original user totals).
SELECT (SELECT count(*) FROM auth.users) AS auth_users,
       (SELECT count(*) FROM auth.identities) AS auth_identities,
       (SELECT count(*) FROM public.profiles) AS app_profiles,
       (SELECT count(*) FROM public.photographer_profiles) AS photographers,
       (SELECT count(*) FROM public.clients) AS clients;

-- 2. Profiles with missing Auth user. Expected: 0.
SELECT count(*) AS profiles_without_auth_user
FROM public.profiles p LEFT JOIN auth.users u ON u.id=p.user_id
WHERE u.id IS NULL;

-- 3. Photographer profiles with missing parent app profile. Expected: 0.
SELECT count(*) AS photographers_without_profile
FROM public.photographer_profiles pp
LEFT JOIN public.profiles p ON p.user_id=pp.user_id
WHERE p.user_id IS NULL;

-- 4. Clients with missing parent app profile or photographer. Expected: 0, 0.
SELECT count(*) FILTER (WHERE p.user_id IS NULL) AS clients_without_profile,
       count(*) FILTER (WHERE pp.photographer_id IS NULL) AS clients_without_photographer
FROM public.clients c
LEFT JOIN public.profiles p ON p.user_id=c.user_id
LEFT JOIN public.photographer_profiles pp ON pp.photographer_id=c.photographer_id;

-- 5. Photographer/client role mismatches. Expected: 0, 0.
SELECT (SELECT count(*) FROM public.photographer_profiles pp
        JOIN public.profiles p ON p.user_id=pp.user_id
        WHERE p.role::text <> 'photographer') AS photographer_role_mismatches,
       (SELECT count(*) FROM public.clients c
        JOIN public.profiles p ON p.user_id=c.user_id
        WHERE p.role::text <> 'client') AS client_role_mismatches;

-- 6. Public table row counts (metadata only; do not infer completeness from zeros).
SELECT relname AS table_name, n_live_tup AS estimated_rows
FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname;
