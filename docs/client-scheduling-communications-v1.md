# Client scheduling communications V1

Base: main `7fb43aa`, including merged PR #286. This extends Client Portal V3's
request timeline and Services page. It does not add a booking/approval model,
notification center, unread tracking or external delivery.

## Actual lifecycle and producer audit

| Path | Current contract | V1 behavior |
| --- | --- | --- |
| Authenticated request submission | `clientRequests.createAuthenticatedClientRequest` stores a preferred date/window and an idempotency key; it creates no job | Existing request-received timeline only; no confirmed event |
| Company schedule proposal | `clientRequestScheduleProposals.createOrReplace` validates a proposed slot; `withdraw` withdraws pending proposals | Existing proposed-time UI/timeline; never a confirmed appointment |
| Client proposal response | `accept` creates a canonical confirmed job through `createJobFromClientRequest`; `decline` leaves the request open | Preserve existing accepted/declined timeline facts and replay behavior; acceptance's resulting job produces one confirmation |
| Direct Owner/delegated Manager confirmation | `jobs.confirmClientRequestSchedule`, guarded by `canManageSchedule` for Managers, delegates to `createJobFromClientRequest` | Insert a confirmation fact inside the creation transaction; existing-job replay does not insert again |
| Manual/quick and proposal-linked job creation | `jobs.create`/`createQuick` use `createCanonicalJob`; the accepted-proposal path links `sourceProposalId`, not `sourceClientRequestId` | Existing inventory/timeline projection remains; no new durable client commitment inferred from these internal creation paths |
| Existing-job schedule edits | `jobs.update`, guarded by `canCreateJobs`, tenant and shared-work access, changes date/start/duration | A material update to a canonical request job records a reschedule after PR #286's revision increment |
| Company cancellation | `jobs.cancel`, with existing Owner/Manager guards, sets `cancelled` | Record cancellation of the canonical request service in the same transaction; do not expose cancellation notes/reasons or actor identities |
| Worker decline/cancel | `jobs.denyJob` / `cleanerCancelJob` record staffing denial or decline review; they do not set company cancellation | No service-cancelled event. A canonical request commitment remains distinct from staffing acceptance; later company rescheduling is still communicated |
| Recurring/commercial schedules | Generation inserts jobs; template changes do not reschedule existing jobs | No invented confirmation for standalone generated jobs. A commercial-account request explicitly confirmed through the canonical request flow is covered |
| Partner jobs | Sharing creates an independent recipient-company copy; original edits do not propagate | Original canonical request service remains its own company's commitment. Incoming copies are excluded even if accepted; no partner data or schedule propagation |
| iCal/reconciliation | Reservation changes flag conflicts, without moving linked jobs | No event for reservation metadata or initial imports; no new sync behavior |

No calendar drag/drop rescheduler, automatic client confirmation, series-wide job
rescheduler or multi-contact recipient fanout was found in the inspected paths.
Walkthroughs are separate appointments. Untouched shared-copy rejection is not a
client service cancellation. Historical fixtures/backfills are not producers.

Commercial account pause/end is operational lifecycle, not access revocation.
`commercialAccounts.transition` records lifecycle history and reports future jobs;
it neither revokes the client relationship nor automatically cancels those jobs.
Existing `getClientLocations`/client-home projections retain paused/ended accounts
and their status. Accordingly, `currentClientLocation` intentionally retains
authorized scheduling history for active, paused and ended commercial accounts.
Current tenant, relationship ownership and session checks still apply; missing,
moved or revoked relationships suppress that history. New request scheduling
continues to require an active account through its existing validation. This does
not change generation, cancellation or commercial lifecycle policy.

## Durable facts and event identity

The existing timeline derives milestones from current records and has no durable
old/new job-window evidence. The small fact table supplies that missing history;
staff notifications are not reused as client authorization or as client delivery.

`clientSchedulingEvents` stores the minimum identity/window evidence required to
extend the existing timeline: company, client user, relationship, request, job,
location IDs, event kind, revision, timestamp, company timezone and old/new local
windows. It stores no title/body, worker names, pay, financial fields, private
notes, access instructions or partner details. There are no scheduled actions,
delivery callbacks, providers or retries.

Identity is `(jobId, kind, revision)`, checked through a compound index inside the
canonical mutation transaction. Confirmation uses revision zero; reschedule uses
the committed `scheduleRevision`; cancellation uses the schedule revision at
cancellation. Failed writes roll back both the operational change and its facts.
Duplicate confirmation replays use the existing canonical job; equivalent
concurrent reschedules converge under the PR #286 comparison/revision semantics.
A return to an earlier window is a real new transition. Cancellation retries keep
the existing mutation's rejection behavior and do not duplicate facts.

Only material local date/start/duration changes produce reschedules. No-op,
assignment-only and cosmetic edits do not. Date-only windows are supported; end
is derived from duration, including overnight end dates. ISO/offset timestamps
are not job schedule inputs. Local fields are formatted without browser timezone
conversion and use the event-time company timezone convention from PR #286.
Timezone-setting changes alone are not service rescheduling events.

The timeline shows confirmation and company cancellation as historical facts.
Only the latest reschedule revision with a window matching the current job is
returned. Superseded rows stay stored but are suppressed. Unversioned/manual
schedule drift also suppresses stale reschedule windows; it does not fabricate a
new event. These facts do not claim that a client read a notice or attended.

## Audience, authorization and projection

The audience is the single active `clientUserId` on the active, same-company
canonical client relationship. The current request/job relationship and property
or commercial account must agree. Incoming shared copies are excluded through
both markers and the reverse shared-job index. No company-wide client fanout.

Each portal query authenticates the current client session. Each returned fact
rechecks its tenant/request/job/location identity, current relationship owner,
active user and property ownership/availability. Deleted jobs, removed or inactive
properties, foreign/moved relationships and revoked sessions cannot expose fact
details. Current labels are resolved after authorization; historical property
snapshots are not used as an access grant. Cancellation remains visible as a
cancelled historical service, not an upcoming appointment.

Authenticated requests' `originClientUserId` is an additional boundary: replacing
a relationship contact does not give that contact another authenticated client's
request history or request-linked service windows. Events also retain their
original recipient identity. Legacy requests with no origin identity continue to
use the current relationship model; this slice does not invent historical contact
ownership or backfill identity. Snapshot-only legacy requests remain readable
through existing relationship access but their unverified location snapshot is
not returned as a current label.

Request-linked jobs/documents are additionally filtered by company and relationship.
Services and request details recheck location ownership, rather than trusting only
an old job relationship link. These changes do not alter billing/payment queries.

Event reads use client/request indexes and inspect the newest 100 rows before
authorization/supersession filtering. The existing linked-record queries are
bounded at 500 rows; schedule-proposal history uses newest-first order while
proposal/agreement presentation preserves its existing order. Existing
broader portal relationship/company caps remain. This is a bounded operational
view, not a complete archive: suppressed rows can consume the event window and
very old facts can fall outside it. No pagination or retention redesign is added.

## Portal experience

`/client/requests/:requestId` gains stable scheduling fact IDs in its existing
timeline, with old/new windows and authorized labels. A durable confirmation
replaces, rather than duplicates, the legacy synthetic scheduled milestone.
Company cancellation has a distinct terminal timeline/status summary and is not
worded as a request merely awaiting confirmation.

When current request status is cancelled but no durable cancellation fact is
visible, the timeline adds an undated terminal status marker. It carries no actor,
window or delivery claim and is not stored as a historical event. A real visible
cancellation keeps its original identity/timestamp and is never duplicated by
this marker. Earlier milestones remain completed rather than becoming current.

`/client/services` gains a small Scheduling updates section linking back to the
existing request route. Current, upcoming and recent inventory remain separate.
There is no new navigation route or unread badge; existing mobile client navigation
already exposes Requests and Services. EN/ES wording, wrapping, 44px touch targets,
visible focus and date-only/overnight presentation are covered by rendered tests.

## Compatibility, rollout and limitations

The only schema addition is the new table and its three indexes. Existing fields
and public mutation argument contracts are unchanged. No replay, backfill or data
migration is required. Preexisting canonical request jobs can produce a new
reschedule/cancellation fact on a real future change without fabricating a past
confirmation fact. An inactive/unlinked client at mutation time receives no new
fact; reactivation does not retroactively generate one.

A future authorized rollout requires backend schema/functions and frontend. No
deployment is performed in this work. Old frontends ignore the added projection
fields. Rollback should preserve the additive table/data and compatible readers;
do not delete events as a rollback step. Stale-edit protection remains PR #286's
optional revision contract, including its documented legacy-client limitation.

Standalone recurring/internal or proposal-only jobs, incoming shared copies, manual database writes
and future mutation writers are intentionally not new commitment producers. A
broader commitment model would require a separate product decision. No external
notification, preferences, reminders, payment, worker-notification redesign or
production reconciliation is included.

## Validation

Local validation passed: 2,115 tests across 219 files, including 26 focused client
scheduling backend cases and 8 rendered presentation cases. The targeted
cancellation/lifecycle selection passed 44 tests. Full regressions include worker
schedule changes, assignments, decline review, shared acceptance, completion,
approval and invoice email safety. Both Convex/frontend typechecks,
frontend-only build and `git diff --check` passed. Existing source-map, Node
deprecation/timer and frontend bundle-size warnings remain nonblocking.
The final full-suite run used four workers; an earlier run alongside concurrent
checks hit an unrelated resource test's five-second timeout. No tests were skipped
or timeout limits changed.

No authenticated browser or production smoke test was run. Portal presentation is
verified through rendered component tests, existing mobile navigation and the
44px touch-target styles. No real external notifications, production mutation,
deployment, environment/billing changes or root deploy-capable build was run.
The PR remains draft for founder review. Existing Git integrations may create
automatic previews after push; no deployment is manually triggered.
