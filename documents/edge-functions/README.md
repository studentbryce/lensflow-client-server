# Supabase Edge Functions — setup and recovery

**Start here after creating and verifying the LensFlow database and Storage policies.**

These are **Deno/TypeScript Edge Functions** deployed to Supabase Functions, **not PostgreSQL functions** and **not SQL migrations**. They must be deployed separately. This package contains source code only; it does not include deployment credentials, Stripe secrets, webhook registrations or proof of live deployment.

## Source location

The five uploaded function sources are preserved byte-for-byte at:

- `supabase/functions/create-stripe-account/index.ts` — create a photographer Stripe connected account
- `supabase/functions/create-stripe-onboarding-link/index.ts` — generate a Stripe onboarding link
- `supabase/functions/sync-stripe-account-status/index.ts` — refresh the account's Stripe status
- `supabase/functions/create-checkout-session/index.ts` — create a Checkout session for an invoice
- `supabase/functions/stripe-webhook/index.ts` — verify and process Stripe events

All paths above are relative to the **repository root**. See `SOURCE_MANIFEST.md` for source mapping and SHA-256 hashes.

## Prerequisites and safety

1. Create and validate a **new disposable Supabase project**. Verify its project reference in the Dashboard. Do not target the original LensFlow project.
2. Complete the SQL setup and database/Storage verification. These functions depend on tables such as `photographer_profiles`, `photographer_stripe_accounts`, `clients`, `invoices`, and `payments`.
3. Review the source before deployment: some functions have hardcoded frontend origins (`https://lensflow-lac.vercel.app`, localhost 5173 and 127.0.0.1:5173). These are **not a general environment configuration**; adjust/review them for the target environment. Do not accidentally route test payments to a production frontend.
4. Use **Stripe test-mode** API credentials, test accounts and a distinct **test webhook signing secret**. Never reuse production Stripe secrets in Recovery-Test.
5. Do not run account creation, Checkout or payment webhooks merely to check that a deployment succeeded. These can create Stripe resources and update database records. Use non-mutating checks first, then controlled disposable integration tests.
6. Never commit keys, webhook secrets, service-role credentials or local `.env` files. Supabase's built-in project variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are expected by the functions; check the target project's actual runtime settings.

## Secrets / environment variables

| Variable | Used by | Handling |
|---|---|---|
| `SUPABASE_URL` | All five | Supabase project runtime configuration |
| `SUPABASE_ANON_KEY` | Four user-invoked functions (not webhook) | Supabase project runtime configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | All five | Server-side only; never expose to React |
| `STRIPE_SECRET_KEY` | All five | **Stripe test-mode key for disposable project** |
| `STRIPE_WEBHOOK_SIGNING_SECRET` | `stripe-webhook` | Signing secret for the exact test endpoint |

Set Stripe secrets in **Supabase Dashboard → Edge Functions → Secrets** for the **verified disposable project**. Do not place secrets in this repository or paste them into chat.

## Deploying to a NEW disposable project (manual, not yet tested)

The Supabase CLI must be installed and authenticated. From the repository root, check the target project reference first. The following commands are a **deployment plan**, not commands to run during the read-only database verification stage:

```bash
supabase functions deploy create-stripe-account --project-ref YOUR_TEST_PROJECT_REF
supabase functions deploy create-stripe-onboarding-link --project-ref YOUR_TEST_PROJECT_REF
supabase functions deploy sync-stripe-account-status --project-ref YOUR_TEST_PROJECT_REF
supabase functions deploy create-checkout-session --project-ref YOUR_TEST_PROJECT_REF
supabase functions deploy stripe-webhook --project-ref YOUR_TEST_PROJECT_REF --no-verify-jwt
```

**Webhook exception:** `stripe-webhook` must accept Stripe's unauthenticated HTTP request at the Supabase gateway. Disable Supabase JWT verification **for this function only**; its code verifies the `stripe-signature` header against `STRIPE_WEBHOOK_SIGNING_SECRET` using the raw body. Do not disable JWT verification for the other functions as a shortcut. Review project-specific Supabase JWT configuration before deployment.

Configure a **Stripe test-mode webhook endpoint** for the test project URL:

`https://YOUR_TEST_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`

Subscribe only to the event types actually handled by the code (review the event switch). Copy the **test endpoint's** signing secret into the test project's Edge Function secrets. Registering a webhook and deploying functions are separate operations. Do not register a production webhook for the disposable environment.

## Verification and testing

1. Check **Supabase Dashboard → Edge Functions** (or `supabase functions list --project-ref YOUR_TEST_PROJECT_REF`) for all five names and their deployment status.
2. Confirm only the webhook has gateway JWT verification disabled, and confirm the other functions' authentication configuration.
3. Check that the runtime has the required secret **names**, without printing values.
4. Review CORS allowed origins, test-only Stripe credentials, webhook URL, API versions and dependency compatibility.
5. Perform a non-mutating negative test for unauthorized calls to user-invoked functions. Only after the environment is isolated, test Stripe account creation, Checkout and webhook processing with disposable records and **Stripe test mode**.
6. Verify `payments`, `invoices`, and account status changes; clean up disposable database records. Stripe-side test resources may require separate cleanup or can remain as isolated test data.

## Important source review findings

- `create-stripe-account` currently sends `Access-Control-Allow-Origin: *`, unlike the other browser-invoked functions' origin allowlists. Its user JWT is checked in code, but CORS policy should still be reviewed.
- The account-creation function explicitly specifies Stripe API version `2026-07-29.dahlia`. Verify compatibility with the test Stripe account and SDK/API behaviour before deployment.
- `stripe-webhook` imports `npm:stripe@^22` (a floating major-version range); consider pinning exact tested dependency versions in a future reviewed change.
- The original ZIP's `source/` subfolders have been normalized for Supabase CLI deployment. No executable source code was edited.
- The standalone `documents/stripe-webhook-index.ts` is an older retained reference; do not deploy it instead of the supplied `supabase/functions/stripe-webhook/index.ts` without a deliberate comparison.

## Status

**Packaged, not deployed or runtime-tested.** Do not interpret this source inventory as proof that the functions will work against a newly created project. Database/Storage validation and Stripe integration validation are separate gates.
