# Durable job email delivery and bounded recovery

Based on main `bd82d8a`, including merged #283. Scope is assignment, completion
and approval email only. Existing in-app notifications, audiences, combined
assignments, acceptance/lifecycle transitions, execution evidence and shared-job
authorization remain authoritative. Proposal/agreement delivery is a reference,
not part of this implementation. No manual resend or frontend dashboard is added.

## Delivery contract audit

| Flow | Producer and delivery check | Stable identity |
| --- | --- | --- |
| Assignment | `lib/jobAssignments.ts`: `notifyInitialJobAssignment` / `applyJobAssignmentChange` through `notifyAdded`; `jobAssignmentNotifications.assignmentEmailState` checks revision, effective active same-company worker, job lifecycle and shared acceptance | company, job, assignment revision, recipient |
| Completion | `lib/jobSubmission.submitJobExecution`; `jobReviewNotifications.completionEmailState` checks owner, canonical form, completion timestamp, submitted sequence/evidence and shared acceptance | company, job, form, completion timestamp, execution sequence, recipient |
| Approval | `mutations/forms.approve`; `jobReviewNotifications.approvalEmailState` checks current direct/team recipient, approved event/form and shared acceptance | company, job, form, approval timestamp, rework count, optional execution sequence, recipient |

Direct/team overlap stays unique. Reordered/unchanged assignments do not create
events. Historical performers do not replace current approval recipients. A
completion remains eligible after approval of the same submission; rework and a
new submission supersede it. Legacy submitted work can still be approved without
inventing execution history. Modern assignment dispatch also passes its frozen
company ID to the existing query, so moving a job between tenants suppresses it.

Before PR2, the three `sendJob*Email` helpers collapsed all provider results into
booleans and operational actions logged failures. Resend 6.9.3's installed SDK
returns `{data,error,headers}` and converts network/JSON failures into
`application_error` (sometimes with null status); it does not retry this send call.
An error result therefore does not prove rejection. The new `deliverJob*Email`
helpers retain template markup/escaping/identity while returning structured,
sanitized outcomes. Boolean wrappers remain for compatibility. No raw error object
or error message is logged by these three transports.

Convex scheduled actions are at most once and do not automatically retry transient
failures. Scheduling in a mutation commits atomically with its writes, whereas an
action's external call and later mutation cannot form one transaction. Reference:
[Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions).
The existing proposal/agreement prepare/finish patterns preserve provider-accepted,
failed and unknown evidence. PR2 uses that distinction without adopting their
manual resend behavior or storing recipient addresses.

## Ledger and states

`operationalEmailDeliveries` stores one event/recipient record with at most four
claim summaries. `ensureOperationalEmail` uses the indexed
`(companyId,eventKey,recipientId)` lookup in the same transaction as creation and
scheduling. Concurrent registration sees one record; concurrent dispatch obtains
one atomic claim. Scheduled callbacks contain the existing legacy snapshots, but
the ledger contains only IDs, event timestamps/revisions, state and safe metadata.

| State | Meaning and allowed progression |
| --- | --- |
| `pending` | Registered; no attempt claimed. Goes to `claimed`, or `skipped` when the recovery window expires. |
| `claimed` | One attempt owns dispatch for ten minutes. Goes to `provider_accepted`, `failed`, `unknown` or `skipped`. |
| `provider_accepted` | Provider API accepted the request. Terminal; **not evidence of mailbox delivery**. |
| `failed` | Definite failure. Only `rate_limited` and `pre_send_unavailable` with `nextAttemptAt` can become `claimed` again. Permanent/exhausted failures have no retry timestamp. |
| `unknown` | Provider outcome cannot be proved. No automatic retry. Late positive evidence from the same expired claim can set `provider_accepted` without sending again. |
| `skipped` | Recipient/event no longer eligible or recovery window expired. Terminal. |

`attemptCount` counts claimed dispatch attempts, including an eligibility check
that skips or fails before any external call. `sendStartedAt` marks entry into the
send stage, not proof of provider acceptance. Attempt summaries preserve each
claim's times and outcome; retrying does not erase earlier failures. A provider
message ID is recorded only when returned and matching a bounded ID format.

Each claim schedules a watchdog. `beginSend` fences an action resuming after
expiry and permits the external stage only once per claim. Expiry sets `unknown`
even if the action might have stopped before sending. It never releases a lease
for automatic resend. If provider acceptance occurs but the finish mutation fails,
the claim remains until conservative unknown recovery; no retry is inferred from
the action exception. Stale finalizers and old watchdogs cannot overwrite a newer
claim or a terminal outcome.

## Retry and recovery policy

- Maximum four claimed attempts, within one hour of record creation.
- Retry delays: one, five and fifteen minutes, plus deterministic jitter of up to
  thirty seconds. Scheduled delivery always revalidates current eligibility.
- Only explicit `rate_limit_exceeded` / HTTP 429 and a failed eligibility read
  known to precede the external stage are automatically retryable.
- Configuration/kill-switch/local-mode failures and documented validation,
  authorization or quota rejections are terminal failures. Quota failures are not
  treated as request-rate throttling.
- Thrown network/timeouts, SDK network errors, malformed/unknown responses, 409
  conflicts and 5xx are conservatively `unknown`. Even when provider docs suggest
  trying later, they do not establish that this particular email was not accepted.
  No automatic retry is based on an ambiguous exception or action timeout.

Classification references: [Resend errors](https://resend.com/docs/api-reference/errors).
No provider idempotency key is introduced: retry payloads are deliberately freshly
resolved and may change. Resend's optional key retention is finite and payload
changes can conflict, so this implementation does not rely on it to authorize
unknown resends. Reference: [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

The internal five-minute recovery mutation selects at most 25 expired claims,
25 due pending records and 25 due retryable failures using status/time indexes.
It repairs only missing/completed/failed/cancelled dispatch callbacks, leaving
pending/in-progress scheduled functions alone. It never scans jobs, revives old
assignment history, or schedules a terminal unknown/permanent failure. Expired
pending/retryable work is skipped. Recovery repairs scheduling and has no external
side effects itself. Large backlogs drain in bounded batches; this is not a
global provider throughput/rate-control system.

## Queued legacy compatibility

All old `sendJobAssigned`, `sendJobCompleted` and `sendJobApproved` argument fields
remain accepted; `deliveryId` is optional. New producers persist the ledger before
scheduling and include its ID.

- Actual queued assignment callbacks with job/worker/revision context may register
  that event on arrival and dispatch through the ledger. Their company is resolved
  from the current job because the older context omitted it; current eligibility
  still uses the existing guards. The original historical company cannot be
  reconstructed from that payload. No old-job enumeration/backfill is performed.
- Actual queued completion/approval callbacks with #283 context register their
  frozen event on arrival. Duplicate callbacks converge on the same record.
- Unidentifiable completion/approval payloads remain a silent no-send, exactly as
  #283 specified. They cannot support tenant-scoped diagnostics.
- Unidentifiable assignment payloads retain their historical one-shot snapshot
  send contract, with no ledger, guessed identity, recovery or automatic retry.
  They cannot be deduplicated/revalidated safely from email/display strings.

## Owner-only diagnostics

`operationalEmailDelivery.listForOwner` is the only public endpoint added. Supply
the existing verified staff `sessionToken`, optional matching `userId`, and
`paginationOpts: {numItems: 1..50, cursor: null | string}`. The active owner session
determines company scope; no company ID is accepted from the caller. Managers,
workers, invalid/revoked/inactive sessions cannot use it. Other owners see only
their own company's indexed pages. No mutation/manual retry is exposed.

The result reports event kind/key, job/recipient IDs, state, counts, timestamps,
sanitized category, provider ID and bounded attempt summaries. It excludes full
recipient email, body, property/address details, secrets and provider error text.
It cannot distinguish delivered/bounced/spam-folder outcomes: no provider webhook
or mailbox verification is added. Reading diagnostics performs no retry or repair.

## Release, migration and rollback

This is an additive new table and indexes; no backfill, historical replay, migration
or environment setting is required. Existing rows in other tables are untouched.
No production inspection/mutation, deployment or real email is performed by this
implementation. Release remains subject to founder review and separate approval.
No temporary Vercel deployment configuration is added; existing Git integration
may create automatic previews when the draft is pushed, as with the prior cleanup.

After an authorized deployment, only new operational producers and actual surviving
queued callbacks enter the ledger. Recovery can schedule new external attempts
only for definite failures within the caps above; the existing external side-effect
guard continues to apply. No manual retry procedure for unknown sends exists.

Do not blindly roll back to pre-PR2 callback validators while deliveries are queued:
they do not accept the new `deliveryId`. A reviewed rollback must retain callback
and ledger compatibility while halting new creation/recovery, or deliberately
accept and document suppressed callbacks. Never clear/recreate unknown records to
force resend. Preserve terminal records and event identity during rollback or
forward repair; losing that ledger loses deduplication evidence. Any rollback,
queue operation or production reconciliation needs separate authorization.

## Verification and residual limits

Tests mock external senders and the provider. Coverage includes producer/bridge
deduplication, team/direct overlap, concurrent claims/send-stage fencing, accepted
IDs, retry caps/backoff and scheduled execution, pre-send query failure, permanent
and ambiguous failures, lost finalization, expiry and late evidence, recipient/
tenant/lifecycle/revision changes, rapid completion/approval, shared acceptance,
legacy payloads, bounded recovery, and owner/tenant/metadata boundaries. Existing
assignment, submission, approval/rework, decline and cancellation suites remain
regression gates.

Local validation: the two new suites passed 51 tests. Full regression passed
1,969 tests across 213 files with `npm exec vitest -- run --maxWorkers=2`.
Both frontend/Convex typechecks, `npm run build:frontend`, and `git diff --check`
passed. Existing TypeScript source-map/deprecation and bundle-size warnings were
nonblocking. Local Node 24 differs from GitHub CI's Node 20; CI is a separate gate.
No dependencies, lockfiles or deployment configuration were changed.

There is a race between eligibility reads and external delivery. Already delivered
mail cannot be recalled. Provider visibility may be lost after a successful send
and failed persistence, and the conservative policy may leave unsent mail unknown.
It favors preventing duplicate sends over automatically guessing. Ledger uniqueness
does not imply exactly-once external delivery, mailbox receipt or a global mail
queue. Deliberate record deletion, manual provider resends, rollback incompatibility
and unidentifiable legacy callbacks remain outside its duplicate protection.
