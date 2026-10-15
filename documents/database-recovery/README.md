# Create and validate a new LensFlow database

This is a **guided setup reference for a new disposable Supabase project**, not a one-click restore. The SQL files have descriptive names and must be reviewed before execution.

## Workflow

| Order | File / action | Type | Expected outcome |
|---|---|---|---|
| 1 | Create a NEW disposable Supabase project; record its project ref | Manual | Original project untouched |
| 2 | `verify/01_environment_READONLY.sql` | Read only | Confirm project and inspect existing state; project ref must also be checked in dashboard |
| 3 | `setup/01_schema_baseline_FRESH_DATABASE_ONLY.sql` | **Write** | Core LensFlow schema, RLS and functions created |
| 4 | `setup/02_identity_protection_FRESH_DATABASE_ONLY.sql` | **Write** | Identity guards and recursion-safe registration logic applied |
| 5 | `setup/03_storage_buckets_FRESH_DATABASE_ONLY.sql` | **Write** | Four expected Storage buckets created |
| 6 | `setup/04_storage_policies_FRESH_DATABASE_ONLY.sql` | **Write** | Sixteen Storage object policies created |
| 7 | Run `verify/02_...sql` through `verify/05_...sql` | Read only | Review structure, identity, bucket and policy checks |
| 8 | Perform authenticated positive and negative API/Storage tests | Manual | Verify enforcement, not merely policy presence |
| 9 | Review `../edge-functions/README.md`; configure and deploy five Edge Functions separately, using Stripe test-mode credentials | **External deployment, not SQL** | Payment integration available only after verified deployment |
| 10 | Follow `DATA_RESTORE_CHECKLIST.md` if original data must be recovered | Separate reviewed process | Data, Auth and media handled deliberately |
| 11 | Follow `../application-testing/README.md` | Staged tests | App connections and workflows validated without touching original |

## Important limitations

- `01_schema_baseline` is a **schema snapshot**, not an idempotent patch. It has not been revalidated against every new Supabase platform version; review dependencies, privileges, extensions and generated objects.
- `02_identity_protection` was previously used for a disposable baseline recovery, but its SQL object names retain legacy suffixes because those are real database identifiers. **Do not rename SQL identifiers merely to improve file names.**
- `04_storage_policies` merges the previously used Storage policy definitions with their path-qualification correction into one clean-install file. The individual policy behaviour was tested, but **this merged file has not been independently replay-tested end-to-end**. It is a candidate for fresh-disposable-project validation, not an approved production migration.
- Existing databases with tables, buckets, policies or data are **not** valid targets for blindly replaying these files. Use a reviewed migration/backup strategy instead.
- The original Auth accounts, business records, uploaded media, provider settings and external integration secrets are **not** included here. Five Edge Function **source files** are included under `../../supabase/functions/` but are **not deployed** by running the SQL.

## Expected structural verification after setup

- 24 public tables; all 24 RLS enabled
- 75 public RLS policies
- 3 identity-protection triggers
- 4 Storage buckets and 16 Storage object policies
- 0 public tables without RLS; 0 unvalidated public foreign keys

Counts are smoke checks, not proof of security. Review SQL function ownership and `SECURITY DEFINER` settings, and run authenticated cross-tenant tests before using any environment for real data.
