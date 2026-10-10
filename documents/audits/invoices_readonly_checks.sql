-- Milestone 10D — read-only schema/security checks (safe for shared Supabase).
-- 1. Invoice, line-item, payment and payment settings RLS.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables WHERE schemaname='public'
AND tablename IN ('invoices','invoice_items','payments','photographer_payment_settings')
ORDER BY tablename;

-- 2. Relevant policies; review authenticated and ownership predicates.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public'
AND tablename IN ('invoices','invoice_items','payments','photographer_payment_settings')
ORDER BY tablename,policyname;

-- 3. FK and uniqueness constraints supporting invoice safety.
SELECT c.conname, c.contype, c.convalidated, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
JOIN pg_namespace n ON n.oid=t.relnamespace
WHERE n.nspname='public' AND t.relname IN ('invoices','invoice_items','payments')
AND c.contype IN ('f','u','p') ORDER BY t.relname,c.conname;

-- 4. Does the schema allow a custom invoice line with no service?
SELECT column_name,is_nullable,data_type
FROM information_schema.columns WHERE table_schema='public'
AND table_name='invoice_items' AND column_name='service_id';

-- 5. No invoice rows missing line items (may identify older partial writes).
SELECT i.invoice_id,i.invoice_number,i.status
FROM public.invoices i
WHERE NOT EXISTS (SELECT 1 FROM public.invoice_items it WHERE it.invoice_id=i.invoice_id)
ORDER BY i.created_at DESC LIMIT 25;

-- 6. No line item has mismatched photographer ownership.
SELECT it.invoice_item_id,it.invoice_id,it.photographer_id,i.photographer_id AS invoice_photographer_id
FROM public.invoice_items it JOIN public.invoices i ON i.invoice_id=it.invoice_id
WHERE it.photographer_id IS DISTINCT FROM i.photographer_id LIMIT 25;
