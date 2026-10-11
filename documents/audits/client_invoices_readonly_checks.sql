-- LensFlow COMP.7214 Milestone 11B — Client Invoices read-only database audit.
-- Run each numbered query separately in Supabase SQL Editor.
-- Do not share bank account numbers, client names, emails or other PII.

-- 1. RLS must be enabled for the client invoice read path.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('clients','profiles','photographer_profiles','invoices','invoice_items','bookings','services')
ORDER BY tablename;

-- 2. Confirm relevant invoice/client/profile/booking RLS policies.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clients','profiles','photographer_profiles','invoices','invoice_items','bookings','services')
ORDER BY tablename, policyname;

-- 3. Validate invoice and item relational constraints.
SELECT c.relname AS table_name, con.conname, con.contype, con.convalidated,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('invoices','invoice_items')
ORDER BY c.relname, con.conname;

-- 4. Confirm invoice status type and financial fields without revealing data.
SELECT table_name, column_name, is_nullable, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'invoices' AND column_name IN
        ('invoice_id','client_id','photographer_id','status','total_amount','issue_date','due_date','bank_account_number'))
    OR (table_name = 'invoice_items' AND column_name IN
        ('invoice_id','photographer_id','service_id','quantity','unit_price','subtotal')))
ORDER BY table_name, column_name;

-- 5. Count client invoices by status; no invoice IDs or sensitive details returned.
SELECT status, count(*) AS invoice_count
FROM public.invoices GROUP BY status ORDER BY status;

-- 6. Count invoice items missing parent invoices (expected 0).
SELECT count(*) AS orphan_invoice_items
FROM public.invoice_items it
LEFT JOIN public.invoices i ON i.invoice_id = it.invoice_id
WHERE i.invoice_id IS NULL;

-- 7. Invoice ownership mismatches (expected no rows).
SELECT i.invoice_id
FROM public.invoices i
JOIN public.bookings b ON b.booking_id = i.booking_id
WHERE i.client_id IS DISTINCT FROM b.client_id
   OR i.photographer_id IS DISTINCT FROM b.photographer_id;

-- 8. Invoice item ownership mismatches (expected no rows).
SELECT it.invoice_item_id
FROM public.invoice_items it
JOIN public.invoices i ON i.invoice_id = it.invoice_id
WHERE it.photographer_id IS DISTINCT FROM i.photographer_id;

-- Note: metadata queries do NOT prove runtime authorization. Browser testing
-- must verify client A cannot access client B invoices and draft invoices.
