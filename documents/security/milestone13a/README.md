# LensFlow — Milestone 13A security review package

**Status: candidate, NOT deployed.** Prepared from the uploaded current project ZIP and live public/private schema dump. No modifications to the React or Express code are required for this limited migration.

## Scope
- Make `profiles.user_id` and `profiles.role` immutable after INSERT.
- Make `clients.client_id`, `clients.user_id`, and `clients.photographer_id` immutable after INSERT.
- Make `photographer_profiles.photographer_id` and `.user_id` immutable after INSERT.
- Restrict direct client-record INSERT to an authenticated client with an existing `profiles.role='client'` and a published photographer.
- Preserve account signup, client/photographer profile editing, client notes, website publishing and business settings.

## Why triggers, not just RLS?
RLS UPDATE `USING` and `WITH CHECK` expressions cannot compare OLD vs NEW values. Existing policies permit users to update many profile columns. BEFORE UPDATE triggers enforce immutable identity fields even if a direct authenticated PostgREST request bypasses Express validation. SQL superusers/owners can deliberately change these rules; this is not a substitute for DB administrator security.

## Safe workflow
1. Save the original baseline unchanged. Run `01_preflight_readonly.sql` in existing project. Resolve any mismatches before applying the candidate.
2. Create a disposable Supabase project or local clean-room instance. Restore the baseline including prerequisites, then apply `02_13a_identity_hardening_REVIEW_ONLY.sql` **there first**.
3. Run `03_postflight_readonly.sql` there, and perform the authenticated positive/negative test matrix below using real separate user JWTs. Do not rely on SQL Editor postgres role for RLS testing.
4. Run existing API unit tests (`cd server && node --test tests/*.test.js`), plus browser registration and profile workflows against disposable project.
5. Only after clean-room tests pass, decide whether to deploy as a versioned migration; make a backup and plan a maintenance window. `04_rollback_REVIEW_ONLY.sql` restores the specific policy and drops these triggers, but does not undo any changes made while they were active.

## Required authenticated test matrix (disposable project)
| Actor / operation | Expected |
|---|---|
| Client inserts own `profiles` row with role client, then `clients` row linked to published photographer | Allow |
| Photographer inserts own `profiles` row with role photographer, then `photographer_profiles` row | Allow |
| Existing client changes `profiles.role` to photographer via PostgREST | Deny |
| Photographer changes linked client's `profiles.role` | Deny |
| Client changes own `clients.photographer_id` | Deny |
| Photographer changes a client's `clients.user_id` | Deny |
| Photographer changes own `photographer_profiles.user_id` | Deny |
| Client inserts client record pointing to unpublished photographer | Deny |
| Photographer-role user inserts a `clients` record | Deny |
| Client updates own name and phone | Allow |
| Photographer updates linked client name, email and phone | Allow |
| Photographer updates client notes | Allow |
| Photographer updates business name, slug and published status | Allow |
| Signup completion repeated without changing existing account association | Allow |

## Boundaries and remaining work
- Account type is intentionally user-selected during initial registration. A mutable `user_metadata.signup_type` is **not** a trusted authorisation source; 13A prevents *post-insert* role changes, but does not create an invitation/approval workflow for photographers. If photographer creation must be restricted, implement a trusted server-side approval mechanism.
- The photographer's ability to edit a linked client's `profiles.email` currently follows existing app behaviour, but does not itself change the Supabase Auth email. This needs a separate consistency/privacy decision.
- Additional hardening still needed: booking/invoice RLS, payment and Stripe metadata, Storage original downloads, media favourites, RPC EXECUTE grants, Edge Functions, and tenant isolation. No claim of complete security.
- The schema-only dump does not include Auth users, Storage bucket/object content, Edge Function source, secrets or sample data.
- Do not run `supabase db push`, `db reset --linked`, or the review SQL against production until explicitly approved.
