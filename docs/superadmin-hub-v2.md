# Superadmin Hub V2

## Scope and routes

Reporting and navigation only. No impersonation, new operational privileges, billing writes, or changes to existing tenant permissions.

- `/admin`: population, jobs, engagement and billing overview.
- `/admin/companies`: indexed name search and cursor pagination; ten companies per UI page.
- `/admin/companies/:companyId`: company identity, populations, jobs, group last-seen, billing evidence and paginated account names/emails/statuses.
- `/admin/engagement`, `/admin/billing`: focused reporting views.
- Existing affiliates, assessments, giveaways, cleanup and tenant worker tools retain their routes and authorization. Founder notifications and operational email delivery are untouched.

## Architecture and cost

`adminHub.report` is an authenticated, on-demand read action. `adminHubData.scan` processes source tables in pages of at most 100 documents, with a 1 MB source-page read target. It returns numeric aggregates, not raw records. Company-specific reports use tenant indexes; company search uses `companies.search_name`. Directory/detail/people responses have explicit minimal return validators.

Every source-page read rechecks the current verified session and active platform entitlement. The action rechecks before returning. Non-admin owners/managers cannot invoke these reporting endpoints. Existing tenant queries remain tenant-scoped even for a platform administrator.

Global reports are linear in source-record count, not constant-time counters. They avoid reactive unbounded scans and silent limits, but still consume reads proportional to the dataset. An eight-minute read budget fails the entire report explicitly; it never returns a truncated total. At substantially larger scale, introduce reconciled materialized counters through the mutation paths before increasing traffic. Do not describe this implementation as an unlimited constant-cost dashboard.

Reports expose start/window-reference and completion times. Pagination across transactions is a **read interval, not an atomic snapshot**; concurrent changes may affect counts. Overview reports update on refresh. Directory/company query refresh keys force new server-time evaluation without using a client-supplied timestamp as evidence. Opening directories loads only visible company reports, not every company's detail.

## Exact populations

All persisted companies are included, including QA/internal. `qaFixtureKey` produces a QA badge; no heuristic email/name-based exclusion or internal classification is invented.

User login accounts are counted by current `users.role`, including pending/inactive accounts. Managers, cleaners and maintenance are staff accounts. Worker profiles are separately counted records across all profile statuses; they are not added to login accounts. Missing/duplicate/foreign profiles are exposed as data-quality counts. Client portal identities are global `clientUsers` records. Client relationships are company-specific records, including duplicate relationships and those without a portal identity; these are not unique customers. Client requests/leads are not silently counted as clients.

## Job definitions

Timestamp windows are `(server reference - 168/720 hours, server reference]`, UTC, with both bounds. Counts describe currently persisted records; they do not reconstruct deleted jobs or repeat lifecycle transitions.

- Created: `_creationTime` in window.
- Completed: `completedAt` in window, independent of current status.
- Approved: `approvedAt` in window, separate from completion.
- Cancelled: `cancelledAt` in window. Current cancelled-record totals are separate.
- Scheduled: `scheduledDate` interpreted at **midnight UTC as an explicitly labeled date proxy**, bounded by the same window, excluding currently cancelled jobs. No exact scheduled-hour claim is made because the field is date-only; future dates are excluded.
- Canonical volume excludes records with `sharedFromJobId`; partner copies are counted separately. This applies to platform and company reports consistently. A receiving company can see its partner-copy volume separately rather than mistake it for zero operational participation.
- Calendar-sync and generated-commercial jobs are included once in canonical counts when they are originals, and also identified as automated records. Automation is never engagement evidence.
- Approved records without completion/approval timestamps and cancelled records without cancellation timestamps are exposed. Missing timestamps are not replaced with scheduled dates.

The compatibility `queries/admin` exports remain available. Their assignment metric is renamed `assignedWorkerAccounts7d`, completion uses timestamps, future scheduled dates are bounded, and oversized legacy reports error rather than silently truncate. V2 does not use those capped queries.

## Foreground observation v1

The recorder mounts only inside the authenticated staff `AppLayout`. A visible screen counts without requiring a click. Initial foreground mounting, eligible navigation, and return to visibility can produce observations. There is **no heartbeat, polling, reconnect listener, page-history storage, or automatic tracking based on operational writes**.

The client excludes Showcase/demo, client and public/authentication surfaces. The server verifies the session, derives company/user/current role, verifies the company exists, and timestamps receipt. Client principal sessions are rejected; affiliate sessions do not record. Identity/time fields submitted by a caller are rejected by argument validation. `surface` is a fixed contract identifier, not a stored page path.

Visibility is a browser signal. The server cannot prove a human is viewing a screen or prevent an authenticated custom client from calling the endpoint. This is minimal product analytics, not attendance, timekeeping, security evidence, or surveillance.

Daily presence is unique by company/user/role/UTC day/definition version. It stores first/last receipt times only. Role and company changes create distinct observations; historical attribution is not rewritten. Browser Web Locks plus a non-secret local-storage timestamp reduce duplicate tab requests. Server transactional deduplication remains authoritative where locks/storage are unavailable. Observations are throttled to five minutes per daily identity/role/company; this bounds write frequency, so last-seen can lag actual foreground access. A long-open static screen has its initial observation but no invented continuous-use duration.

`hubCompanyPresence` maintains owner/staff last observation for inexpensive company classification. Managers belong to staff. Group summaries preserve observation-time company/group after role/company changes; headcounts reflect current accounts.

`hubObservation` establishes the first valid observation for definition version 1, only when a qualifying observation is actually recorded. No migration or deployment time is presented as historical activity. No backfill comes from sessions, logins, security events or assignments.

For each company, coverage begins at the later of its creation and global v1 first-observation time. Until the entire 168/720-hour window fits after coverage start, classification is **Insufficient observation**. Otherwise:

- Both active: owner and staff observation in the window.
- Owner-only: owner observation only.
- Staff-only: staff observation only.
- Neither: neither observed in a fully covered window.

Solo companies show **No staff accounts**, and owner-only is explicitly not framed as failed staff adoption. Successful login, foreground access, and operational actions remain distinct. No historical trends are invented. Coverage assumes the instrumented client is deployed and functioning; telemetry outages or older clients can cause under-observation. A future definition change must use a new version and fresh coverage.

## Retention and privacy

Daily identified observations expire at UTC day start plus 46 days (approximately 45–46 days after observation). Company/group last-seen expires after 90 days. The internal retention job runs every 15 minutes in batches of 250 per table, scheduling bounded continuations to drain backlogs. Expiration is asynchronous, not a hard deletion SLA during outages. Version/start metadata contains no identity and remains so coverage does not reset when old observations expire.

Only superadmin reports expose engagement summaries. Daily identities are not returned by public reporting queries. No page paths, raw session tokens, hashes, IP/device fingerprint, documents, pay/compliance notes, reset or invitation secrets are included. Names and contact emails remain visible to authorized admins through bounded directory/people projections. Account IDs used for local tab deduplication are not credentials. Existing session storage/security architecture is unchanged.

## Billing and access

Stored Solo/Team/Pro tiers are separate from legacy cleaning/STR owner labels and unknown/unset. The entitlement helper's default-to-Pro behavior is not used for reporting.

Stored subscription status, trial, promotion, complimentary entitlement and cancellation are overlapping signals. Promotion is derived only from available subscription snapshot discounts/awarded-until dates. Missing snapshots mean promotion unknown, not false. Snapshots older than 24 hours are labeled stale; trial/award end dates are snapshot evidence. Existing subscription-notice feature settings may mean snapshots are absent. No new environment variable or live Stripe dashboard request is required.

**Payment evidence is Unverified for all companies in this release.** Neither active status nor launch-gated founder notification facts establish a universal ledger. This is deliberately not a paid/unpaid classification. A future verified-payment report requires a reconciled invoice/collection evidence contract, including credits/refunds and historical coverage, before it can make payment claims.

## Validation and rollout

New tables: `hubObservation`, `hubDailyPresence`, `hubCompanyPresence`. New company search index: `search_name`. No required fields are added to existing documents, no backfill, and no production fixtures. The generated API declaration receives only the three new function modules; unrelated local generated changes must remain outside the commit.

Before a separately authorized release:

1. Review the draft PR and run CI. Deploy schema/functions and frontend together through the normal release process; wait for the company search index to become available.
2. Smoke-test on an isolated development deployment using synthetic accounts: visible read-only access → daily record/group summary → authorized company report. Test a hidden tab and Showcase with an existing staff session.
3. Verify non-admin denial, revoked grants/sessions, tenant isolation, and email/worker operations. Check retention scheduling and read costs with representative data.
4. Verify the first genuine observation establishes v1 coverage. Expect insufficient coverage for seven/thirty days; never seed historical activity to make cards appear populated.
5. Monitor report runtime/read costs, company-summary write contention and retention backlog. Add maintained global aggregates if linear on-demand reads become costly.

This task does not authorize merge, deployment or production data changes. No Convex push/codegen that contacts a deployment is part of local validation. Frontend build, TypeScript, in-memory Convex tests and synthetic component/browser previews are local evidence; they do not replace the isolated deployment smoke test.

### Local validation results

- `npm test -- --maxWorkers=4`: **236 files, 2,309 tests passed**. An earlier unrestricted run had a contention timeout and an obsolete source assertion; the assertion was updated, both tests passed in isolation, and the complete rerun passed.
- Focused backend scale rerun: **15 tests passed**, including **10,003 login accounts** with 10,001 owners, beyond the former user scan cap.
- `npm run typecheck`: passed for frontend and Convex. An additional compiler-host check substituting only the staged API declaration also reported zero diagnostics, ensuring unrelated local generated changes are not needed in the PR.
- `npm run build:frontend`: passed. Existing large-bundle warning remains; the root `build` command was intentionally not used because it deploys Convex.
- `git diff --check`: passed. Full tests emitted non-failing dependency deprecation/negative-timeout and missing TypeScript source-map warnings.
- Synthetic UI preview: actual hub components rendered with mock data and built CSS, inspected at **1440 × 1000** and **390 × 844**. No horizontal document overflow. Screenshots are local artifacts outside the repository. This is visual evidence, not a live backend/browser integration test.
- No merge, deployment, production data access/write or production fixtures performed. No new environment variables; additive tables/index plus existing release process required.
