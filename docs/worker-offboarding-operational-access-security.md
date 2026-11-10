# PR7: worker offboarding and operational access security

Base: latest fetched origin/main `f909bc7`, including merged PR #288. Branch: `codex/worker-offboarding-security`, in a fresh isolated worktree. No repository/ancestor AGENTS.md was found in the instruction audit; the Convex expert/reviewer guidance applies. PR6's historical investigation is retained in `team-membership-assignment-safety.md`; the founder-approved policy in this document supersedes its unresolved profile-access question.

## Approved policy and implementation choice

An explicitly inactive or archived worker profile blocks regular staff authentication and authorization even if users.status remains active. The application has one ordinary staff session, not a safe financial-only session: it carries no scope that could exclude live jobs/properties. PR7 therefore denies fresh staff session issuance and revalidates profile status at both existing server session boundaries. It creates no new identity, portal, permission, token scope or financial exception.

Owner lifecycle is independent of worker profiles. Every non-Owner principal with a workforce profile is checked, including an account whose role later changes; changing role or permission flags cannot bypass a disabled profile. Legacy affiliates without workforce profiles keep their existing account/role behavior. This grants no new role permissions. users.status remains an independent account gate, including for Owners.

## Before / after authorization matrix

All allowed cells still require a valid, unexpired, unrevoked matching-principal session and existing company/role/delegation/shared-job/lifecycle rules.

| Account / profile / principal | PR6 behavior | PR7 behavior |
| --- | --- | --- |
| Active account, one same-company active profile | Ordinary staff access under existing permissions | Unchanged |
| Active account, one same-company pending profile | Ordinary staff access; onboarding/compliance metadata was not a general access gate | Unchanged; strict active-profile self-onboarding endpoint remains strict |
| Active account, missing profile | Legacy access under existing permissions | Unchanged |
| Active account, inactive/archived profile | Transition revoked old sessions; password login issued a new session that regained assigned work access | Password login/session issuance denied; query/mutation/action guards deny old or still-unrevoked gap sessions |
| Disabled Manager profile with canSeeAllJobs, assignedManagerId, team lead/direct assignment or delegated flags | Fresh login restored those independent grants | All regular staff-session grants blocked before any of them are evaluated |
| Maintenance worker with disabled profile | Fresh login could perform assigned maintenance jobs | Same persistent block as cleaners/Managers; role compatibility remains separate |
| One foreign-company profile for a non-Owner | Could sign in; communications predicate rejected it, generic staff access did not | Session issuance/use fails closed; canonical profile writes reject the corrupt linkage |
| Duplicate profiles (active or disabled, in either order) | First-profile communications/admin lookup could pick an arbitrary record | Bounded two-row uniqueness check denies regular sessions and communications; profile mutation helpers reject rather than pick/repair a row |
| Inactive underlying account, any profile | No valid staff access | Unchanged; active/pending/missing profile never overrides the account gate |
| Pending underlying account, any profile | Sign-in could mint an unusable session; validators required active account | No regular staff session issued; account still has no staff access. This does not change pending worker-profile policy |
| Active Owner, any stale workforce-profile row | Owner account/role lifecycle independent | Owner authentication remains independent; worker-profile status mutation rejects Owner targets. Company/role checks still apply. No Owner account status exception |
| Existing revoked session after reactivation | Remained revoked | Unchanged; no revival. Canonical inactive/archived -> active additionally revokes any remaining gap-era sessions, requiring fresh login |
| Own historical finance as disabled worker | Fresh ordinary login could read own frozen-recipient history and operational jobs | Ordinary login/access denied. Stored history is preserved for authorized company readers; a restricted history-only channel is deferred |
| Owner historical company finance | Existing financial capabilities/tenant checks | Unchanged; target worker profile disablement does not delete/reprice/cancel records |

## Complete lifecycle / authorization trace

### Authentication, issuance and validation

- authActions.signIn still verifies the real password and returns the existing generic INVALID_CREDENTIALS shape when issuance is denied. It no longer obtains a session from sessionInternal.create for a disabled/corrupt profile. Signup, accepted employee invitation and public-checkout staff issuance also funnel through that same mutation; active Owners and eligible legacy staff remain compatible.
- sessionInternal.create now checks the current active account and profile in the same transaction as the insert. Profile-by-user indexed reads (including absence) and session-by-user revocation participate in Convex OCC: an offboarding transition that wins first blocks issuance; issuance that wins first is included in revocation. No client-side check is trusted.
- lib/sessionAuth.requireVerifiedStaffSession is the common query/mutation guard. It now rechecks the profile before returning a staff user or touching the session. Hydration authQueries.getCurrentUser inherits the guard and returns null on the existing session-required denial.
- Node actions use lib/sessions.getPrincipalFromSessionToken / requireStaffSession / Owner/Manager capability wrappers. Their sessionInternal.getStaffPrincipal query now returns null for a blocked profile, so action principal validation also fails closed. Existing expiry/revocation/account/claimed-ID checks remain intact. There is no separate refresh endpoint that can bypass these two guards; normal idle-session touch follows validation.
- mutations/workers.setWorkerStatus and upsertWorkerProfile retain atomic profile update plus existing session revocation/security events on disablement. Re-enabling an explicitly inactive/archived profile also revokes residual sessions for fresh-login requirements. setWorkerStatus rejects Owner targets, matching the existing Owner exclusion in upsert. They change neither users.status nor any job, finance, client or delivery state. Pending-profile transitions retain existing lifecycle behavior.
- queries/workers validates the referenced user company before returning worker profile/detail/directory data, rejects duplicate by-user lookups, and omits foreign team links from the detail view. Owner status does not authorize reading another company's data through a corrupt target profile.
- getExistingProfileForUser and requireOwnedProfile in mutations/workers validate uniqueness and referenced-user company before writes/revocation. This also protects role synchronization, profile backfill/ensure and administrative profile operations from choosing a corrupt foreign/duplicate row. There is no automatic repair, merge, deletion or migration of corrupt profiles.

### Operational entry-point matrix

| Surface | Existing canonical boundary now covered |
| --- | --- |
| Jobs: list/detail/cleaner/Manager/calendar, property data and access instructions | queries/jobs and queries/properties use requireVerifiedStaffSession or derived staff/Owner/Manager company wrappers |
| Arrival/start/pause/resume/complete, inventory and form checklist writes | mutations/jobs and mutations/forms -> requireAssignedJobExecutor -> requireVerifiedStaffSession; direct/team/team-lead/assigned-manager paths cannot override it |
| Final submission / performed workers | Same staff gate before existing canSubmitFinalJob and freezePerformedWorkers; evidence candidates are still an assignment/identity concern, not a communications predicate |
| Forms/photos/red flags | queries/forms, queries/redFlags and mutations/redFlags use the same staff/worker guards; form/item attachment issuance and consumption call requireAssignedJobExecutor in lib/attachmentUploads |
| Storage and resource/document uploads | mutations/storage and resource-upload/attachment helpers use generic staff or Owner/Manager capability guards |
| Reviews, inspections and quality | workerDeclineReviews, mutations/inspections, queries/inspections use assigned-executor or Owner/Manager wrappers; delegated flags are checked only after the staff gate |
| Availability | queries/availability and mutations/availability -> requireWorkerSession / Owner/Manager wrappers |
| Teams, directory, worker profile/settings and onboarding | queries/teams, mutations/teams, queries/workers, mutations/workers and employee functions use generic or Owner/Manager session guards; completeMyOnboardingItem keeps its stricter requireActiveWorkerProfile behavior |
| Inbox and notification acknowledgement | queries/notifications and mutations/notifications -> requireVerifiedStaffSession; no stale session can fetch notification details |
| Shared/partner jobs | The staff gate runs before existing company/role/accepted-copy checks. No origin-company roster access or shared acceptance bypass is introduced |
| Business administration, schedule, analytics and configuration | Existing Owner/Manager capability wrappers derive from the same staff gate; no disabled-Manager exception or new delegated permission |

A search of production authSessions/getByTokenHash consumers found the common validator/issuer paths above plus trusted revocation/QA internals; this PR does not expose an unguarded replacement validator. Public marketing/client-capability entry points retain their separate existing policies and do not authenticate a disabled staff principal.

### Financial and payment trace

- outgoingQueries uses requireVerifiedStaffSession / Owner-or-Manager financial capability checks, then frozen recipient identity/company ownership. The same raw staff session is used for ordinary job access, so it is not a safe offboarding financial-only exception.
- workerCompensation (submission candidates, historical confirmation, compensation review, job compensation, balances, preview) uses assigned-executor or Owner/financial capability guards. Owner review still operates on approvedExecution/frozen obligations; disabling the recipient's profile does not change debt or approval evidence.
- queries/cleanerPayments, settlements/financial queries and outgoingMutations use staff/worker/Owner guards; immutable historical compatibility records remain stored. No principal source, amount, allocation, compensation rule or ledger identifier is changed.
- Stripe Connect status queries use the generic staff guard. Node Connect/onboarding, affiliate/company Connect and payment/settlement actions use lib/sessions staff/Owner capability wrappers. Existing retired-payment restrictions and feature flags remain; no Stripe/provider call is made by profile mutation. Background provider/webhook accounting remains an independent trusted system path, not a worker-session grant, and existing obligations are not cancelled on offboarding.
- Tests retain approved/submitted executionHistory, legacy cleanerPayments, a synthetic obligation and partial outside settlement/allocation unchanged across offboarding, and verify Owner history queries still work. Synthetic convex-test bookkeeping is not a real payment.

A future restricted pay-statement/export channel should authenticate a separate restricted scope, project only frozen payee/statement data, and exclude current jobs, property names/addresses/access instructions, attachments and operational tokens. It needs its own account recovery, tenant/payee binding, retention and revocation policy. None is implemented here.

### Communications and client commitments

- PR6's separation remains: getJobRecipientUserIds / effectiveDeclineWorkers still describe assignment/evidence/review identity; profile status is not used to rewrite assignments or erase performed-worker candidates.
- operationalWorkerAvailable reuses the bounded profile-integrity/status policy for recipient eligibility. Existing assignment/review/schedule producer and delivery/read checks inherit it, including duplicate and foreign profiles. Existing durable delivery/retry/unknown-claim guarantees are unchanged; delivered mail cannot be recalled and a change after the final external-send check cannot be made atomic with the provider.
- lib/helpers.createNotification now suppresses fresh operational notifications to inactive-account or blocked-profile recipients as a final shared boundary, including assigned-Manager inspection/rework workflows. Invitation notifications retain their distinct non-work lifecycle. The other direct notification inserts are active-Owner client/calendar alerts or trusted QA fixtures, not worker-profile audiences.
- sendJobAssigned with a delivery ID or assignment context still uses the durable dispatcher and fresh recipient state. Unidentified legacy assignment payloads now fail closed instead of sending a one-shot email whose recipient/tenant/profile cannot be verified. No event identity is guessed, historical delivery row rewritten or invitation replayed. Current production producers already supply contextual/durable identity.
- Client invitation/recovery, partner/company-Owner and client scheduling communications keep their own audiences/policies. Profile updates never call recordClientSchedulingEvent, schedule invitations, increment assignment/schedule revisions, change job status or send cancellation/rescheduling/customer mail.

## Exact changes, cost and validation

Changed production boundaries: new lib/workerProfileAccess.ts; lib/sessionAuth.requireVerifiedStaffSession; sessionInternal.create/getStaffPrincipal; mutations/workers profile lookup/ownership and reactivation boundaries; queries/workers target-profile ownership/uniqueness and team projection; lib/operationalWorkerEligibility; shared lib/helpers.createNotification; legacy fallback in actions/emailNotifications.sendJobAssigned. No frontend route or UI-only security fix.

The gate uses existing workerProfiles.by_userId with take(2); it neither loads a whole roster nor scans a table. Each non-Owner session validation adds at most two profile documents; Owner authentication adds no profile query. Notification producers may recheck a small bounded profile lookup at their existing final notification boundary. No background sweep, global lock or additional schema/index is introduced.

Authenticated regressions replace PR6's unsafe-login expectations and exercise both canonical disablement mutations, direct/team lead, Managers/delegation/assignedManagerId, maintenance, old and deliberately still-unrevoked gap tokens, real password login, trusted issuance rejection, in-progress forms/timers, active/pending/missing profiles, account status, reactivation and residual-session revocation, duplicate/foreign profiles and writes, shared jobs/tenants, immutable evidence and real synthetic ledger rows, Owner financial access, notification suppression and stale delivery retries. PR6 evidence/decline regression intent remains covered. No production data or real email/payment is used.

Validation commands: focused regression tests, full Vitest, npm run typecheck (frontend and Convex), npm run build:frontend, git diff --check. Final counts and CI/Vercel state are in the draft PR. The frontend build retains the existing bundle-size warning; test dependency sourcemap/deprecation warnings are non-fatal.

## Schema, rollout, rollback and remaining boundaries

No schema/index, backfill, package, environment, billing, payroll or historical data migration. Existing inactive/archived/foreign/duplicate non-Owner profiles become blocked immediately on backend release, including any prior gap-era session still within its lifetime. Duplicates/corrupt links need deliberate audited administrative review; this PR does not select an arbitrary record or provide a broad repair tool.

No deployment, production call, merge, real email or real payment was initiated. Do not use root npm run build: it deploys Convex. Backend push/live smoke steps from generic skill guidance are intentionally not run because this task prohibits deployment. Normal release validation must be performed separately with authorized synthetic users.

Rollback by reverting PR7 and releasing through the separately authorized normal process; this restores the authorization weakness. Revoked sessions remain revoked and users must sign in again. No financial/evidence restore or recomputation is needed. Already-delivered messages and already-issued storage URLs cannot be recalled; bound attachment consumption and new URL issuance recheck current session authority. Profile offboarding does not administratively stop timers or cancel service: Owners must explicitly manage staffing/ongoing work under existing product workflows.

The founder-approved offboarding policy is fully implementable within the current architecture. No remaining policy question blocks this security closure. A restricted financial-history-only portal/export, broader onboarding policy and automatic reassignment/financial repair remain separate work.
