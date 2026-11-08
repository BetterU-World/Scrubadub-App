# Combined assignments: review and staged implementation

Reviewed main: `06830b0` (includes PRs #276, #277, #278). Investigation and local tests establish code behavior, not production behavior.

## Release boundary

This first PR changes submission eligibility only: a current directly assigned worker retains submission authority when a team is present. Existing team-lead and authorized manager/owner paths remain. The canonical submission transaction still enforces session, company, role, shared-job acceptance, execution state, checklist, inventory, and performer evidence. EN/ES restriction copy describes the updated rule.

It does not enable combined assignment creation/editing, change decline/cancellation, mutate assignments, or change notification delivery. Do not release the broader combined-assignment UI until the lifecycle and notification prerequisites below are reviewed and verified. No new assignment table is needed.

## Current architecture and risks

| Area | Confirmed implementation and risk |
| --- | --- |
| Schema | `jobs.cleanerIds[]` and optional `assignedTeamId` coexist. Individual IDs may include eligible managers/owners as well as cleaners. Keep execution-role validation in `lib/jobExecutionAuth.ts`; do not reduce it to a cleaner-only assumption. |
| Standard/quick creation | `mutations/jobs.ts:createCanonicalJob` validates tenant, subscription and manager assignment permissions, then rejects a team with individuals. Both creation paths use it. Creation notifications already use a unique team/direct union when a team exists. |
| Editing | `jobs.update` rejects explicitly supplied combined assignments and clears a team when nonempty individuals are supplied. An omitted individual list can allow a team to be added without clearing existing individuals, so current behavior depends on payload shape. General edits only audit; they do not notify workers. |
| Dedicated reassignment | `reassignJob` replaces the individual list with one worker, preserves the team, and resets job-wide lifecycle/acceptance for a real replacement. #278 makes an exact singleton retry a no-op after authorization. Being one member of a larger direct list is not an unchanged replacement. |
| Recurring jobs | `commercialSchedules.generateCommercialJobsFromSchedule` can populate both assignments. `assignedCleanerId` is singular on the schedule/account; generation maps it to the job array. It deduplicates generated dates but bypasses ordinary assignment notifications. Preserve its generation and pricing snapshots. |
| Team membership | `lib/teams.ts` resolves current active memberships; access and recipients change dynamically. `mutations/teams.ts` does not reconcile affected jobs or send assignment notices. Archiving a team does not deactivate memberships, and membership helpers do not check team active status. Treat archive policy separately from this submission PR. |
| Access | Worker list/detail queries and execution use direct assignment OR active team membership. Removing one source cannot revoke access supplied by the other. Losing both must revoke worker reads/writes/uploads; legitimate owner/manager permissions remain independent. |
| Submission | Previously, team presence caused direct non-leads to lose submission authority. This PR fixes that narrow inconsistency. One canonical form and the existing completion requirements remain. |
| History/approval | `performedWorkers.freezePerformedWorkers` records execution evidence separately from current assignments. Never rewrite that evidence on assignment changes. Approval/rework resolve current unique recipients; they are not a historical performer-notification system. |
| Acceptance/decline | `acceptJob`, `denyJob`, and `cleanerCancelJob` operate on whole-job acceptance. One worker's decline/cancel currently marks the entire job denied. Enabling combined forms without fixing this would violate the approved product rule. |
| Shared jobs | `requireSharedJobAccepted` verifies markers AND the reverse link, company provenance and pending/rejected/manual-review state. Pending copies must remain untouched; a worker response is not a partner-company acceptance/rejection. Keep all existing fences before execution or assignment changes. |
| Calendar | Imports create unassigned jobs with owner-confirmed classification/automation gates. Feed changes/cancellation/missing observations retain linked work for review. Assignment work must not rewrite feed state, bypass admission, regenerate jobs, or silently reschedule/cancel linked jobs. |
| UI | `JobFormPage` uses exclusive individual/team mode and sends empty/clear payloads; `QuickJobPage` clears/hides individuals when selecting a team. Query `assignmentType` labels any team-containing job as team-only. `LiveJobBanner` includes a direct-only cleaner check. Detail pickers and worker summaries need a combined-aware presentation. |

## PR boundaries and order

### 1. Submission prerequisite (this PR)

- Give directly assigned workers submission authority independent of team membership.
- Preserve team-lead and authorized manager/owner authority, role and company checks, canonical form, performer evidence and shared-work boundaries.
- Update EN/ES eligibility wording. Use the existing server capability in the UI; add no new controls.
- Test independent and overlapping direct/team workers, source removal, team-member removal, completion blockers, rework/approval/history, and pending/rejected/accepted shared work.

### 2. Non-destructive worker decline/cancel prerequisite

- Keep job-wide acceptance and existing statuses; add no per-worker acceptance table.
- Distinguish worker unavailability from rejecting the whole service and from recipient-company rejection of a shared job.
- On a multi-worker/combined job, preserve whole-job status, acceptance, timer, form and evidence; notify active owners and only managers with the required resource visibility and operational capability.
- Recommended first behavior: record an owner-review request, leaving assignment sources unchanged until an authorized owner/manager updates them. A worker overlapping a team and a direct list must not be removed from the company team as a side effect of declining one job.
- Document that this recommendation retains the worker's assignment/access until review. If decline must immediately withdraw that worker, design a job-specific exclusion and its membership interactions first; removing only their direct ID cannot revoke access via the team.
- Deduplicate retried requests by worker and assignment revision; record the event rather than overloading whole-job `deniedAt`/`denyReason`. An optional event key/revision on existing records is preferable to an acceptance table. Specify what permits a fresh request after reassignment.
- Preserve current single-effective-worker behavior unless explicitly approved otherwise. Cover both initial decline and post-acceptance cancellation, with no new cancel route for work already started.

### 3. Independent assignment mutation + standard/quick UI

- Retain the two existing fields. Omission preserves; `cleanerIds: []` removes only direct individuals; `clearAssignedTeam: true` clears only the team. Reject simultaneous team-set/team-clear instructions.
- Compare direct IDs as sets; validate uniqueness, active tenant membership and execution-role compatibility. Preserve #278's dedicated replacement meaning.
- Compute unique effective recipients before and after each change in the same mutation. Notify only added/removed effective workers; overlap is not a removal. An unchanged/reordered assignment emits no assignment notices or emails and preserves acceptance.
- Maintain a single shared assignment-change helper across authorized entry points. Bound fanout and use record identity/revision to prevent stale queued assignment messages; do not send assignment emails for months of generated jobs by default.
- Make changed-assignment acceptance rules explicit before implementing them. Do not reopen in-progress/submitted/approved work as a side effect of editing assignees. Never rewrite execution history or canonical forms.
- Replace exclusive modes with an optional team selector plus independent multi-worker controls. Preserve omitted values for managers who cannot assign workers. Display both sources and unique worker counts, with EN/ES labels and a clear unassigned state.
- Keep mobile controls stacked/wrapping, labelled and keyboard accessible. Exercise 320/375/768px layouts, EN/ES, loading/error/save states, and round-tripping an existing combined job without dropping either source.
- Update worker lists/details, performed-worker picker deduplication, query presentation and live banner consistently. Preserve partner-company authorization separately from local worker assignment.

### 4. Membership/recurring notification reconciliation

- Specify whether membership changes apply to future, in-progress and historical work; preserve evidence independently.
- Use bounded indexed batches for affected jobs. Avoid a company-wide scan or thousands of per-job emails.
- Retain direct access when team membership is removed and vice versa; new memberships should not silently create duplicate notifications.
- Define team archive behavior explicitly. Preserve the recurring generator's date deduplication, source/add-on snapshots and existing assignments.

## Decisions needed before the combined UI PR

1. Approve notification-only owner review on combined-worker decline, or require immediate withdrawal? The latter needs job-specific access/exclusion semantics for team members.
2. For real assignment changes after acceptance, preserve job-wide acceptance or require explicit owner reconfirmation? Existing general edits and dedicated reassignment differ. Recommendation: preserve acceptance on general edits and keep reconfirmation an explicit action; never reset executed work.
3. Confirm notification destinations for removed workers and manager escalation. A removal notice must reveal no details beyond work they were previously authorized to see.
4. Confirm live membership/archive behavior for in-progress and historical access before adding membership-change notification fanout.

## Broader regression matrix (deferred to the relevant PR)

- Individual, multiple-individual, team-only, combined, unassigned and overlapping memberships.
- Each source added/removed independently; omitted vs empty vs clear; reordered/repeated/concurrent operations.
- Same effective workers through different sources: preserve access, one recipient, no false removal.
- Real changes before/after acceptance and after execution; old forms/history unchanged.
- Membership add/remove, team archive, inactive/incompatible workers; no cross-tenant IDs.
- Worker visibility, direct URL/query access, form edits, uploads, timers and submission after source removal.
- Authorized/unauthorized manager create/edit/assign/decline-notice access.
- Initial decline and cancellation after acceptance; one worker cannot deny the whole combined job.
- Approval/rework, historical performer snapshots and current-recipient deduplication.
- Pending/rejected/corrupt/accepted shared copies, disconnection and foreign origin/recipient boundaries.
- Standard/quick UI round trips, mobile layouts and EN/ES; recurring generation and calendar-created jobs.

The first PR's automated tests cover its submission boundary, not this entire future matrix. No browser/mobile combined-assignment validation is claimed before those controls exist.
