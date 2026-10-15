# Application integration test checklist

**Status: NOT STARTED.** Target: disposable Supabase project only.

## A. Connection safety — no application writes

- [ ] Back up or commit the current working app; keep `.env` secrets outside Git.
- [ ] Locate frontend Supabase initialization and its environment variable names.
- [ ] Locate Express Supabase initialization and its environment variable names.
- [ ] Find any service-role client, webhook, background job, email sender or calendar/Stripe integration.
- [ ] Create local test-only configuration without overwriting production settings.
- [ ] Check frontend and Express project refs against the **same disposable project** in the Supabase dashboard.
- [ ] Confirm neither process loads original project credentials or live external integration secrets.
- [ ] Disable/sandbox Stripe, email, calendar and other side effects.
- [ ] Confirm a safe command to start **only** test-configured processes.
- [ ] STOP if any connection target or external side effect is uncertain.

## B. Read-only smoke tests — after A passes

- [ ] Public pages render without creating records.
- [ ] Express health/API endpoint responds; its database target is confirmed.
- [ ] Disposable photographer signs in and sees only their own records.
- [ ] Disposable client signs in and sees only their own records.
- [ ] Unauthenticated and cross-tenant access to private data is denied.
- [ ] Browser and server logs have no unexplained errors.

## C. Synthetic write tests — approve separately

- [ ] Agree on exact test records, ownership and cleanup SQL first.
- [ ] Test service, availability and booking workflows with disposable accounts.
- [ ] Verify row ownership and RLS isolation.
- [ ] Clean up the exact synthetic records and re-run read-only checks.
- [ ] Do not trigger real payments, customer messages or calendar events.

## D. Record evidence

- [ ] Record date, project reference, app commit, commands, test outcomes and cleanup status (never keys/passwords).
- [ ] Identify any missing original data, media, Auth settings, Edge Functions and external integrations.
- [ ] Do not approve production cutover based only on disposable smoke tests.
