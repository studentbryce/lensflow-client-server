-- READ ONLY. Check client gallery Storage policy path qualification.
-- Expected: five client-media policies reference storage.objects.name, not g.name.
SELECT policyname, cmd,
       (COALESCE(qual,'') LIKE '%g.name%' OR COALESCE(with_check,'') LIKE '%g.name%') AS has_wrong_gallery_name_reference,
       (COALESCE(qual,'') LIKE '%objects.name%' OR COALESCE(with_check,'') LIKE '%objects.name%') AS has_storage_object_path_reference,
       qual, with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND policyname IN (
    'Clients can view purchased gallery media',
    'Photographers can delete their client media',
    'Photographers can update their client media',
    'Photographers can upload client media',
    'Photographers can view their client media'
  )
ORDER BY policyname;

-- Expected: zero policies using g.name and 16 Storage object policies.
-- The Storage object count can be nonzero after test uploads or data restoration.
SELECT
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects') AS storage_policy_count,
  (SELECT COUNT(*) FROM storage.objects) AS storage_object_count,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND (COALESCE(qual,'') LIKE '%g.name%' OR COALESCE(with_check,'') LIKE '%g.name%')) AS policies_still_using_g_name;
