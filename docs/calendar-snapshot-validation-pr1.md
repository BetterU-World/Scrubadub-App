# Calendar snapshot validation — reliability PR 1

## Problem and scope

`node-ical` is intentionally tolerant: it ignores malformed lines, supplies missing
event end dates, and collapses repeated UIDs. Previously, successful parsing was
treated as a complete snapshot. HTML, empty calendars, and skipped malformed
events could therefore cancel reservation records; inferred checkout dates could
create jobs.

This change validates ingestion only. It does not classify reservations, change
automation rules, reschedule/cancel linked jobs, or repair historical records.

## Boundary and outcomes

- `validateRawCalendar` in `convex/lib/icalSnapshot.ts` checks unfolded content
  lines, one balanced VCALENDAR envelope, component nesting, unique event UIDs,
  explicit DTSTART/DTEND, and actual calendar date/time values before parsing.
  Unknown provider properties/components, quoted parameters, folded lines,
  VTIMEZONE and VALARM remain supported. This is not a full RFC conformance checker.
- `parseICalFeed` in `convex/actions/icalParser.ts` accounts for every raw event
  after library parsing, rejects non-increasing stay dates, and returns `valid`,
  `valid_empty`, `invalid`, or `degraded`. Rejected results expose no partial
  reservations or cancellation UIDs. New diagnostics contain fixed text only.
- Date-only values retain their literal calendar dates. Timed events retain the
  existing UTC-date normalization; property timezone support is not added.
- Explicit CANCELLED events require UID but not irrelevant stay dates. They are
  represented separately from malformed/skipped candidates.
- `syncConnection` sends valid and valid-empty snapshots to persistence. Invalid
  and degraded snapshots use the existing error-recording path, retain the last
  successful-sync timestamp, and count toward the existing three-failure suspension.
- A valid-empty response is a distinct non-error `empty` outcome, not authoritative
  reconciliation. It leaves every reservation/job unchanged and preserves
  `lastSyncAt`, clears the completed attempt and error, resets consecutive failures,
  and records `lastCheckedAt` plus an `empty` sync log. The regular hourly cron
  interval uses the latest valid check, falling back to `lastSyncAt` for old rows.
  Empty feeds therefore neither suspend a healthy connection nor poll every tick.
- The property status UI distinguishes the feed check from the last authoritative
  reconciliation, including the case where none has completed. It does not display
  a sync error or claim reconciliation success for empty responses.
- `processSyncResults` checks the attempt fence first, then validation status,
  candidate identity/count consistency, skip count, and increasing dates before any
  reservation write. Missing validation status from an older in-flight action is
  rejected safely. The optional wire fields require no stored-data migration.
- Cancellation-only snapshots may cancel only explicitly named reservation UIDs.
  They do not authorize absence-based cancellation of unrelated reservations.
  No linked job is modified.

## Tests and local validation

The final eight-file calendar regression set passed 137 tests, including 36 parser
tests, 59 containment tests, and three rendered empty-status UI tests. Tests use
synthetic records, fake clocks, and mocked fetches. The action orchestration is
invoked through its handler against real `convex-test` mutations, following the
existing containment-test pattern; no deployed action was invoked.

Coverage includes HTML, absent/truncated/mismatched envelopes, malformed content
lines, missing/invalid/rolled-over dates, DURATION without DTEND, reversed/equal
ranges, duplicate/conflicting UIDs, mixed valid/invalid events, valid-empty feeds,
date-less cancellation, parser omissions/exceptions, fetch/HTTP/blank failures,
idempotency, rollback, stale callbacks, admission leases, and tenant boundaries.
Empty-feed regressions cover more than three consecutive empty checks, hourly
scheduling, never-reconciled legacy rows, recovery on a later nonempty feed,
real failure -> empty -> real failure streaks, rollback and stale/lost callbacks.
Protected-record assertions compare reservation/job/payment records, manual
overrides, assignments, notifications, and audit history before/after rejection.
Job status preservation includes scheduled, in-progress, submitted, and approved.

Command (arguments shown on separate lines for readability):

```text
vitest run
  convex/lib/__tests__/icalParser.test.ts
  convex/lib/__tests__/calendarSyncContainment.test.ts
  convex/lib/__tests__/calendarSyncAdmission.test.ts
  convex/lib/__tests__/calendarSessionRegression.test.ts
  convex/lib/__tests__/pr6bOperationalDataMigration.test.ts
  convex/lib/__tests__/jobCancellationLifecycle.test.ts
  convex/lib/__tests__/relationshipPropagation.test.ts
  packages/frontend/src/components/owner/CalendarSyncTab.test.ts
  --configLoader runner --reporter=dot
```

Convex and frontend typechecks passed. Frontend production build passed with the
existing large-chunk warning. The sandbox blocked Vite's default config loader;
the same local build succeeded with filesystem escalation. Diff whitespace checks
passed. Unrelated working-tree generated API changes are excluded from the commit.

## Compatibility, limitations and release order

Schema changes are additive: optional `calendarConnections.lastCheckedAt` and a
new `empty` value in connection/log status unions. Existing rows remain valid;
no migration, backfill or public API argument change is needed. The status UI has
a compatibility reader for the new value. Normal valid feeds retain hashes,
deduplication and creation gates.
The attempt fence, retry accounting, cooldowns and atomic processor transaction
remain in place. Duplicate UIDs, including recurrence overrides sharing a UID,
are deliberately rejected rather than guessed at or silently collapsed.
Legitimate DURATION-only events cannot create turnovers without explicit DTEND.

An otherwise well-formed nonempty provider feed that omits events still uses the
existing absence-based cancellation policy. Syntax checks cannot establish semantic
completeness. Classification/review, missing-event grace policy, identity conflicts,
SSRF/response limits, full URL redaction, timezone redesign, calendar query limits,
and broader UI changes remain separate work. This does not make calendar automation fully safe.

Release review found no need to relax raw validation for the tested common provider
formats: explicit date-only, UTC/floating date-time, IANA and Windows TZIDs, quoted
VALUE/TZID parameters, provider metadata, folded lines, extensions, and alarms all
pass the real parser. These are synthetic compatibility fixtures, not certification
against live provider exports. The deliberate DURATION-only/shared-UID recurrence
restrictions above remain release limitations under the approved safety policy.

After explicit release approval, release the compatible frontend status reader
first (it works with old backend statuses), then deploy the Convex schema/action/
parser/processor together. This supersedes the original backend-only release note:
the old frontend treats an unknown status as an error. An already-open old browser
may temporarily mislabel an empty check until refreshed; data remains protected.
Older in-flight unvalidated processor calls fail without writes; existing error
recording can log that failure. No previously disabled connection is automatically
re-enabled. A genuinely failed feed still requires the existing owner recovery
workflow. Do not perform historical repair or narrow the status schema on rollback
while `empty` records/logs exist. Retain the compatible frontend reader on rollback.

No merge, deployment, real provider sync, or production data operation was performed.
