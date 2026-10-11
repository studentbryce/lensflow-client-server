-- Milestone 12A: Run each numbered SELECT separately in Supabase SQL Editor.
-- Read-only. Do not execute against another tenant's production data without authorisation.

-- 1. RLS enabled on the messaging and identity tables.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('clients','conversations','messages','photographer_profiles','profiles')
ORDER BY tablename;

-- 2. Relevant SELECT, INSERT and UPDATE policies, including read receipts.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('conversations','messages')
ORDER BY tablename, policyname;

-- 3. Constraints for conversations and messages.
SELECT cls.relname AS table_name, c.conname, c.contype, c.convalidated,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c JOIN pg_class cls ON cls.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cls.relnamespace
WHERE n.nspname = 'public' AND cls.relname IN ('conversations','messages')
ORDER BY cls.relname, c.conname;

-- 4. Required columns.
SELECT table_name,column_name,is_nullable,data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('conversations','messages')
AND column_name IN ('conversation_id','photographer_id','client_id','created_at','updated_at',
 'message_id','sender_id','message','is_read')
ORDER BY table_name,column_name;

-- 5. Message integrity and read-state triggers.
SELECT event_object_table AS table_name, trigger_name, event_manipulation, action_timing,
       action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table IN ('conversations','messages')
ORDER BY event_object_table, trigger_name;

-- 6. Cross-owner conversations (expect zero).
SELECT count(*) AS cross_owner_conversations
FROM public.conversations c
LEFT JOIN public.clients cl ON cl.client_id = c.client_id
WHERE cl.client_id IS NULL OR cl.photographer_id IS DISTINCT FROM c.photographer_id;

-- 7. Messages whose sender is not a participant (expect zero).
SELECT count(*) AS invalid_message_senders
FROM public.messages m
LEFT JOIN public.conversations c ON c.conversation_id = m.conversation_id
LEFT JOIN public.photographer_profiles pp ON pp.photographer_id = c.photographer_id
LEFT JOIN public.clients cl ON cl.client_id = c.client_id
WHERE c.conversation_id IS NULL OR pp.user_id IS NULL OR cl.user_id IS NULL
   OR m.sender_id NOT IN (pp.user_id,cl.user_id);

-- 8. Realtime publication membership (expect public.messages).
SELECT pub.pubname AS publication, ns.nspname AS schemaname, cls.relname AS tablename
FROM pg_publication_rel rel
JOIN pg_publication pub ON pub.oid = rel.prpubid
JOIN pg_class cls ON cls.oid = rel.prrelid
JOIN pg_namespace ns ON ns.oid = cls.relnamespace
WHERE pub.pubname = 'supabase_realtime' AND ns.nspname = 'public' AND cls.relname = 'messages';
