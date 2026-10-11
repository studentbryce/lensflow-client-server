-- LensFlow COMP.7214 Milestone 11D — eight READ-ONLY audit queries.
-- Run each numbered SELECT separately in Supabase SQL Editor. Share results without message text or personal data.

-- 1. Row-level security enabled on all messaging-related tables.
SELECT schemaname, tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('clients', 'conversations', 'messages', 'profiles', 'photographer_profiles')
ORDER BY tablename;

-- 2. Relevant conversation/message RLS policies; confirm recipient-only UPDATE, participant SELECT/INSERT.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('conversations', 'messages')
ORDER BY tablename, policyname;

-- 3. Messaging table foreign keys, uniqueness and other constraints.
SELECT cls.relname AS table_name, con.conname, con.contype, con.convalidated,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class cls ON cls.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'public' AND cls.relname IN ('conversations', 'messages')
ORDER BY cls.relname, con.conname;

-- 4. Messaging columns and nullability (no message contents).
SELECT table_name, column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('conversations', 'messages')
ORDER BY table_name, ordinal_position;

-- 5. Message update-protection and conversation timestamp triggers.
SELECT event_object_table AS table_name, trigger_name, event_manipulation, action_timing,
       action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('conversations', 'messages')
ORDER BY event_object_table, trigger_name, event_manipulation;

-- 6. Conversations with no valid client/photographer relationship; expected 0.
SELECT COUNT(*) AS cross_owner_conversations
FROM public.conversations cv
LEFT JOIN public.clients c ON c.client_id = cv.client_id
WHERE c.client_id IS NULL OR c.photographer_id IS DISTINCT FROM cv.photographer_id;

-- 7. Orphaned messages and messages sent by nonparticipants; expected 0.
SELECT COUNT(*) AS invalid_message_senders
FROM public.messages m
LEFT JOIN public.conversations cv ON cv.conversation_id = m.conversation_id
LEFT JOIN public.clients c ON c.client_id = cv.client_id
LEFT JOIN public.photographer_profiles pp ON pp.photographer_id = cv.photographer_id
WHERE cv.conversation_id IS NULL OR c.client_id IS NULL OR pp.photographer_id IS NULL
   OR (m.sender_id IS DISTINCT FROM c.user_id AND m.sender_id IS DISTINCT FROM pp.user_id);

-- 8. Realtime publication membership (public.messages expected for live INSERT/UPDATE updates).
SELECT p.pubname AS publication, n.nspname AS schemaname, c.relname AS tablename
FROM pg_publication p
JOIN pg_publication_rel pr ON pr.prpubid = p.oid
JOIN pg_class c ON c.oid = pr.prrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('messages', 'conversations')
ORDER BY p.pubname, c.relname;
