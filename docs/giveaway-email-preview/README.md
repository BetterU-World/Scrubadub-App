# SCRUB giveaway campaign implementation

Draft PR #275 now implements the A/C campaign. Visual layout and branding are preserved. B remains archived. **Implementation is approved; test sends, production sends, deployment, merging and Stripe changes are not approved.** No emails have been sent by this work.

- [Offline design gallery](index.html): approved visual direction with updated copy, sample content and private-footer markers. Regenerate with `node docs/giveaway-email-preview/generate.mjs`. Shared content lives in `convex/lib/giveawayEmailTemplates.js`; the generator reads no environment secrets.
- [Operating and approval instructions](delivery-readiness.md): configuration, recipient audit, release gates and reconciliation.
- [Billing requirements and optional verification](verification-update.md): founder-confirmed FREESCRUB behavior; no connector dependency.
- [Current published rules evidence](published-rules-verification.json): all 10 public rule bodies matched the repository. This is not a historical frozen-rules audit.

See [final adversarial review and deployment checklist](final-review.md) for the latest fixes, configuration inventory, no-send proofs and exact internal-inbox steps.

## Implementation

`convex/giveawayEmailCampaign.ts` provides superadmin-only previews, paginated dry-run preparation, aggregate counts, snapshot/config/content-bound approval, pause, ledger review, and provider-acceptance reconciliation. New tables hold private snapshots, recipients, stable campaign-level delivery keys and persistent marketing suppressions. Existing tables receive no new required fields.

`convex/actions/giveawayCampaignDelivery.ts` provides the manually invoked, bounded Resend operation, plus signature-verified provider suppression ingestion. Default delivery mode is disabled. Every provider attempt requires a durable reservation, unexpired approval, matching configuration/content and current recipient checks. Unknown outcomes stop the run and prohibit another attempt. No scheduler or automatic retry exists.

`convex/giveawayUnsubscribe.ts` and additive routes in `convex/http.ts` implement signed, opaque opt-out links. GET displays a confirmation form; POST persists suppression. Complaint/bounce/suppression webhooks use Resend's local signature verification before updating suppression. Existing transactional behavior is unchanged.

`convex/lib/giveawayCampaignEmail.ts` validates server configuration, signs links, renders escaped private footer values into outgoing HTML/text, and applies strict recipient classification. Only A and C are supported by the delivery renderer. The winner's prize is independent of marketing preferences and bonus acceptance.

`GiveawayCampaignPanel.tsx` adds controls to the existing superadmin giveaway operator page: sample previews, production dry-run preparation, internal-test review preparation, aggregate counts, typed mode-specific approval, explicit send-batch button and pause. Preparing a test review sends nothing. Client visibility is not the authorization boundary: every backend control verifies the existing session and platform-admin entitlement.

## Safety and limits

- Founder-confirmed FREESCRUB requirements: signup starts a 14-day trial; first post-trial subscription invoice is $0; following monthly invoice is regular price; Solo/Team/Pro; payment method required; automatic renewal unless canceled. Live operational verification is a future follow-up, not an implementation blocker.
- The official email starts the 72-hour window. Provider acceptance time is recorded as the initial notification timestamp, with a corresponding deadline; it is not proof of inbox delivery. Review binding correspondence and delivery failures privately. TikTok was preliminary. No drawing occurs.
- A includes the optional three-month all-plan offer and subsequent regular-price renewal. Its exact activation/payment/trial details must be supplied before bonus activation; accepting it is never a prize condition.
- C requires strict boolean Yes and auditable giveaway consent. Winner, No/missing/invalid consent, duplicate groups, invalid entries and suppressed/unsubscribed addresses are excluded. Current source consent and suppression are rechecked at reservation. No fallback to B.
- A database reservation and external provider call cannot be atomic. A last-moment unsubscribe can race an already-started provider attempt. A durable reservation prevents duplicate attempts; it does not recall an already-accepted email. Both messages share a release approval; the provider cannot deliver all messages atomically.
- Configuration and code are not deployed. Production entrant counts, sender/domain/reply-to status, actual inbox rendering, secure postal configuration and unsubscribe endpoint reachability have not been verified live. Counts are unknown until the private dry run is performed.
- No recipient address or the founder's private postal address is committed. Synthetic test data is clearly fictitious. Real address injection happens only in the outgoing-message renderer; public previews never load it.

## Validation

Focused tests use synthetic database records and a fully mocked Resend transport: consent, winner exclusion, duplicates, opt-out, provider-signature boundary, missing configuration, unauthorized controls, expiry/config drift, cross-snapshot idempotency, interrupted reservations, partial rejection/timeouts and allowlisted test mode. No test depends on live Stripe, Resend, or production Convex.

Run `node ../node_modules/vitest/vitest.mjs run convex/lib/__tests__/giveawayEmailCampaign.test.ts` from this worktree (or normal `npm test -- ...` after installing dependencies). Run frontend/Convex typechecks and a frontend-only build. Never use the root build script, which deploys Convex. No deployment-based verification was performed because deployment is not authorized.

Final implementation validation: **204 files / 1,745 tests passed**, including the focused **4 files / 60 tests** campaign regressions. Convex and frontend TypeScript checks and the frontend-only production build passed. All 18 responsive overflow checks passed; six sample screenshots were regenerated. Existing non-failing build chunk-size and dependency source-map warnings were observed. No deployment or actual email sends were performed.

Final adversarial review validation: **204 files / 1,756 tests passed**, followed by **4 files / 72 focused tests** including the added same-run/identity-rotation regressions. Both typechecks and the frontend-only build passed. No deployment, environment write or email delivery was performed.
