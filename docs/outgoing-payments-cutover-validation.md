# Outgoing Payments V2 final cutover audit (PR F)

## Classification gate

The following classification was recorded before further obsolete UI deletion. Categories describe current purpose, not names. Client incoming payment infrastructure is a separate active system and is excluded from outgoing classifications.

| Class | Artifacts | Treatment / evidence |
| --- | --- | --- |
| A — canonical V2 | `workerCompensation.ts`, `partnerCompensation.ts`, `outgoingMutations.ts`, `outgoingQueries.ts`; `lib/{outgoingLedger,outgoingAllocation,outgoingPaymentPreview,outgoingSchema,outgoingValidators,performedWorkers,jobSubmission,jobExecutionAuth,partnerCompensation}.ts` and performed-team helpers; five outgoing tables and optional execution/terms metadata; PaymentsHubPage, WorkerBalances, RecipientLedger, PartnerCompensation, JobCompensation, PerformedWorkerPicker, FinancialBoundary, WorkerPaymentsPage and contextual Worker/Job/Partners links; EN/ES compensation keys; A–E financial tests | Retain. One materializer, one allocation planner, owner financial writes, frozen approved evidence. |
| B — historical compatibility | `cleanerPayments`, `cleanerPaymentJobs`, `companySettlements`, `settlementBatches`, `settlementBatchItems`; legacy account IDs/onboarding metadata; `queries/{cleanerPayments,settlements,stripeConnect}.ts` historical reads; `lib/legacyOutgoingCompletion.ts`, legacy internal Stripe completion handlers and signed webhook branches; LegacyWorkerHistory, CleanerPaymentsPage, SettlementsPage, old return URL; historical A–E validation/phase-zero docs | Retain records/schema and signed historical completion. Bound list reads; historical pages are secondary/read-only and excluded from V2 totals. Old return URL redirects to affiliate page. Unused assignment projections remain authenticated compatibility queries, with explicit noncanonical comments and limits; no frontend calls them. |
| C — retired safety boundaries | `actions/{cleanerPayments,cleanerStripeConnect,settlements,stripeConnect}.ts` legacy creation/link/refresh endpoints; `mutations/{cleanerPayments,settlements}.ts` creation/manual-record/invite endpoints; old user Connect setters in `mutations/{stripeConnect,cleanerStripeConnect}.ts`; `lib/legacyOutgoingRetirement.ts`; affiliate electronic execution/retry stubs and PR A retirement tests | Keep validators/session/tenant gates and fail-closed errors. No worker or partner account/link/Checkout/Transfer execution. Shared Stripe configuration probe remains inert. |
| D — affiliate-only | AffiliatePage/financial tabs; affiliate ledger, attribution, requests, manual batches and historical resolutions; `actions/affiliateStripeConnect.ts`, `setAffiliateStripeAccount`, affiliate account lookup and own referral queries | Preserve separate lifecycle. Current onboarding only for affiliate role or owner/manager with their own stored referral code. Cleaner/maintenance blocked before Stripe. Writes only affiliate account field. Electronic payout execution remains class C. Never included in V2 obligations/totals. |
| E — obsolete | Worker Home legacy payment query, payment model/fixture and open-payment attention badge; legacy user-account refresh UI on StripeReturnPage; generic Express onboarding implementation using worker account field; owner Job Detail's old planned-worker-pay panel/import and empty legacy action comments | Remove/demote. Current Worker Home links to canonical own Payments without estimating debt. Old generic endpoint remains class C. Worker Job Detail has its own route; owner/manager Job Detail uses canonical compensation review. |

Generated API declarations are inspected but not edited/staged: unrelated local generated changes are preserved. Navigation uses the existing desktop/mobile layout; no new navigation system, financial table or migration is introduced.

## Audit findings

The generic `startStripeConnectOnboarding` endpoint admitted worker roles and could populate legacy user account IDs. It has no current onboarding caller; current affiliates use a separate field and action module. Generic onboarding and refresh now fail closed. Current affiliate creation/link actions also enforce role and stored own-referral context before obtaining a Stripe client. Legacy internal user setters fail closed. Company Accounts v2 Merchant onboarding is separate and unchanged.

Worker Home treated assignment/planned pay/legacy status as open payment attention. It now links to canonical worker history. Legacy partner settlement copy was English-only; its read-only historical boundary and labels now use EN/ES resources.

Further browser checks found missing focus restoration for controlled dialogs and a missing proposal amount error association. The shared DialogShell now restores its connected opener; the partner proposal input references its localized error. The final performance review bounded legacy batch completion reads with atomic rollback and replaced full audit-log materialization with an exact historical conflict lookup.

## Complete system audit

### Canonical worker path

Explicit performed roster → frozen submission execution → selected operational approval → owner financial review per worker → one canonical base obligation per payer company × job × worker. Historical owner-confirmed roster grants eligibility only. Multi-worker approvals are independent; owner self-work is excluded. Planned per-job pay supplies only the existing narrow suggestion. Rework uses the final approved execution; reassignments, team edits, renames, profile changes and deactivation do not rewrite frozen debt. A $0 review with reason creates an audited no-compensation outcome and no obligation.

### Canonical partner path

Active relationship → payer-owner immutable proposal → recipient-owner exact version/revision decision → explicit governing accepted version → genuine copied-job approved submission execution → payer-owner financial approval → one company obligation per payer company × sharedJobs ID. Proposal/acceptance/operational approval alone create no debt. Replacements cannot duplicate approved principal. Disconnection blocks new proposal/acceptance, preserves accepted evidence and earned debt, and does not prevent paying existing debt. Company A → Company B and Company B → its own workers are separate liabilities with different recipient/source families.

### Settlement/accounting findings

Worker and partner use the same `planOutsideAllocation` and payment preview. Only `materializeTerms` inserts canonical obligations; public worker/partner financial review calls that transaction, and internal approval uses the same evidence guards. Generic partner drafts are blocked. `recordOutsideSettlement` is the only new recorded-payment path: owner declaration, same payer/recipient/USD, positive safe integer cents, valid nonfuture occurrence date, exact allocation sum and displayed ledger versions. No provider executes or verifies it.

Immutable principal + append-only adjustment deltas = adjusted principal. Allocations minus valid ledger reversals = net recorded paid. Outstanding = adjusted principal − net paid, never negative. Void is an independent lifecycle, excluding collectible outstanding without deleting evidence. Negative adjustment cannot cross the recorded-paid floor. Corrections never create a second base obligation. Ledger reversal neutralizes original allocations exactly once and is not an external refund.

Payer-scoped command keys/fingerprints reject different-content reuse; identical retries retain original evidence, including after reversal. Stable approval-time/ID ordering gives deterministic allocation. Convex transaction reads/patches conflict on source/terms/obligation state: duplicate financial approvals and concurrent recordings cannot duplicate debt or overpay. Existing independent evidence-reconstruction and concurrency tests remain intact.

### Permissions/privacy/adversarial findings

Verified active sessions and matching claimed user IDs remain authoritative. Payer owners write; recipient owners decide their own partner terms. Financial managers read their own permitted company projection only; form/team/invoice/sales capabilities grant no outgoing write authority. Workers read only their frozen identity in the authenticated current company. Clients, unrelated companies, invalid/revoked/expired/deactivated sessions are denied.

Worker and recipient-company projections omit payer-private notes, command keys and fingerprints. Managers also receive no owner-private settlement notes. Legacy own-worker history now filters current company after a bounded identity-index read. Owner legacy company reads retain their narrower historical permission; manager old route redirects instead of issuing a forbidden query.

Preserved tests exercise foreign obligation/source IDs, manager direct mutations, coworker history, recipient-company privacy, unrelated payer history, exact/stale terms and execution, stale allocations, duplicate approval/declaration, forged source/recipient families, disconnected action and legacy-row non-materialization. No additional fundamental stop condition remains after the authorized Connect fix.

### Electronic rails / affiliate boundary / client firewall

Repository search and caller tracing cover account/link creation, user account writes, invitations/refresh, Checkout, PaymentIntent, destination charges, Transfers, payout/ACH/Treasury calls, retries, scheduled work, environment references and webhook completion. Generic legacy user onboarding/refresh and three user account setter/refresh mutations now fail closed. Dedicated worker onboarding, invitations, worker/partner Checkout/manual legacy writes, affiliate Transfer execution and retry remain retired. No worker/partner new-production provider call or automatic financial cron exists; crons are calendar sync and resource-intent expiration only.

Remaining user Express account/link calls are in current affiliate actions with the narrowed server context; they write only the affiliate field. Owner company-account reuse is existing affiliate behavior, not a worker/partner onboarding path. Affiliate ledger/manual lifecycle and historical resolution stay separate; no affiliate row enters V2 totals. Unbounded affiliate history/attribution reads are retained for the separate affiliate initiative, not represented as V2 complete aggregates.

Remaining Checkout calls belong to client invoice direct charges, gated company Merchant test payment or subscription billing. Company Accounts v2 Merchant account/link creation is unchanged. Client application fee remains $0 below $30 and $2 at/above $30; invoice attempts, reconciliation, Connect webhook routing, client Billing, owner subscriptions and live invoice kill switch are untouched. Shared environment helpers/Stripe secrets/configuration probes remain because those active systems use them. No deployment, environment change, live financial transaction or external Stripe call was made.

### Historical policy and performance

No legacy OPEN row becomes V2 debt, no unverifiable migration/acceptance/roster/provider evidence is fabricated, and no historical record/table/field is removed. Signed legacy completion only updates old records and retains same-session retry/conflict behavior. Historical worker/partner batch completion rejects above 500 links in the same transaction; tests confirm payment/batch state and job pointers roll back. Exceptionally large histories need support reconciliation or a future paginated historical view; they are never returned as complete partial totals.

Canonical pages paginate (25-row initial histories; up to 100 requested rows), and only selected shared sources load terms histories. Canonical 500 recipient/source/event/relationship, 5,000 company summary and 100 transaction limits remain. The two canonical settlement-allocation `.collect()` calls are inherently bounded by the 100-allocation creation invariant. Historical roster candidates and obsolete retained job projections now stop above 5,000 indexed rows. Legacy histories and batch reads stop above 500. Legacy conflict audit lookup uses exact filter + first, subject to Convex read/execution limits. No new aggregate table/index or schema migration is added.

Existing typed events, actors, timestamps and differentiated errors support diagnosis: operational/evidence/accepted-governing prerequisites, stale previews, exact idempotent retry versus conflict, overpayment, denied authority, disconnection and explicit safety bounds. Existing local financial boundaries show localized read/limit failures without traces or partial totals. No logging framework was added.

### Navigation/copy/cleanup

Existing desktop/mobile navigation uses the single current Payments workspace; Jobs, Workers and Partners retain contextual entry points. Worker Home links to own canonical history. Owner legacy links are secondary; managers retain canonical financial reads. Affiliate return/refresh redirects safely without mutating legacy worker metadata. Legacy partner history is read-only and localized. Canonical status is textual (Needs approval, Owed, Partially paid, Paid, Voided, Adjusted, No compensation, Payment record reversed), not color-only. Outside-declared status never claims provider verification.

Removed: generic old Express/link/refresh implementation, Worker Home legacy query/model/payment-count preview and fixture, old return-page polling, unused planned-worker-pay panel/import and empty legacy action comments. Showcase's financial sample now declares explicit fictional approval/declaration evidence independently of operational assignments. Kept: authenticated compatibility projections/validators, retirement stubs, historical data/schema/completion, shared Stripe configuration, current affiliate onboarding/manual lifecycle, A–E tests and history docs. **Schema changes: none. Generated API: no intended changes.**

## Validation

| Required command | Final result |
| --- | --- |
| `npx tsc -p convex/tsconfig.json --noEmit` | PASS |
| `npm run typecheck` | PASS (frontend + Convex) |
| `npx vitest run --maxWorkers=2` | PASS: 164 files, 1,086 tests; 253.36 seconds |
| `npm run build:frontend` | PASS: 2,794 modules; 18.84 seconds |
| `git diff --check` and staged equivalent | PASS |

CI uses these typechecks, tests and frontend build; the repository defines no lint command. Production deployment build is intentionally not used for local validation. Existing build warnings remain: stale Browserslist data and a frontend chunk larger than 500 kB. No dependency/bundle redesign was added for those warnings.

The first full run exposed two new history-test session fixtures using a different pepper from the imported token helper. Fixtures were aligned with the repository's test environment and the final full run passes. Frontend typechecking also found a remaining Showcase consumer of the removed Home payment model; it now uses explicit independent fictional financial evidence. No A–E test was removed.

New tests cover all role/session permutations on generic/current affiliate endpoints with zero rejected Stripe side effects or legacy account writes, legitimate contained affiliate contexts, internal legacy setter retirement, historical tenant filtering/bounds/atomic rollback, actual Worker Home non-debt projection, actual EN/ES read-only partner page and connected/disconnected dialog opener restoration. All A–E tests are preserved; the existing affiliate UI fixture now declares its legitimate affiliate role.

### Browser / responsive EN/ES

Local Vite fixtures render actual repository pages/components in the actual AppLayout with mocked query/mutation boundaries and built CSS. They do not prove deployed integration/provider readiness. Pages: owner Payments Hub, manager read-only Hub, Worker Home, Worker Payments, Worker Detail, owner Job Detail, copied/shared Job Detail, Partners, worker/partner ledger detail, recipient receivable detail, payer/recipient terms and historical partner page. Expanded worker legacy history is also checked.

EN and ES at **360, 390, 412, 430, 768, 1440 px**: 168 page checks plus 12 expanded-history checks pass without horizontal overflow/render errors/untranslated outgoing keys. Long company/source/reference text and large currency amounts wrap. 144 dialog states pass: worker/partner payment entry and allocation confirmation; adjustment, unpaid void, ledger reversal, event history; proposal, acceptance, decline and payer financial approval. Dialog titles/viewport bounds/focus are checked; button targets are at least 44px. Tab/Shift+Tab and Escape work; Escape restores the opener. Invalid payment/proposal amount errors are linked to their controls. Stale mocked commit returns to refreshed preview and requires confirmation again. Textual status and provenance remain visible. Older unrelated operational/profile/home-shell text remains English where the existing app is not localized; no claim of a whole-app translation overhaul is made.

## Production smoke checklist (after deployment; not performed locally)

- Worker: submit explicit two-worker performed roster, operationally approve, confirm no debt yet, financially approve only worker A, confirm B still needs review, record a partial outside payment, check A's self-history/allocation and privacy. Confirm rework selects final execution; historical roster confirmation and owner self-work create no debt.
- Partner: payer proposes exact terms, recipient accepts, recipient submits copied work, operationally approve, confirm no debt yet, payer financially approves once, record partial outside payment, check recipient's public declaration/allocation and absence of payer-private note. Disconnect and confirm earned history/debt remains; new proposal/acceptance blocked.
- Accounting: repeat identical command, try changed-content key and stale preview; verify no duplicate/overpayment, adjustment floor, unpaid void and ledger reversal/restored outstanding. Reversal does not claim an external refund.
- Permissions: financial manager reads but direct outgoing writes reject; operational manager approval creates no debt; worker/coworker/third-company/client isolation; invalid/deactivated sessions reject; recipient cannot retrieve payer-private notes.
- Legacy/Connect: old OPEN remains separately historical, old worker/partner actions and generic worker/maintenance account/link/refresh calls reject with no new legacy account ID. Current legitimate affiliate uses only its affiliate field; Transfer execution/retry stays retired. Legacy large histories/batches fail explicitly and require reconciliation.
- Client: verify existing Merchant/direct-charge gates, $30 fee boundary, invoice attempt/reconciliation and subscription behavior using existing non-live smoke procedures. No live money movement is required for this cutover smoke.

## Intentional limitations / future initiatives

USD only; current explicit limits; exceptionally large historical details may need pagination/support reconciliation; no automatic legacy reconstruction. Deactivated access is not restored. Multi-company identity, aggregate scaling, affiliate redesign/scaling, electronic payout/bank onboarding, payroll/tax/classification, accounting exports/integrations and automated payment verification are separate future initiatives. No wallet/company funds balance or electronic outgoing subsystem is implied.

## Explicit A–H answers

| Question | Answer |
| --- | --- |
| A. Any NEW worker compensation using a legacy electronic rail? | No. Worker/generic onboarding and legacy execution are fail closed. |
| B. Any NEW partner compensation using a legacy electronic rail? | No. Partner Checkout/execution remain fail closed. |
| C. Legacy OPEN becoming V2 debt automatically? | No. Historical queries/completion never materialize V2 debt. |
| D. Operational approval alone creating financial debt? | No. Explicit owner financial approval is required. |
| E. Managers performing outgoing financial writes? | No. Financial capability grants reads only. |
| F. Outside payments claimed provider-verified? | No. Provenance is always outside_declared. |
| G. Client invoice architecture altered by PR F? | No. No client financial implementation file is changed. |
| H. V2 complete for defined scope? | Yes: canonical worker/partner compensation, outside declarations, accounting/corrections/history/permissions, with the documented bounds and separate future initiatives. |

## Exact files changed

- `convex/actions/affiliateStripeConnect.ts`
- `convex/actions/stripeConnect.ts`
- `convex/lib/__tests__/outgoingCutover.test.ts`
- `convex/lib/legacyOutgoingCompletion.ts`
- `convex/lib/legacyOutgoingRetirement.ts`
- `convex/mutations/cleanerPayments.ts`
- `convex/mutations/cleanerStripeConnect.ts`
- `convex/mutations/settlements.ts`
- `convex/mutations/stripeConnect.ts`
- `convex/queries/cleanerPayments.ts`
- `convex/queries/settlements.ts`
- `convex/queries/stripeConnect.ts`
- `convex/workerCompensation.ts`
- `docs/outgoing-payments-cutover-validation.md`
- `docs/outgoing-payments-ledger.md`
- `packages/frontend/src/App.tsx`
- `packages/frontend/src/components/affiliate/AffiliateFinancialResponsive.test.ts`
- `packages/frontend/src/components/affiliate/StripePayoutsSection.tsx`
- `packages/frontend/src/components/payments/LegacyWorkerHistory.tsx`
- `packages/frontend/src/components/payments/PartnerCompensation.tsx`
- `packages/frontend/src/components/ui/DialogShell.test.ts`
- `packages/frontend/src/components/ui/DialogShell.tsx`
- `packages/frontend/src/demo/fixtures/workerShowcaseFixtures.ts`
- `packages/frontend/src/features/worker-home/WorkerHomePresentation.tsx`
- `packages/frontend/src/features/worker-home/workerHomeViewModel.ts`
- `packages/frontend/src/i18n/en/common.json`
- `packages/frontend/src/i18n/es/common.json`
- `packages/frontend/src/pages/demo/DemoWorkerOperationsPages.tsx`
- `packages/frontend/src/pages/owner/JobDetailPage.tsx`
- `packages/frontend/src/pages/owner/PaymentsHubPage.tsx`
- `packages/frontend/src/pages/owner/SettlementsPage.tsx`
- `packages/frontend/src/pages/shared/StripeReturnPage.tsx`
- `packages/frontend/src/pages/worker/OutgoingCutover.test.ts`
- `packages/frontend/src/pages/worker/WorkerHomePage.tsx`

Unrelated `convex/_generated/api.d.ts` local changes (68 additions / 2 deletions) are preserved unstaged. No schema, client Stripe/invoice, environment, cron, dependency or lockfile changes. Temporary browser fixtures are removed before delivery.
