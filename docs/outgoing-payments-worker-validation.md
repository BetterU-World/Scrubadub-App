# PR C: worker compensation implementation and validation

## PR D audit and hardening

The audit traced execution/roster/submission/approval/rework, independent financial approval, settlement allocation/correction, worker history, navigation and permission paths. Canonical arithmetic, concurrency/version checks, owner-only writes, tenant/self isolation, frozen evidence and rework selection were correct and remain intact. No fundamental accounting redesign or product blocker was found.

Confirmed gaps and fixes:

- Roster loading/empty state and stale selected assignees: visible states, mobile checkbox targets, valid current selection.
- Review clarity: approved execution sequence, final $0 confirmation with reason/time evidence, minimum five-character explanation for new $0 decisions; existing reviews remain immutable.
- Hub: complete company owed/open/oldest summary and honest zero-balance vocabulary. Legacy worker route now provides secondary history and a return link, rather than duplicating the V2 hub.
- Recipient views: approved totals, visible adjustments, owner-only administrative notes, and truthful payment/recording dates and outside-payment wording.
- Payment confirmation: exact server allocation total, per-job and complete worker remainder, safe-limit unavailable state and explicit re-confirmation after stale rejection. No React allocation arithmetic.
- Corrections: signed adjustment effect and principal floor shown before confirmation; void/reversal remain safe reasoned ledger operations. Accessible money error associations and localized retirement notice.
- Permissions: managers previously received private administrative notes through company settlement reads. These now return redacted settlement projections; owner access and worker self-isolation remain unchanged.
- Query safety: indexed source/terms reads and event/payment details cap at 500 with explicit failure; materialization avoids repeated per-line history scans. Settlement details supply frozen allocation labels, eliminating per-allocation full-history queries in React. Existing 500/5,000/100 bounds remain. Localized financial error boundaries prevent broken pages, raw trace exposure and partial totals.

Intentionally unchanged: immutable principal and append-only ledger semantics, approval unit, USD-only money parser, operational permissions, job evidence model, worker authentication, partner source cardinality, and external payment declarations. Reopening $0 would need new audited review semantics, so it remains locked with explicit finality copy. Existing nonfinancial Worker Detail profile/onboarding copy remains outside this PR. No schema changes.

Source eligibility and UTC payment-date semantics are documented in `outgoing-payments-ledger.md`. All six existing cleaning/maintenance job types support evidenced same-company labor across residential, commercial, recurring, request and owner-created origins. Shared copies can compensate their own company's performers; neither side can compensate the other company's staff or infer a partner debt. Owner self-compensation and partner recipient workflow remain excluded.

Responsive QA rendered actual Owner Job Detail, Payments Hub, Worker Detail and Worker Payments page components with SCRUB styles and local fictional query/auth fixtures. All **48 page/language/width combinations** passed at 360, 390, 412, 430, 768 and 1440 px with no document overflow. Active Spanish payment confirmation, adjustment, void and reversal dialogs passed all six widths with no overflowing dialog elements; payment confirmation was visually inspected at 360 px. Accessible labels, checkbox state, dialog focus and localized financial meaning were inspected. No live database writes or deployment; authenticated deployed end-to-end QA remains a rollout check.

PR D changes exactly these files (generated API edits are excluded):

- `convex/workerCompensation.ts`, `convex/outgoingMutations.ts`, `convex/outgoingQueries.ts`, `convex/lib/outgoingLedger.ts`
- `convex/lib/__tests__/outgoingLedger.test.ts`
- `packages/frontend/src/components/payments/FinancialBoundary.tsx`, `JobCompensation.tsx`, `RecipientLedger.tsx`, `WorkerBalances.tsx`, `PerformedWorkerPicker.tsx`, `LegacyOutgoingNotice.tsx`, `LegacyWorkerHistory.tsx`, `compensationErrors.ts`
- `packages/frontend/src/pages/owner/CleanerPaymentsPage.tsx`, `packages/frontend/src/pages/owner/JobDetailPage.tsx`
- `packages/frontend/src/i18n/en/common.json`, `packages/frontend/src/i18n/es/common.json`
- `docs/outgoing-payments-ledger.md`, `docs/outgoing-payments-worker-validation.md`

New tests cover dates, owner-only notes/public references, server preview/result, $0 reasons, all six labor job types, aggregate failures and each PR C endpoint's session/capability boundaries. Validation passed: standalone Convex typecheck, combined frontend/Convex typecheck, **162 files / 1,049 tests**, frontend-only production build and diff whitespace checks. Existing bundle-size and stale Browserslist warnings remain.

Remaining limits: large totals/details fail honestly and need future aggregate storage/paginated detail support; $0 review is final; UTC day is the server date boundary. PR E will define partner compensation UX. No electronic outgoing rail was added; legacy rails remain retired; client payment architecture remains unchanged.

## PR C implementation record

## Operational → financial workflow

1. The final checklist/job submission requires an explicit selection of the people who performed the work. Current assignments/team members are candidates, not historical financial evidence.
2. Submission appends frozen execution evidence. Operational approval selects that submission. Rework preserves earlier entries and selects the later, finally approved roster.
3. For an approved historical job without evidence, only the owner can explicitly confirm historical performers. Provenance is distinct; nothing is silently backfilled and confirmation creates no debt.
4. The owner independently reviews each non-owner performer, edits the suggestion and confirms positive compensation or a reasoned $0/no-obligation review.
5. Positive approval creates a one-line terms document and materializes through the canonical PR B transaction. Payer × job × worker source-index checks prevent a second base obligation, including concurrent retries and new terms versions. Partner source cardinality remains protected.
6. Outside payment preview uses the same server planner as settlement recording. Confirmation commits the displayed exact allocations and ledger versions. Adjustments, unpaid voids and ledger reversals retain canonical accounting and append-only evidence.

## Owner and worker UX

- Job Detail: operational readiness, historical roster confirmation, independent editable suggestions, explicit review, canonical approved/paid/outstanding amounts and history/detail.
- Payments Hub: worker balances, approved total, recorded paid, open obligations, oldest outstanding approval and drill-down.
- Worker Detail: recipient compensation summary/history, outside declarations, allocations and correction actions.
- Worker Payments: self-history, approved principal and corrections, recorded paid/outstanding, outside methods/dates/references/allocations and visible reversed records. Private notes remain excluded.
- No-compensation decisions are narrow audited operational review outcomes, not financial debts. They are final for this job/worker in PR C; reopening such a decision is a future explicit workflow.
- Pay-profile suggestions use only per-job USD rates. Planned job pay is a fallback only for exactly one eligible worker; no equal split, array-order inference or hourly/payroll calculation exists.
- Inactive historical/performed workers require explicit owner financial review. Existing frozen debts survive deactivation, assignment/team changes, profile edits, renames and schedule changes. Owner performers never become worker compensation recipients.

## Permissions and scope

Owners alone can confirm historical execution and approve compensation, record outside payment, adjust, void or reverse. Managers with `canViewFinancials` can read financial views; operational form approval creates no debt and grants no financial write. Other manager capabilities do not grant financial reads/writes. Worker access remains authenticated self-history under the existing company/session rules; inactive sign-in is not newly enabled.

No electronic worker payment mechanism, Stripe outgoing/onboarding rail, payroll/tax computation, partner workflow or affiliate migration was added. Legacy protections remain retired and legacy OPEN rows never become V2 debt. Client invoices, fee economics, Merchant onboarding, reconciliation, client billing and subscriptions were unchanged.

## Schema changes

- `jobs.executionHistory`: append-only frozen rosters with sequence, provenance, confirming actor/time, scheduled date/source label and worker identity/name/role snapshots.
- `jobs.submittedExecutionSequence` and `jobs.approvedExecutionSequence`: current submission and the operationally approved execution.
- `jobs.compensationReviews`: reasoned no-obligation decisions with worker/execution/owner/time evidence.
- `outgoingTerms.executionSequence`, `outgoingObligations.executionSequence`: frozen linkage to the approved execution.
- All fields are optional for existing records. No new financial tables or provider objects.
- PR B's temporary worker one-materialized-version-per-job restriction becomes one base obligation per payer/job/worker. Partner restriction, immutable principal, adjustments, allocation arithmetic, idempotency and concurrency protection remain intact.

## Validation

Validation completed:

- `npx tsc -p convex/tsconfig.json --noEmit`: passed.
- `npm run typecheck`: passed.
- `npx vitest run --maxWorkers=2`: **162 files, 1,034 tests passed**.
- `npm run build:frontend`: passed; existing bundle-size and stale Browserslist warnings remain.
- `git diff --check`: passed.

No root deployment build or Convex deployment was performed.

Added coverage includes independent multi-worker approval, concurrent retry, unapproved/denied/canceled/rework rejection, explicit historical evidence and provenance, no-compensation review, suggestions without splitting, recipient snapshots, reassignment/rename/deactivation, manager reads/owner writes, preview equality, selected-job settlement, stale preview rejection, final approved rework evidence, team membership changes, owner self-work, preserved partner uniqueness and exact safe money parsing in EN/ES decimal formats. Existing PR B tests cover partial/full/multi-job payments, overpayment, tenant/recipient isolation, adjustment/void/reversal rules, private-note filtering and ledger evidence reconstruction. Existing legacy/client/subscription/affiliate regression suites remain required.

Responsive component validation used actual React components and SCRUB styles against **local fictional fixtures**, with Convex/auth hooks replaced only inside a temporary uncommitted harness. It did not deploy or write to a live database.

| Component | 360 | 390 | 412 | 430 | 768 | 1440 |
| --- | --- | --- | --- | --- | --- | --- |
| Worker balance hub, EN/ES | Pass | Pass | Pass | Pass | Pass | Pass |
| Owner recipient detail, EN/ES | Pass | Pass | Pass | Pass | Pass | Pass |
| Worker self-history, EN/ES | Pass | Pass | Pass | Pass | Pass | Pass |
| Job compensation review, EN/ES | Pass | Pass | Pass | Pass | Pass | Pass |
| Historical roster confirmation, EN/ES | Pass | Pass | Pass | Pass | Pass | Pass |
| Submission roster picker, EN/ES | Pass | Pass | Pass | Pass | Pass | Pass |
| Payment allocation confirmation, ES | Pass | Pass | Pass | Pass | Pass | Pass |

No document horizontal overflow was observed in the component matrix. The Spanish payment dialog was measured with an active dialog at all six viewports, with zero overflowing dialog elements, and visually inspected at 360/1440 px. Form, adjustment, void and reversal use the existing accessible, internally scrollable Radix dialog shell. Responsive validation is component-level; deployed authenticated end-to-end QA remains a rollout check.

## Limits and follow-ups

Recipient aggregates retain PR B's 500-obligation bound; the worker balance hub rejects company histories above 5,000 obligations instead of presenting incomplete totals. Histories and payment selection paginate. Future aggregate storage can remove these limits. Execution history stays on the job; exceptionally large rework histories may eventually need a dedicated evidence table. Historical roster confirmation intentionally cannot overwrite existing evidence. Reopening a no-compensation decision requires a separately audited future operation.

PR E remains responsible for partner eligibility/acceptance/settlement UX. Affiliate migration, explicit manager financial-write delegation and any future provider-verified electronic payment design remain separate work.

## Exact implementation files

Backend:

- `convex/schema.ts`
- `convex/_generated/api.d.ts` (PR C module registration only; unrelated pre-existing generated additions remain unstaged)
- `convex/workerCompensation.ts`
- `convex/outgoingMutations.ts`
- `convex/outgoingQueries.ts`
- `convex/lib/performedWorkers.ts`
- `convex/lib/outgoingAllocation.ts`
- `convex/lib/outgoingLedger.ts`
- `convex/lib/outgoingSchema.ts`
- `convex/lib/jobExecutionForm.ts`
- `convex/lib/jobSubmission.ts`
- `convex/mutations/forms.ts`
- `convex/mutations/jobs.ts`

Frontend:

- `packages/frontend/src/App.tsx`
- `packages/frontend/src/components/layout/navigation.ts`
- `packages/frontend/src/components/payments/JobCompensation.tsx`
- `packages/frontend/src/components/payments/RecipientLedger.tsx`
- `packages/frontend/src/components/payments/WorkerBalances.tsx`
- `packages/frontend/src/components/payments/PerformedWorkerPicker.tsx`
- `packages/frontend/src/components/payments/LegacyWorkerHistory.tsx`
- `packages/frontend/src/components/payments/compensationErrors.ts`
- `packages/frontend/src/components/payments/compensationMoney.ts`
- `packages/frontend/src/i18n/en/common.json`
- `packages/frontend/src/i18n/es/common.json`
- `packages/frontend/src/pages/owner/JobDetailPage.tsx`
- `packages/frontend/src/pages/owner/WorkerDetailPage.tsx`
- `packages/frontend/src/pages/owner/PaymentsHubPage.tsx`
- `packages/frontend/src/pages/owner/CleanerPaymentsPage.tsx`
- `packages/frontend/src/pages/manager/ManagerJobDetailPage.tsx`
- `packages/frontend/src/pages/worker/WorkerPaymentsPage.tsx`
- `packages/frontend/src/pages/cleaner/CleanerJobDetailPage.tsx`
- `packages/frontend/src/pages/cleaner/CleaningFormPage.tsx`
- `packages/frontend/src/pages/maintenance/MaintenanceJobDetailPage.tsx`
- `packages/frontend/src/pages/maintenance/MaintenanceFormPage.tsx`

Tests and documentation:

- `convex/lib/__tests__/outgoingLedger.test.ts`
- `convex/lib/__tests__/assignedManagerJobExecution.test.ts`
- `convex/lib/__tests__/jobPauseLifecycle.test.ts`
- `convex/lib/__tests__/legacyOutgoingRetirement.test.ts`
- `convex/lib/__tests__/managerExecutionLifecycleHotfix.test.ts`
- `packages/frontend/src/components/payments/compensationMoney.test.ts`
- `docs/outgoing-payments-ledger.md`
- `docs/outgoing-payments-worker-validation.md`
