# Cleaner completion repair and guide coordination

## Canonical workflow

Job detail → Continue Checklist → Review job → select actual performed workers →
Submit job for review → Submitted (waiting for owner review).

Review is the existing checklist review screen, not an added completion stage.
The final action calls `forms.submit`, which already shares the transactional
`submitJobExecution` helper with `jobs.completeJob`. It submits the canonical form
and job together, checks inventory/checklist/worker evidence and permissions, stops
the timer, and notifies the owner. A submitted job is not approved or paid.

Submitting while paused ends the pause at the submission timestamp. This preserves
the tested backend behavior; the UI explains it rather than imposing a conflicting
resume requirement. No submission mutation or authorization rule changed.

## Root causes repaired

- Job detail required a submitted form before enabling a second completion action,
  but normal form submission also submitted the job, removing that second action.
- The second completion dialog required a worker selection that was rendered in
  the Deny dialog. Remove this redundant dialog and the misplaced selector. The
  checklist review retains the worker selector as the single confirmation point.
- Final checklist submission was named Complete Checklist despite completing the
  job too. Rename the review and final actions in English and Spanish.
- Missing inventory, incomplete checklist, and team permissions were discovered
  through generic compensation errors. Review now shows these blockers in advance,
  includes the inventory return link, and maps stale server rejections to actionable
  messages. The server remains authoritative when data or permissions change.
- The page could attempt checklist writes after submission and lacked an immediate
  repeated-click guard. Submitted/approved forms now show status/navigation, and
  final submission has an in-flight guard. Legacy In Progress jobs whose form was
  already submitted use the same review path without attempting an editable-score
  update first.

## Draft guide PR #261: do not merge unchanged

The guide branch has not been modified. `cleaner-guide-completion-follow-up.patch`
contains exact English and Spanish changes against guide commit
`9f3161e916e8abfd0da4efa63b4777681e55fbf8` from draft PR #261.
It was checked with `git apply --check` against those two original guide files.

After the repair is accepted and available to the environment being documented,
apply that patch to the guide branch, review both languages, and rerun its structural,
render, typecheck, and build checks. If #261 changes before then, rebase/review the
patch instead of applying it blindly. Do not merge #261 while it describes the
removed controls. Neither PR is merged or marked ready by this task.

The patch:

- Replaces Review & Complete / Complete Checklist with Review job / Submit job for
  review, and Revisar trabajo / Enviar trabajo para revisión.
- Removes the separate Complete Clean instructions and missing-selector workaround.
- Replaces mandatory resume instructions with the consistent stop-on-submit rule.
- Updates rework and troubleshooting to the same action names and blockers.
- Preserves the cleaning-only scope, invitation help, 14-day availability rule,
  and unrelated draft-recovery caveats.

## Remaining issues outside this repair

Fast Mode still defaults on. The signature canvas is still not persisted, and local
draft Resume still restores only self-score. Some older form labels remain English.
Guide reader/listing dates are still hardcoded. Maintenance retains its own screens;
this change does not redesign them. The new permission field requires deploying the
backend query together with the frontend through the normal release process.

Validation here uses local Convex tests and React DOM interactions; it does not
claim an authenticated browser walkthrough or a deployment.

## Final release revalidation (October 30, 2026)

Updated this branch with main at `66ebef9`, including merged staff #263 and client
#264 authentication repairs, without conflicts. The submission transaction and
guards are unchanged. 125 tests across 12 completion, authorization, pause,
accounting, and mounted staff/client authentication suites pass. Frontend build
passes with the existing large-chunk warning. Both typechecks pass.

Guide #261 is being aligned using the prepared patch; its final branch supersedes
the patch's original draft-restoration wording. Keep both PRs separate. Release
order: merge #262, deploy its Convex query, release its frontend, then merge/release
#261. Alternatively merge #262 then #261 before one coordinated release, provided
Convex succeeds before that frontend becomes available. Do not release the guide
against the old completion UI. No schema/data migration is needed.

The new frontend requires `canCurrentUserSubmit`; the old frontend tolerates the
additional query field. Therefore backend first is safe; frontend first is not.
From the reviewed merged release checkout in Git Bash, with the existing authorized
SCRUB production CLI context, the backend command is:

```bash
npx convex deploy --deployment-name canny-spider-91
```

Only after it succeeds should the normal frontend release publish its build.
The repository's `npm run build` already uses `convex deploy --cmd` (build locally,
then push Convex); a hosting pipeline must publish the frontend only after that
whole command succeeds. `npm run build:frontend` alone never deploys Convex.
No deployment was executed during this review.

## Future Fast Mode product requirement (not implemented)

Standard Mode should be the default. Owners should control Fast Mode eligibility;
managers should manage eligibility only with delegated permission. Trusted cleaners
should visually verify tasks with fewer taps while retaining required quality
control, inventory, performed-worker confirmation, and submission obligations.
Current Fast Mode starts enabled and has no owner eligibility gate. Neither PR
implements or promises the future permission model.
