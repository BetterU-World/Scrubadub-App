# Superadmin entitlements — staged deployment runbook

## Deployment boundary

Phase 1 adds storage, internal operator provisioning, and read-only readiness only.
It deliberately does not change runtime authorization or billing behavior. The
dependent phase 2 PR removes email-derived authorization. Do not deploy phase 2
until the manual production checklist below is signed off. Passing CI is not
cutover authorization. Neither PR deploys or provisions production automatically.

## Operator authorization and recovery

`platformProvisioning:setAdministrator` and `setComplimentarySubscription` are
**internal mutations**, callable only through trusted deployment-operator access
(for example an authorized Convex dashboard/CLI). There is no public wrapper or
grant UI. Keep deployment credentials restricted. `operator`, `approvalReference`
and `confirmation` record intent and attribution; they are not authentication.
An operator must obtain explicit approval of the exact immutable user/company
IDs in a reviewed operational ticket before invoking them. Never infer legitimacy
from an email match or automatically import the old allowlist.

Arguments for `setAdministrator`: `userId`, `active`, `expectedRevision` (0 for
first provisioning), `operator`, `approvalReference`, `reason`, and exact
`confirmation` of `GRANT ADMIN <userId>` or `REVOKE ADMIN <userId>`.
For billing use `companyId` and `GRANT BILLING <companyId>` / `REVOKE BILLING
<companyId>`. Every change increments revision and appends audit attribution and
timestamp atomically. Stale revisions fail; inspect before retrying. Revocation
is separate from session invalidation; incident response should also revoke
sessions. Missing/inactive users cannot receive grants. No migration creates
accounts or transfers identity.

Keep an independently controlled deployment-operator recovery route available.
If a verified founder loses access, inspect the exact user ID and entitlement,
then use this same audited internal mechanism to repair that ID. Do not restore
email-based authorization or a hardcoded fallback. Never recover by recreating
an account with the same email. Schema and entitlement records remain additive
during rollback; application rollback must retain entitlement enforcement after
cutover (fix forward or use a reviewed enforcement-preserving build).

## Manual production checklist (not performed by this PR)

1. Deploy phase 1 only. Confirm production deploy/commit and operator access.
2. Read existing user IDs, statuses, creation/provisioning history and duplicate
   normalized-email matches. Confirm the real administrator(s) directly with the
   application owner. Do not assume configured addresses are verified.
3. Inventory every company currently benefiting from the legacy owner-email
   billing bypass, including inactive owners, and decide each intended exemption
   explicitly. Record the complete approved company-ID list, including an empty
   list when deliberately none. Do not turn administrator grants into free plans.
4. Provision only the approved user IDs and complimentary company IDs using the
   internal mutations. Confirm their audit records and revisions.
5. Invoke internal query `platformProvisioning:readiness` with
   `approvedAdministratorIds`, `approvedComplimentaryCompanyIds`,
   `confirmation: "VERIFY APPROVED PLATFORM IDS"`, and `approvalReference`.
   Require at least one active provisioned administrator, all approved rows ready,
   and a reviewed complete billing inventory. This query is read-only and its
   approval reference is an operator assertion, not proof of human approval.
6. Record the readiness result, revisions, deployment and approval in the ticket.
   Freeze provisioning/identity changes during cutover; recheck immediately before
   deployment. A missing, inactive, revoked, duplicate or stale identity means STOP.
7. Only after explicit owner authorization, deploy the dependent phase 2 change.
   Confirm access for approved administrators and unchanged intended exemptions.
   Validate revocation with synthetic staging accounts before production cutover.

The readiness result is a snapshot, not a future guarantee or a complete inventory
of legacy exemptions. Manual inventory and deployment ordering are required.
Do not merge/deploy the dependent cutover PR before phase 1 provisioning completes.

## Account uniqueness follow-up

Ordinary signup and staff/affiliate invitation actions check email before separate
creation mutations; `authInternal.createUser` and affiliate creation insert without
an atomic shared uniqueness check. Checkout reconciliation has an in-transaction
check but is not shared by every path. Normalize/reserve identities in the same
transaction as creation across all production writers in a separate security PR.
First audit duplicate identities; never merge users or move entitlements by email.
This change does not add a user-creation or email-update path.

## Consumer checklist for phase 2

- [ ] Query/mutation `sessionAuth.requireSuperadminSession`.
- [ ] Action `sessions.requireSuperadminSession`, with mutation-time recheck for
      action-backed administrative writes.
- [ ] `authQueries.getCurrentUser` and `queries.admin.isSuperAdmin` projections.
- [ ] Direct `affiliateLedger.lockLedgerPeriod` override.
- [ ] Platform, affiliate, payout, manuals, assessment and giveaway admin callers
      inherited through the shared helpers, including cleanup's read-only wrapper.
- [ ] `queries.billing` and `lib/subscriptionGating` use explicit company billing
      exemptions, independently of administrator status.
- [ ] Remove `founderEmails` runtime use; no env or hardcoded email fallback.
- [ ] Update synthetic admin fixtures and cover same-session revocation, email
      changes/recreation, signup/invites, audit and billing separation.

Stronger admin MFA/step-up authentication remains a separate follow-up. Existing
peppered tokens, active-user checks, session expiry/revocation, tenant/resource
checks and operational-role rules must remain intact.
