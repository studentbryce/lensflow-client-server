# LensFlow developer documentation

This directory groups instructions by **developer workflow**, rather than by historical project milestones. Start with the [project README](../README.md) for architecture and local setup.

## Find the right guide

| Goal | Guide |
|---|---|
| Create a new disposable Supabase database | [Database setup and recovery](database-recovery/README.md) |
| Run schema and Storage verification SQL | [Read-only verification scripts](database-recovery/verify/) |
| Understand original data and media restoration | [Data restoration checklist](database-recovery/DATA_RESTORE_CHECKLIST.md) |
| Deploy the Stripe-related Supabase Edge Functions | [Edge Function setup](edge-functions/README.md) |
| Review deployment gates for Edge Functions | [Edge Function deployment checklist](edge-functions/DEPLOYMENT_CHECKLIST.md) |
| Check React/Express connectivity and test workflows | [Application testing](application-testing/README.md) |

## What is included

- `database-recovery/setup/` — **database-modifying** SQL for a *fresh* disposable project, including PostgreSQL functions, identity guards, RLS, buckets and Storage policies.
- `database-recovery/verify/` — read-only inspection scripts; compare results against expectations and investigate differences.
- `edge-functions/` — instructions and source manifest. The executable Edge Function source lives in the repository-root `supabase/functions/` directory.
- `application-testing/` — staged checklist for safe frontend/backend verification.

## Verified work (15 October 2026)

A disposable Supabase recovery project was used to validate:

- 24 public tables with RLS, 75 public policies, three identity-protection triggers, four Storage buckets and 16 Storage object policies.
- Six test Auth identities with six application profiles (three photographers and three clients), with no detected orphan or role-link errors.
- Private gallery permissions through five publication/payment states: **30/30 access checks passed**, plus **1/1 synthetic image cleanup check**.
- Removal of five synthetic business records and the private test image after testing.
- React/Express application connectivity and login/client linking against the disposable project (**user-confirmed**); application pages and data were reported to load through Express.

The disposable project contains test identities, not a restored copy of original customer records. Original media bytes have not been restored. The remaining public portfolio placeholder is not a customer image.

## Work documented but deferred

- Independently replaying the consolidated setup SQL, including the merged Storage policy installer, on a completely fresh project.
- Deploying and integration-testing the five Supabase Edge Functions with Stripe **test-mode** secrets.
- Restoring original Auth users, business records and Storage files, if a full disaster recovery is ever required.
- Production deployment checks, full end-to-end payment testing and additional security regression testing.

The current repository therefore provides a **documented recovery procedure and tested components**, not a claim of complete production disaster recovery.

## Safety rules

1. **Check the Supabase project reference in the Dashboard** before any write or deployment. SQL's `current_database()` value is not proof of which hosted project is selected.
2. Run `FRESH_DATABASE_ONLY` SQL **only** on a new, reviewed disposable project. Never blindly replay it against an existing application database.
3. Treat `READONLY` scripts as inspection tools; a successful query does not by itself prove access-control enforcement.
4. Keep original database credentials, service-role keys, Stripe secrets and personal data out of the repository and test logs.
5. The developer's current local environment may have been manually switched to Recovery-Test. **Do not infer the active target from this README**; verify both frontend and Express environment variables before running any writes.
6. Edge Function source files are not automatically deployed by database SQL. Review Stripe credentials, webhook signatures, CORS and JWT gateway settings before any deployment.

The separate file `stripe-webhook-index.ts`, if still present in `documents/`, is a historical duplicate/reference. The intended deployable source is `../supabase/functions/stripe-webhook/index.ts`. It can be archived after confirming no tooling references it.
