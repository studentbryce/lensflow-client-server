# LensFlow

**LensFlow** is a web-based photography business management application. It provides separate photographer and client portals for managing bookings, services, invoices, galleries, messaging, reviews and public photographer websites.

This repository contains a **React/Vite frontend**, a **Node.js/Express REST API**, Supabase database/Auth/Storage configuration and the source of five **Supabase Edge Functions** used for Stripe integration.

> **Project status (15 October 2026):** Core application pages and authenticated test-account workflows have been exercised against a disposable Supabase recovery project. Database structure, RLS, Storage configuration and private-gallery permissions have also been tested. This is **not** a production-readiness certification. The Edge Functions are stored in the repository, but their deployment and end-to-end Stripe testing are deferred.

## Features

**Photographer portal** (`/photographer`): dashboard, bookings, calendar, client management, services, invoices, galleries and portfolio, website builder, messages, reviews and settings.

**Client portal** (`/client`): dashboard, bookings, invoices, galleries, messages, reviews and profile.

**Public pages**: login, account registration, password reset and photographer websites at `/:photographerSlug`.

These are routes/components present in the source. The presence of a page does not mean every related external integration has been fully validated.

## Architecture

```text
Browser: React + Vite
    |-- Supabase Auth (login/session)
    |-- Supabase Storage (where used by the UI)
    `-- /api/*  [HTTP/JSON + authenticated access token]
          |
          v
      Express REST API (port 3001 locally)
      routes -> controllers -> services
          |
          v
      Supabase PostgreSQL + Row Level Security

Supabase Edge Functions (separately deployed)
    `-- Stripe Connect / Checkout / webhook processing
```

The Express API uses the request user's verified access token for ordinary data access, so Supabase RLS remains in effect. Public API reads use an anonymous Supabase client. Do **not** substitute a service-role key for ordinary frontend or Express CRUD requests.

## Requirements

- Node.js and npm compatible with the versions required by the project's dependencies (check `package.json` and `server/package.json`).
- A Supabase project configured with the LensFlow schema, RLS policies and Storage buckets.
- Separate frontend and backend environment variables for that **same** Supabase project.
- Stripe credentials **only if** deploying and testing the payment Edge Functions.

## Local development

### 1. Frontend environment

Create an untracked `.env.local` in the repository root:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PROJECT_ANON_OR_PUBLISHABLE_KEY
```

Only use the public client key in Vite. **Never put a Supabase service-role/secret key or Stripe secret in a `VITE_` variable.**

### 2. Express environment

Copy `server/.env.example` to `server/.env` and set:

```dotenv
PORT=3001
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PROJECT_ANON_OR_PUBLISHABLE_KEY
```

Use the same project reference as the frontend. The backend reads `server/.env` when started from the `server` directory. Do not commit real credentials.

### 3. Install dependencies and start both processes

Terminal A, from the repository root:

```bash
npm install
npm run dev
```

Terminal B:

```bash
cd server
npm install
npm run dev
```

The Vite development server proxies `/api` to `http://localhost:3001` (see `vite.config.js`). Open the local URL printed by Vite. A basic API process check is `http://localhost:3001/api/health`; this endpoint alone does **not** verify database connectivity.

### 4. Build and tests

From the repository root:

```bash
npm run build
npm run lint
```

From `server/`:

```bash
node --test
```

`npm run lint` is an available diagnostic command, **not a claim that the current lint run is clean**. The backend package currently has no `npm test` script. Review actual command output before recording a pass.

## Repository layout

```text
src/                    React pages, layouts, components, Auth context and API clients
public/                 Public frontend assets
server/src/             Express routes, controllers, services, middleware and config
server/tests/           Backend automated tests
supabase/functions/     Five Stripe-related Edge Function sources
supabase/config.toml    Supabase CLI configuration (review for your environment)
documents/              Developer setup, recovery and test documentation
```

## Database setup and recovery

Start with [the developer documentation](documents/README.md), then follow [the database setup guide](documents/database-recovery/README.md). The recovery scripts include PostgreSQL functions, identity protection, RLS policies and Storage configuration; the Stripe Edge Functions require a **separate deployment**.

**Important:** The setup SQL is intended for a **fresh disposable Supabase project**, not as a patch to an existing production database. A schema-only setup does not restore customer data, Auth identities, original uploaded media or external-service secrets.

## Edge Functions and Stripe

Source code is under `supabase/functions/` for:

- `create-stripe-account`
- `create-stripe-onboarding-link`
- `sync-stripe-account-status`
- `create-checkout-session`
- `stripe-webhook`

See [Edge Function deployment documentation](documents/edge-functions/README.md). **Source is preserved, but deployment and Stripe test-mode validation remain future work.** Do not assume payments work in a newly restored project until those steps are completed.

## Verification status

As of **15 October 2026**, the disposable recovery environment was reported/observed to have:

| Area | Evidence and scope |
|---|---|
| Database structure | 24 public tables; RLS enabled on all 24; 75 public policies |
| Identity relationships | 6 Auth users/identities and 6 application profiles (3 photographers, 3 clients); no detected orphaned profiles or role mismatches |
| Storage | 4 buckets and 16 Storage object policies; no objects referencing missing buckets |
| Private gallery access | 30/30 positive/negative checks across five payment/publication states; 1/1 synthetic-file cleanup check |
| Fixture cleanup | Synthetic records and private test image removed; a harmless public portfolio folder placeholder remains |
| Application connectivity | User-confirmed React and Express use the disposable project; test-account login and client linking work; application pages/data load through Express |
| Not completed | Fresh replay of the combined setup package, full Edge Function deployment/Stripe testing, original customer/media restore, production deployment validation |

The application-connection observations were supplied during manual testing; they are **not** an independently audited production environment. Consult [application testing](documents/application-testing/README.md) before running additional tests.

## Deployment caution

The Vite development proxy is **development-only**. `vercel.json` currently defines a catch-all SPA rewrite; verify that deployed `/api` requests reach the actual Express backend before a production release. Also review Supabase Auth redirect URLs, Storage policies, Stripe test/live separation and Edge Function origins/secrets.

## Documentation

- [Developer documentation index](documents/README.md)
- [Fresh database setup and verification](documents/database-recovery/README.md)
- [Data and media restoration checklist](documents/database-recovery/DATA_RESTORE_CHECKLIST.md)
- [Supabase Edge Function deployment](documents/edge-functions/README.md)
- [Application integration and testing](documents/application-testing/README.md)
