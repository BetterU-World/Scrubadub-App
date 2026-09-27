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

No verified local test credential was available. All automated integration tests use mocks and signed fixtures; no Stripe API request was made with a real test or live credential.

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

Merge review should confirm the preview API contract and controlled migration. **Live enablement blockers:** unavailable independent Stripe test E2E evidence; unconfirmed platform preview access and exact restricted-key permissions; unverified real Radar/pricing/balance behavior. Preview SDK/API changes require another documented version review. Uncertain old creation/payment evidence requires support reconciliation, not account swapping. This PR does not migrate multi-country operations or implement automated refund policy.
