# Outgoing Payments V2: Phase 0 containment

## Permanent retirement boundary

Worker and partner legacy destination-charge creation, legacy financial writes,
worker payment onboarding/invitations, and affiliate electronic Transfer execution
are retired in code. There is no environment switch to resurrect them. The client
invoice live-payment gate remains independent.

Compatibility exports retain their validators and verified-session authorization.
Worker/partner requests check tenant ownership before returning the stable
`Legacy outgoing payments are retired. Payment recording is being upgraded.` error.
No retired endpoint calls Stripe or creates financial records. Job submission and
approval remain operational workflows; submission no longer creates OPEN payments.
Previously queued worker Stripe invitations are suppressed.

## Reviewed inventory checkpoint

Read-only inventory covered DEV `majestic-turtle-198` and production `canny-spider-91`.

| Area | DEV | Production |
| --- | --- | --- |
| Worker payments | 5: two outside-paid, two Stripe-paid, one canceled | 5: one $75 outside-paid, four OPEN without amounts/provider IDs |
| Worker payment/job links | 13, with incomplete allocation amounts | None |
| Partner settlements | Six: three open, three paid | None |
| Partner batches/items | None | None |
| Affiliate batches | One recorded Zelle batch, $0 | None |
| Current Stripe account Sessions | None | 25, none tagged with known legacy outgoing types |
| Current Stripe account Transfers | None | None |

Three DEV Session references ($388/$80 worker and $101 partner) are unavailable
under the current test account. Other DEV artifacts include an ambiguous $100 paid
partner record and a destination field containing a Convex company ID.

The product owner explicitly classified the known DEV records as development/test
artifacts requiring no reconstruction. The five production worker records were
classified as financially immaterial to cutover. This does not prove unknown
historical provider objects never existed. No financial objects were altered.

## Historical compatibility

Historical records remain readable. Existing signed platform webhook completion
branches and internal completion mutations remain available. Their compatibility
behavior is not a new canonical reconciliation engine and does not reconstruct
historical test transactions. Same-Session completion retries remain idempotent.
Conflicting Session evidence is retained in the existing company audit log under
`legacy_outgoing_reconciliation_required`; financial state is not overwritten.
A Convex company ID is no longer supplied as a Stripe destination ID. Existing
malformed fields are neither repaired nor guessed.

Affiliate qualification, ledger, requests, history and existing internal resolution
functions remain separate. Only electronic execution/retry is disabled.

## Phase 1 handoff

No schema changes, V2 ledger, source claims, migration, funding, reservation or
payment adapters are introduced. Existing OPEN records and mutable job projections
must not automatically generate V2 obligations. Phase 1 must start from explicitly
approved compensation/partner terms with an independent historical boundary.

Deploying this PR must not expire Sessions, cancel PaymentIntents, refund Charges,
reverse Transfers or change connected accounts. Any newly discovered production
outgoing financial movement requires review before financial-state changes.

## Files changed in PR A

- convex/actions/cleanerPayments.ts
- convex/actions/cleanerStripeConnect.ts
- convex/actions/emailNotifications.ts
- convex/actions/settlements.ts
- convex/actions/stripePayouts.ts
- convex/http.ts
- convex/lib/__tests__/legacyOutgoingRetirement.test.ts
- convex/lib/__tests__/pr6dFinalLegacyRemoval.test.ts
- convex/lib/jobSubmission.ts
- convex/lib/legacyOutgoingCompletion.ts
- convex/lib/legacyOutgoingRetirement.ts
- convex/mutations/cleanerPayments.ts
- convex/mutations/jobs.ts
- convex/mutations/settlements.ts
- docs/outgoing-payments-phase0.md
- packages/frontend/src/components/affiliate/AffiliateLedgerTab.tsx
- packages/frontend/src/components/payments/LegacyOutgoingNotice.tsx
- packages/frontend/src/pages/owner/CleanerPaymentsPage.tsx
- packages/frontend/src/pages/owner/JobDetailPage.tsx
- packages/frontend/src/pages/owner/PaymentsHubPage.tsx
- packages/frontend/src/pages/owner/SettlementsPage.tsx
- packages/frontend/src/pages/worker/CleanerSettingsPage.tsx
- packages/frontend/src/pages/worker/WorkerPaymentsPage.tsx
