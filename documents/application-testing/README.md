# Test LensFlow against a disposable database

The React frontend and Express backend currently use the original Supabase project. **Do not run integration tests until both are switched to an isolated test configuration.**

1. Inspect the actual frontend and backend environment variable names and Supabase client creation paths.
2. Create **separate, local, uncommitted** test-only configuration files. Keep the original `.env` files unchanged.
3. Confirm the frontend and Express Supabase project references **both** match the disposable project's dashboard reference.
4. Disable or sandbox live Stripe, email, calendar, webhook and background-job side effects.
5. Run read-only smoke tests first; approve synthetic writes only after those pass.
6. Verify and clean up synthetic records, then document the results.

Use [`APPLICATION_TEST_CHECKLIST.md`](APPLICATION_TEST_CHECKLIST.md) for the detailed checklist.
