# Non-destructive worker decline and cancellation V1

## Baseline and scope

Based on main `06830b0`. PR #279 was an open draft when inspected; this change does not depend on its submission-authority changes. Combined-assignment forms and assignment mutation policy remain deferred.

Previously, `denyJob` denied the entire job and `cleanerCancelJob` cancelled it, including job-wide acceptance changes and existing notifications. These handlers still perform their original verified-session, execution-authorization, shared-job and lifecycle checks first. For eligible multi-worker jobs they now record an availability review instead of executing those destructive transitions. `acceptJob`, submission, approval, scheduling, payroll and PMS behavior are unchanged.

## Effective workers

Count unique current-company, active, execution-role-compatible users from direct `cleanerIds` and active memberships of the assigned same-company team. Direct/team overlap counts once. Inactive users, inactive memberships, foreign-company memberships and incompatible roles do not count. A directly assigned eligible manager/owner counts; an oversight-only `assignedManagerId` does not. Maintenance eligibility follows the existing execution role helper.

Archived teams currently retain member execution access; this change follows that rule rather than treating archiving as access revocation. More than 1,000 roster entries or candidates per reviewer role fails closed and rolls back the transaction, rather than classifying an incompletely read roster as single-worker.

One effective worker retains the existing denial/cancellation transitions, acceptance resets, notifications and supported reason handling. Existing single-worker lifecycle restrictions remain unchanged. The new multi-worker route only accepts scheduled/confirmed jobs without `startedAt`; it does not expose cancellation of started, submitted or rework jobs. The legacy single-worker rework guard is outside this PR.

## Review lifecycle and authorization

A small `workerDeclineReviews` table stores original worker/name, request kind, reason and time, plus pending/resolved metadata. Existing notifications and audit logs are reused; reading a notification does not resolve a request. No new email or scheduler operation is introduced.

Pending identity is `(job, worker)` across decline and cancellation. Concurrent/repeated calls reuse the original pending request without replacing its reason, creating another audit event or sending more alerts. The indexed read and transactional insert provide server-side deduplication. Eligibility is checked on every call.

Assignment or membership changes do not silently close a pending request. A remaining eligible worker reuses it even if the roster now contains only one worker; a removed worker cannot request or read through the worker API. After authorized resolution, a new eligible request creates a new historical record; current effective-worker classification applies again. Existing pending requests remain staff-visible after normal job cancellation/completion.

Active same-company owners may review. Managers require assignment or schedule capability plus existing job visibility (global visibility, assigned-manager oversight or actual assignment). View-only, team-management-only, unrelated and foreign managers cannot review. Shared-job acceptance and recipient-company boundaries remain enforced; partner rejection is a separate workflow.

V1 resolution only records acknowledgement, resolver and time. It changes no assignment, job acceptance, access, form, timer, inventory, performer evidence, calendar reservation or shared-job record. Original request fields remain intact. Staff receive one existing in-app notification per authorized recipient. Worker and job-detail review UI supports English/Spanish, responsive layouts and paginated history. Persisted notification text follows the existing English notification convention.

## Validation and next boundaries

Regression coverage includes individual/team/combined/overlap classification; single-worker compatibility; cancellation after acceptance; concurrent/repeated requests; permission and shared-job boundaries; roster changes and access revocation; durable resolution; operational-record preservation; and existing acceptance/submission compatibility. UI coverage checks truthful review feedback, pending controls, escaping, translation and resolution failures.

This PR adds the review table and indexes, two supporting indexes on existing tables, and job-detail affordances. No data backfill is needed. No production deployment is part of this work.

Next: implement independent assignment mutations separately, preserving job-wide acceptance on actual assignment changes, recording those changes and notifying unique affected workers. Explicit clearing must affect only its own assignment source; omitted fields preserve values; ID comparisons use sets. Review-request handling after assignment changes must remain explicit. Then expose combined normal/quick creation and editing with EN/ES/mobile coverage, once lifecycle prerequisites including submission authority are reviewed. Per-worker acceptance remains out of scope.
