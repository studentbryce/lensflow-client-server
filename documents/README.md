# LensFlow — developer documentation

This folder is organised by **what a developer needs to do**, not by historical testing milestones.

## Start here

| Task | Document |
|---|---|
| Understand how to set up a new disposable database | [`database-recovery/README.md`](database-recovery/README.md) |
| Inspect the SQL files in setup order | [`database-recovery/setup/`](database-recovery/setup/) |
| Verify an existing or newly configured database | [`database-recovery/verify/`](database-recovery/verify/) |
| Deploy and configure Supabase Edge Functions | [`edge-functions/README.md`](edge-functions/README.md) |
| Plan restoration of real data and media | [`database-recovery/DATA_RESTORE_CHECKLIST.md`](database-recovery/DATA_RESTORE_CHECKLIST.md) |
| Test the React/Express app safely | [`application-testing/README.md`](application-testing/README.md) |
| Review the renamed files | [`FILE_CHANGES.md`](FILE_CHANGES.md) |

## Critical safety rules

1. **Never run setup scripts against the original LensFlow Supabase project.** Use a new, disposable project and verify its project reference in the dashboard. SQL alone cannot identify the Supabase project reliably.
2. Files containing `FRESH_DATABASE_ONLY` **modify the database**. They are not general-purpose patches and must not be rerun on an already configured project.
3. Files containing `READONLY` only inspect state; review unexpected results before proceeding.
4. The schema snapshot does not include original customer records, Auth identities, uploaded file bytes, Supabase project settings or Stripe credentials. Five Edge Function source files are supplied separately under `supabase/functions/`; they are not automatically deployed and no secrets are included.
5. Do not commit local environment files, passwords, service-role keys or payment secrets. Keep live email, Stripe and calendar actions disabled during testing.
6. The application currently points to the original Supabase project. **Do not start application integration or write tests** until both React and Express have independently been confirmed to use the disposable project.

## Current verification snapshot (15 October 2026)

The existing disposable recovery project has 24 public tables with RLS, 75 public policies, four Storage buckets, 16 Storage object policies, six Auth users and six profiles (three photographers and three clients). The tested private-gallery access sequence passed 30/30 checks, plus one cleanup check. Temporary gallery fixtures were removed. The public portfolio bucket contains one empty-folder placeholder.

**These are historical observations, not a guarantee that a new project will have the same state.** The original business data and media have not been restored, and application integration testing has not begun.

`stripe-webhook-index.ts` is a retained historical source reference; the newly supplied deployable function is `supabase/functions/stripe-webhook/index.ts`. Compare them before removing the reference or assuming which revision is deployed.
