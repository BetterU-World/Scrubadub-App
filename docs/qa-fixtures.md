# Guarded local QA fixtures

The Bright Harbor Cleaning Co. fixture is a development-only workspace for repeatable browser QA. It contains an owner, a delegated manager, a worker, a client portal user, four properties, six jobs across lifecycle states, checklists, client requests, a proposal, a signed agreement, a commercial schedule, notifications, and inert financial records. All people, addresses, credentials, and business details are fictional.

## Safety prerequisites

Set these variables on the `majestic-turtle-198` Convex development deployment:

```text
SCRUB_QA_ENABLED=true
SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS=true
APP_URL=http://localhost:5173
```

The server also verifies the exact deployment name. Every fixture entry point is internal-only and refuses unless all guards pass. Never configure these fixture settings in production or previews. The side-effect kill switch is mandatory even with a loopback URL.

## Founder workflow

1. Set root `VITE_CONVEX_URL` to the `majestic-turtle-198` development URL and start SCRUB with `npm run dev`.
2. Inspect fixture state with `npm run qa:status`.
3. Create it with `npm run qa:seed`, or replace the existing marked fixture with `npm run qa:reseed`.
4. Give the browser agent the local SCRUB URL and one of the roles below. Use `npm run qa:reset` when a clean database state is needed.

| Persona | Email | Password |
| --- | --- | --- |
| QA Owner / Maya Chen | `owner@brightharbor.example.test` | `BrightHarbor-QA-Owner-2026!` |
| QA Manager / Jordan Brooks | `manager@brightharbor.example.test` | `BrightHarbor-QA-Manager-2026!` |
| QA Worker / Elena Ruiz | `worker@brightharbor.example.test` | `BrightHarbor-QA-Worker-2026!` |
| QA Client / Rowan Ellis | `client@brightharbor.example.test` | `BrightHarbor-QA-Client-2026!` |

These are deterministic development-fixture credentials, not secrets. They must never be enabled against or grant access to production.

Reset is intentionally conservative. It locates the company only by its durable `qaFixtureKey`, verifies exact fixture/persona identity, preflights every indexed child record, and refuses before deleting anything if the company has cross-company, foreign-client, affiliate, inconsistent, or storage-backed relationships. It never scans or wipes the database broadly, and it never calls email, Stripe, Connect, calendars, Vercel Blob, or webhooks.
