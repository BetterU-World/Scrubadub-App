# Completion and approval notification recipient safety

Based on main `51fe470` after #279–#282. This slice changes communication recipient
selection and delayed email eligibility only. Assignment notifications, shared-job
authorization, lifecycle transitions, acceptance and performed-worker history retain
their existing contracts.

## Audiences

- Completion: active owners of the job's company only. No new manager audience.
- Approval and rework: unique current direct/team workers, active and in the job's
  company, with an execution-compatible role for the job type. An already assigned
  manager/owner remains eligible for non-maintenance work; being a manager or the
  assigned inspector alone does not add a recipient. Maintenance work uses the
  existing maintenance-role rule. Historical performers do not replace assignments.
- Team and membership company IDs are independently checked. Archived teams retain
  member access as before. Losing one overlapping source does not remove a worker
  who remains directly assigned or a current team member.
- Selection uses indexed, bounded reads (maximum 1,000 owners, members or unique
  workers). Overflow rejects the transaction instead of silently truncating notices.
  The broadly used `getJobRecipientUserIds` helper is unchanged.

## New queued emails

Completion carries company, job, canonical form, owner, completion timestamp and
execution sequence. Delivery requires the same submitted execution and form/time.
The job/form may be submitted or approved together: rapid approval does not suppress
a valid completion message. Rework, restarted work, cancellation and a newer
submission suppress the older message, even when submissions share a timestamp.
The submitting actor's current same-company name is used; a missing/foreign actor
is displayed as “A worker” rather than blocking the owner's valid review notice.

Approval carries company, job, canonical form, worker, approval timestamp, rework
count and optional execution sequence. Delivery requires the matching approved
event/form and current eligible direct/team assignment. The sequence may be absent
when approving legacy submitted work; no historical execution evidence is invented.

Both actions recheck shared-copy acceptance/linkage with the existing shared-job
guard. Recipient-company copies never gain access to source-company property data:
current property linkage must be local, otherwise delivery is suppressed. Valid
copied jobs use their existing property snapshot. The recipient email, property name,
company identity and reply-to are freshly resolved. Snapshot arguments remain in
the queue for argument compatibility but do not authorize delivery.

No query/suppression path logs recipient addresses, property details or message
contents. Existing template escaping and sender/reply-to rendering are unchanged.

## Legacy queued argument inventory and policy

Before this PR, the only completion producer was `lib/jobSubmission.ts` and the only
approval producer was `mutations/forms.ts`. The registered action contracts were:

- `sendJobCompleted`: required `email`, `propertyName`, `cleanerName`, `completedAt`,
  `companyName`; optional `replyTo`.
- `sendJobApproved`: required `email`, `propertyName`, `companyName`; optional
  `replyTo`.

All those validators remain accepted. New optional `completionContext` and
`approvalContext` fields add identity. Old payloads without context return `null`
without sending or logging: their job, tenant, event and current recipient cannot
be authenticated from display strings/email. This deliberately drops any still
pending legacy completion/approval emails when these functions are eventually
deployed. Existing in-app records remain. No guessed email-based lookup, backfill,
resend or queue mutation is performed. Legacy **assignment** email compatibility
is untouched.

## Verification and limits

`jobReviewNotifications.test.ts` uses real local Convex mutation/action dispatch
with mocked completion/approval senders. It covers audience filtering, corrupt
tenant/team links, archived teams, maintenance roles, replay, fresh delivery fields,
membership/removal/deactivation, rapid approval, rework/resubmission, legacy payloads
and accepted/in-progress/completed/pending/rejected/malformed shared-copy states.
Existing assignment, completion, decline, cancellation and shared-job suites remain
regression gates.

Local validation: new suite 38/38; focused safety/assignment/completion/decline/
cancellation/shared-job/template/identity suites 276/276 across 10 files; full
`npm exec vitest -- run --maxWorkers=2` 1,918/1,918 across 211 files; both
`npm run typecheck` projects passed; `npm run build:frontend` passed; whitespace
checks passed. Existing TypeScript source-map/deprecation and large-bundle warnings
were nonblocking. Local Node 24 differs from CI's Node 20; no dependency changes
were made. Email dispatch in the new suite is mocked.

There is still a race between the last read and an external provider call. Already
sent mail cannot be recalled. This PR adds no delivery ledger, external exactly-once
guarantee, retry infrastructure, preferences, schedule notices or reminders. Existing
in-app records remain historical; later access changes do not erase them. Real inbox
receipt and production verification require separate authorization. No deployment
or real email send is part of this PR.

The root and frontend `vercel.json` files hold automatic Git deployments for the
exact `codex/notification-recipient-safety` branch using `git.deploymentEnabled`.
Other branches retain their normal behavior. This is a source-controlled branch
hold, not a project/environment setting change. A future merge to main may deploy
and requires separate founder approval. The existing GitHub Actions workflow runs
tests, typechecks and frontend-only build; it contains no deployment step.
