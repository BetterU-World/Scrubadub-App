# Guarded local QA fixtures

The Bright Harbor Cleaning Co. fixture is a development-only workspace for repeatable browser QA. It contains an owner, a delegated manager, two active workers, a client portal user, four properties, seven jobs across lifecycle states, checklists, client requests, proposals, service agreements, a commercial schedule, notifications, and inert financial records. All people, addresses, credentials, and business details are fictional.

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
| QA Worker 2 / Marcus Reed | `worker2@brightharbor.example.test` | `BrightHarbor-QA-Worker2-2026!` |
| QA Client / Rowan Ellis | `client@brightharbor.example.test` | `BrightHarbor-QA-Client-2026!` |

These are deterministic development-fixture credentials, not secrets. They must never be enabled against or grant access to production.

The seed command also returns the deterministic public QA proposal path `/proposal/bright-harbor-avery-proposal-v1`. It opens a sent Avery seasonal deep-clean proposal and exercises the existing public accept/decline flow without sending email.

## Coverage-expansion records

- Marcus Reed is a minimal active W-2 cleaner with completed safety onboarding, Tuesday-Saturday availability, and no Stripe Connect configuration.
- Pelican Loft has one valid scheduled turnover with no cleaner or team assignment, enabling assignment recovery and reassignment between Elena and Marcus.
- A separate Pelican Loft request has a pending schedule proposal awaiting Rowan's response in the Client portal.
- A Pelican Loft monthly deep-clean agreement is sent and awaits Rowan's authenticated Client response.
- The Avery seasonal deep-clean proposal is sent with the deterministic public QA token above.

These records materially improve Torture Test scenarios TT-03 (real reassignment), TT-11 (public sent-proposal response), TT-12 (pending Client scheduling decision), TT-13 (actionable sent agreement), TT-15 (Manager assignment control), TT-17 (two-worker scope), and TT-21 (Client attention/documents state). Dense-data testing remains intentionally out of scope.

Reset is intentionally conservative. It locates the company only by its durable `qaFixtureKey`, verifies exact fixture/persona identity, preflights every indexed child record, and refuses before deleting anything if the company has cross-company, foreign-client, affiliate, inconsistent, or storage-backed relationships. It never scans or wipes the database broadly, and it never calls email, Stripe, Connect, calendars, Vercel Blob, or webhooks.
