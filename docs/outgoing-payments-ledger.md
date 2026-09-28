# Outgoing Payments V2: canonical ledger and worker workflow (PR B/C)

SCRUB is the ledger, not the bank. **Recorded outside payment != provider-verified payment. Settlement reversal != external refund/reversal.**

## Canonical entities

- `outgoingTerms`: versioned source terms with identified recipient lines, USD amounts, basis, creator, frozen display snapshots and approval/partner acceptance evidence. Draft content can change using a revision check. Approved content cannot change.
- `outgoingObligations`: one immutable approved principal per terms line; frozen payer, worker user/profile (where a profile exists) or partner company, source, terms version, basis and approval references. Worker classifications do not determine tax/legal treatment.
- `outgoingSettlements`: immutable payer declarations of outside payment to one recipient in one currency. Date, method, public reference, optional private administrative note, recorder, idempotency key and canonical request fingerprint are retained. Provenance is always `outside_declared`.
- `outgoingSettlementAllocations`: immutable positive allocations connecting a declaration to obligations. No separate batch entity is needed.
- `outgoingEvents`: typed approval, creation, principal adjustment, void, declaration and ledger reversal evidence with actors and server timestamps. Adjustment/void/reversal command retries also retain their idempotency evidence here.

No financial evidence is deleted. Snapshots duplicate display/reference information deliberately: later job reassignment or name/profile edits must not rewrite approved history.

## Accounting and transactions

```
adjusted principal = immutable base principal + principal adjustment event deltas
net recorded paid = allocation amounts - allocations of ledger-reversed settlements
outstanding = adjusted principal - net recorded paid >= 0
```

Obligation `adjustmentCents`, `adjustmentCount`, `settledCents` and `ledgerVersion` are derived caches. Every write updates these in the SAME Convex mutation transaction as canonical allocation/event evidence. The tests independently reconstruct balances from evidence. Neither callers nor the frontend can set cached totals or base principal. Writes read and patch affected obligation documents, so Convex transaction conflicts force retries against current balances; two recordings cannot overpay the same debt.

Payment projection is `OWED`, `PARTIALLY_PAID` or `PAID`; `adjusted` is a historical badge, including corrections that net to zero. Lifecycle is separately `APPROVED`/`VOIDED`. A void preserves the original principal and arithmetic residual as history, but `collectibleOutstandingCents` and recipient outstanding totals exclude voided debt. It can never be allocated or adjusted after voiding.

Amounts are safe integer minor units, positive where required, capped at 1,000,000,000,000 per amount/resulting total. Initial creation accepts explicit uppercase `USD` only; no conversion occurs. Negative principal corrections cannot reduce adjusted principal below net recorded payment. Zero adjusted principal is allowed through correction, without inventing credits/refunds.

## Terms and materialization boundary

Owners can create/update drafts tied to an actual company-owned job or an actual outgoing shared-job relationship. Worker lines validate same-company worker identity; partner lines validate the shared recipient company. Drafts freeze names/source labels; approval validates structural identities without refreshing those snapshots.

`approveAndMaterialize` is INTERNAL only. It verifies an active payer owner, approved worker job or accepted/in-progress/completed partner share, and partner-owner acceptance evidence where applicable. It approves and creates all obligations/events atomically. Retry returns the original obligations. Transactional source/version and terms/line checks prevent duplicate materialization. PR C narrows worker uniqueness to payer company × job × worker recipient. Each worker is approved independently in a one-line terms document; another terms version cannot create a second base obligation for that worker/job. Partner sources retain one materialized terms version per source pending PR E. Subsequent financial corrections use explicit adjustments.

PR C connects owner worker approval to this shared materialization transaction after verifying the frozen, operationally approved performed-worker evidence. Partner acceptance UX remains reserved for PR E. No production API can insert an arbitrary approved obligation.

## Declarations, allocations and idempotency

Record a positive declaration with either:

1. Explicit obligation/amount/version allocations: exact sum required; stale versions reject.
2. Selected obligation IDs: allocate the requested amount oldest-approved-first among that selection.
3. No selection: allocate oldest-approved-first among eligible recipient obligations.

Equal approval times use an ascending stable ID tie-breaker. All selected records must match payer, frozen recipient and currency; duplicate IDs, voided records, overpayment and invalid sums reject the whole transaction. No silent partial commits or reallocation of explicit stale allocations.

At most 100 terms lines/selected obligations/allocation rows per transaction. Automatic selection and aggregate queries scan at most 500 recipient obligations and reject larger histories; explicit selection remains available. Lists use Convex pagination. A later scaling change can add aggregates without weakening canonical evidence.

Payer-scoped idempotency keys are shared across settlement/adjustment/void/reversal commands. Fingerprints are exact canonical JSON, with sorted object keys and normalized selection/allocation order, including actor, amounts, methods, dates, references, notes and explicit versions. Same key/content returns the original result; different content rejects. A retried declaration remains the original declaration even if it was later ledger-reversed—it never becomes a replacement payment automatically.

## Corrections, void and reversal

- Principal adjustment requires owner, nonzero signed integer delta, reason, expected ledger version and idempotency key. Base principal is never edited. Positive corrections can reopen an outstanding balance after full settlement; negative corrections below net recorded settlement reject.
- Ordinary void requires zero NET recorded settlement, reason, expected version and idempotency key. Partially/full-paid obligations reject; historical allocations fully neutralized by a ledger reversal do not count as current paid debt.
- Outside settlement reversal appends one event, neutralizes its allocations transactionally exactly once and restores outstanding. Original settlement/allocations remain unchanged. Same-key retry returns the reversal; a second distinct reversal rejects. Replacement declarations require new keys. This reverses SCRUB's record, never an external payment.

## Permissions and privacy

All public endpoints require verified staff sessions; claimed user IDs must match the session. Owner sessions alone can write. Managers with existing `canViewFinancials` can read payer-company records; other manager capabilities grant no write authority. Company reads/details reject foreign tenants.

Worker self-history uses frozen worker user identity scoped to the current authenticated company; it does not consult current job/team assignment. Self-history exposes approved amounts, basis, adjustments, allocations, outside methods/provenance, payment/recording dates, reversal evidence and balances. It omits private notes, request fingerprints, command keys and other recipients' terms. Partner-side access/acceptance is reserved for PR E. This does not implement multi-company login; a future identity migration must preserve the original user/profile relationship.

## Worker compensation workflow (PR C)

Assignment and current team membership are scheduling intent. Final submission now requires an explicit performed-worker selection through the existing checklist/job submission path. It appends a frozen `jobs.executionHistory` entry with worker identities, display names, roles, source/date label, confirming actor/time and `submission_confirmed` provenance. It sets `submittedExecutionSequence`. Form approval selects that entry with `approvedExecutionSequence`; owner self-completion captures and selects its explicit roster in the same transaction. Owner performers remain operational evidence and are excluded from outgoing worker compensation.

Rework retains prior execution entries, resets the canonical form to editable when work restarts, and captures a new roster at the later submission. Only the selected, finally approved execution establishes eligibility. Failed/submitted/rework/denied/canceled work does not establish financial eligibility. Submission retries do not append another execution. No obligation is created by submission, operational approval, or historical roster confirmation.

An approved older job with no execution history offers an owner-only explicit historical roster confirmation. It records `owner_confirmed_historical` provenance, including inactive historical workers in the same tenant. Nothing is silently inferred from assignments, current team members, planned pay, or legacy payment records. Existing evidence cannot be replaced through this historical confirmation endpoint.

The owner reviews each performed non-owner worker independently. A per-job pay profile in USD can supply an editable suggestion. If no such profile exists, legacy planned job pay is suggested only when there is exactly one eligible worker. Hourly/salary/vendor rates are not converted into job compensation, and multi-worker planned pay is never split. Suggestions are not debt and can be changed before approval. Each positive approval creates one single-line terms document and calls the same canonical materializer transaction as PR B. Frozen execution names/source labels and the execution sequence are retained. A $0 review requires a reason and stores a narrow audited `compensationReviews` outcome on the job; it creates no financial obligation or fake zero-dollar ledger event.

**Worker base uniqueness is payer × job × frozen worker recipient.** Source-index transaction reads prevent duplicate debt across concurrent approvals or new terms versions. An exact approval retry returns its existing obligation even after operational edits; different financial content requires adjustment. Other workers on the job can approve later in separate terms versions. The previous PR B one-approved-version-per-job rule is intentionally superseded only for worker sources; partner materialization remains one version per shared source pending PR E. Immutable principal, append-only events, tenant checks, allocation/version checks, void/reversal rules and settlement idempotency remain intact.

Job Detail displays compensation review, no-compensation outcomes and canonical balances. Owner Payments replaces the retired worker surface with company worker balances, original approval totals, recorded paid, open jobs and oldest outstanding approval, with recipient detail also available in Worker Detail. Authorized managers can read these views but cannot invoke any financial write. Worker Payments uses frozen-recipient self-history, including allocations, corrections and visibly reversed records. Private administrative notes are never exposed to workers. Legacy history remains separately labeled and never contributes to V2 outstanding totals.

Record payment collects amount, outside method, date, public reference and optional private note. A shared server allocation planner supplies the preview and commits canonical settlement allocations. No selection means oldest approved outstanding first; explicit selection restricts the eligible jobs. Confirmation submits the displayed exact allocation amounts and ledger versions; intervening ledger changes reject rather than silently reallocating. Full and partial payments use the same arithmetic. Adjustment, ordinary unpaid void and ledger reversal require reasons and explicit confirmation; reversal copy says it does not reverse/refund/cancel the external payment.

Deactivation, assignment/team edits, profile changes, renames and schedule edits never alter frozen obligations or execution history. Inactive performed workers can receive compensation only through explicit owner review; existing debts remain visible and settleable. Worker sign-in retains existing active-session rules, so deactivated access is not newly granted.

New schema fields are optional for rollout compatibility: execution history, submitted/approved execution sequence and no-compensation reviews on jobs; execution sequence on terms and obligations. No new financial table or provider integration is added. Recipient totals preserve PR B's 500-obligation bound; company summary currently refuses histories over 5,000 obligations. Financial histories paginate. Future aggregates can remove these deliberate limits.

New copy follows the existing EN/ES i18n system. Responsive card-based layouts and Radix dialogs were checked at 360, 390, 412, 430, 768 and 1440 px using local component fixtures; this is layout validation, not a deployed end-to-end payment test. See `outgoing-payments-worker-validation.md` for validation and changed files.

## Preserved boundaries

No reads/migration of legacy OPEN payments, planned pay, partner settlements or Stripe evidence generate V2 obligations. PR A retirement and affiliate separation remain intact. No electronic attempts, funding, payout accounts, Stripe calls, Treasury, payroll/tax calculations or company funds balance are added. Future provider evidence must use a distinct provenance and reviewed electronic extension, not reinterpret `outside_declared`.

Client invoices, fee economics, company Merchant onboarding, subscription billing and webhooks are unchanged. No deployment, environment/configuration changes or financial object modifications are performed by this PR.
