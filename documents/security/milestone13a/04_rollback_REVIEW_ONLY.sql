-- Milestone 13A rollback. REVIEW ONLY; use only if rollback is required.
-- Reverts ONLY the 13A trigger and clients INSERT policy changes.
BEGIN;
DROP TRIGGER IF EXISTS guard_profile_identity_13a ON public.profiles;
DROP TRIGGER IF EXISTS guard_client_identity_13a ON public.clients;
DROP TRIGGER IF EXISTS guard_photographer_identity_13a ON public.photographer_profiles;
DROP FUNCTION IF EXISTS private.guard_profile_identity_13a();
DROP FUNCTION IF EXISTS private.guard_client_identity_13a();
DROP FUNCTION IF EXISTS private.guard_photographer_identity_13a();
DROP POLICY IF EXISTS "Clients can create their own client record" ON public.clients;
CREATE POLICY "Clients can create their own client record" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));
COMMIT;
