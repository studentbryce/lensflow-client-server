-- Milestone 10G: READ-ONLY Supabase SQL Editor audit.
-- Run each numbered query separately; share row counts and non-sensitive output only.
-- Never paste actual bank-account numbers or Stripe secrets into chat.

-- 1. RLS on settings-related tables
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles','photographer_profiles','photographer_payment_settings','photographer_stripe_accounts','calendar_integrations')
ORDER BY tablename;

-- 2. Policies on settings-related tables
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles','photographer_profiles','photographer_payment_settings','photographer_stripe_accounts','calendar_integrations')
ORDER BY tablename, policyname;

-- 3. Primary, foreign, unique and check constraints
SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype, c.convalidated,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid IN ('public.photographer_payment_settings'::regclass,
                   'public.photographer_profiles'::regclass,
                   'public.photographer_stripe_accounts'::regclass,
                   'public.calendar_integrations'::regclass)
ORDER BY table_name, conname;

-- 4. Expected payment columns (metadata only)
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='photographer_payment_settings'
  AND column_name IN ('photographer_id','gst_tax_number','default_tax_rate','bank_account_name','bank_name','bank_account_number','bank_payment_instructions')
ORDER BY column_name;

-- 5. Auth/account fields and Stripe/Calendar schema (metadata only)
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='photographer_stripe_accounts' AND column_name IN ('photographer_id','stripe_account_id','charges_enabled','payouts_enabled','details_submitted'))
    OR (table_name='calendar_integrations' AND column_name IN ('photographer_id','provider','is_active')))
ORDER BY table_name, column_name;

-- 6. Duplicate payment-settings rows: expected no rows
SELECT photographer_id, COUNT(*) AS row_count
FROM public.photographer_payment_settings
GROUP BY photographer_id HAVING COUNT(*) > 1;

-- 7. Orphaned payment-settings rows: expected no rows
SELECT ps.photographer_id
FROM public.photographer_payment_settings ps
LEFT JOIN public.photographer_profiles pp ON pp.photographer_id=ps.photographer_id
WHERE pp.photographer_id IS NULL;

-- 8. Out-of-range tax rates: expected no rows
SELECT photographer_id, default_tax_rate
FROM public.photographer_payment_settings
WHERE default_tax_rate IS NOT NULL AND (default_tax_rate < 0 OR default_tax_rate > 100);
