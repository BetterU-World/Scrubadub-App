# Calendar identity and date reconciliation (#274)

## Baseline and audit before implementation

Independent worktree/branch `codex/calendar-reservation-identity` starts at merged main `66bfdb5debd6da8752abb18b19228f9fa611ccaf` (#270–#272). No #273 transport, credential, diagnostic or harness commits are included. Original local work remains on its original branch/worktree. No deployment state is inferred from Git.

Verified behavior in `actions/icalParser.ts`, `lib/icalSnapshot.ts`, `mutations/calendarSync.ts` (`processSyncResults`, `maybeCreateJobForReservation`, `confirmEventClassification`), and `schema.ts`:

| Situation | Baseline behavior |
|---|---|
| A: repeated UID/event | Matches connectionId + externalUid; updates lastSeenAt, keeps link; same evidence retains owner classification. |
| B: changed UID, same stay | Creates another needs_review record; old UID becomes missing on a valid nonempty snapshot. No alias/identity review links the records. |
| C: date extension/shortening | Same-UID dates overwritten, classification invalidated. Linked-job checkout changes set dateConflict/originalCheckOut; arrival-only changes have no dedicated review. Repeated checkout changes overwrite that simple previous value. |
| D: changed UID and dates | A new unconfirmed record; no matching beyond UID. Possible second job after separate owner guest confirmation, especially with changed checkout. |
| E: similar metadata | No fuzzy merge; selected provider/title/date/status is not verified booking evidence. |
| F: duplicate/moved feeds | Connection-scoped identity produces separate records. A same-property/date non-cancelled calendar-job check blocks some work, but not changed dates or cancelled linked work. |
| G: confirmed guest becomes ambiguous | Material event/feed changes preserve previous decision evidence but reset classification to needs_review. |
| H/I: manually modified/completed/cancelled/financial job | Existing linkedJobId prevents another job for that row; sync updates reservation only. UID changes can evade the link. |
| J: overlap/retry/stale callbacks | Atomic admission, cooldown, lease and attempt fencing; mutations provide transactional conflict retries. Lookup uses first() rather than detecting pre-existing duplicate UID rows. |

No verified provider booking ID is extracted. UID is an observation key, not proof of permanent booking identity. Severity: potential duplicate operational work is high; incomplete date-review evidence is medium. No live/customer data was examined.

## Conservative first slice

Preserve all records; never auto-merge, transfer links or modify existing jobs. Detect possible collisions within the same company/property using overlapping stay dates, equal UIDs across feeds, or a different UID absent/missing from the same feed. These are review hints, not identity proof. Owner must explicitly identify a separate booking or suppress extra automation as a possible duplicate. Classification and identity decisions remain separate. Bound scans/candidates and fail closed for incomplete evidence.

Track previous/proposed arrival and departure values in versioned review evidence, with append-only audit entries for each date transition. Acknowledgement does not resolve a linked job discrepancy or reschedule anything. Existing job links, assignments, checklists, approvals, invoices and payments remain unchanged. Further policy, validation, limitations and rollout notes are recorded below as implementation is verified.

## Implemented policy and code map

- `lib/calendarReconciliation.ts:identityReviewFor` compares only same-company, same-property retained observations. Names, descriptions, platforms, statuses and similar dates never establish a booking identity. Overlapping dates (half-open stays), equal UIDs across feeds, and different missing/cancelled UIDs in the same feed produce **possible** identity hints. Removed-feed records remain evidence. An unlinked owner-suppressed record is excluded as a candidate; linked records remain evidence even when suppressed.
- `mutations/calendarSync.ts:processSyncResults` completes imports, explicit cancellations and missing observations before identity scans/job attempts. Lookup by connection+UID uses `unique()`; corrupt legacy duplicates fail the whole transaction rather than selecting an arbitrary row. Index range reads plus Convex OCC protect insert/review invariants; no unsupported database uniqueness declaration or migration is introduced. Malformed ISO dates also fail before writes. Existing admission/attempt fencing is unchanged.
- `refreshIdentityReview` binds a revision/fingerprint to the observed event and candidate IDs, dates, material versions, missing episode, cancellation, suppression and linked job IDs. Changed evidence reopens review. Unchanged evidence does not produce repeated review/audit episodes. Refresh runs during sync and before classification/job creation and identity decisions. Candidate changes discovered during owner submission commit a refreshed pending revision and return `stale`, requiring inspection before retry.
- `reviewReservationIdentity` requires the verified owner session and same-company property/source/event/feed/review versions. `distinct` is an owner attestation, not a proven identity match. `duplicate` suppresses additional automation on this record and records the candidate reference; it never merges, deletes, transfers a job link, cancels another row, or changes downstream work. Suppression chains/cycles are rejected. Same-decision retries are idempotent; conflicting/stale decisions cannot overwrite the resolved revision. Resolution itself creates no job. A previously confirmed unlinked guest can become eligible on a later normal sync after an explicit separate-booking decision; all existing gates still apply.
- `processSyncResults` detects arrival-only and departure changes. `dateReview` retains the first unacknowledged previous dates and latest proposed dates; `calendar_reservation_dates_changed` audits every actual transition. Material changes rebind pending evidence. Feed dates still update on the reservation, while linked jobs stay unchanged. Legacy `dateConflict` remains set and `originalCheckOut` retains its first value.
- `acknowledgeReservationDates` is an owner-only, versioned, idempotent acknowledgement; it neither clears job discrepancy flags nor creates work. Pending dates hold unlinked job creation. Guest/block classification remains a separate decision; linked-job early return preserves even cancelled work without recreation.
- `CalendarReconciliationReview.tsx` displays uncertainty, candidate dates/source suffixes and existing job evidence, previous/proposed dates and explicit separate/suppress/acknowledge controls. Managers receive view-only new controls through `PropertyDetailPage`; server authorization independently enforces owner-only decisions. Current source observations are required. `CalendarSyncTab` prioritizes all pending reviews, disables guest confirmation while held, and retains the existing View job path for separate manual operational review. Audit actions: `calendar_identity_review_required`, `calendar_identity_reviewed`, `calendar_reservation_dates_changed`, `calendar_dates_acknowledged`.

## Bounds, unresolved cases and operational risks

Property scans read at most 201 rows to detect a 200-row bound, and display at most 20 candidates. Exceeding either bound marks evidence incomplete and refuses separate-booking approval/new automation; safe suppression remains available for displayed candidates. This counts retained history, not just active future stays. Busy or long-lived properties may therefore need manual scheduling and a later paginated reconciliation design. Nothing deletes history to regain automation.

Missing/cancelled same-feed records intentionally produce conservative hints even for disjoint dates. Old unrelated records can cause false positives and owner workload; overlap across genuinely distinct bookings also requires explicit attestation. The original missing episode persists after duplicate suppression and must be reviewed separately. Suppression is not a UID alias and does not follow future changes onto the old row/job. Resolving one record may change candidate evidence on another; refresh and review again when requested. No same-version reversal of a resolved decision is provided; arrange separate manual work review for mistaken decisions instead of bypassing the guard.

Disjoint events with changed UIDs across different feeds, or simultaneous disjoint old/new active events with different UIDs in one feed, cannot reliably be linked by the available data. They remain unconfirmed under #272 and need owner verification; this first slice cannot guarantee global deduplication after an incorrect owner attestation. UID reuse cannot be distinguished conclusively from a changed booking: material changes reset classification and dates require acknowledgement. Title-only changes with identical UID/dates retain the source observation row, preserve its existing link and reset classification. No provider ID, fuzzy match or certainty is invented.

Existing unbounded connection reconciliation/property UI queries and historical same-checkout job dedup remain outside this change; the added identity scan is bounded. No network transport, parser normalization/timezone policy, missing-event grace policy, global side-effect guard, cron configuration or environment variables change. #273's transport security/runtime blocker remains entirely separate.

## Validation and manual QA

`convex/lib/__tests__/calendarReconciliation.test.ts` uses the real parser and Convex transactional mutations with synthetic database fixtures: repeat/concurrent/retried actions, UID rotation with identical/disjoint dates, distinct overlaps, snapshot ordering, cross-feed/property/tenant isolation, removed feeds, stale candidates, owner/manager/cleaner permissions, classification/cancellation interactions, feed generation CAS, malformed dates, corrupt stored duplicates and bounded evidence. Linked scheduled/in-progress/submitted/approved/cancelled jobs are compared byte-for-byte alongside manual assignments/notes/time, execution history, approved checklists, invoices and paid payment/link records after date extension/shortening and review. These are local transactional regressions, not deployed-runtime certification.

Existing containment/admission/missing/classification/session/parser suites remain part of validation. The shared older job-focused fixture explicitly records owner-reviewed separate-booking/date consent before guest confirmation; ambiguity tests exercise holds directly. Frontend tests cover revision/candidate submission, stale/error messages, pending click protection, owner/source availability, incomplete scans, date acknowledgement and blocked guest confirmation. Exact final command results are recorded in the draft PR.

Local validation: **221 tests passed across 10 suites** (seven backend calendar/parser/session suites and three frontend calendar suites), Convex/frontend `tsc --noEmit` passed, `npm run build:frontend` passed (existing large-chunk warning), and `git diff --check` passed. The initial sandboxed Vite invocation could not traverse the worktree's parent directory; the same frontend-only build succeeded with filesystem access. No deployed behavior is claimed.

After separate deployment approval, use synthetic feeds in an isolated approved test environment (do not disable QA safeguards):
1. Import/confirm a guest and manually edit its job. Repeat the feed and verify one row/link/job.
2. Rotate UID with same dates and then disjoint dates; verify two retained rows, missing evidence, pending identity and no second job. Suppress the new row and repeat; verify all existing work remains unchanged.
3. Import genuinely distinct overlapping stays and attest each separately. Refresh stale candidates if another job is linked. Confirm classification separately and check the existing same-checkout gate still holds.
4. Extend/shorten arrival and departure. Verify previous/proposed evidence, audit entries, and unchanged job dates/assignments/checklist/financial records. Acknowledge and inspect the retained discrepancy; use the existing manual job workflow only with separate authorization.
5. Test manager view-only behavior, removed feeds, changed feed URLs, concurrent owners, cancellation, incomplete scans, mobile layout/keyboard controls and safe stale feedback.

No live/customer feeds, deployment, provisioning, QA/production settings or production data are needed for this PR's local validation.

## Schema, release and rollback

Two optional reservation fields; no backfill, migration, required field, new index, scheduler or external dependency. Existing rows acquire review evidence only on a relevant normal sync/classification attempt, not through a mass update. Preserve all original records and audit history. Release only after code review and synthetic manual QA: deploy the compatible additive schema/backend before the new frontend through the normal approved release process. Never use root `npm run build` just to validate: it deploys Convex; local validation uses `npm run build:frontend`.

Rollback is **not** a blind deployment of old main. Once fields exist, old schema validation may reject records; old mutation code also ignores the new safety holds. Prefer a forward fix or revert the UI while keeping the additive schema and backend guards. Any full rollback requires an explicitly reviewed compatibility plan that retains optional validators/holds or first disables relevant automation through a separately approved owner operation. Do not bulk-clear evidence, remove reservations or alter jobs/payments to make an old schema deploy. No rollback/configuration action has been executed.
