# Outgoing Payments V2: canonical architecture (PR A–F)

Outgoing Payments V2 is SCRUB's canonical ledger for worker compensation and inter-company partner compensation. SCRUB records financial obligations and outside-declared settlements but does not electronically send or verify those outgoing payments. V2 is complete for this defined scope; electronic execution, payroll/tax, affiliate redesign, multi-company identity and automated provider verification are separate future initiatives.

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

Owners can create/update worker drafts tied to an actual company-owned job. Partner sources must use the PR E immutable proposal workflow; generic draft creation/update cannot bypass recipient acceptance. Worker lines validate same-company worker identity; partner lines validate the shared recipient company. Drafts freeze names/source labels; approval validates structural identities without refreshing those snapshots.

`approveAndMaterialize` is INTERNAL only. It verifies an active payer owner, approved worker job or exact accepted governing partner terms plus an accepted/in-progress/completed share and operationally approved copied-job execution with submission_confirmed provenance. It approves and creates all obligations/events atomically. Retry returns the original obligations. Transactional source/version and terms/line checks prevent duplicate materialization. PR C narrows worker uniqueness to payer company × job × worker recipient. Each worker is approved independently in a one-line terms document; another terms version cannot create a second base obligation for that worker/job. PR E retains one partner base obligation per payer company × sharedJobs ID. Subsequent financial corrections use explicit adjustments.

PR C connects owner worker approval to this shared materialization transaction after verifying the frozen, operationally approved performed-worker evidence. PR E adds recipient-owner acceptance and payer-owner financial approval through the same transaction. No production API can insert an arbitrary approved obligation.

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

Worker self-history uses frozen worker user identity scoped to the current authenticated company; it does not consult current job/team assignment. Self-history exposes approved amounts, basis, adjustments, allocations, outside methods/provenance, payment/recording dates, reversal evidence and balances. It omits private notes, request fingerprints, command keys and other recipients' terms. Recipient-company owners and managers with canViewFinancials receive only their own B2B receivable projection, including public references and allocations. Private payer notes remain readable only by that payer’s owner. This does not implement multi-company login; a future identity migration must preserve the original user/profile relationship.

## Worker compensation workflow (PR C)

Assignment and current team membership are scheduling intent. Final submission now requires an explicit performed-worker selection through the existing checklist/job submission path. It appends a frozen `jobs.executionHistory` entry with worker identities, display names, roles, source/date label, confirming actor/time and `submission_confirmed` provenance. It sets `submittedExecutionSequence`. Form approval selects that entry with `approvedExecutionSequence`; owner self-completion captures and selects its explicit roster in the same transaction. Owner performers remain operational evidence and are excluded from outgoing worker compensation.

Rework retains prior execution entries, resets the canonical form to editable when work restarts, and captures a new roster at the later submission. Only the selected, finally approved execution establishes eligibility. Failed/submitted/rework/denied/canceled work does not establish financial eligibility. Submission retries do not append another execution. No obligation is created by submission, operational approval, or historical roster confirmation.

An approved older job with no execution history offers an owner-only explicit historical roster confirmation. It records `owner_confirmed_historical` provenance, including inactive historical workers in the same tenant. Nothing is silently inferred from assignments, current team members, planned pay, or legacy payment records. Existing evidence cannot be replaced through this historical confirmation endpoint.

The owner reviews each performed non-owner worker independently. A per-job pay profile in USD can supply an editable suggestion. If no such profile exists, legacy planned job pay is suggested only when there is exactly one eligible worker. Hourly/salary/vendor rates are not converted into job compensation, and multi-worker planned pay is never split. Suggestions are not debt and can be changed before approval. Each positive approval creates one single-line terms document and calls the same canonical materializer transaction as PR B. Frozen execution names/source labels and the execution sequence are retained. A $0 review requires a reason and stores a narrow audited `compensationReviews` outcome on the job; it creates no financial obligation or fake zero-dollar ledger event.

**Worker base uniqueness is payer × job × frozen worker recipient.** Source-index transaction reads prevent duplicate debt across concurrent approvals or new terms versions. An exact approval retry returns its existing obligation even after operational edits; different financial content requires adjustment. Other workers on the job can approve later in separate terms versions. The previous PR B one-approved-version-per-job rule is intentionally superseded only for worker sources; partner materialization remains one version per shared source in PR E. Immutable principal, append-only events, tenant checks, allocation/version checks, void/reversal rules and settlement idempotency remain intact.

Job Detail displays compensation review, no-compensation outcomes and canonical balances. Owner Payments replaces the retired worker surface with company worker balances, original approval totals, recorded paid, open jobs and oldest outstanding approval, with recipient detail also available in Worker Detail. Authorized managers can read these views but cannot invoke any financial write. Worker Payments uses frozen-recipient self-history, including allocations, corrections and visibly reversed records. Private administrative notes are never exposed to workers. Legacy history remains separately labeled and never contributes to V2 outstanding totals.

Record payment collects amount, outside method, date, public reference and optional private note. A shared server allocation planner supplies the preview and commits canonical settlement allocations. No selection means oldest approved outstanding first; explicit selection restricts the eligible jobs. Confirmation submits the displayed exact allocation amounts and ledger versions; intervening ledger changes reject rather than silently reallocating. Full and partial payments use the same arithmetic. Adjustment, ordinary unpaid void and ledger reversal require reasons and explicit confirmation; reversal copy says it does not reverse/refund/cancel the external payment.

Deactivation, assignment/team edits, profile changes, renames and schedule edits never alter frozen obligations or execution history. Inactive performed workers can receive compensation only through explicit owner review; existing debts remain visible and settleable. Worker sign-in retains existing active-session rules, so deactivated access is not newly granted.

New schema fields are optional for rollout compatibility: execution history, submitted/approved execution sequence and no-compensation reviews on jobs; execution sequence on terms and obligations. No new financial table or provider integration is added. Recipient totals preserve PR B's 500-obligation bound; company summary currently refuses histories over 5,000 obligations. Financial histories paginate. Future aggregates can remove these deliberate limits.

New copy follows the existing EN/ES i18n system. Responsive card-based layouts and Radix dialogs were checked at 360, 390, 412, 430, 768 and 1440 px using local component fixtures; this is layout validation, not a deployed end-to-end payment test. See `outgoing-payments-worker-validation.md` for validation and changed files.

## Worker hardening decisions (PR D)

Worker compensation supports the six existing labor job types: standard, deep clean, turnover, move in/out, post-construction and maintenance. Residential/commercial location, recurring generation, requests and owner creation do not independently grant eligibility: the same-company, operationally approved frozen performers are required. An incoming shared copy may compensate its receiving company's own performers; its original company's workers cannot become recipients. The original job may compensate only independently evidenced labor of its own company. Neither path creates partner/intercompany compensation. PR E partner recipients/acceptance use the distinct `partner_shared_job` source; owner self-compensation remains excluded.

New outside declarations reject malformed dates and dates later than the server's current UTC calendar date. `paymentDate` is the owner's stated occurrence date; `recordedAt` is the server declaration timestamp. Existing declarations are unchanged and identical retries remain valid. Public references are explicitly worker-visible; administrative notes are now owner-only on settlement list/detail and obligation payment detail, including when managers have financial-read capability.

$0 review remains a final audited operational outcome, with actor, timestamp, execution and a nontrivial reason. Reopening requires a future audited decision model; this PR does not remove or overwrite evidence. Confirmation states its finality and that it creates neither debt nor payment. Status vocabulary remains Needs approval, Owed, Partially paid, Paid, Voided, with Adjusted, Payment record reversed and No compensation as historical indicators. Aggregate zero balances use “No outstanding balance,” not an inferred Paid status.

Payment confirmation displays server-calculated allocated total, per-job remainder and complete recipient remainder where it can safely be calculated. Above the recipient bound, the complete remainder is explicitly unavailable. Stale commit rejection returns to the refreshed preview and requires confirmation again; it never substitutes allocations. Adjustment previews show original principal, current principal, signed correction, resulting principal, recorded paid and outstanding; the mutation's ledger version and principal floor remain authoritative. Void and reversal wording distinguish record correction from deletion/payment/refund.

The 500-recipient, 5,000-company and 100-allocation limits remain unchanged. Indexed source obligation/terms reads and event/payment details now fail explicitly above 500 records rather than collecting an indefinitely growing history. Worker-source materialization reads prior obligations once, avoiding one repeated history scan per line. Local financial error boundaries show actionable limit/access messages without partial totals or raw server traces. Financial histories remain paginated; aggregate storage and paginated exceptionally large details are future work.

No schema changes were needed. Performed roster loading/empty states, stale selected candidates, meaningful $0 confirmation, hub summaries, approved totals, correction previews, owner-only notes, and localized retirement copy were hardened without changing the financial domain.

### Preserved payment boundaries

No reads/migration of legacy OPEN payments, planned pay, partner settlements or Stripe evidence generate V2 obligations. PR A retirement and affiliate separation remain intact. No electronic attempts, funding, payout accounts, Stripe calls, Treasury, payroll/tax calculations or company funds balance are added. Future provider evidence must use a distinct provenance and reviewed electronic extension, not reinterpret `outside_declared`.

Client invoices, fee economics, company Merchant onboarding, subscription billing and webhooks are unchanged. No deployment, environment/configuration changes or financial object modifications are performed by this PR.


## Partner compensation workflow (PR E)

The originating company owns the customer relationship and buys subcontracted service (payer). The receiving company owns the copied job and performs it (recipient company). Shared work has a stable sharedJobs identity linking the original, copy and both companies. Operational acceptance, submission and form approval remain separate from financial decisions.

Active relationship → payer OWNER proposes immutable USD terms → recipient OWNER accepts the exact version → copied work receives operational approval → payer OWNER explicitly financially approves → one canonical company obligation → outside payment declaration → public recipient history.

**Accepted terms != debt. Operational approval != financial approval.** Operational work may proceed without accepted financial terms, but financial approval stays blocked until explicit acceptance and genuine approved execution evidence exist.

Every proposal is a new immutable one-line outgoingTerms version. Amount, currency, parties, relationship ID, original/copy IDs, source label, proposer and timestamps are retained. Pending older proposals become superseded with actor/time; accepted and declined proposals remain historical. Acceptance records the exact ID/version/revision and recipient owner actor/time. Decline creates no debt and does not disconnect the companies.

sharedJobs.governingTermsId explicitly selects the accepted version. A newer proposal does not change it. Accepting a replacement explicitly confirms the previous governing version and stores replacesTermsId; stale governing pointers reject. After base financial approval, new proposals cannot create another debt; corrections use canonical adjustments.

Financial approval requires valid original/copy/company linkage, an accepted/in-progress/completed share, exact accepted governing terms, copied job status approved, approvedAt and the selected approved execution with submission_confirmed provenance. Frozen execution sequence and operational approval time are retained on terms; approval creates the accepted amount through the canonical materializer. Historical acceptance remains valid if its original owner later changes status; authority was verified when accepting.

**Partner base uniqueness: payer company × sharedJobs ID** (sourceKey partner_shared_job:<ID>). One approved version and one company recipient line form that compensation unit. Worker uniqueness remains payer × job × frozen worker recipient. A → B debt never implies A → B’s workers: B may separately approve its own Maya/Elena compensation using its own execution evidence.

Payments Hub contains company payables/receivables, original approval totals, recorded paid, outstanding, open count and oldest outstanding approval. Its partner detail reuses RecipientLedger for allocations, public payment references, events, adjustments, unpaid void and ledger reversal. Recipient history says who recorded the outside payment and that SCRUB does not verify receipt. Payer notes, request fingerprints and command keys are redacted from recipient-company readers. Payer owners alone write the payer ledger; recipient owners alone accept/decline. Financial managers may read appropriate own-company records; operational capabilities alone grant no financial writes. Workers, clients and third companies have no B2B access.

Partners links to the canonical Hub. Shared Job Detail provides contextual terms review. Lists paginate; only a selected shared source loads its terms history, preventing repeated partner × obligation × settlement histories. Complete summaries fail above 5,000 obligations; recipient totals, source histories and relationship histories retain explicit bounds (500), and transaction allocation/page bounds remain 100. No knowingly partial total is presented. The shared server allocation preview is used by workers and partners without new payment arithmetic.

Disconnection blocks new proposals/acceptance and existing shared-work creation rules remain active-relationship gated. It preserves accepted evidence, fulfilled work, earned debt and history. Earned accepted work may still receive financial approval; existing debt remains payable outside SCRUB. Reinvitation creates a new connection record and preserves closed IDs referenced by historical terms.

Legacy OPEN settlements never become V2 debt or authoritative suggestions. Older legitimate work can use explicit proposal/acceptance only when its linked copy already has genuine approved submission evidence. Owner-confirmed historical worker rosters are insufficient for B2B reconstruction. No automatic migration, fabricated acceptance or legacy payment reconciliation occurs.

Schema additions are optional partner metadata on outgoingTerms, optional governingTermsId on sharedJobs and an outgoingObligations by_recipient_global index for recipient-company summaries. No financial table or electronic rail is added. Recorded outside payment != provider-verified payment; settlement reversal != external refund/reversal. Client payments and affiliates remain unchanged; PR F cleanup/cutover is separate. See outgoing-payments-partner-validation.md for the audit, exact scope and validation.

## Final cutover (PR F)

Payments Hub is the current owner/financial-manager workspace; Worker Payments is the worker's frozen-recipient self-history. Worker Home links there without inferring debt from assignment, planned pay, operational completion or old payment status. Showcase now uses explicit fictional approved/declaration evidence separately from assignment fixtures. Owner/manager Job Detail uses canonical compensation review; the old planned-worker-pay panel and empty legacy action comments are removed.

Legacy worker/partner history remains secondary, read-only and excluded from V2 balances. Worker history queries load only after expansion and fail locally rather than showing partial data. Company legacy history remains owner-only; a financial manager's old worker-history URL redirects to the canonical Hub. Legacy partner copy is localized in EN/ES and explicitly states that historical OPEN is not V2 debt.

Generic user Express onboarding and legacy status refresh were discovered to admit workers. Both now authenticate and fail closed, together with legacy internal user account setters. Current affiliates use `affiliateStripeAccountId`: affiliate role or an owner/manager with their own stored referral code may use contained affiliate onboarding; cleaner/maintenance may not. Affiliate onboarding does not enable electronic payout execution. Historical user account metadata remains readable; old return/refresh URLs redirect to `/affiliate`. Company Accounts v2 Merchant onboarding, direct invoice charges, application fees, reconciliation, subscriptions and signed webhook routing remain unchanged.

Canonical bounds remain 100 lines/allocations, 500 recipient/source/relationship history and 5,000 company summary rows; indexed settlement allocations are inherently limited to 100 by creation. PR F adds explicit 5,000 historical-roster/legacy-job bounds and 500 legacy payment/history/batch-link bounds. Oversized historical batches reject transactionally and require reconciliation instead of partially updating history. Conflict evidence lookup returns the exact existing audit match without materializing the entire audit log; that filtered historical lookup remains subject to Convex's execution/read limits. Affiliate scaling is outside this worker/partner cutover.

Controlled dialogs now restore keyboard focus to their connected opener, preserving existing pending-state dismissal guards. Partner proposal amount errors reference their localized message. The final system audit, classification, validation results, deliberate limitations and deployed smoke checklist are in [outgoing-payments-cutover-validation.md](outgoing-payments-cutover-validation.md). Earlier phase-zero, worker and partner validation documents remain historical implementation evidence.
