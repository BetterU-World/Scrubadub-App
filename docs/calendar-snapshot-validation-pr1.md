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
- `syncConnection` sends only valid snapshots to persistence. Invalid, degraded,
  and valid-empty snapshots use the existing error-recording path, retain the last
  successful-sync timestamp, and count toward the existing three-failure suspension.
- `processSyncResults` checks the attempt fence first, then validation status,
  candidate identity/count consistency, skip count, and increasing dates before any
  reservation write. Missing validation status from an older in-flight action is
  rejected safely. The optional wire fields require no stored-data migration.
- Cancellation-only snapshots may cancel only explicitly named reservation UIDs.
  They do not authorize absence-based cancellation of unrelated reservations.
  No linked job is modified.

## Tests and local validation

The seven-file calendar regression set passed 122 tests, including 29 parser tests
and transactional containment cases for every shared unsafe fixture. Tests use
synthetic records, fake clocks, and mocked fetches. The action orchestration is
invoked through its handler against real `convex-test` mutations, following the
existing containment-test pattern; no deployed action was invoked.

Coverage includes HTML, absent/truncated/mismatched envelopes, malformed content
lines, missing/invalid/rolled-over dates, DURATION without DTEND, reversed/equal
ranges, duplicate/conflicting UIDs, mixed valid/invalid events, valid-empty feeds,
date-less cancellation, parser omissions/exceptions, fetch/HTTP/blank failures,
idempotency, rollback, stale callbacks, admission leases, and tenant boundaries.
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
  --configLoader runner --reporter=dot
```

Convex and frontend typechecks passed. Frontend production build passed with the
existing large-chunk warning. The sandbox blocked Vite's default config loader;
the same local build succeeded with filesystem escalation. Diff whitespace checks
passed. Unrelated working-tree generated API changes are excluded from the commit.

## Compatibility, limitations and release order

No schema change, migration, backfill, public API change, or frontend change is
needed. Normal valid feeds retain their hashes, deduplication and creation gates.
The attempt fence, retry accounting, cooldowns and atomic processor transaction
remain in place. Duplicate UIDs, including recurrence overrides sharing a UID,
are deliberately rejected rather than guessed at or silently collapsed.
Legitimate DURATION-only events cannot create turnovers without explicit DTEND.

An otherwise well-formed nonempty provider feed that omits events still uses the
existing absence-based cancellation policy. Syntax checks cannot establish semantic
completeness. Classification/review, missing-event grace policy, identity conflicts,
SSRF/response limits, full URL redaction, timezone redesign, calendar query limits,
and UI changes remain separate work. This does not make calendar automation fully safe.

After explicit release approval, release the Convex backend first, with action,
parser and mutation together. No frontend release is required. Older in-flight
unvalidated processor calls fail without writes; existing error recording can log
that failure. Observe error counts and suspended connections before any later
frontend work. Re-enable a corrected feed only through the existing owner workflow.
Do not auto-retry indefinitely, clear failures, or repair historical data.

No merge, deployment, real provider sync, or production data operation was performed.
