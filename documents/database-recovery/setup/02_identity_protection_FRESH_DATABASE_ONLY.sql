-- LensFlow: identity protection and recursion-safe registration.
-- For a fresh disposable database after the schema baseline. Do not rerun on an already configured database.
-- Do not apply to production until application regression, migration review, and backup approval.
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

-- Recursion-safe published-photographer lookup. Direct policy subqueries into
-- photographer_profiles trigger 42P17 via its existing SELECT policy on clients.
-- IMPORTANT: run as trusted postgres administrative owner; SECURITY DEFINER
-- relies on an owner that bypasses the referenced table's RLS.
CREATE OR REPLACE FUNCTION private.is_published_photographer_13a(
  p_photographer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.photographer_profiles AS pp
    WHERE pp.photographer_id = p_photographer_id
      AND pp.published IS TRUE
  );
$function$;

-- The helper exposes only whether the supplied business is published.
-- Its owner must bypass the photographer_profiles RLS policies.
REVOKE ALL ON FUNCTION private.is_published_photographer_13a(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_published_photographer_13a(uuid)
  TO authenticated;

DROP POLICY IF EXISTS "Clients can create their own client record"
  ON public.clients;
CREATE POLICY "Clients can create their own client record"
  ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (SELECT private.is_client())
    AND private.is_published_photographer_13a(photographer_id)
  );

COMMIT;
