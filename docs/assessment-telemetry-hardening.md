# Assessment telemetry hardening

## Behavior and compatibility

The assessment page sends each question-progress key once per mounted session.
The key still includes attempt, session, and question. Different questions and
attempts remain independent; a real remount gets a fresh session. The first
committed question after attempt creation is still eligible, as is the next
question. Recovery, forward/back navigation, answer persistence, completion, and
PR #256 initialization/read budgets are unchanged.

Progress telemetry is best effort: a failed send is not retried by a language
change, rerender, or revisit. Previously those interactions could incidentally
retry it. Successfully stored events retain the same first-write timestamp,
language, metadata, and deduplication key. Suppressing redundant calls therefore
does not change existing analytics counting semantics.

Repository history from the original continuity funnel (`c1e6408`) through main
(`2938ce2`, including PR #256) has exactly three frontend `recordEvent` types:
`assessment_resumed`, `assessment_progress`, and `scrub_support_cta_clicked`.
All already send the capability and the exact keys now validated by the backend.
Resume/progress already include the session metadata; progress includes section
and question. The old broad endpoint also accepted arbitrary strings. The only
`assessment_viewed`/`report_viewed` callers found were synthetic backend tests;
those now exercise real supported events. Public calls cannot create the
server-owned start/completion/report/roadmap/email milestones. Existing stored
rows and backend milestone writers are not changed.

## Backend admission

1. Validate the supported event type, capability shape, key, and metadata.
   Version numbers must be safe integers from 0 to 1,000,000. Metadata strings
   use bounded identifiers (80 characters, 120 for question, 64 for session).
   Sessions remain 16–64 hexadecimal characters. Metadata is capped at 2 KiB;
   the other bounded fields keep the complete JSON payload below 3 KiB.
2. Look up the exact indexed deduplication key. An existing event returns
   `{ recorded: false }` after one lookup, with no writes and no attempt read.
   This is also the response to invalid capabilities; the duplicate path does
   not authorize any operation or return assessment/event contents.
3. Read reusable per-attempt and global admission counters. Saturation returns
   `{ recorded: false }` before loading attempt snapshots, without any writes.
4. For a new event, load the attempt and verify its capability hash. Only then
   charge both counters and insert the event in the same transaction.

The budget is 120 new events per attempt per ten-minute fixed window, shared
across sessions/tabs, plus the existing global ceiling of 500 per minute. The
bundled longest path has 32 questions (28 for solo operators); 120 permits more
than three full question sets with resume events. Rotating session IDs does not
evade the attempt limit or create additional counter rows. There is at most one
new counter row per valid attempt. The existing duplicate-cleanup operation
includes this exact attempt-owned key; this change does not execute cleanup.

Duplicates, invalid capabilities, malformed metadata, and rejected admissions
spend no budget and perform no writes. Caller-selected IDs cannot consume
another attempt's budget without its capability. Limits are isolated from
answer writes, completion, recovery, report, and roadmap admission.

No schema change, migration, or deployment ordering dependency is required.
The backend accepts existing frontend payloads, and the frontend works with the
previous backend. Backend protection also applies to old open tabs.

## Verification and limits

Regression coverage includes real React effects and translations, Strict Mode,
revisits, language changes, idle rerenders, remounts, first-answer transitions,
failed telemetry/completion, legacy payloads, first-write semantics, concurrent
duplicate/admission requests, missing/wrong capabilities, malformed metadata,
attempt isolation, rotating sessions, fixed-window reset, and budget cleanup.
The unchanged PR #256 suites cover recovery and snapshot read-budget behavior.

Local validation: all 184 test files / 1,271 tests passed; frontend and Convex
typechecks passed; the frontend-only build and diff whitespace checks passed.
The build retains the existing large-chunk warning; tests emitted a dependency
deprecation and missing TypeScript source-map warning without failing.

Convex-test verifies transactional application behavior but does not establish
distributed production OCC retry rates or actual read bytes. Duplicate calls
still cost an indexed event lookup. New events still load an attempt document
for capability verification; removing that read would require separate compact
authorization state, deliberately outside this change. No global HTTP/IP abuse
firewall is introduced: malformed/duplicate requests still cost function
execution, and enough distinct valid attempts can exhaust the shared global
ceiling. One attempt cannot do so alone. All throttling drops only telemetry.

Broad subscribed admin/giveaway summaries can still rerun when new event rows
affect their read ranges. No analytics-query rewrite or production measurement
is included. Event retention and historical-row cleanup policies are unchanged.
