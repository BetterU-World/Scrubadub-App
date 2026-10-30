# Fast Mode V1: trusted cleaners and explicit section confirmation

## Scope and reused behavior

Based on main `76ec72e`, containing merged cleaner completion #262 and bilingual
guide #261. Reuses canonical formItems section strings, the by_formId_section
index, workerProfiles, verified staff sessions, canManageTeam delegation, logAudit,
the existing item editor, and the unchanged final job-submission transaction.
No job lifecycle, staff/client authentication, billing, or Maintenance redesign.

The actual operational identity is users.role. Profile eligibleRoles labels do
not grant cleaning execution. V1 grants only active users.role=cleaner targets
with an active same-company profile; Maintenance, Manager, and Owner execution
identities cannot use Fast Mode. Owners and delegated Managers administer it.

## Storage and authorization

- workerProfiles.fastModeEligible is optional. Missing/false means ineligible,
  including all existing profiles. Nothing grants eligibility automatically.
- workers.setFastModeEligibility exposes only target user and a boolean. It
  requires a verified Owner or Manager with current canManageTeam and an active
  same-company cleaner target. It cannot modify pay, compliance, roles, or other
  Owner-only profile fields. If a legacy cleaner has no profile, explicit
  administration creates the existing standard default profile before the grant.
- forms.fastModeEligibility is a reactive, authenticated current-user capability
  query. It reads role, profile company/status, and the live eligibility flag.
- forms.confirmSection validates session, identity, company, assignment, cleaning
  role, editable form, in-progress job/form, timer availability, and live grant.
  Section membership comes from the indexed database query, never arbitrary
  client item IDs. A maximum of 1000 items per section bounds the transaction;
  larger sections reject before any writes. Current templates are far smaller.

## Cleaner and management experience

Every form starts in Standard Mode. Mounting, refreshing, reopening rework, and
switching modes do not complete checklist items. Eligible cleaners intentionally
select Fast Mode, visually inspect all tasks, and press Confirm [Section] Complete.
Only unfinished items in that section change. Repeated confirmation with no
unfinished items returns completedCount=0 without another confirmation audit.

Each section action has an in-flight guard, loading/disabled state, localized
success/error feedback, and a full-width touch target. Individual item editing
remains available. The shared component supplies the same behavior at mobile and
desktop widths. Revocation reactively returns an open form to Standard Mode and
the server rejects the next bulk action even with stale UI. Earlier completions
and history remain; a transaction already committed before revocation is retained.
Concurrent writes rely on Convex's transactional conflict handling.

Team directory rows expose Allow Fast Mode only for active cleaner targets to
Owners and delegated Managers. Owner Worker Detail also exposes the same targeted
control. Other worker profile administration remains Owner-only. Manager directory
responses add only the eligibility boolean, not private worker/pay profile data.

## Provenance

formItems.completionConfirmation is optional:

```
{ method: "individual" | "section", confirmedById: Id<"users">, confirmedAt: number }
```

The item's formId and section identify scope; the form identifies the job.
Explicit individual completion stamps individual provenance; unchecking removes
current confirmation metadata. Note/photo-only edits do not rewrite provenance.
No historical metadata is inferred for old completed items.

The existing auditLog stores set_fast_mode_eligibility (actor, target, new boolean,
timestamp) and confirm_checklist_section (actor, timestamp, method, formId, jobId,
section, completedCount). The section audit survives later item edits and grant
revocation. This records deliberate application confirmation, not proof of
physical work or actual human attention. Individual API calls can still be
automated by an authorized executor; V1 does not claim to detect human gestures.

## Backend-first compatibility and deployment

One focused PR supports two release phases; a separate compatibility PR is not
needed. Keep forms.markAllComplete as an authenticated compatibility no-op using
the original argument shape. It never changes checklist items, regardless of
eligibility. Valid old mount/toggle calls resolve null instead of triggering new
permission-error loops. Existing identity, assignment, and immutable-form errors
still apply. All production frontend callers are removed; test fixtures now
complete items individually. Keep the tombstone while older clients may exist.

1. After founder review, merge this PR and deploy its Convex schema/functions.
   Optional fields require no backfill, data script, or inferred grants. Old
   frontends may still display their old Fast Mode label, but bulk calls no longer
   precheck items. They can complete items individually. Final submission still
   blocks unchecked items and missing required inventory/worker evidence.
2. Publish the matching frontend and guides only after Convex succeeds. Ask active
   workers to refresh to receive the accurate Standard/Fast Mode UI. No precise
   frontend/backend timing is required for data safety. New frontend against old
   backend is unsupported because the new query/mutations would be absent.

From the reviewed merged release checkout, using an authenticated local Convex
CLI in Git Bash, the existing production deployment is canny-spider-91:

```bash
git switch main
git pull --ff-only origin main
env -u CONVEX_DEPLOY_KEY CONVEX_DEPLOYMENT=prod:canny-spider-91 npx convex deploy --cmd 'npm run build:frontend' --cmd-url-env-var-name VITE_CONVEX_URL
```

Confirm the displayed production target. This builds with the production URL,
then deploys Convex. Publish that frontend build only after the command succeeds.
The root npm run build also coordinates build and Convex deployment; a hosting
pipeline must publish only after the entire command succeeds. A frontend-only
build does not deploy Convex. Do not roll back the backend to the unrestricted
bulk implementation as a frontend rollback. Preserve optional schema fields when
rolling back UI so existing provenance remains valid.

No deployment, production data operation, or manual grant was performed here.

## Documentation and remaining limits

The existing English/Spanish Cleaner Guides now cover Standard default, delegated
eligibility, explicit visual inspection and section confirmation, revocation, and
unchanged inventory/final submission obligations. Owner Guide follow-up: explain
the Team/Worker Detail checkbox, grant/revoke authority, and retention of completed
work. Permission-aware Manager Guide follow-up: show this action only with
canManageTeam; distinguish configuring eligibility from executing/submitting jobs.
Owner Guide changes are deferred because they are not otherwise maintained in
this focused branch.

No universal photo requirements, job-specific Standard override, section-language
data migration, new Manager permission, or automatic grants. Existing section
names may be English even with Spanish controls. Local React DOM tests verify
both languages and mobile/desktop viewport configurations, not visual browser
layout or physical work quality. The existing large frontend bundle warning is
outside this change.

## Final validation

- 140 tests pass across 17 focused suites, using `--maxWorkers=4
  --testTimeout=15000`. Coverage includes grant/revoke authorization, current-role
  restrictions, tenant/assignment checks, terminal forms, rework, legacy calls,
  partial-progress preservation, confirmation provenance/history, English/Spanish
  controls at 375px and 1280px, and existing submission/security/authentication.
- Frontend and Convex typechecks pass; frontend production build passes with the
  existing Vite large-chunk warning. Diff/whitespace checks pass.
- Both Cleaner Guides render with react-markdown and retain matching 40-entry
  heading/list structure; all 14 Fast Mode translation keys align.
- The delegated-administration regression test now mocks only Resend transport.
  No permission assertions were removed or relaxed. Its original real-network
  timeout and the five-second timeout under concurrent CPU load are avoided by
  local email isolation and the bounded test command above.
- Pre-existing generated API edits and untracked local capture/cache directories
  are excluded. Existing generated imports already cover every changed API module;
  no new generated module registration is required for these functions.
