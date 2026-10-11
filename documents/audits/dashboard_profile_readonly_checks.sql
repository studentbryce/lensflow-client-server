-- Milestone 11A: Client Dashboard + Profile (READ-ONLY; run each numbered query separately).
-- No personally identifying profile values are returned.

-- 1. Required RLS switches.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'profiles', 'bookings', 'invoices', 'galleries')
ORDER BY tablename;

-- 2. Applicable client read/write policies (inspect expressions).
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clients', 'profiles', 'bookings', 'invoices', 'galleries')
ORDER BY tablename, policyname;

-- 3. Identity and ownership constraints.
SELECT conrelid::regclass::text AS table_name, conname, contype, convalidated,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid IN ('public.clients'::regclass, 'public.profiles'::regclass,
                   'public.bookings'::regclass, 'public.invoices'::regclass,
                   'public.galleries'::regclass)
  AND contype IN ('p','f','u','c')
ORDER BY table_name, conname;

-- 4. Profile fields used by GET/PATCH /api/client/profile.
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN ('user_id', 'first_name', 'last_name', 'email', 'phone')
ORDER BY column_name;

-- 5. Duplicate client auth identities (expect zero rows).
SELECT user_id, count(*) AS duplicate_count
FROM public.clients
WHERE user_id IS NOT NULL
GROUP BY user_id HAVING count(*) > 1;

-- 6. Client records without matching profile (expect zero rows).
SELECT count(*) AS clients_missing_profiles
FROM public.clients c LEFT JOIN public.profiles p ON p.user_id = c.user_id
WHERE p.user_id IS NULL;
