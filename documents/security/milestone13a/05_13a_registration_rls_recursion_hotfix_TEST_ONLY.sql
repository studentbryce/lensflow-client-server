-- LensFlow Milestone 13A: registration RLS recursion hotfix.
-- TEST PROJECT ONLY. Do not apply to production until review and regression testing.
-- The 13A clients INSERT policy queries public.photographer_profiles;
-- an existing photographer_profiles SELECT policy queries public.clients.
-- That policy cycle raises PostgreSQL 42P17 during client registration.
-- Use a narrowly scoped SECURITY DEFINER boolean lookup to avoid the cycle.
-- Run as the postgres administrative role via the Supabase TEST project's SQL Editor.
BEGIN;

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
