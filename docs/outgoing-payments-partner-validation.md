# PR E: partner compensation implementation and validation

## Repository investigation

The workflow was traced before implementation through ownerConnections, mutations/partners, sharedJobs/jobs, submission/form approval, performedWorkers, legacy companySettlements, the retired settlement routes and PR B–D ledger code.

| Question | Finding |
| --- | --- |
| A: customer relationship | The originating company retains the original job, client/property relationship and source snapshot. |
| B: buyer/payer | sharedJobs.fromCompanyId identifies the originating company buying subcontracted service. |
| C: performer/recipient | toCompanyId owns copiedJobId, linked by copy.sharedFromJobId to originalJobId, and assigns its own workers. |
| D: operational acceptance | Recipient-owner acceptSharedJob accepts the work. It records no exact financial terms acceptance. |
| E: fulfillment | Approved copied-job execution selected by approvedExecutionSequence provides frozen submission-confirmed evidence. Existence, scheduling, assignment, submission alone and elapsed dates are insufficient. |
| F: operational approver | Recipient owner or an authorized canApproveForms manager approves submitted forms; owner self-completion also captures approved execution. The share’s completed summary is secondary and may not be synchronized by every approval path. |
| G: existing amounts | Legacy companySettlements contains payer-entered amounts and statuses. These lack exact recipient financial acceptance. |
| H: suggestion authority | Legacy amounts are insufficient as authoritative B2B suggestions; no amount is reused or migrated. |
| I: source identity | sharedJobs retains original/copy/from/to IDs; structural checks verify tenant and copy linkage. PR B’s one materialized partner version per source fits one B2B compensation unit. |

Owner identities are already verified through existing staff sessions. No architecture stop condition was found: source, payer/recipient and fulfillment evidence are reliable, exact ownership acceptance can be represented, and no electronic or client-payment architecture is needed.

## Lifecycle and immutable versions

1. An active relationship permits the payer OWNER to propose positive USD compensation for stable shared work.
2. Each proposal creates a new immutable one-line outgoingTerms version, frozen parties/names/source label, relationship/original/copy IDs, creator/name/time. Superseded pending versions retain actor/time. Generic partner draft mutation is blocked.
3. Recipient OWNER accepts or declines that exact ID/version/revision. Decision actor/name/time and exact acceptance evidence are retained. Decline preserves history, creates no debt and does not disconnect.
4. Acceptance atomically sets sharedJobs.governingTermsId. A newer pending proposal cannot silently replace an earlier governing agreement. Acceptance of a replacement records replacesTermsId and requires an unchanged expected governing pointer.
5. The copied job must be approved with approvedAt and selected submission_confirmed execution; accepted/in_progress/completed shared status and immutable structural linkage are revalidated.
6. Payer OWNER explicitly financially approves the accepted governing amount. Execution sequence and operational approval timestamp are frozen. Canonical obligations/events materialize atomically.
7. Payer records outside payment using the existing planner, preview and ledger mutations. Recipient sees a public, truthful projection.

**Acceptance != debt. Completed/operationally approved work != debt.** Financial approval alone creates the canonical obligation. Work without accepted terms is clearly surfaced and cannot be financially approved. Explicit historical review is possible only with genuine eligible copied-job execution; no recipient acceptance or fulfilled evidence is fabricated.

**Uniqueness:** one base B2B obligation per payerCompanyId × sourceKey (partner_shared_job:<sharedJobs ID>), with one governing accepted company line. Exact retries return original results; concurrent approval cannot create duplicate principal. Once approved, new versions cannot materialize additional source debt. Corrections use adjustments.

## UX, authority and privacy

Payments Hub is the canonical workspace for partner payables, company receivables, approved totals, recorded paid, outstanding, open count and oldest outstanding approval. Partner financial detail distinguishes original principal, adjustments, current principal, recorded paid, outstanding, lifecycle and ledger-reversed records. Terms history retains versions, proposed amounts, decision actors/times, governing selection and financial approval.

Partners links into Payments. Shared Job Detail exposes contextual terms review. Only selected shared sources load full terms histories; the Hub paginates work and uses a single bounded balance query rather than loading each partner’s ledger history.

Payer owners propose, financially approve and write their own ledger. Recipient owners accept/decline and read their company’s receivables. Managers with canViewFinancials read appropriate own-company projections; no manager financial writes are granted by operational/sales/team/invoice capabilities. Worker, client, unauthenticated and third-company access is denied by backend authority.

Recipient payment history includes the payer’s outside declaration, method, payment date, recorded date, public reference, allocations and reversed state. Copy explicitly says the payer recorded the payment and SCRUB does not verify receipt. Private payer notes, command keys and fingerprints remain payer-owner only. Partner reference copy identifies recipient-company visibility; the B2B method list excludes worker payroll-provider copy.

EN/ES copy follows existing i18n conventions. Dialog titles/actions identify proposal, acceptance, decline and financial approval; amounts, parties, version, acceptance and fulfillment evidence appear in confirmations. Labels, aria state, status/error announcements and Radix dialog focus are retained.

## Accounting, separation and disconnect

Outside settlements reuse canonical deterministic oldest-first allocation, selected-obligation restrictions, exact server previews, stale ledger versions, safe integer USD arithmetic, payment-date validation, overpayment/tenant checks and idempotency. Full/partial/multiple-obligation payments share the worker planner; no partner arithmetic fork exists.

Adjustments preserve accepted terms and immutable base principal and cannot reduce principal below net recorded paid. Ordinary void requires unpaid debt and a reason. Ledger reversal preserves the original settlement/allocations and restores outstanding exactly once; it cannot refund, cancel or reverse external money.

Company A owes company B for B2B work. B separately owes its own performed workers through PR C/D. Tests explicitly establish A → B $300, B → Maya $120 and B → Elena $90, without A → Maya/Elena debts or cross-payer double counting. Worker payer × job × worker uniqueness is unchanged.

Disconnection blocks new proposals/acceptance and preserves existing work-creation active-relationship rules. Accepted historical evidence and legitimately earned work/debt survive; approval of earned accepted work and recording existing outside debt remain available. Recipient visibility survives disconnect. Reinvitation creates a new connection ID while preserving closed IDs referenced by terms; duplicate active/pending invitations remain blocked.

Legacy OPEN settlements are never V2 debt or accepted terms. No automatic old-job migration, amount reuse, payment verification or historical reconstruction occurs. Old records remain secondary read-only history. Historical owner-confirmed worker rosters do not qualify as B2B submission evidence. Electronic partner/worker rails and affiliate execution remain retired.

## Schema and exact changed files

No new tables. Optional outgoingTerms.partner adds relationship/original/copy/recipient IDs, state, proposer name, decision actor/name/time, replaced governing ID, supersession actor/time and frozen approval execution/time. Existing acceptance preserves its original timestamp. Optional sharedJobs.governingTermsId selects the agreement. outgoingObligations.by_recipient_global indexes recipientKey/approvedAt for incoming company summaries.

The intended commit contains exactly these 21 files:

1. convex/_generated/api.d.ts — only the two partnerCompensation API registration lines; unrelated pre-existing generated changes remain unstaged.
2. convex/partnerCompensation.ts — proposals, decisions, financial approval, detail, paginated work and balances.
3. convex/lib/partnerCompensation.ts — stable linkage and fulfillment/governing eligibility.
4. convex/lib/outgoingPaymentPreview.ts — shared authoritative preview.
5. convex/lib/outgoingSchema.ts — optional metadata and recipient index.
6. convex/schema.ts — governing pointer.
7. convex/outgoingMutations.ts — proposal bypass prevention and exact evidence materialization.
8. convex/outgoingQueries.ts — recipient projections/privacy and generalized preview.
9. convex/workerCompensation.ts — delegates its existing preview to the shared helper.
10. convex/mutations/partners.ts — preserves closed connection identity on reinvitation.
11. convex/lib/__tests__/outgoingLedger.test.ts — focused partner matrix and canonical regressions.
12. packages/frontend/src/components/payments/PartnerCompensation.tsx — terms/history and Hub partner composition.
13. packages/frontend/src/components/payments/RecipientLedger.tsx — company recipient detail and canonical actions.
14. packages/frontend/src/components/payments/compensationErrors.ts — localized partner eligibility/connection/stale errors.
15. packages/frontend/src/i18n/en/common.json — English copy.
16. packages/frontend/src/i18n/es/common.json — equivalent Spanish copy.
17. packages/frontend/src/pages/owner/PaymentsHubPage.tsx — partner workspace.
18. packages/frontend/src/pages/owner/PartnersPage.tsx — contextual Hub link.
19. packages/frontend/src/pages/owner/JobDetailPage.tsx — selected shared-source terms review.
20. docs/outgoing-payments-ledger.md — current PR E lifecycle and boundaries.
21. docs/outgoing-payments-partner-validation.md — this audit/scope/validation report.

## Validation

Focused ledger suite: **81 tests**, including exact versions/decisions/governing replacement, retry/concurrency, immutable proposal bypass prevention, no debt from operational stages, actual form approval, stale/malformed linkage/evidence, authority matrix, disconnection/reinvitation/privacy, partial/multiple/selected/oldest-first allocation, date/stale/overpayment/cross-tenant guards, adjustments/void/reversal, separate B2B/worker debts, legacy exclusion and bounds. Reinvitation scheduler fixtures use fake timers to avoid unintended scheduled email execution and teardown races.

Required final commands:

- npx tsc -p convex/tsconfig.json --noEmit — passed.
- npm run typecheck — passed (frontend and Convex).
- npx vitest run --maxWorkers=2 — passed: 1,065 tests across 162 files.
- npm run build:frontend — passed; existing outdated Browserslist data and >500 kB bundle warnings remain.
- git diff --check — passed.

The final full run passed 1,065 tests / 162 files in 247.66 seconds. An additional frontend/Convex typecheck using only the intended staged API declarations also passed; the preserved unrelated generated registrations are not required for PR E validation.

Full regression coverage includes PR B accounting, PR C/D worker compensation, PR A containment, client direct charges, subscriptions and affiliate containment. Build/typechecks do not deploy Convex. Initial sandboxed esbuild commands could not read parent directories; authorized reruns with normal configuration access resolved startup failures.

### Responsive and dialog checks

Actual AppLayout, actual changed pages/components, real CSS/Tailwind and real EN/ES dictionaries were rendered with fictional local query fixtures and no-op mutations. This is browser layout/interaction validation, not deployed authenticated end-to-end financial execution.

- Final page matrix: **72 checks** = EN/ES × six widths × Payments Hub, Partners, payer shared Job Detail with selected terms, recipient shared Job Detail, payer financial detail, recipient financial detail.
- Dialog matrix: **156 checks** across EN/ES proposal, acceptance, decline, approval, payment entry/authoritative confirmation, adjustment, unpaid void, reversal and obligation history. Includes 24 repeated payer proposal/approval checks after selected-source loading and 12 final approval checks after adding the shared-work label inside confirmation.
- Widths: **360, 390, 412, 430, 768, 1440 px**; 900 px height.
- No page/body/dialog horizontal overflow; named dialogs rendered and focus remained inside. Spanish acceptance and mobile payment confirmation were visually inspected. Recipient detail exposed public reference with no payer private note or Record payment action in both languages.

Final review fixed genuine issues only: immutable generic partner draft bypass, recipient-private copy/method/history wording, selected-source loading to avoid multiplied histories, action-specific terms confirmation labels, persisted supersession/replacement evidence, closed connection preservation, and display eligibility aligned with backend approval gates. Existing work and unrelated generated modifications were preserved.

## Limits and remaining questions

USD only. Complete company summaries refuse >5,000 obligations; recipient/source/terms/relationship histories use 500 safety bounds; allocation/page maximum remains 100. A preview may explicitly report recipient-wide remaining unavailable above the recipient bound rather than invent a partial total. Large histories need future aggregate/pagination work; caps were not increased.

No automatic legacy migration or reconstruction of missing B2B fulfillment/acceptance. Existing active-session and current-company identity rules remain. Pending terms are discoverable in the Hub/contextual shared work; no new notification delivery system is introduced. Browser fixtures do not replace a deployed tenant smoke test. Build warnings remain outside this slice. No unresolved architecture/product stop condition remains.

**Zero electronic partner money movement was added.** No provider API, bank onboarding, wallet or payment execution exists. Legacy electronic rails remain retired. Client invoices/direct charges, Merchant onboarding, fees, payment attempts/reconciliation, webhooks, subscriptions and client Billing were unchanged. Affiliate lifecycle remains separate. No deployment was performed. PR F final cleanup/cutover remains follow-up work.
