# Create and verify a LensFlow Supabase database

This folder contains a **guided, schema-first setup** for a new disposable Supabase project. It is not an automated production restore, and the SQL is not intended to be rerun against an existing LensFlow database.

> **Status (15 October 2026):** The recovery environment has passed structural, identity and Storage verification. The consolidated setup files have **not** all been replayed as one complete installer on an entirely fresh project; in particular, the merged Storage policy setup needs an independent fresh-project test before it is approved for production recovery.

## What this setup contains

- PostgreSQL tables, relationships, indexes, database functions and RLS policies.
- Identity-protection functions/triggers.
- Four Storage buckets and their object access policies.
- Read-only checks to inspect the resulting configuration.

**Not included in SQL:** original Auth identities, customer/business records, uploaded file bytes, project-specific Auth settings, Stripe credentials, webhook registration or deployment of the five Edge Functions. See [data restore checklist](DATA_RESTORE_CHECKLIST.md) and [Edge Function guide](../edge-functions/README.md).

## Setup order (new disposable project only)

| Step | Action | Type |
|---|---|---|
| 1 | Create a **new** Supabase project; verify its project reference in the Dashboard | Manual |
| 2 | Run `verify/01_environment_READONLY.sql` and inspect existing objects | Read-only |
| 3 | Review and run `setup/01_schema_baseline_FRESH_DATABASE_ONLY.sql` | **Modifies database** |
| 4 | Review and run `setup/02_identity_protection_FRESH_DATABASE_ONLY.sql` | **Modifies database** |
| 5 | Review and run `setup/03_storage_buckets_FRESH_DATABASE_ONLY.sql` | **Modifies Storage configuration** |
| 6 | Review and run `setup/04_storage_policies_FRESH_DATABASE_ONLY.sql` | **Modifies Storage policies** |
| 7 | Run `verify/02_structure_and_security_READONLY.sql` | Read-only |
| 8 | Run `verify/03_identity_and_relationships_READONLY.sql` | Read-only |
| 9 | Run `verify/04_storage_readiness_READONLY.sql` | Read-only |
| 10 | Run `verify/05_gallery_policy_paths_READONLY.sql` | Read-only |
| 11 | Create disposable Auth users and perform authenticated positive/negative tests | Manual, controlled writes |
| 12 | Deploy Edge Functions **separately**, only if Stripe integration is required | External deployment |

A new empty project will not have the same Auth-user counts as the previously tested recovery project. Review expected outcomes in context; do not try to force historical row counts into a new installation.

## Expected structural checks

The tested configuration contained:

| Component | Expected reference count |
|---|---:|
| Public tables | 24 |
| Public tables with RLS | 24 |
| Public RLS policies | 75 |
| Identity-protection triggers | 3 |
| Storage buckets | 4 |
| Storage object policies | 16 |
| Public tables without RLS | 0 |
| Unvalidated public foreign keys | 0 |

These counts are **sanity checks**, not a substitute for examining function privileges, policy expressions, ownership or authenticated cross-tenant behaviour. A successful query is not proof that the complete fresh setup has been replay-tested.

## Important SQL cautions

- `01_schema_baseline_FRESH_DATABASE_ONLY.sql` is a snapshot, not an idempotent migration. Review dependencies and compatibility with the target Supabase/PostgreSQL version.
- PostgreSQL **functions are already part of the schema setup**. They are distinct from the five Deno/TypeScript Supabase Edge Functions in `../../supabase/functions/`.
- `02_identity_protection_FRESH_DATABASE_ONLY.sql` includes real SQL identifiers with historical suffixes. Renaming them without a reviewed migration could break references; descriptive filenames do not require changing database object names.
- `04_storage_policies_FRESH_DATABASE_ONLY.sql` combines policy definitions with an earlier path-qualification correction. The tested policy behaviour passed, but the **combined installer has not been independently replay-tested**.
- For an existing database, use a separately reviewed migration or backup/restore procedure; do not rerun the fresh-install scripts.

## Verified recovery-test evidence (15 October 2026)

- Structure: 24/24 public tables RLS enabled, 75 public policies, three identity triggers, four buckets, 16 Storage policies; no unvalidated public foreign keys.
- Identity: six Auth users and six profiles (three photographers, three clients); zero detected orphaned or role-mismatched records.
- Storage: bucket limits/MIME types matched the expected configuration; zero objects with nonexistent buckets.
- Private gallery: 30/30 access checks across unpublished, unpaid and paid states, plus one successful synthetic-file cleanup check. The five disposable database records were subsequently removed.
- Application: frontend and Express connectivity, test-account login and client linking were reported working against Recovery-Test.

**Still outstanding:** replay validation of the combined setup, original data/media restoration, Edge Function deployment/Stripe integration, and full production readiness testing. These are documented future steps, not prerequisites for retaining the recovery source files in the capstone repository.
