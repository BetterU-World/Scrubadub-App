# Partner shared-job acceptance enforcement V1

## Boundary and compatibility

The original acceptance implementation synchronized the shared-work summary only
after acceptance; it did not authorize assignment or execution. Recipient copies
could reach Approved with a Pending share, create recipient-worker obligations,
and subsequently be cancelled by a late company rejection.

`sharedJobAuthorization` checks both the job marker and the indexed reverse link.
Missing/duplicate/mismatched links fail closed. Pending and Rejected work cannot
be operationally mutated. Accepted/In Progress/Completed shares still require all
ordinary tenant, role, assignment, task, inventory, worker-evidence and lifecycle
checks. Accepted work survives disconnection. Original/non-shared jobs retain
their existing behavior.

Checks run inside the protected mutation's transaction, including upload-intent
issuance and attachment consumption. Alternate Owner execution, review,
inspection, reshare, customer-pricing metadata and worker financial paths are
protected independently.
Financial guards precede new materialization; exact retries against existing
frozen worker obligations remain read-only and do not recreate debt. Existing
partner debt/settlement/adjustment history is not rewritten.

Only a pristine Scheduled, unassigned Pending copy with no execution/form/
inspection/red-flag evidence can receive a company response. Existing inconsistent
records return a manual-review error without altering their evidence. Repeated
company responses retain the existing "not pending" failure behavior. Final
submission and compensation preserve their existing idempotency guarantees.

## Disconnect

The transaction finds Pending work in both directions using the existing recipient
and status index. Untouched requests become Rejected and their copies Cancelled,
with cancellation actor/time/reason. Accepted work and obligations are untouched.
Inconsistent Pending copies remain unchanged and receive a
`shared_job_manual_review_required` audit record. IDs are returned and the count
is shown to the disconnecting Owner as a manual-review notice. The Pending execution guard
continues to block them even if the companies reconnect later.

The scan fails atomically when either company's Pending request set exceeds 500;
it never silently processes a partial set. Connection lookup similarly fails
closed above 500 originating connection rows. Larger histories require a separate
bounded operational procedure, not an implicit migration in this repair.

## Existing-record review procedure (not executed)

No production diagnostic or migration is part of this change. A separately
authorized read-only diagnostic should paginate shared records and report only
company/job/share IDs, statuses, response timestamps, linkage validity, assignment
presence, timer state and counts of linked forms/inspections/financial obligations.
It should flag Pending copies with assignments, non-Scheduled status, form or
execution evidence; Rejected copies with later mutations; malformed links; and
contradictory cancelled/accepted states. Do not include customer names, addresses,
contact details, photos, tokens or credentials in the diagnostic output.

An authorized human must review the source and recipient evidence and agree a
case-specific resolution. Do not automatically accept requests, cancel active
timers, delete forms/photos, reverse worker obligations, or alter the originating
company's debt. Existing open timers need prompt review: this repair freezes
operational writes but deliberately does not rewrite their accounting history.
Remediation requires a separate reviewed task and explicit production authority.

## Release order and verification

1. Run focused acceptance and existing partner/execution/attachment/financial
   regressions, both typechecks, frontend build and whitespace checks.
2. Deploy Convex enforcement first, using the repository's normal production
   deployment procedure (`npx convex deploy`). Do not use a frontend-first release.
3. Only after backend deployment succeeds, publish the frontend through the normal
   frontend release pipeline. The local verification command is
   `npm run build:frontend`; the root build script also deploys Convex and is not
   a validation command.
4. With approved synthetic tenant accounts in an authorized verification
   environment, verify Pending request viewing and recipient response, rejection
   denial, direct mutation denial, Accepted assignment/execution/rework/submission,
   duplicate submissions, disconnection in both states, and preserved financial
   retries. Confirm no operational/notification/financial writes on denied calls.
5. Check EN/ES notices and direct edit/work routes. Older frontends may still show
   obsolete controls, but the deployed backend must deny their calls.

No deployment, merge, production inspection or production data changes were run
while preparing this repair. No schema change or automatic backfill is required.

## Separate follow-ups

Shared-copy inventory/property identity, red-flag support without owned property
IDs, Owner completion-package synchronization and same-partner rejected reshare
remain separate product issues. This repair does not redesign those workflows.
