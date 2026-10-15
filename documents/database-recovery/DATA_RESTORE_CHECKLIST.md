# Restoring data and files — separate from schema setup

**Status: NOT STARTED.** Creating tables and Storage buckets does not restore application data.

## Before restoring anything

- [ ] Confirm the target is a disposable project, not the original LensFlow project.
- [ ] Confirm a current, authorized export/backup and its scope; do not assume the schema snapshot contains data.
- [ ] Decide whether restoring personal/customer information is necessary. Prefer synthetic data for testing.
- [ ] Verify schema compatibility, migration history, RLS and foreign keys.
- [ ] Agree on a rollback and cleanup plan before importing records or files.

## Separate recovery components

- [ ] **Auth:** users, identities, provider configuration, redirect URLs, token/session implications.
- [ ] **Application records:** profiles, photographers, clients, bookings, services, invoices, payments and dependent tables, preserving ownership relationships.
- [ ] **Storage:** metadata, file bytes, object paths, MIME types, access policies; verify actual downloads after import.
- [ ] **Supabase project settings:** extensions, secrets, database functions, Edge Functions, scheduled jobs, auth email configuration.
- [ ] **External integrations:** Stripe, webhooks, email and calendar connections; use sandbox/test credentials.
- [ ] **Post-restore checks:** referential integrity, role isolation, client gallery access and application smoke tests.

## Known gap

The earlier original-project inventory showed 26 Storage objects, while the disposable recovery project has only a placeholder in its public portfolio bucket. **The original media bytes have not been restored.** No original business records or original Auth identities have been restored to the disposable environment.

Do not interpret successful structural verification as approval for a production cutover.
