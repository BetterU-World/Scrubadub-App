# Outgoing Payments V2: canonical ledger backend (PR B)

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

`approveAndMaterialize` is INTERNAL only. It verifies an active payer owner, approved worker job or accepted/in-progress/completed partner share, and partner-owner acceptance evidence where applicable. It approves and creates all obligations/events atomically. Retry returns the original obligations. Transactional source/version and terms/line checks prevent duplicate materialization. Only one terms version per source may materialize in PR B; subsequent financial changes use explicit adjustments. New draft versions do not create additional debt.

This is a foundation, not full work eligibility/compensation approval or partner acceptance UX. PR C/E must define and connect those workflows before calling the internal path. No production owner API can directly insert an arbitrary approved obligation.

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

## Legacy and future extension

No reads/migration of legacy OPEN payments, planned pay, partner settlements or Stripe evidence generate V2 obligations. PR A retirement and affiliate separation remain intact. No electronic attempts, funding, payout accounts, Stripe calls, Treasury, payroll/tax calculations or company funds balance are added. Future provider evidence must use a distinct provenance and reviewed electronic extension, not reinterpret `outside_declared`.

Client invoices, fee economics, company Merchant onboarding, subscription billing and webhooks are unchanged. No deployment, environment/configuration changes or financial object modifications are performed by this PR.
