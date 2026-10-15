# Application integration test checklist

**Snapshot: 15 October 2026.** This checklist records what was reported or verified during the disposable Recovery-Test exercise and what should be revisited before production. Checked items are **not** a certification of production readiness.

## A. Connections and authentication

- [x] Frontend Supabase URL/public key manually switched to Recovery-Test.
- [x] Express Supabase URL/public key manually switched to Recovery-Test.
- [x] Disposable account login and correct client linking worked.
- [x] Application pages/data were reported to load through Express.
- [ ] Add or verify a repeatable environment-isolation procedure for future developers; do not rely on manually swapped `.env` values.
- [ ] Audit other integrations and any service-role connections for accidental production targeting.
- [ ] Check live Stripe, email, calendar, background jobs and webhooks are disabled or sandboxed during future test runs.

## B. Database and Storage evidence

- [x] 24 public tables, 24 with RLS and 75 public policies confirmed by read-only SQL.
- [x] Six Auth users and six profiles (three photographers, three clients); no detected orphan/role mismatches.
- [x] Four Storage buckets and 16 object policies confirmed; no objects referencing missing buckets.
- [x] Private-gallery access checks: 30/30 passed across five publication/payment states.
- [x] Synthetic image cleanup: 1/1 passed; five synthetic database records removed; private media bucket empty.
- [ ] Replay the merged fresh-install SQL on an entirely new disposable project before relying on it for production recovery.

## C. Additional application testing (future work)

- [ ] Independently verify frontend and Express active project references at startup.
- [ ] Check representative public and authenticated API routes, including unauthorized and cross-tenant access.
- [ ] Run and document current backend automated tests and frontend build on the final submitted commit.
- [ ] Test controlled synthetic service/availability/booking/invoice/gallery workflows and clean up exact records.
- [ ] Test responsive UI, error handling, browser navigation and password recovery.
- [ ] Deploy and test Stripe Edge Functions with **test-mode** secrets, including webhook signature verification.
- [ ] Validate deployed `/api` routing, Supabase Auth redirect URLs and other external integrations before production.

## D. Record and release decision

- [ ] Record date, project reference, code commit, commands, outcomes and cleanup for each new test (no secrets).
- [ ] Confirm original data/media restoration requirements separately if planning a disaster recovery.
- [ ] Perform a reviewed security and deployment gate before any production cutover.

**Current decision:** retain the documented recovery files and completed test evidence; defer additional deployment and Stripe testing until a future production-readiness phase.
