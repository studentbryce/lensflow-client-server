# LensFlow

**LensFlow** is a full-stack, web-based photography business management application designed to help independent photographers manage their business operations through a centralised platform.

The application provides separate photographer and client portals for managing bookings, calendar availability, services, invoices, payments, galleries, messaging, reviews and public photographer websites.

**Project:** COMP.7214 Client-Server Web Development — Assignment 3  
**Version:** LensFlow V1  
**Status:** Completed and deployed for academic assessment — November 2026  
**Developer:** Bryce Milbank

> **Project scope:** LensFlow V1 is a functioning academic project demonstrating full-stack client-server development, REST API integration, relational database management, authentication and access controls. It is not certified for commercial production use.

---

## 1. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, React Router |
| Backend | Node.js, Express REST API |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Media Storage | Supabase Storage |
| Payments | Stripe Checkout and Connect (test mode) |
| Frontend Hosting | Vercel |
| Backend Hosting | Vercel |
| Testing | Node.js test runner, Postman, browser Developer Tools |

PostgreSQL was used instead of MongoDB with tutor approval during Assignment 2.

## 2. Features

### Photographer Portal

The photographer portal provides tools for managing business operations.

- Dashboard and business overview
- Photography service and package management
- Booking and calendar management
- Availability rules and exceptions
- Client management
- Invoice and payment management
- Photography galleries and media
- Public website and portfolio management
- Client messaging and reviews
- Business and payment settings

### Client Portal

The client portal allows clients to interact with their photographer.

- Dashboard and booking management
- Invoice viewing and sandbox payments
- Authorised gallery access
- Messaging with photographers
- Reviews for eligible completed sessions
- Profile management

### Public Website

Photographers can create and manage a public-facing website displaying their business information and photography.

Public functionality includes:

- Photographer-specific websites
- Photography services and portfolios
- Client booking access
- Account registration and authentication

Public photographer websites are accessible using a photographer-specific URL such as `/:photographerSlug`.

## 3. Client-Server Architecture

LensFlow uses a three-layer architecture that separates frontend presentation, backend application logic and persistent data storage.

```text
+--------------------------------------+
|           React + Vite SPA           |
|                                      |
|  Photographer Portal | Client Portal |
+------------------+-------------------+
                   |
                   | HTTP / JSON
                   | Bearer access token
                   v
+--------------------------------------+
|       Node.js + Express REST API     |
|                                      |
|   Routes -> Controllers -> Services  |
|                 |                    |
|              Middleware              |
+------------------+-------------------+
                   |
                   | Authenticated
                   | Supabase requests
                   v
+--------------------------------------+
|               Supabase               |
|                                      |
|   PostgreSQL | Row Level Security    |
|   Authentication | Storage           |
+--------------------------------------+

Separate payment integration:

React / Express / Supabase
             |
             v
    Supabase Edge Functions
             |
             v
     Stripe Test Environment
```

### Frontend

The frontend is a React Single Page Application (SPA) built using Vite.

React components manage the user interface, while API requests communicate with the Express backend using HTTP and JSON.

The frontend uses client-side routing to provide navigation between photographer and client pages.

### Backend

The Express REST API handles application requests and separates responsibilities using routes, controllers, services and middleware.

Responsibilities include:

- Processing incoming HTTP requests
- Validating request data
- Verifying authentication and authorisation
- Applying business rules
- Communicating with Supabase
- Returning structured JSON responses
- Handling errors using appropriate HTTP status codes

### Database

Supabase PostgreSQL stores persistent application records.

The database uses relational tables, primary keys, foreign keys, constraints and Row Level Security (RLS) policies.

RLS provides an additional layer of protection by restricting access to records based on the authenticated user.

### Authentication and Storage

Supabase Auth manages user authentication and sessions.

Selected authentication and storage operations communicate directly with Supabase rather than passing through Express.

Supabase Storage manages uploaded photography media, with access controlled through storage policies and application-specific authorisation rules.

### Payments

Stripe integration is implemented using Supabase Edge Functions.

LensFlow V1 uses Stripe test mode to demonstrate payment workflows without processing real financial transactions.

## 4. REST API

The Express backend provides resource-based REST endpoints supporting Create, Read, Update and Delete (CRUD) operations.

Standard HTTP methods include:

| Method | Operation | Description |
|---|---|---|
| GET | Read | Retrieve one or more records |
| POST | Create | Create a new record |
| PATCH | Update | Modify an existing record |
| DELETE | Delete | Delete an eligible record |

Example resource endpoints include:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/photographer/services` | Retrieve photography services |
| GET | `/api/photographer/services/:serviceId` | Retrieve a specific service |
| POST | `/api/photographer/services` | Create a service |
| PATCH | `/api/photographer/services/:serviceId` | Update a service |
| DELETE | `/api/bookings/:bookingId` | Delete an eligible booking |

API requests and responses use JSON.

The API includes authentication, authorisation, validation and structured HTTP error handling.

Business rules restrict certain operations when related records must be preserved.

For example, a service associated with existing bookings may require different handling from an unused service.

The accompanying assignment report contains additional REST API examples, CRUD testing evidence and HTTP response screenshots.

## 5. Local Development

### Prerequisites

The following are required to run LensFlow locally:

- Node.js and npm
- Internet connection
- A configured Supabase project
- Appropriate frontend and backend environment variables
- A supported web browser

Stripe credentials are only required when deploying and testing payment-related Edge Functions.

### 5.1 Frontend Environment

Create an untracked `.env.local` file in the repository root.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_SUPABASE_KEY
```

Replace the placeholders with the appropriate Supabase project values.

Only public Supabase keys should be exposed through Vite environment variables.

**Important:** Never place a Supabase service-role key, Stripe secret key or other privileged credential in a variable prefixed with `VITE_`.

### 5.2 Express Environment

Copy `server/.env.example` to `server/.env`.

Configure the following values:

```dotenv
PORT=3001
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_SUPABASE_KEY
```

The frontend and backend must reference the same Supabase project.

The backend reads `server/.env` when started from the `server` directory.

Do not commit or distribute privileged credentials.

### 5.3 Install and Start the Frontend

Open a terminal in the project root.

Install dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

The frontend typically runs at:

```text
http://localhost:5173
```

Use the local URL displayed in the terminal if Vite selects a different port.

### 5.4 Install and Start the Backend

Open a second terminal.

Navigate to the backend directory:

```bash
cd server
```

Install backend dependencies:

```bash
npm install
```

Start the Express development server:

```bash
npm run dev
```

The backend runs locally on port `3001` unless configured otherwise.

The Vite development proxy forwards `/api` requests to the Express backend.

### 5.5 Verify the API

A basic API health endpoint is available at:

```text
http://localhost:3001/api/health
```

This confirms that the API process is responding.

It does not independently verify database connectivity, authentication or the availability of every API resource.

Additional authenticated requests can be tested using Postman or the browser Developer Tools.

## 6. Build and Testing

### 6.1 Frontend Build

From the project root:

```bash
npm run build
```

This creates an optimised production build of the React application.

### 6.2 ESLint

From the project root:

```bash
npm run lint
```

The final LensFlow V1 lint cleanup completed with zero errors and zero warnings.

### 6.3 Backend Automated Tests

From the `server` directory:

```bash
node --test
```

The backend uses the Node.js built-in test runner.

### 6.4 Final V1 Verification Results

| Test Category | Recorded Result |
|---|---|
| Backend automated tests | 464 passed |
| Frontend automated tests | 27 passed |
| Total automated tests | 491 passed, 0 failed |
| Security signer tests | 12 passed |
| REST API testing | CRUD and error-handling checks completed |
| Browser integration testing | React-to-Express requests verified |
| Production build | Successful |
| ESLint | 0 errors, 0 warnings |

The automated tests cover selected application functionality, business rules, API behaviour and security controls.

These results should not be interpreted as complete coverage of every possible application behaviour.

### 6.5 Security Verification

Security testing focused on protecting photographer and client resources.

Verified scenarios included:

- Authentication and authorisation checks
- Restrictions on cross-user access
- Booking and availability permissions
- Client access to their own invoices
- Restrictions on unpublished or unpaid galleries
- Media download permissions
- Watermarked image previews
- Signed original-media access
- Rejection of invalid media paths
- Stripe sandbox payment updates
- Messaging permissions

The media security signer test suite completed with 12 passing tests.

### 6.6 Browser and Integration Testing

Browser-based testing was performed throughout development.

Testing included:

- Photographer and client navigation
- CRUD operations through the Express API
- Form validation
- Booking and availability behaviour
- Invoice and payment workflows
- Gallery access permissions
- Messaging and reviews
- Public website functionality
- Authentication and logout

Browser Developer Tools and network requests were used to verify frontend-to-backend communication.

### 6.7 Preliminary User Acceptance Testing

Three participants tested the deployed application using photographer and client accounts.

The recorded results included:

- 36 of 36 task outcomes passed
- Average System Usability Scale (SUS) score of approximately 88.3/100

The sample size was small, so the results represent preliminary usability evidence rather than a comprehensive evaluation.

Further user testing would be beneficial before commercial deployment.

## 7. Repository Structure

```text
LensFlow/
|
+-- src/
|   React pages, components, layouts,
|   authentication context and API clients
|
+-- public/
|   Public frontend assets
|
+-- server/
|   +-- src/
|   |   Express routes, controllers,
|   |   services, middleware and configuration
|   |
|   +-- tests/
|   |   Backend automated tests
|   |
|   +-- package.json
|   +-- .env.example
|
+-- supabase/
|   +-- functions/
|   |   Stripe Edge Function source code
|   |
|   +-- config.toml
|
+-- documents/
|   Developer setup, recovery and
|   testing documentation
|
+-- package.json
+-- vite.config.js
+-- README.md
```

The React frontend uses reusable components, shared layouts and feature-specific pages.

The Express backend follows a layered structure to separate request routing, business logic and database access.

This separation supports maintainability, testing and future development.

## 8. Database Setup and Recovery

LensFlow uses a hosted Supabase PostgreSQL database.

The database contains related records for:

- Photographers and clients
- Services and bookings
- Calendar availability
- Invoices and payments
- Galleries and media
- Messages and reviews
- Photographer websites and portfolios

Database integrity is supported through:

- Primary and foreign keys
- Relational constraints
- Row Level Security policies
- Authentication-based access rules
- Storage access policies

### Database Documentation

Additional setup and recovery instructions are available in the repository:

- [Developer documentation](documents/README.md)
- [Database setup and recovery](documents/database-recovery/README.md)
- [Data restoration checklist](documents/database-recovery/DATA_RESTORE_CHECKLIST.md)

### Important Setup Notes

The assessment demonstration uses an existing configured Supabase environment.

A fresh Supabase installation requires additional configuration, including:

1. Creating a Supabase project.
2. Applying the required database schema, functions and policies.
3. Configuring Storage buckets and policies.
4. Creating appropriate authentication accounts and test data.
5. Configuring the frontend and backend environment variables.
6. Deploying payment-related Edge Functions if Stripe testing is required.

Database schema scripts alone do not restore existing authentication identities, uploaded media or external-service secrets.

Recovery SQL should be applied to a fresh disposable Supabase project rather than an existing production database.

## 9. Stripe Integration

LensFlow V1 includes Stripe integration in **test mode**.

The integration demonstrates payment-related workflows without processing real financial transactions.

### Edge Functions

The following Supabase Edge Functions are included in the repository:

```text
supabase/functions/
|
+-- create-stripe-account/
+-- create-stripe-onboarding-link/
+-- sync-stripe-account-status/
+-- create-checkout-session/
+-- stripe-webhook/
```

The deployed V1 application has been tested with Stripe sandbox payments and corresponding invoice status updates.

### Limitations

Stripe live payments are outside the scope of LensFlow V1.

Future development includes:

- Refund and dispute reconciliation
- Additional webhook failure and replay testing
- Payment state conflict handling
- Production configuration verification
- Additional security and logging improvements

Deploying the Edge Functions into a new Supabase project requires separate configuration and Stripe test credentials.

See the [Edge Function deployment documentation](documents/edge-functions/README.md).

## 10. Deployment

LensFlow V1 is deployed using Vercel and Supabase.

| Component | Hosting |
|---|---|
| React frontend | Vercel |
| Express REST API | Vercel |
| PostgreSQL database | Supabase |
| Authentication | Supabase Auth |
| Media storage | Supabase Storage |
| Payment Edge Functions | Supabase |

The deployed frontend and backend communicate with the intended Supabase project.

Final deployed regression testing confirmed core application workflows, including authentication, bookings, invoices, galleries, messaging and Stripe sandbox payments.

### Deployment Considerations

The Vite `/api` proxy is used for local development.

Production deployments require the frontend to communicate with the deployed Express API using the appropriate configuration.

Additional production considerations include:

- Environment-variable management
- Authentication redirect URLs
- CORS configuration
- Storage policies
- Stripe test/live separation
- Webhook signature verification
- Security logging
- Performance monitoring

The deployed V1 application is intended for academic demonstration rather than commercial production use.

## 11. Limitations and Future Development

LensFlow V1 demonstrates the main requirements of the capstone and client-server development assignments.

Further improvements have been identified for LensFlow V2.

### Performance

- Route-based lazy loading and code splitting
- Deferred loading of larger gallery, PDF and editor dependencies
- Bundle analysis and performance optimisation
- Review of static and dynamic imports

### Payments

- Additional payment reconciliation
- Refund and dispute handling
- Expanded webhook failure testing
- Production payment configuration and verification

### Security

- Additional deployment hardening
- Expanded negative security testing
- Further logging and monitoring improvements
- Continued review of access controls and Storage policies

### Usability

- Further user acceptance testing
- Accessibility improvements
- Interface refinements based on user feedback
- Testing across additional devices and browsers

These improvements were documented as future work rather than introduced late in V1 development.

## 12. Project Documentation

Additional technical documentation is available in the `documents/` directory.

- [Developer documentation index](documents/README.md)
- [Database setup and verification](documents/database-recovery/README.md)
- [Data and media restoration](documents/database-recovery/DATA_RESTORE_CHECKLIST.md)
- [Supabase Edge Function deployment](documents/edge-functions/README.md)
- [Application integration and testing](documents/application-testing/README.md)

The accompanying academic report provides additional information about the project architecture, REST API implementation, database design, design patterns, testing methodology and results.

## 13. Project Ownership and AI Assistance

LensFlow was developed by **Bryce Milbank** as an academic software development project.

ChatGPT and OpenAI Codex were used to support research, programming, troubleshooting, testing and documentation.

Generated suggestions were reviewed and tested as appropriate. Final implementation, verification and evaluation decisions remained the responsibility of the developer.

---
