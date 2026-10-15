# Supabase Edge Functions — deployment and recovery

LensFlow stores five **Deno/TypeScript Supabase Edge Functions** for Stripe-related workflows. They are separate from the **PostgreSQL functions** created by the database SQL.

> **Status (15 October 2026):** All five source files are included in the repository. Their deployment to a new recovery project, webhook registration and end-to-end Stripe test-mode validation are **documented but deferred**. Do not treat source presence as proof of a working payment integration.

## Function inventory

| Function | Purpose | Source (from repository root) |
|---|---|---|
| `create-stripe-account` | Create a photographer Stripe connected account | `supabase/functions/create-stripe-account/index.ts` |
| `create-stripe-onboarding-link` | Generate a connected-account onboarding link | `supabase/functions/create-stripe-onboarding-link/index.ts` |
| `sync-stripe-account-status` | Refresh connected-account status | `supabase/functions/sync-stripe-account-status/index.ts` |
| `create-checkout-session` | Create an invoice Checkout session | `supabase/functions/create-checkout-session/index.ts` |
| `stripe-webhook` | Validate Stripe signatures and process payment events | `supabase/functions/stripe-webhook/index.ts` |

See [SOURCE_MANIFEST.md](SOURCE_MANIFEST.md) for the original archive paths and source hashes. No executable Edge Function source has been changed by this documentation update.

## Prerequisites for future deployment

1. Create and verify a **disposable** Supabase project with the LensFlow schema, PostgreSQL functions, RLS policies and Storage setup; see [database setup](../database-recovery/README.md).
2. Review the source, dependencies, Stripe API version, webhook event handlers and allowed browser origins for the target environment.
3. Configure **Stripe test-mode** credentials and a separate test webhook endpoint; do not reuse production Stripe credentials or customer data.
4. Verify the target project reference in the Supabase Dashboard and in each deployment command.
5. Review Supabase gateway JWT settings and the function's own authorization/signature checks.

## Runtime secrets

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Target Supabase project URL (typically supplied by hosted runtime) |
| `SUPABASE_ANON_KEY` | Public project key for authenticated user flows (where used) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged key; never expose to React |
| `STRIPE_SECRET_KEY` | **Stripe test-mode** API secret for recovery testing |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | Signing secret for the **matching test webhook endpoint** |

Check the exact variables consumed by each source file and the target project's runtime. Set external secrets through **Supabase Dashboard → Edge Functions → Secrets**, not through committed `.env` files.

## Deployment reference (not yet executed on Recovery-Test)

Install/authenticate the Supabase CLI and run the following from the repository root **only after confirming the project reference**:

```bash
npx supabase functions deploy create-stripe-account --project-ref YOUR_TEST_PROJECT_REF
npx supabase functions deploy create-stripe-onboarding-link --project-ref YOUR_TEST_PROJECT_REF
npx supabase functions deploy sync-stripe-account-status --project-ref YOUR_TEST_PROJECT_REF
npx supabase functions deploy create-checkout-session --project-ref YOUR_TEST_PROJECT_REF
npx supabase functions deploy stripe-webhook --project-ref YOUR_TEST_PROJECT_REF --no-verify-jwt
```

**Webhook exception:** Stripe's webhook requests do not carry a Supabase user JWT. The `stripe-webhook` gateway must permit the request through and the function must authenticate it by validating the raw-body `stripe-signature` header with `STRIPE_WEBHOOK_SIGNING_SECRET`. **Only** the webhook should use `--no-verify-jwt` in this documented flow; do not disable gateway verification for other functions without a separate security review.

Register the matching Stripe **test-mode** webhook URL:

```text
https://YOUR_TEST_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
```

Review the webhook's handled event types in its source and subscribe to those events in Stripe. A deployed function is not the same as a configured webhook.

## Required checks before production

- Confirm all five functions deploy and start on the intended Supabase project.
- Confirm CORS allows the correct development/deployment origins; `create-stripe-account` currently uses a wildcard origin and other functions include environment-specific hardcoded origins.
- Verify the Stripe API version and dependency compatibility; the account-creation source specifies `2026-07-29.dahlia`, and the webhook uses a floating `npm:stripe@^22` range.
- Confirm project-specific secrets, gateway JWT rules and webhook signature verification.
- Run unauthorized-call tests first, then test connected-account creation, onboarding, Checkout and webhook processing **using disposable records and Stripe test mode**.
- Verify invoices, payments and connected-account status in the database; record results and clean up synthetic records.
- Verify deployed frontend `/api` routing and callback/redirect URLs independently of the Edge Function deployment.

Use [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) to track future deployment steps.

## What is deliberately not claimed

The repository provides Edge Function **source and deployment instructions**. No claim is made that the functions have been deployed, Stripe accounts created, payments processed, or production integration approved. This work is deferred until a later release-readiness phase.

If `documents/stripe-webhook-index.ts` remains in the project, treat it as a historical reference; the intended deployment source is `supabase/functions/stripe-webhook/index.ts`.
