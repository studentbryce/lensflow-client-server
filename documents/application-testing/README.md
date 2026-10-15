# LensFlow application integration testing

This guide explains how to verify the React frontend and Express backend against an **isolated Supabase project**. It is intended for maintainers who need to repeat or extend testing; it does not require completing every optional test before working on the application.

## What has already been checked (15 October 2026)

- The developer manually switched the React and Express Supabase URL/client-key settings to the disposable Recovery-Test project.
- Login with disposable test accounts worked and client-account relationships were linked correctly.
- The developer reported that application pages and data were loading through the Express server.
- Independent SQL checks found six Auth users/identities and six profiles, with no orphaned or role-mismatched photographer/client records.
- Separate authenticated Storage tests passed **30/30** private gallery access checks, followed by **1/1** image cleanup check and verified fixture deletion.

These are **user-reported application smoke tests plus separately verified database/Storage results**. They do not prove every route or external integration has been end-to-end tested.

## Safe setup for a future test run

1. Commit or back up the working code and confirm the intended Supabase project reference in its Dashboard.
2. Check the frontend `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Check `server/.env`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT`.
4. Verify **both URLs use the same disposable project**. Do not rely on a previous developer's last-used `.env` values.
5. Review other connection strings, service-role credentials, Edge Functions, email, calendar and Stripe configuration before running anything that writes data or calls external services.
6. Start the Express server from `server/` (`npm run dev`), then the Vite frontend from the repository root (`npm run dev`).
7. Check `/api/health` for process availability and inspect a safe authenticated `/api/...` request to confirm actual database connectivity. `/api/health` alone is not a database check.
8. Use disposable photographer/client accounts to test page loading, navigation, ownership and error handling. Only run controlled write tests with a clear cleanup plan.

The Vite `/api` proxy works in local development. Verify production API routing separately before deployment.

## Tests not yet completed / deferred

- A comprehensive application-wide route-by-route regression pass.
- Fully isolated service, availability, booking, invoice and gallery end-to-end write flows after the latest recovery documentation changes.
- Stripe Edge Function deployment, Checkout, connected-account onboarding and webhook processing.
- Production hosting configuration, Auth redirect URLs, email/calendar side effects and live payment readiness.

Use [the detailed checklist](APPLICATION_TEST_CHECKLIST.md) when resuming testing. The checklist distinguishes already observed evidence from work that remains open.

## Record new evidence

For each future test, note the date, application commit, **project reference (not keys)**, test user roles, command or page, expected/actual result and cleanup status. Never store credentials or customer personal information in test reports.
