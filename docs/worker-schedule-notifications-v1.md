# Worker schedule-change notifications V1

Base: origin/main 59cc6ab (merged #283, #284 and #285). Repository code is the
source of this audit.

## Schedule mutation audit

| Path | Current code and behavior | V1 coverage |
| --- | --- | --- |
| Owner and delegated Manager edit | convex/mutations/jobs.ts update; canCreateJobs, tenant and shared acceptance guards; JobFormPage is the only UI caller found | Producer at successful update transaction |
| Calendar drag/drop | No event-drop/drag reschedule mutation or UI handler found; owner calendar navigates to job/edit views | No speculative producer |
| Initial manual/quick job | jobs.create/createQuick and createJobFromClientRequest; existing assignment notification semantics | No schedule-change event on creation |
| Client-request schedule proposal/confirmation | clientRequestScheduleProposals and lib/clientRequestScheduling.ts createJobFromClientRequest; indexed existing-job replay returns existing job without rescheduling | Creation excluded; later jobs.update covered; no new client confirmations |
| Recurring/commercial series | commercialSchedules.update edits the template; generateCommercialJobsFromSchedule inserts missing service dates and skips existing dates | Generation excluded; individual generated job edits via update covered; no series-wide rescheduler found |
| iCal sync / reconciliation | calendarSync.processSyncResults changes calendarReservations; checkout drift sets dateConflict/originalCheckOut, preserves linked job. maybeCreateJobForReservation inserts only. Rules change defaults for future creation | No notice for reservation-only changes. Human job edit covered |
| Shared/partner work | partners.shareJob inserts independent tenant copy; original changes do not propagate into copy. Accepted copy may be edited through jobs.update | Notify only workers of the edited company job/copy. No cross-company fanout or new schedule synchronization |
| Red-flag follow-up | redFlags.createMaintenanceJob inserts a new job | Creation excluded; maintenance audience outside cleaner V1 |
| Internal/legacy paths | Start, timer, execution, forms, compensation and account lifecycle patches affect status/evidence, not scheduledDate/startTime/durationMinutes. QA fixture insertion is test data | No generic DB trigger, historical replay or backfill |
| Walkthrough appointments | walkthroughs schedule fields belong to walkthroughs, not jobs | Outside worker job attendance V1 |

Search included all schedule-field references and AST inspection of patch calls,
including dynamic patch objects and spreads. No other existing-job schedule
writer was found. Direct dashboard/manual database writes or future writers are
not automatically intercepted; they must adopt the helper after their guards.

## Contract, identity and concurrency

Canonical fields: jobs.scheduledDate (YYYY-MM-DD), optional startTime (HH:mm),
and durationMinutes. There is no independent job end field, timezone offset,
property timezone or UTC timestamp input. End is derived from start plus duration.
Jobs use their company's local wall-clock convention; shared copies use their
own job company's timezone, matching current shared-job email behavior. There is
no geographic timezone inference. ISO/offset inputs are invalid rather than
silently converted; browser timezone cannot turn a routine edit into a change.
Absent and empty startTime compare equally. Unchanged windows, notes, property,
checklist, assignment-only and sync metadata edits emit no schedule event.

notifyJobScheduleChange is called once after the update and assignment edits in
the same mutation. Any failure rolls back all effects. Each material transition
increments optional jobs.scheduleRevision (legacy default zero). Event identity
is (jobId, scheduleRevision), with one notification per unique worker ID. No
external side effects, action, queue, cron or delivery callback is introduced.
Convex transaction conflict handling re-reads the committed job; equivalent
concurrent targets produce one event. A->B->A is two real changes, not a duplicate.

JobFormPage captures expectedScheduleRevision when initializing the form. A
non-equivalent stale target is rejected before assignment/schedule writes;
equivalent retries are harmless. The argument is optional for old callers, which
retain existing last-committed-write behavior. A legacy retry after an intervening
different schedule can still constitute a new transition. There is no invented
client request identity for old clients.

Scheduled, confirmed, in-progress and rework-requested jobs are actionable.
Cancelled, denied, submitted and approved jobs do not generate notices. This
slice does not forbid existing edits or reset job-wide acceptance, execution,
performed-worker history, assignment revisions or assignment email state.

## Recipient and read safety

Reuse effectiveDeclineWorkers for the bounded direct/team union and active,
same-company, job-compatible eligibility. Restrict V1 to cleaner role; do not
expand Owner, Manager, maintenance, affiliate or client audiences. Intersect the
before/after effective worker sets: workers newly added in the same edit receive
the existing assignment flow, not an additional schedule-change notice. Workers
removed in that edit receive no schedule notice. Overlap receives one notice.
Archived teams retain existing active-member access; archiving is not revocation.
The roster cap is 1,000, using existing indexes and failure-on-overflow behavior.

notifications.list and unreadCount both revalidate user/company, current job,
latest schedule revision/window, actionable status, current direct/team eligibility
and shared-job acceptance. Old revisions, cancelled/deleted jobs, removed workers,
company transfers and inaccessible copies disappear from both responses and badge
counts. Inactive users fail session auth. No sensitive title or property snapshot
is persisted in the new notification title/message; old/new windows are withheld
until read authorization succeeds. Property labels are resolved freshly and
verified same-company; a shared copy uses only its sanctioned snapshot. This is
read-time authorization, not merely a frontend concealment check.

List reads inspect the latest 500 notifications via the new per-user index;
unread count inspects the latest 500 unread rows via the existing index. Both
filter tenant-mismatched legacy rows too. This bounds read-time checks but is not
a complete historical archive: hidden rows can consume the window and older
visible notices may be omitted. No large notification-center/pagination redesign
is included. Existing read-marking mutations are unchanged. Suppressed rows remain
stored; reassignment back to a worker can make a still-current event visible again
when access is authorized. No claim is made that the user read it or attended.

## Worker experience and localization

Reuse the existing mobile-visible Header NotificationBell and /notifications.
Schedule cards use EN/ES copy, authorized current property label, previous and
updated date/start/derived-end/duration, event-time company timezone and /jobs/:id
(the actual worker detail route). Date-only work is explicit about an unset start.
No browser timezone conversion is applied to local fields. Overnight end dates
are shown. Malformed legacy windows fail to the localized unavailable-time label.
Cards wrap on narrow widths; the job link uses the existing touch-target sizing
and visible keyboard focus. No new center, emails, push, preferences or reminders.

Company timezone-setting changes alone are outside this event model. Snapshots
retain the timezone at the schedule transition; V1 is not a DST/offset scheduling
engine. Existing ambiguous/nonexistent DST wall-time semantics are unchanged.

## Validation, rollout and rollback

Focused tests cover real owner/manager updates, auth/tenants, recipient overlap,
archived teams, inactive/foreign workers, mixed assignment edits, no-ops, invalid
ISO inputs, stale clients, concurrent identical targets, successive revisions,
initial creation, generated jobs, stale read suppression and shared-copy access.
Actual recurring/iCal tests verify no schedule notices for their non-rescheduling
paths. SSR tests cover EN/ES, local/overnight formatting, mobile wrapping/touch
links, worker routing and suppressed content. Full regressions include assignment,
decline review, cancellation, shared acceptance, completion/approval and invoices.
All external email paths remain unchanged; tests use local fixtures/mocks only.

Schema changes are additive: optional job revision, optional schedule metadata,
a notification type and per-user index. No backfill or historical notifications.
An eventual authorized deployment needs backend schema/functions and frontend;
refresh old forms to gain stale-edit guards. No deployment is performed here.
A rollback must retain the widened schema/notification type while new rows exist;
old frontends show the safe generic title/body and existing worker job link.
Do not blindly remove fields/enums from populated data. No destructive cleanup
or production reconciliation is included. Keep PR draft for founder review.

Final local validation: 2,078 tests across 217 files passed, including 26 focused
schedule backend cases and 5 worker presentation tests. Both Convex/frontend
typechecks, frontend-only build and git diff --check passed. Existing Node
deprecation, missing TypeScript source map and bundle-size warnings are
nonblocking. No root build, real emails or production mutations were performed.
Mobile behavior is verified through rendered component tests and existing
44px touch-target styles; no authenticated browser/production smoke test was run.
