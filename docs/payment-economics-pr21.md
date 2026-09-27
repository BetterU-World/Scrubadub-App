# PR2.1 invoice payments: architecture and validation

## Architecture

SCRUB uses direct charges so client invoice payments belong to the cleaning company's connected Stripe account. SCRUB collects an application fee without becoming the payer of ordinary payment processing fees. Fee responsibility must be `stripe`; a direct charge alone does not prove the intended economics. See [Stripe's responsibility configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration).

New accounts use `POST /v2/core/accounts`, Merchant configuration, `dashboard: express`, USD defaults, US identity country, and `defaults.responsibilities` with both `fees_collector` and `losses_collector` set to `stripe`. Business entity type and acceptance are collected through hosted onboarding. This release supports US/USD companies; broader countries require an explicit supported-country implementation.

`configuration.merchant.capabilities.card_payments.requested` is true. Payout readiness is returned as `configuration.merchant.capabilities.stripe_balance.payouts`. The pinned official preview SDK does **not** expose a separately requestable Merchant payout field; SCRUB sends no invented request field and requires active payout status plus the compatible v1 `payouts_enabled` flag before payment. No Recipient configuration or transfer capability is requested. See [Accounts v2 configurations and example](https://docs.stripe.com/connect/accounts-v2).

Accounts operations alone use the exact alias `stripe-connect-preview = npm:stripe@22.7.0-beta.1` and explicit `2026-08-26.preview`. The existing `stripe@20.3.1` dependency remains in use for Checkout, payment objects and subscriptions. Express with Stripe loss responsibility specifically needs the [current public preview API](https://docs.stripe.com/connect/risk-management/managed-risk); standard API Express restrictions must not be used as a substitute. SDK release: [stripe-node v22.7.0-beta.1](https://github.com/stripe/stripe-node/releases/tag/v22.7.0-beta.1).

Hosted onboarding uses `POST /v2/core/account_links`, `use_case.type = account_onboarding`, configurations `[merchant]`, and authenticated SCRUB return/refresh pages. A return is never proof of completion. See [Account Links request](https://docs.stripe.com/api/v2/core/account-links/create).

## Managed Risk, Radar and permissions

The integration uses direct card charges, hosted onboarding and Express Dashboard access to satisfy Managed Risk's transaction, onboarding and owner notification requirements. Merchant card capability and hosted agreement acceptance use the full service relationship; no recipient agreement is selected. [Stripe handles agreement acceptance during hosted onboarding](https://docs.stripe.com/connect/service-agreement-types).

[Radar is built in](https://docs.stripe.com/connect/radar), with connected-account rules applied to direct charges. SCRUB does not bypass Radar or disable its defaults. Validate the company's Radar configuration in the platform's Connect Dashboard before live approval. Optional platform Radar account fees and negotiated Managed Risk pricing are separate from ordinary processing economics and must be reviewed with Stripe.

Official public [restricted-key documentation](https://docs.stripe.com/keys/restricted-api-keys) describes resource permissions and connected-account permissions, but does not document the internal string `v2_account_storer_write`. That exact permission name remains **unverified** and is not hard-coded or relied on. In a test deployment, inspect permission errors/request logs and confirm the correct Accounts v2 read/write permission with Stripe before creating a live key. Checkout write, PaymentIntent read, compatible Account read and connected-account access are also needed for this rail. Existing subscription permissions remain necessary for their separate integration.

Current Accounts v2 guidance documents creation directly without directing the user to enable the unrelated **Reusable payment methods for Global Payouts** preview. Do not enable that preview or **Allow small charges**. Express loss responsibility is itself a public preview: platform eligibility/access is not established by this PR. Accounts v2 can return access-blocked errors; confirm access using an authorized test credential and contact Stripe if rejected. No fallback to different fees/losses/dashboard semantics is implemented.

## Economics

| Issued invoice / client charge | SCRUB application fee | Processing economics |
| --- | --- | --- |
| $25.00 | $0; parameter omitted | Cleaning company |
| $29.99 | $0; parameter omitted | Cleaning company |
| $30.00 | $2.00 | Cleaning company |
| $30.01 | $2.00 | Cleaning company |
| $500.00 | $2.00 | Cleaning company |

The fee is computed from the authoritative frozen invoice total only at reservation and stored on the attempt. It is never added to the client charge. USD card charges must meet Stripe's [normal $0.50 minimum](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts). Actual processing rates come from the connected account's Stripe pricing; this PR does not assume a fixed rate.

## Schema and historical compatibility

- New attempts: `chargeModel = direct`, immutable `connectedStripeAccountId`, amount, USD and `platformFeeCents`.
- Historical attempts: missing `chargeModel` means `destination`; their optional legacy `destinationStripeAccountId` remains intact. Stored historical fees are used without applying the new threshold retroactively.
- Company: `stripeConnectArchitecture`, `stripeConnectModernReady`, pending account and flow reference. Existing cached capability/requirement fields remain.
- `companyConnectFlows` retains owner/company, original account, created account, creation time and activation time/status.
- `invoiceStripeFinancialEvents` retains refund/dispute event/object/PaymentIntent and verified source/account, with a matching attempt when account context is valid.
- New attempt indexes support company migration inspection and PaymentIntent financial-event correlation. No destructive data migration or Stripe account deletion occurs.

## Controlled reconnect

Legacy owners see **Reconnect Stripe** before new invoice Checkout is allowed. Owner session and exact company are checked before reserving an auditable creation flow. Account creation uses that flow's stable idempotency key; uncertain creation older than 23 hours requires support review rather than blindly creating another account after Stripe's retention window.

The new account remains pending during hosted onboarding. On authenticated refresh, SCRUB verifies live readiness and company/flow metadata. Old open Sessions are retrieved and expired in their **original attempt account context**. Already expired Sessions can proceed; completed, uncertain or creating-without-Session attempts block activation pending reconciliation. Live readiness is retrieved again immediately before atomic activation. The mutation rechecks owner, company, flow, previous/pending account and absence of unresolved open attempts.

The original account is retained in the flow audit and historical attempts. Late events use those original references. A late historical payment can become canonical only when the original invoice is still payable; outside-paid, void or second payments remain reconciliation cases.

## Webhooks and account context

New Checkout creation, Session retrieval/expiry and PaymentIntent retrieval use SDK `stripeAccount` request options. There is no `transfer_data` on new invoice Checkout. Idempotency includes model, account ID and attempt ID.

Direct invoice events must verify against `STRIPE_WEBHOOK_CONNECT_SECRET`, with `event.account` exactly equal to the frozen attempt account. These checks occur before Stripe reads. Legacy destination events must use `STRIPE_WEBHOOK_ACCOUNT_SECRET` and have no connected `event.account`; their objects remain platform-owned and their transfer destination is checked against the stored historical account. Subscription events are processed only in platform scope. See [Connect event scope](https://docs.stripe.com/connect/webhooks).

Amount, USD, Session, PaymentIntent, metadata, invoice/company/relationship references and stored application fee are validated before atomically marking paid. Missing Stripe application fees normalize to zero. Duplicate successful events are harmless; conflicting or ambiguous facts go to terminal reconciliation with retained evidence. Corrected later events cannot auto-heal reconciliation. Transient Stripe reads return HTTP 500 for retry.

Expired/failed Sessions require the same exact event account. Outside payment keeps outside provenance, schedules account-aware Session expiration and collects no SCRUB fee. Refunds/disputes do not automatically undo invoice provenance.

## Live readiness

Before every new Checkout or reuse of an existing Checkout URL:

1. Server invoice-payment gate and authenticated client/invoice/company/relationship eligibility pass.
2. Active company architecture is Merchant direct v2 and the account matches the reserved/current identity.
3. Retrieve v2 with `include = configuration.merchant, defaults, requirements, identity`; also retrieve its compatible v1 Account.
4. Require explicit open state, expected credential test/live mode, US identity, USD default, Merchant configuration, Express dashboard and both Stripe collectors.
5. Require active card and payout capabilities with empty restriction details.
6. Require included requirements, no current/past-due deadline, and a known nonblocking summary when entries exist.
7. Require compatible v1 charges/payouts enabled, explicit current/past-due requirement arrays empty, and no disabling reason.

Missing/ambiguous facts fail closed. Cached status is only presentation, expires after 24 hours and cannot authorize Checkout. A v1 account update may revoke readiness but cannot certify v2 economics.

## Production gate

**Live invoice payments remain disabled by default.** No environment setting was enabled by this work.

`SCRUB_ENABLE_LIVE_INVOICE_PAYMENTS` must equal the exact string `true` in the Convex server deployment environment to allow `sk_live_`/`rk_live_` invoice Checkout. Missing, false or unknown credential mode blocks. Test keys bypass this live gate for validation. The existing `SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS` and local APP_URL protections still take precedence. This gate controls creating/reusing Checkout; verified late webhooks continue reconciling already-created payments.

After merge, an authorized operator must complete and independently review the test-mode checklist below, confirm Stripe preview eligibility, key permissions and real balances/economics, configure separate platform/Connect webhook secrets and approve the rollout. Only then set the live flag in the intended deployment. To stop new Checkout immediately, remove the flag or set it to `false`. Previously-issued Stripe URLs require explicit account-aware expiration; disabling SCRUB creation cannot revoke a Stripe URL by itself.

## Post-merge TEST-mode E2E sequence

At initial PR2.1 implementation, no verified local test credential was available. The original automated integration tests used mocks and signed fixtures. The subsequent real DEV payment validation is recorded below.

1. Use a separate nonproduction Convex deployment and an authorized Stripe sandbox/test key, installed through deployment secrets rather than chat. Keep the live gate unset. Ensure APP_URL points to that deployment and external side effects are allowed there.
2. Configure platform events and connected-account events with separate signing secrets. Subscribe Connect to `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `account.updated`, `charge.refunded`, `charge.dispute.created/updated/closed`. Configure SCRUB subscription events separately in platform scope. Confirm event payloads include connected `account`. Keep card-only payment methods.
3. As a legacy owner, select Reconnect Stripe. Inspect Stripe's request log: exact preview header, Merchant/Express, Stripe fees/losses, card request, no Recipient. Complete hosted test onboarding and agreement acceptance. Verify pending account is not activated before complete readiness. Verify a manager/staff cannot perform reconnect.
4. Retrieve the new account with all includes and the v1 compatible account; save sanitized evidence of every readiness predicate. Check default Radar protection and Express risk/notification access. Check preview access and restricted-key resource/connected permissions without enabling unrelated previews.
5. Start an old legacy Session before migration in a fixture company. Reconnect; verify original platform Session is expired before activation. A completed/uncertain old Session must block activation. Confirm original account and attempt evidence are unchanged.
6. Create and issue separate invoices for **$25, $29.99, $30 and $500**, including residential and commercial paths. Record authoritative amount, new attempt ID, direct model, company account and stored fee before paying. Start Checkout twice and verify the same open Session and account-aware idempotency.
7. Pay each with Stripe's documented successful test card. Confirm the client pays exactly the table amount. For $25/$29.99 verify the create request omits `application_fee_amount`, the PaymentIntent reports null/zero, and no application fee object exists. For $30/$500 verify 200 cents and the corresponding platform fee.
8. In the connected company's test Dashboard (or API with `Stripe-Account: <attempt account>`), open the Session, PaymentIntent and latest Charge. Confirm they belong to that company, have exact USD amount and matching canonical metadata, and no destination transfer. Platform-context retrieval should not resolve these direct objects.
9. Retrieve the Charge's expanded `balance_transaction` **in the connected account**. Inspect amount, `fee_details`, fee and net: connected net must equal client amount minus Stripe processing charges minus SCRUB fee. Do not infer ownership from metadata alone. In the platform test Dashboard's collected application fees/balance transactions, verify $2 only for the qualifying payments and no ordinary processing-fee debit for these company charges. Record Stripe's actual test pricing/fee behavior and reconcile both balances; do not assume a rate.
10. Verify signed completion uses Connect scope and exact `event.account`; canonical invoice becomes paid once, with the exact attempt/Session/PaymentIntent. Replay the same event and another equivalent completion; paid timestamp/provenance must remain unchanged. Check missing/wrong account, amount, currency, fee, Session and PI fixture mismatches stay unpaid/reconciliation and corrected replay stays terminal.
11. Create another invoice and expire its connected Session; confirm expired attempt, no payment, and safe new attempt on retry. Exercise a decline using Stripe's documented decline test card and verify it never becomes paid. Replay an expired/failed event from the wrong account; it must not authorize or silently close the legitimate payment.
12. Create a Session, record payment outside SCRUB through the authorized invoice flow, and confirm outside provenance, no application fee and expiration in the stored account. A simulated late successful signed event must remain reconciliation and must not replace outside provenance or add a retroactive fee. Repeat for void and two successful attempts; preserve one canonical outcome.
13. Test a direct refund in Stripe test mode: original invoice paid provenance stays intact and financial-event evidence is associated with the original connected account. Recheck historical destination events after migration using platform context. Confirm SCRUB subscription creation/update/cancel webhooks still update subscription billing only.
14. Independently review sanitized request logs, ownership, balances, canonical state, webhook routing and negative paths. Test results/Stripe eligibility must be recorded before any live enablement. No production deployment, merge or gate enablement is performed by this PR.

## Refund/dispute policy for future implementation

[Direct refunds use the original connected account](https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted). Application fees are not returned automatically. A future full refund of a qualifying payment should use `refund_application_fee: true` (or an explicit fee refund) to return its $2 fee; Stripe proportionally refunds the application fee for a partial refund with that flag. Product approval is needed for a different partial-refund policy. Zero-fee payments have no application fee to return. Do not use destination transfer-reversal assumptions for direct payments.

This PR captures refund/dispute context only; it adds no automated refunds or dispute management UI. SCRUB remains responsible for its own platform negative balance. Stripe collector configuration concerns connected-account losses and does not eliminate all platform fees or obligations.

## Validation and rollout risks

Automated coverage includes fee boundaries, direct Checkout execution/reuse and live gate, signed event routing, terminal reconciliation, duplicates/late events, legacy ownership, refund evidence, live capability/responsibility/mode/requirement failures, owner-only reconnect, old Session expiration and atomic activation guards. Existing invoice/pricing/permission/subscription regression suites remain part of the full test run.

Validation completed locally on 2026-09-27:

- Targeted four payment/Connect suites: **63 passed**.
- Full repository: `npx vitest run --maxWorkers=2`, **154 files / 895 tests passed**. The initial unrestricted worker run encountered two existing-suite timeouts under build/typecheck contention; reducing workers resolved them. An integration error-message assertion was restored before the passing run.
- `npm run typecheck`: frontend and Convex passed.
- `npm run build:frontend`: production Vite build passed; no Convex deployment.
- `git diff --check`: passed.

The build retains its existing large-chunk/Browserslist notices. Automated results establish application behavior with mocks, not Stripe platform eligibility or verified real transaction economics.

Merge review should confirm the preview API contract and controlled migration. **Remaining live enablement blockers:** production readiness audit; unconfirmed platform preview access and exact restricted-key permissions; unverified production Radar/pricing/balance behavior. Preview SDK/API changes require another documented version review. Uncertain old creation/payment evidence requires support reconciliation, not account swapping. This PR does not migrate multi-country operations or implement automated refund policy.

## Completed DEV payment validation and display cleanup

Real Stripe TEST-mode E2E passed on Convex DEV `majestic-turtle-198` with the hosted DEV frontend. This validates the tested payment path; it is not a production readiness audit or proof that every negative scenario above was exercised.

| Client charge | Frozen SCRUB fee | Actual Stripe processing fee | Connected company net |
| --- | --- | --- | --- |
| $25.00 | $0 | $1.03 | $23.97 |
| $29.99 | $0 | $1.17 | $28.82 |
| $30.00 | $2 | $1.17 | $26.83 |
| $500.00 | $2 | $14.80 | $483.20 |

Actual connected-account Sessions, PaymentIntents, Charges and balance transactions established direct ownership and company processing-fee responsibility. Platform-context retrieval did not resolve those objects. Two application fees credited the platform $4 total; the two smaller charges had no application-fee objects. Genuine delayed Stripe Connect completion deliveries matched the exact connected event account and reconciled all four invoices and attempts to Paid, with canonical references and zero reconciliation exceptions. A genuine repeated $25 completion left application and financial state unchanged.

Original zero-fee create request logs were not independently inspected; code omission and null Stripe fee fields were verified. Platform subscription webhook lifecycle isolation remains untested in this real E2E.

The cleanup reads the canonical attempt's frozen fee without retroactively applying current policy to historical destination charges. Missing/invalid legacy fee evidence is displayed as unavailable. Outside payment has no SCRUB fee. Client Billing projects open/creating attempts reactively and replaces Pay Online with a processing message while they exist; terminal attempt states release that presentation and Paid still requires canonical reconciliation. Onboarding explanation appears above the existing Connect controls in English and Spanish. These are presentation changes only.

### Required before production live rollout

- Perform a read-only production Stripe/Convex readiness audit before enabling live invoice payments; this cleanup does not perform that audit.
- Verify the production connected-account destination uses **snapshot payloads**, **connected-account scope**, and the eight payment events listed above. A webhook URL alone is insufficient.
- Verify the separate platform subscription destination includes `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.paid`.
- Verify both production signing secrets correspond to the exact configured destinations, including payload type and event scope.
- Keep `SCRUB_ENABLE_LIVE_INVOICE_PAYMENTS` unset/false pending readiness validation and the separately authorized controlled live smoke-test process. Keep broad rollout disabled until that process passes.
- Perform a tiny controlled LIVE payment, inspect ownership, fees, balances and reconciliation, and independently review the result before broad enablement.

No deployment, environment change, Stripe configuration change, payment creation or live enablement is part of this cleanup.


## PR3 audit and payment experience scope

Audit performed against merged PR2, PR2.1 and #234. PR3 preserves the verified payment rail rather than replaying the older checklist.

| Original PR3 area | Before PR3 | Existing evidence / remaining work |
| --- | --- | --- |
| Canonical payment, webhook reconciliation, late/duplicate protection | Already satisfied | `invoicePaymentInternal.ts`, `http.ts`, direct-charge and payment-attempt suites; verified real TEST E2E above. |
| Accounts v2, direct ownership, fee economics, historical compatibility, live gate | Already satisfied | `companyStripeMerchant.ts`, `invoiceStripeContext.ts`, `environment.ts`; unchanged. |
| Open/creating processing UI and actual frozen fee display | Already satisfied | #234: `ClientBillingPage.tsx`, `queries/invoices.ts`, `invoiceModel.ts`; preserved. |
| Stripe setup explanation | Already satisfied | #234: `StripeConnectPage.tsx`, EN/ES copy; unchanged. |
| Return and terminal client states | Partial | Paid invoice state existed, but redirects/cancel copy could imply an outcome, failed/expired attempts lacked guidance, and review evidence did not suppress Pay Online. |
| Owner provenance/payment record | Partial | Inline online/outside/fee labels existed only in the management actions section; no coherent read-only record for financial viewers. |
| Reconciliation visibility | Partial | Owner generic flag existed; clients could see a payable invoice. Checkout reservation also allowed a new attempt after terminal reconciliation evidence. |
| Refund execution | Deferred | No refund action or accounting model; existing event evidence lacks amounts, refund IDs/status, full/partial totals and application-fee refund state. |
| Dispute visibility | Missing | Signed account-validated events were stored, but owners had no read-only presentation. Actual dispute status/outcome/amount is not stored. |
| Dispute response/evidence submission | Deferred | No mature authorized workflow or response/evidence model. |
| Compact payment history | Missing | Attempt, canonical invoice and financial-event records existed without a combined invoice detail view. Broad reporting remains deferred. |

### Implemented PR3 behavior

- Client Billing derives paid, processing, attention, failed, expired or awaiting-payment presentation from stored invoice/attempt/exception evidence. Checkout return/cancel parameters display neutral guidance only; they never authorize Paid. Paid online and recorded-outside sources are distinguished. Failed/expired attempts offer retry only when online availability and lifecycle allow it. Server-side live Merchant readiness and payment validation remain authoritative; query availability is only a UI hint.
- Review evidence takes precedence over routine processing/retry. Both internal inspection and atomic reservation now reject another Checkout on an issued invoice with a reconciliation-required attempt, an inconsistent paid attempt, or matching exception evidence. Failed/expired retries and the existing one-active-attempt reservation remain intact. No reconciliation record is cleared or auto-healed.
- The shared owner invoice detail (residential and commercial) includes a read-only payment record: lifecycle, source, invoice amount, canonical payment amount when recorded, paid time and frozen fee. Outside payment shows zero fee and says SCRUB did not process it. Missing source, fee or method evidence is not invented. Existing invoice reader permissions govern access; support references additionally require `canViewFinancials` (owners retain access).
- Compact history contains stored initiation/current attempt-state records, canonical invoice confirmation/outside-paid record and verified refund/dispute event receipts. It does not reconstruct lost intermediate states. Displayed times are SCRUB record/receipt times, not invented Stripe occurrence times.
- A `by_attemptId` index on `invoiceStripeFinancialEvents` supports scoped reads without scanning other companies' events. Existing ingestion and stored event payload fields are unchanged. Only matched, context-valid evidence is shown; no raw payloads, Checkout URLs, identity/bank data or secrets are added to projections.
- Refund activity and dispute opened/updated/closed event receipts are shown read-only. A closed dispute event does not establish won/lost status, and a refund event does not establish full/partial accounting. These unknowns are stated explicitly; canonical invoice paid provenance remains unchanged.
- All new lifecycle/record copy is localized in EN and ES. No refund, force-reconcile or dispute-response button is added.

### Refund execution blockers: modern and historical payments

There is no existing complete refund backend. Invoice status supports draft/issued/paid/void, not refund accounting; retained financial events contain only event/object/PaymentIntent/account/source identifiers, matched attempt and receipt time. They cannot establish remaining refundable amount, full versus partial completion, refund failures or fee-return totals. Payment method descriptions also are not stored.

For modern direct charges, execution must use the original frozen connected account; application fees do not return automatically, and proportional/full fee behavior must be approved explicitly. See [Stripe direct-charge refunds](https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted#issue-refunds).

Historical destination charges require platform-context refund execution and a deliberate transfer-reversal policy. By default, the transferred company funds remain with the company; returning the application fee for a destination charge also requires reversing the transfer. See [Stripe destination-charge refunds](https://docs.stripe.com/connect/destination-charges?platform=web&ui=elements#issue-refunds).

Before execution can be added, approve full/partial refund and application-fee policies for both models; design idempotent authorized refund commands and durable refund/fee/transfer accounting; ingest authoritative refund amounts/statuses and failures; define invoice balance/state behavior; and cover concurrent/refailed refunds and historical account ownership. PR3 deliberately leaves money movement deferred and preserves existing evidence.

### Dispute limits and remaining work

PR3 shows verified event activity and receipt history only. No current dispute status, disputed amount, Stripe event occurrence time or won/lost outcome is inferred. Owners are directed to review the payment with Stripe; SCRUB does not submit responses. Rich status capture and response controls require a separate approved model/workflow.

The production-readiness requirements above remain in force: independent read-only audit, snapshot Connect scope and eight events, platform subscription lifecycle plus invoice.paid, exact destination/signing-secret correspondence, and separately authorized controlled live validation before broad enablement. The live-payment kill switch remains untouched. Original zero-fee request-log omission and real subscription webhook lifecycle isolation remain independently unverified.

Worker/partner payout architecture remains a separate investigation. PR3 performs no deployment, Stripe/Convex configuration changes, real/test payment creation or live enablement.
