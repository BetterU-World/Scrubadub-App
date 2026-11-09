# Independent backend assignment mutations (Phase 3)

Baseline: main `3e19e53`, including merged submission-authority #279 and non-destructive decline-review #280. This PR adds no combined-assignment controls or frontend workflow changes.

## API semantics

- `mutations.jobs.create` and `createQuick` share canonical creation. `cleanerIds` remains required (an empty array is valid); optional `assignedTeamId` may coexist. IDs are deduplicated before validation/storage. Existing initial status/confirmation behavior is preserved.
- `mutations.jobs.update`: omitted `cleanerIds` preserves direct workers; `cleanerIds: []` removes direct workers only. Omitted `assignedTeamId` preserves the team; `clearAssignedTeam: true` clears the team only. Setting a team and requesting its clear together is rejected. `false` does not clear. Null is not accepted. Both sources can be changed atomically.
- Direct ID sets are compared without order or duplicates. Assignment-only unchanged/reordered calls produce no writes, assignment audits, notifications, emails or revision change. Existing metadata-edit audits remain separate.
- `reassignJob` retains its owner-only singleton replacement meaning: replace all direct individuals with `newCleanerId`, preserving the team. It intentionally no longer reopens work, resets acceptance or erases denial metadata. Cancelled jobs remain blocked by that endpoint. General update retains its existing lifecycle permissions.
- Supplied direct workers must be active same-company execution-compatible users (including eligible owners/managers, and maintenance staff only for maintenance jobs). Assignment edits validate retained direct workers too; remove an invalid old direct worker explicitly rather than propagating it. New/supplied teams must be active same-company teams. An omitted existing archived team is preserved and its memberships retain existing access semantics. Invalid retained cross-company teams cannot be propagated by assignment edits.
- Changes preserve job status, acceptance, accepted/denied timestamps and reasons, forms, timers, photos, inventory, performer history, approval evidence, pricing, shared-job markers and calendar links. This does not reconfirm denied work or introduce per-worker acceptance.

## Caller compatibility

- Standard `JobFormPage` already sends `cleanerIds: []` in team mode and `clearAssignedTeam: true` when switching back to individuals. Its intentional exclusive workflow therefore remains unchanged, with no UI migration needed here. Its current presentation of a combined job remains a limitation until the UI phase; saving that exclusive form can explicitly remove the other source.
- `QuickJobPage` still sends its currently exclusive form payload. The backend accepts a combined payload but exposes no new controls.
- Owner job-detail reassignment still replaces direct workers with one worker; the accepted founder policy now preserves lifecycle instead of silently reopening the job. Reopening/reconfirmation is not added to assignment APIs.
- Commercial schedule generation already supports its singular schedule cleaner plus team. It remains unchanged, including date deduplication, pricing/add-on snapshots and no bulk assignment-email fanout. Generated/legacy jobs with no revision start at zero for their first ordinary edit.
- Calendar imports and request scheduling create unassigned jobs; this PR does not modify admission, reservations or scheduling. Team membership mutations remain unchanged. Current membership continues to govern effective access and team-lead authority dynamically.
- All guarded entry points retain verified sessions, current owner/manager capabilities, tenant and shared-job fences. General editing still requires `canCreateJobs`; managers editing assignments additionally need `canAssignCleaners`. Dedicated replacement remains owner-only. No new manager visibility/capability shortcut is added.

## Effective workers, audit and notifications

Reuse #280's bounded effective-worker resolver: unique active, role-compatible same-company direct users plus active assigned-team memberships, filtering foreign membership rows. Archived-team access follows the existing policy. More than 1,000 roster entries fails closed transactionally.

A meaningful assignment-source change increments optional `jobs.assignmentRevision` and writes an existing audit event containing actor, before/after sources, revision, added/removed effective worker IDs and automatically resolved review IDs. No parallel assignment table exists. Overlap or a source-only transfer with identical effective workers changes the assignment audit but creates no false recipient delta.

Added workers get one existing in-app assignment notification. Planned, unstarted work also schedules the existing escaped assignment email. Removed effective workers get one in-app removal notice referring only to the formerly assigned date, without a job link or new property details; removal emails are not introduced. Notifications use factual event wording rather than promising current access. Historical audit/notification records remain intact.

All newly queued assignment emails include job, worker and revision identity. Immediately before delivery an internal query checks revision, current eligibility/membership, planned/unstarted lifecycle, timer closure and shared-work acceptance, and obtains current email/location/date/company identity. Superseded invitations are dropped; in-app notices remain available. An unrelated later assignment-source edit can supersede an older pending invite even if that worker remains assigned. Legacy already-queued payloads lack identity and retain their old delivery contract for compatibility. External email delivery cannot be atomic with a concurrent later mutation: a change after the delivery-time check or an email already delivered cannot be recalled. No claim of exactly-once external delivery is made.

## Pending decline reviews

On a meaningful assignment edit, pending requests whose worker is absent from the resulting effective worker set are marked resolved with `resolutionReason: assignment_removed`, actor and timestamp. Original worker/kind/reason/request time remain intact. Audit links the resolved IDs to the assignment edit. Removing only one overlapping assignment path leaves the request pending. Removed workers lose ordinary worker reads/execution via the existing access model; legitimate independent owner/manager permissions remain. Re-adding a worker allows a new request while preserving the original resolved record.

No-op edits do not close requests. Team membership changes alone do not reconcile review records or send job-level assignment notices; that bounded reconciliation remains a separate future PR. Existing manual acknowledgement still changes no assignments.

## Validation and remaining boundaries

Tests cover canonical and quick creation, independent source edits/clears/omission, normalized/reordered/concurrent no-ops, actual-change acceptance and history preservation, overlap/deltas, audits, review removal/re-add, authorization, accepted/pending/rejected shared copies, delayed-email dispatch and legacy queued payload compatibility. Existing assignment, submission, decline, quick-job, shared-job, recurring/commercial and calendar suites are also run in the full suite. Both typechecks, local frontend build (without Convex deployment) and diff checks are required.

Next PR: combined-aware normal/quick forms and presentation, with independent fields, clear controls, EN/ES and mobile round-trip tests. Retain the backend semantics above. Membership/archive reconciliation is separate; do not introduce bulk future-job notifications in the UI PR. No additional founder decision blocks this backend implementation; review the deliberate no-reset replacement behavior, removal-notice channel and superseded-email policy before release.
