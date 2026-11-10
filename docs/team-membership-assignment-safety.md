# PR6: membership and assignment safety

**PR7 policy update:** This document records the PR6 investigation. The founder subsequently approved persistent denial for inactive/archived worker profiles. See [worker offboarding security](worker-offboarding-operational-access-security.md) for the implemented authorization policy; the historical unresolved question below is superseded.

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

## Focused review of a70fa15: disabled-profile authorization and user ownership

**Pre-merge policy question remains open:** worker-profile disablement is not currently a persistent job-access or account-disable boundary. The review below demonstrates the gap; it does not declare this access safe or intentional. This correction does not change shared assignment or general session authorization. Founder review must choose the desired disablement semantics before relying on profile status for offboarding.

### Concern 1: exact authenticated behavior

| Boundary after profile becomes inactive/archived while users.status stays active | Actual behavior (unchanged by this correction) |
| --- | --- |
| setWorkerStatus transition | Revokes all existing staff sessions and emits account_disabled with source worker_profile; does not change users.status |
| upsertWorkerProfile transition | Same revocation and security event on status transition; creating a non-active profile also revokes existing sessions |
| Repeating the same disabled status | Existing-profile paths only revoke on transition; a newly issued session is not revoked by an unchanged-status call |
| Password login | authActions.signIn validates password and users.status, not workerProfiles; can issue a fresh session |
| Session creation | sessionInternal.create inserts the principal binding without a profile check, including if issuance races after revocation |
| Action session validation | lib/sessions.getPrincipalFromSessionToken checks expiry/revocation and active users.status; no profile status check |
| Query/mutation session validation | lib/sessionAuth.requireVerifiedStaffSession checks the same account/session boundary; no profile status check |
| Hydration | authQueries.getCurrentUser uses the general staff guard; a fresh session hydrates an active account despite disabled profile |
| Direct or current-team assignment | Fresh login can still read job details/list/calendar and forms, start compatible jobs, and issue bound form-photo upload intents; shared-job/lifecycle/role/tenant checks continue to apply |
| Operational communications | PR288 suppresses explicitly inactive/archived profile recipients and assignment/schedule inbox reads independently of job-access policy |
| Explicit active-profile guard | requireActiveWorkerProfile rejects missing/non-active profiles, but its production caller is completeMyOnboardingItem; it is not used by general login, job execution, form reads or attachments |
| Own financial history | A fresh active-account session can use outgoingQueries.listRecipientHistory under its frozen recipient/company rules, irrespective of assignment/profile status |
| Account inactive | Canonical updateEmployeeStatus revokes sessions; password login fails and staff queries/mutations deny access |

Evidence of intent is conflicting: profile transitions revoke sessions and label security events account_disabled, but they deliberately store a separate administrative status without changing the account or checking it at login/session use. No repository policy resolves whether this is a one-time lifecycle logout, persistent workforce execution disablement, or account-wide offboarding. Therefore it is a demonstrated policy/authorization gap, not evidence that continued access is founder-approved. Introducing any of the following rules without a decision would invent policy:

- Deny all staff login/session access for inactive/archived worker profiles: would also remove Manager administrative grants and own historical financial access.
- Deny execution/worker operational access only: would need a clear distinction between current job details, historic evidence, Manager administrative job reads and financial reads.
- Preserve current separation: users.status controls account access, profile status controls administrative lifecycle and communications; product copy and offboarding guidance would need to make this explicit.

A disabled Manager currently has no special profile exemption or restriction: after re-login, existing canSeeAllJobs or assignedManagerId grants still work; assignment is still separately required for execution. A directly assigned compatible Manager can execute even with a disabled profile. Maintenance workers have the same profile gap for maintenance jobs. Owners cannot be given a worker profile through canonical upsert; Owner access is independently role-based. Legacy users without profiles remain valid. The shared assignment helper is intentionally not changed to collapse these distinct grants.

Authenticated characterization tests in disabledProfileAuthorizationAudit.test.ts cover both disablement mutations, inactive and archived states, direct/team-only paths, old-session rejection, real fresh password login, action-session validation, job execution, form reads, bound attachment issuance, own-history authorization, independent Manager/Owner grants, maintenance, legacy users, account disablement and the missing-profile upsert branch. They are explicitly named as characterization of the unresolved gap, not a security guarantee. No actual upload, email or payment is sent.

### Concern 2: complete helper caller trace and correction

Production call graph (searched across convex/):

- getActiveTeamMembers -> getActiveTeamMemberUserIds -> getJobRecipientUserIds.
- getJobRecipientUserIds -> mutations/jobs.cancel (cancellation notices), lib/performedWorkers.freezePerformedWorkers (submission/historical candidates), and workerCompensation.submissionCandidates (roster display).
- Execution and team-lead authority do not call this roster helper: isUserAssignedToJob -> isActiveTeamMember -> getActiveTeamMembership, and canSubmitFinalJob -> isActiveTeamLead -> getActiveTeamMembership. The per-user helper already checks the referenced user company/status.
- Explicit assignment deltas use effectiveDeclineWorkers; review recipients use currentReviewWorkers; both separately validate loaded user company/status/role. Job/team roster decorations also have their own tenant checks.

At a70fa15 the roster helper's exported IDs could include a foreign user when the membership.companyId matched the team but the referenced user belonged elsewhere. The known recipient/candidate callers already rechecked user company, so this audit did not prove an end-to-end foreign-user execution or notification exploit through those callers. Nevertheless the shared helper violated its tenant contract and could mislead any consumer trusting those rows/IDs. The correction filters referenced users to the team's company inside getActiveTeamMembers, before either exported rows or IDs leave it. Missing users are also excluded. Account status is not filtered here, preserving roster semantics; operational status/role/profile checks remain downstream.

The existing by_teamId_active index and 1001-row take remain; the cap is checked before filtering. Archived teams remain valid for existing access. No schema/index, stored membership, stored assignment, lead grant, financial calculation or client-commitment changes are introduced by the ownership filter.

### Performance and policy-change review

The helper adds one bounded user lookup per tenant-matching membership (maximum 1000) and no table scan, write, scheduler or background repair. Its current downstream recipient/candidate path also resolves users, so this adds bounded repeated reads there; this is the explicit cost of enforcing the shared helper's ownership contract, not a claim of zero overhead. Per-user execution/lead checks are unchanged. Assignment deltas now again use account-active assignment eligibility without the profile communications filter, restoring the pre-PR semantics described below. No broad profile reads were added to login/session/job/form/attachment/financial guards. The indexed profile checks now run at communication boundaries, bounded by existing recipient/inbox caps; no new unbounded query or global session/job-access policy is introduced. Live load benchmarking was not performed.

### Unintended shared-helper effects corrected during review

Tracing all callers also proved that the prior profile-communications filter had been placed too broadly:

1. getJobRecipientUserIds supplies freezePerformedWorkers and workerCompensation.submissionCandidates, not only cancellation notifications. Filtering disabled profiles there could prevent recording a current assignee who was still authorized to work. Restore its account-active, same-company assignment union and apply operationalWorkerAvailable at mutations/jobs.cancel instead. Disabled recipients still get no cancellation notice; performer/history policy is not changed by a communications predicate.
2. effectiveDeclineWorkers supplies assignment deltas, worker review eligibility and the single-vs-multi-worker decision, in addition to communications. Excluding disabled profiles could turn a multi-worker decline into legacy single-worker whole-job denial/cancellation even while those users remained authorized to execute. Restore its pre-PR active-account/compatible-role union; filter profiles only in assignment notice creation/removal, schedule notice audience selection, delivery-time assignment state and decline-review notification recipients. currentReviewWorkers remains a communications-only helper and keeps its filter.

Regression tests prove that a disabled-profile current assignee remains a performed-worker candidate and can be recorded in immutable completion evidence under existing authorization; that an active worker's multi-worker decline with another disabled-profile assignee remains a review request, preserves scheduled status and creates no client scheduling event; and that cancellation/assignment communications remain suppressed. These corrections preserve the established access/lifecycle policy while the broader profile-disable question remains unresolved.

Final local validation counts, commit and current CI state are recorded in the same Draft PR #288 description.
