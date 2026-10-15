# Edge Function deployment checklist (new disposable project)

This is a **manual, safety-gated** checklist. Do not use it to deploy to the original LensFlow project.

- [ ] Database schema, functions, RLS and Storage verification passed
- [ ] Disposable project ref checked in Supabase Dashboard
- [ ] Frontend/backend production connections remain untouched
- [ ] Five Edge Function source files reviewed and confirmed correct
- [ ] Browser allowed origins reviewed for the test environment
- [ ] Stripe **test-mode** secret key configured on the disposable project
- [ ] Project-scoped Supabase runtime variables available
- [ ] Functions deployed **to disposable project only**
- [ ] Stripe webhook deployed with JWT verification disabled **only for webhook**
- [ ] Stripe test webhook endpoint registered for the disposable project's exact URL
- [ ] Matching Stripe **test webhook** signing secret configured
- [ ] Function inventory and gateway JWT settings checked
- [ ] Negative authentication checks passed before any payment actions
- [ ] Only then: approved disposable Stripe test account, Checkout and webhook tests
- [ ] Record test outcomes and clean up disposable database records

**Never copy production Stripe API keys, webhook signing secrets or live payment data into Recovery-Test.**
