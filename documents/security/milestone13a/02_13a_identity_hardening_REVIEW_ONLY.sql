-- Milestone 13A: REVIEW-ONLY CANDIDATE. DO NOT RUN ON PRODUCTION YET.
-- Must first test on a disposable/restored Supabase project with real JWT/RLS tests.
-- Protects account role/identity and client-photographer ownership against direct
-- authenticated PostgREST UPDATE, including calls that bypass the Express API.
-- Keeps legitimate profile edits, client notes, photographer business edits and
-- first-time self-service photographer/client registration functional.
BEGIN;

CREATE OR REPLACE FUNCTION private.guard_profile_identity_13a()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Profile owner cannot be changed' USING ERRCODE='42501';
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Profile role cannot be changed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.guard_client_identity_13a()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id OR
     NEW.user_id IS DISTINCT FROM OLD.user_id OR
     NEW.photographer_id IS DISTINCT FROM OLD.photographer_id THEN
    RAISE EXCEPTION 'Client identity and photographer association cannot be changed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.guard_photographer_identity_13a()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF NEW.photographer_id IS DISTINCT FROM OLD.photographer_id OR
     NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Photographer identity and owner cannot be changed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION private.guard_profile_identity_13a() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_client_identity_13a() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_photographer_identity_13a() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_identity_13a ON public.profiles;
CREATE TRIGGER guard_profile_identity_13a
  BEFORE UPDATE ON public.profiles FOR EACH ROW
  EXECUTE FUNCTION private.guard_profile_identity_13a();

DROP TRIGGER IF EXISTS guard_client_identity_13a ON public.clients;
CREATE TRIGGER guard_client_identity_13a
  BEFORE UPDATE ON public.clients FOR EACH ROW
  EXECUTE FUNCTION private.guard_client_identity_13a();

DROP TRIGGER IF EXISTS guard_photographer_identity_13a ON public.photographer_profiles;
CREATE TRIGGER guard_photographer_identity_13a
  BEFORE UPDATE ON public.photographer_profiles FOR EACH ROW
  EXECUTE FUNCTION private.guard_photographer_identity_13a();

-- A client may create only their own client record, linked to a published
-- photographer, and only when their existing account profile is a client.
-- This matches accountOnboardingService.js's registration checks, and blocks
-- bypassing the Express endpoint by calling PostgREST directly.
DROP POLICY IF EXISTS "Clients can create their own client record" ON public.clients;
CREATE POLICY "Clients can create their own client record"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT private.is_client())
    AND EXISTS (
      SELECT 1 FROM public.photographer_profiles pp
      WHERE pp.photographer_id = clients.photographer_id
        AND pp.published = true
    )
  );

COMMIT;
