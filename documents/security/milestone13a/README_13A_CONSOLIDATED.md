# LensFlow Milestone 13A — consolidated migration candidate and regression gate

## Current evidence (user-reported, TEST project)
- Baseline schema restore: 24 tables, 24 RLS-enabled, 75 policies, 16 original functions.
- Identity and ownership checks: 11/11 PASS under authenticated test sessions.
- Registration checks: 10/10 PASS (3 before recursion hotfix, 7 after).
- The original 02 migration alone caused `42P17` infinite RLS recursion; 05 hotfix resolved it.
- Production remains unchanged.

## What this package is
`supabase/migrations/20261015_13a_identity_registration_hardening.sql` combines the exact
identity guard approach from 02 with the recursion-safe registration policy from 05.
It is a **candidate for future clean-room replay and code review**; it is **NOT a new migration to
apply to the current TEST project**, where both stages have already been installed.
Keep the original 02 and 05 scripts as audit evidence; do not deploy 02 alone.

### Safety
- Never run against production without confirming project ID, fresh backup, peer review,
  production-safe rollout, and app regression sign-off.
- For a new disposable test project: restore baseline, then apply the consolidated migration
  once as a single transaction from a trusted postgres admin session.
- Confirm the SECURITY DEFINER function owner can bypass RLS; review its EXECUTE grants.
- This is not a full recovery backup: Auth users, Storage buckets/objects/policies,
  Edge Functions, secrets, and data need separate recovery steps.

## Next: automated application regression (run from your existing LensFlow checkout)
The ZIP project contains Node built-in test files in `server/tests/`, and root scripts
`build` and `lint` (the server package does not define an `npm test` script).

In Git Bash:

```bash
cd server
node --test
cd ..
npm run build
npm run lint
```

If dependencies are not installed, run `npm ci` in both the root and `server/`
first. Do not run `npm run dev` against the recovery test project until you have
separate test-only `.env` configuration for BOTH frontend and server.

`node --test` primarily runs mocked/unit API tests; it does NOT prove end-to-end
integration with Supabase or that Storage and Edge Functions are restored.

## Browser smoke-test checklist (TEST environment only)
- [ ] Test photographer signs in and opens dashboard, profile, and settings
- [ ] Photographer edits their own contact details and business settings
- [ ] Photographer views linked client and edits client contact info/notes
- [ ] Test client signs in, views profile, and edits own name/phone
- [ ] Published photographer public page loads
- [ ] New client signup with published photographer succeeds
- [ ] New client signup with unpublished photographer is rejected
- [ ] Browser and Express API do not return unexpected 403, 42501, or 42P17 errors
- [ ] Record any Storage, payments, galleries, calendar, or Edge Function failures
      separately as NOT YET RESTORED; do not confuse with 13A regression

Use fresh synthetic accounts for any repeat registration tests. The earlier
registration script is stateful; do not rerun it against its existing fixtures.

## Read-only postflight
`documents/security/milestone13a/07_postflight_consolidated_readonly.sql`

## Next decision
Once automated tests and the focused browser smoke test pass, we can mark 13A
as regression-tested in the disposable project. Production deployment still
requires separate approval, rollback review, and a backup/restore plan.
