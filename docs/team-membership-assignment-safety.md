# PR6: membership and assignment safety

Base: origin/main 82ac576, including merged #284 (operational email ledger), #286 (worker schedule notices), and #287 (client commitments). No AGENTS.md is tracked in this repository or present at the workspace parent. Work is isolated on codex/team-membership-safety; original checkout changes and stashes are untouched.

## Established behavior and precise before/after matrix

Assignment is a union of explicit cleanerIds and current active teamMembers. It is not a membership snapshot at assignment time. Existing comments in workerDeclineReviews, jobReviewRecipients and docs/independent-assignment-mutations.md explicitly preserve archived-team access. These semantics are retained; there is no retrospective job rewrite, repair job or notification fan-out.

| Operation / state | Before | After PR6 |
| --- | --- | --- |
| Add active same-company worker to team | Access to all existing team jobs, including future and historical jobs; no assignment event | Unchanged for valid tenant links |
| Remove team-only worker | Immediate loss of ordinary job list/detail/calendar/form/execution access at every status | Unchanged; linked stale assignment inbox entries and unread counts also suppressed |
| Remove member who is also directly assigned | Explicit assignment continues access; no job change | Unchanged, deduplicated recipient union |
| Archive team | Cannot newly assign archived team or add members; existing members retain job access | Unchanged; archive is not cancellation or membership revocation |
| Reactivate team | Existing assignment sources remain | Unchanged; no assignment/schedule/client event generated |
| Scheduled / confirmed job | Membership dynamically grants/revokes access; queued assignment email rechecks current eligible membership, revision and lifecycle | Unchanged, plus disabled-profile suppression |
| In-progress job | Team-only removal immediately revokes execution, including submission; direct assignment survives | Unchanged; no job timer, acceptance, form or checklist rewrite |
| Submitted / approved job | Access remains based on current membership/direct assignment, not performer identity; performed-worker evidence is frozen separately | Unchanged; no evidence or approval rewrite |
| Denied / rework job | Same dynamic access; execution/lifecycle guards still apply; assignment email not sent for these states | Unchanged |
| Cancelled job | Same assignment source semantics; default job list excludes cancelled; execution guards retain lifecycle rules | Unchanged; membership never records a client cancellation |
| Account inactive / pending | Staff-session guard rejects inactive/pending accounts; eligible operational recipients require active account | Unchanged; shared helpers additionally reject inactive accounts |
| Reactivate account | Assignment sources persist, access returns with valid new session; previously revoked sessions remain revoked | Unchanged; no notification replay or synthetic assignment revision |
| Disable/archive worker profile | Profile and users.status are separate; sessions revoked, but queued assignment/review communications could still reach active user record | Explicitly disabled/archived profile suppressed in common operational recipients (including cancellation), assignment/review/schedule recipient selection and assignment/schedule read checks |
| Change operational role | Canonical workers.changeOperationalRole updates user/profile atomically, clears Manager flags, preserves memberships and financial identity | Unchanged; incompatible execution role suppresses assignment email/inbox and review audience; no permissions added |
| Malformed membership company/team/user link | Several common access helpers trusted membership IDs without checking all tenant links | User, membership, team and job ownership must agree before team-derived access; direct path remains independently validated |
| Corrupt foreign team/roster pointer on local job | Job/team projections could decorate local results with foreign names/emails | Foreign team and roster decorations omitted; membership writes validate actual team ownership |
| Membership add/remove/lead change | Team creation/update/archive audited; individual membership changes lacked audit records | Membership action, actor and previous state audited transactionally |
| Payment/history | outgoingQueries uses frozen recipient identity independent of current assignment; active session/company guards still apply | Unchanged; no monetary calculation, deletion or reconciliation |

Worker list/detail/calendar and Manager personal visibility use getActiveTeamIdsForUser; forms, red flags, uploads and execution use isUserAssignedToJob. Shared helper hardening makes both reject malformed ownership links. Role compatibility still controls execution independently of ordinary job visibility. Manager canSeeAllJobs and assignedManagerId remain separate legitimate grants. No new Manager permission is introduced.

## Audit trace and intentional boundaries

- Team lifecycle: mutations/teams.ts create/update/setActive/addMember/removeMember/setMemberRole. Removal is soft (active=false, removedAt); no team hard-delete entry point. Mutations require owner or delegated canManageTeam, and same company. Add checks supported user role and same company; it may retain a pending/inactive roster member, whose account cannot execute or receive operational invitations.
- Worker lifecycle: mutations/employees.ts updateEmployeeStatus changes account status and revokes sessions; mutations/workers.ts setWorkerStatus/upsertWorkerProfile separately disable/archive profiles and revoke sessions. changeOperationalRole preserves user identity and memberships, resets Manager permissions, and audits. Company membership is on users.companyId; malformed or moved links must fail closed. Profile pending status, onboarding and jobEligibilityStatus remain distinct existing concepts; this PR does not invent new hiring eligibility policy.
- Assignment: lib/jobAssignments.ts normalizes source IDs, calculates eligible union deltas and increments assignmentRevision only for explicit assignment edits. Membership edits do not invoke it. Overlapping source removal is not effective worker removal. Existing pending decline reviews reconcile on explicit assignment edits only.
- Evidence: lib/performedWorkers.ts appends executionHistory snapshots at submission/owner historical confirmation. Submission authority is direct worker or team lead (plus existing owner/Manager authority). Removing a lead can block their submission; it never rewrites who performed prior work. Owner historical confirmation already exists for approved legacy work lacking evidence.
- Forms/photos/checklists: queries/forms.ts and lib/attachmentUploads.ts require live assignment/company authority; job mutations retain execution/shared-state guards. No evidence retention changes or storage deletions.
- Financial history: workerCompensation.ts consumes approvedExecution, freezes compensation identity, and retries from existing obligations before mutable job checks. outgoingQueries.ts authorizes a worker's own frozen recipient records without current job/team membership, while staff session and company boundaries remain required. Disabled accounts are not granted a special history login by this PR.
- Assignment email: jobAssignmentNotifications.assignmentEmailState rereads current revision, planned/unstarted lifecycle, shared acceptance, effective active same-company compatible workers and property ownership. PR284 claim/retry/outcome ledger remains untouched; skipped/ineligible stays terminal, and reactivation does not replay it. The new profile check runs on every delivery attempt through recipient resolution.
- Schedule notices: PR286 only emits on material schedule mutation to eligible retained cleaners; membership edits emit none. Existing read-time schedule revision, current assignment, role, shared-state and lifecycle checks remain; explicit profile disable now also suppresses notices.
- Client commitments: PR287 scheduling events remain exclusively at canonical service decisions. No membership/role/profile helper calls recordClientSchedulingEvent or changes job status, date or acceptance. Internal staffing changes never imply cancellation or rescheduling.
- Shared/partner jobs: recipient copy company is the operational tenant; sharedJobAuthorization requires accepted valid reciprocal links for operations. No assignment path imports the origin company's roster. Existing shared acceptance and tenant regression suites remain required.
- Reconciliation: no broad repair/background sweep exists or is added here. Canonical membership mutations remain transactional; Convex OCC handles conflicts. Read/delivery checks consult current rows. External email cannot be recalled, and membership can change after its last eligibility read; this is not an exactly-once or atomic-send guarantee.

## Proven corrections and safety rules

1. Validate all ownership links in common team access, recipient and team/job roster projections; bound common roster helper reads at 1000 with explicit failure above the cap. Archived team semantics remain intact.
2. Revalidate linked assignment inbox entries using current tenant, role, assignment, profile availability and shared-work acceptance; apply the same predicate to unread counts. Preserve linkless removal notices and all persisted notification evidence. Schedule snapshots retain their stricter PR286 checks.
3. Reject explicitly inactive/archived or foreign-company worker profiles for new operational communications (including cancellation, assignment, review and schedule notices), with backward compatibility for workers lacking a profile. Pending profile/onboarding policy is unchanged.
4. Audit membership mutations in their existing transactions, and validate team ownership before updating a membership's parent team. No schema changes.

No new frontend wording or controls are required for these corrections: the existing EN/ES inbox renders only currently authorized entries. This PR does not label assignment membership as historical work performed. A separate historical-work UX needs policy approval before implementation.

## Deferred founder policy decisions (no policy implemented)

- In-progress departure: retain current immediate revocation, introduce a job-specific explicit direct assignment with owner approval, or freeze a roster when work starts. The latter two alter access policy; no automatic snapshot/direct assignment is added.
- Historical jobs: retain current dynamic full-job access, expose a separately redacted performer-history view, or freeze full historical job access. A new team member currently sees historical team jobs; frozen work evidence is not authorization to reveal property/access instructions.
- Offboarding history: active same-company workers keep independent financial history; an inactive or moved account needs a dedicated restricted history identity/export policy before it can log in to prior-company records.
- Pending decline reviews after membership removal: leave durable pending review for company acknowledgement (current behavior), auto-resolve, or add a separate no-longer-assigned state. Automatic resolution would introduce a new business rule and is deferred.
- Membership notifications: no bulk existing-job invitation replay, no retroactive schedule notifications. A future member welcome/digest would require product policy and event identity design.
- Pending profile / onboarding eligibility: preserve current semantics; do not turn administrative onboarding metadata into execution authorization without a separate decision.

## Validation, rollout and rollback

New teamMembershipSafety tests exercise all eight job statuses, canonical add/remove/archive, direct overlap, current inbox/unread access, corrupt tenant links, Manager permission denial, deactivation/reactivation, role incompatibility, disabled profile delivery, immutable approved evidence/payments and concurrent explicit assignment plus membership removal. Existing full suite covers shared jobs, completion/approval, durable retry safety, schedule suppression, worker role transitions, Manager boundaries and client commitments.

No schema, indexes, migration, backfill, package or environment changes. No deployment or live invocation was performed; the task explicitly prohibits deployment, so skill push/smoke instructions are intentionally not run. No real email/payment/provider calls. Tests use convex-test and mocked transports. Frontend-only build is used; never root build.

Rollback: revert this PR and deploy through the normal separately approved release process. Stored membership audit entries are additive and remain valid. No historical data repair is necessary; reverting would restore the prior access/notification weaknesses. Newly suppressed ledger outcomes are not replayed automatically.

Final test counts and CI state are recorded in the draft PR description.
