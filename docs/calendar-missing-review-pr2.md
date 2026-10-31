# Calendar reliability PR 2 — missing reservations require review

## Baseline inspected before implementation

Current main was fetched and confirmed to contain PR #270 through merge commit
`d312054` (including `afbe4b4` and `c3356ba`). Git history does not establish the
state of production deployments. No deployment or production data was inspected.

On that baseline, `processSyncResults` still marked active reservations cancelled
when their connection-scoped UID disappeared from a valid nonempty feed. Explicit
cancellations were carried as separate UIDs, and cancellation-only feeds did not
cancel unrelated records. Invalid/degraded feeds failed safely; zero-event calendars
completed as healthy, non-authoritative empty checks. Existing jobs were never
modified by reconciliation. Returning cancelled reservations reactivated normally.

Reservation statuses were only active/cancelled. `lastSeenAt`, `cancelledAt`,
`dateConflict`, and `cancellationFlagged` existed, but no disappearance metadata or
owner acknowledgement action did. The owner property Calendar Sync tab displayed
flags and five recent reservations. Only the primary feed could be managed there,
although reservations from all property feeds were queried. Existing audit entries
and owner-only audit retrieval were available. Change/cancellation notifications
were promised in explanatory copy but were not emitted by that reconciliation path.

## Lifecycle and evidence

- Presence creates/updates reservations under existing automation gates. Presence
  updates `lastSeenAt`. If a missing episode exists, reappearance clears it and
  records a resolution audit containing its final observation/acknowledgement data.
  Linked jobs are neither recreated nor mutated.
- An absent active reservation stays active. Optional `missing` metadata carries
  `episodeId` (the first detecting attempt ID, scoped to this reservation),
  `firstMissingAt`, `lastMissingAt`, `observations`, and optional `acknowledgedAt` /
  `acknowledgedBy`. Each committed valid nonempty snapshot that omits it increments
  the count once. No count or time threshold ever cancels it.
- The first absence opens review immediately. There is no grace-period system.
  An opening audit captures the episode and known dates, last-seen time, connection
  and property. Repeated absences update metadata and per-sync log counts without
  adding duplicate episode-opening alerts. The existing admission/attempt fence
  prevents duplicate or stale callbacks from counting again.
- Explicit STATUS:CANCELLED evidence affects only the matching UID and connection.
  `cancellationEvidence` stores source `ical_status_cancelled`, observation time
  and attempt ID, not an inferred provider cancellation time. Cancellation clears
  current missing metadata and records it in the explicit-cancellation audit.
  Existing cancellation timestamps are preserved for already-cancelled legacy rows.
  Repeated identical cancellation state does not generate duplicate audit entries.
  Unknown cancellation UIDs do not create reservation records.
- A cancellation-only snapshot is nonempty: unmatched active reservations may gain
  missing observations, but cannot be cancelled through absence. A calendar with
  zero VEVENTs follows PR #270's empty-check path and never changes missing state.
- Reactivation after explicit cancellation retains its evidence in the audit trail
  and clears the current cancellation fields. No historical cancellation is
  reinterpreted merely because it is absent. No historical cleanup/backfill occurs.
- Invalid, degraded and valid-empty snapshots leave reservation/missing/job state
  untouched. Missing reservations do not count as feed failures or suspend syncing.

Episode closure is automatic only on reappearance or explicit cancellation.
Acknowledgement records owner review while absence tracking continues. A later
disappearance after reappearance has a distinct episode ID. Audit history remains
outside the reservation document, avoiding an unbounded embedded history array.

## Minimal owner review

The existing Calendar Sync reservation list prioritizes unacknowledged missing
episodes, then acknowledged missing episodes, then ordinary imports. It identifies
the property, feed label/platform/ID suffix, known stay dates, last-seen and
first/last-missing timestamps, observation count and linked-job status. Missing
copy explicitly says cancellation is not confirmed. Job links open the linked job.
Retained reservations remain visible even after their connection is removed.

`acknowledgeMissingReservation` uses the verified owner session and reservation
company, not a claimed actor/company. It requires the current episode ID, is
idempotent, and audits the real owner. Managers, workers, other tenants, invalid
sessions, spoofed actor IDs, and stale episodes are rejected. Acknowledgement
cannot change reservation status, jobs, assignments, execution evidence or money.

No notification subsystem or repeated hourly notification was added. The owner
review surface is the property tab, and episode history uses the existing owner
audit log. The misleading notification promise was replaced with this behavior.

## Compatibility and validation

Only optional reservation/log fields and a connection+UID lookup index are added.
Existing statuses, rows and PR #270 empty/error behavior remain compatible. Legacy
cancelled rows gain evidence only when actual new explicit evidence is received;
they are otherwise untouched. Existing calendar read scale limits remain outside
this focused lifecycle change.

Synthetic transactional tests cover initial presence, absence staying active,
linked scheduled/in-progress/submitted/approved jobs with manual edits, assignment,
execution evidence, paid cleaner payments and joins; repeated observations and
attempt replay; explicit UID/connection scope; reappearance/new episodes; invalid,
degraded, empty and stale results; multiple feeds/properties/companies; authorized,
duplicate and unauthorized acknowledgement; stale episode actions; and preservation
of historical cancellation state. Rendered UI tests cover review details, ordering,
acknowledged state, removed feeds and explicit-vs-legacy cancellation wording.
Existing parser/admission/containment/auth/job regressions are included. All fetches
are mocked; no real provider calendar or deployed action is used.

Final local validation: 164 tests passed across nine files, including 22 new
transactional lifecycle cases and eight rendered Calendar Sync UI tests. Convex
and frontend typechecks passed. The frontend production build passed with the
existing large-chunk warning. Git diff whitespace checks passed. Vitest used the
runner config loader for sandbox compatibility; the normal local build required
filesystem escalation for Vite's config bundler. Unrelated generated API changes
and pre-existing untracked cache/capture directories are excluded from the commit.

```text
vitest run
  convex/lib/__tests__/icalParser.test.ts
  convex/lib/__tests__/calendarMissingReview.test.ts
  convex/lib/__tests__/calendarSyncContainment.test.ts
  convex/lib/__tests__/calendarSyncAdmission.test.ts
  convex/lib/__tests__/calendarSessionRegression.test.ts
  convex/lib/__tests__/pr6bOperationalDataMigration.test.ts
  convex/lib/__tests__/jobCancellationLifecycle.test.ts
  convex/lib/__tests__/relationshipPropagation.test.ts
  packages/frontend/src/components/owner/CalendarSyncTab.test.ts
  --configLoader runner --reporter=dot
```

## Release and rollback

After explicit approval, deploy the additive Convex schema/index and backend first,
then the frontend. The frontend acknowledgement mutation must exist before its
button is offered. The old frontend ignores optional missing metadata, so keep the
gap short: jobs/reservations are protected immediately, but the review surface
requires the new frontend. No data migration or historical repair is required.

For rollback, retain the additive schema/index and safe backend reconciliation.
Rolling the backend back to PR #270 while syncing is enabled restores unsafe
absence-based cancellation. If a backend rollback is necessary, stop affected syncs
through the existing authorized owner workflow first, with separate production
approval. Do not delete metadata/audits, narrow the schema while these records
exist, or rewrite jobs/payments to undo the release. A frontend rollback removes
review controls but does not authorize reverting the backend safety rule.

Classification/keyword heuristics, provider APIs, automatic job rescheduling or
cancellation, UID matching, SSRF, timezone redesign, historical cleanup, and broader
calendar UI/i18n work remain excluded. No merge, deployment or production data
operation is part of this PR.
