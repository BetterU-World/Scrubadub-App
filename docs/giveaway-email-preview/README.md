# SCRUB giveaway email review — November 2, 2026

**Preview only. No email sends, scheduling, production mutations, deployments, new drawing, or Stripe changes.**

Open `index.html` locally to review all three drafts, subject lines, preview text, HTML and plain copy. Use its Desktop/Mobile controls. Regenerate with `node docs/giveaway-email-preview/generate.mjs` from the repository root. The generator imports only filesystem/path helpers; nothing is connected to the application or Resend. HTML is a draft artifact, not a delivery payload. Screenshots show sample content only.

## Architecture and source evidence

Reviewed against `origin/main` at `66bfdb5`. An isolated branch preserves the original checkout's unrelated edits and calendar work. No repository AGENTS.md or separate PR template was found. Existing `.github/workflows/ci.yml` typechecks frontend/Convex, runs Vitest, and builds the frontend without deploying; the root `npm run build` deploys Convex and must not be used for this review.

- `convex/lib/email.ts`: shared Resend transport, escaped content, `getPlatformEmailHeaders()` using the configured SCRUB sender, optional operational reply-to, and existing transactional templates. `convex/actions/emailNotifications.ts` exposes existing internal delivery actions. This review does not import, call, or extend them.
- `convex/lib/giveawayCampaigns.ts`: shared public rules registry; campaign `scrub-giveaway-2026-001`, rules version `scrub-giveaway-2026-001-rules-v1`; one $100 Digital Visa Gift Card. `packages/frontend/src/pages/public/GiveawayPage.tsx` renders the rules at `/giveaway#official-rules`. Sponsor is Scrubadub Solutions LLC. The rules require response within 72 hours of notification and allow eligibility verification before fulfillment. No fee, subscription, or assessment is required to receive the prize. Rules do not specify a November 6 fulfillment date; that date comes from the founder and remains subject to verification.
- Published URL attempted: https://scrubscrubscrub.com/giveaway. Web retrieval failed. **Published-rule parity is unverified**; do not treat the repository as proof of what entrants saw. Obtain the published/frozen rules version before approving delivery.
- `convex/schema.ts` / `convex/lib/giveawayEntries.ts`: entries record normalized/original email, campaign, qualification time/status, eligibility/rules acknowledgment, method, optional assessment reference, and separate marketing consent/time/version. New consent uses `giveaway_followup_v1`; duplicate submissions retain the first entry and do not update consent. Legacy method-less rows represent assessment entries. Consent to report delivery is separate and must not substitute for giveaway marketing consent.
- `convex/giveaways.ts` / `packages/frontend/src/pages/admin/GiveawayOperatorPage.tsx`: authenticated superadmin entrant pagination/export. No production export or participant record was retrieved during this task.
- `docs/giveaway-v1.md`: manual private drawing/verification/fulfillment ledger. Founder confirms the winner has already been selected. Do not draw again. Keep the supplied address in the private approval context only; match it to the canonical entry and drawing ledger before delivery. It is deliberately absent from repository files, previews, screenshots, and PR metadata.
- No dedicated giveaway bulk sender, recipient notification ledger, global marketing suppression storage, or operational marketing unsubscribe handler was identified. Existing transactional send results are not proof of campaign-level idempotency or suppression coverage.
- Brand colors come from `packages/frontend/tailwind.config.js`: dark green `#064e3b`, green `#047857`, pale green `#ecfdf5`. Emails use a legible SCRUB wordmark, inline styles, presentation tables, a 600px wrapper with Outlook conditional width, system fonts, and a restrained gold accent for the winner. No external assets must load to read the message.

## Draft decisions and approval holds

**A — Winner.** Prepared for the founder-confirmed private recipient, with a generic greeting to avoid guessing a name. Includes prize, Friday November 6 electronic delivery subject to verification, reply within 72 hours of actual notification, no purchase requirement, and three complimentary months as a separate optional bonus. An elapsed drawing date does not start the response clock. If prior official notification already occurred, reconcile its timestamp and deadline privately before using this draft; do not restart or invent a deadline. Confirm a monitored reply-to and activation terms (plans, payment requirement, end-of-bonus billing, cancellation, existing-account handling) before offering activation. No bonus configuration is claimed. Assessment-specific thanks are withheld until the winner's entry method is verified.

**B — Results.** Neutral, no promotional offer or marketing CTA. The repository rules authorize giveaway administration and winner contact but do not explicitly promise nonwinner notification. HOLD until the frozen published rules and applicable communication requirements support this message. A source-code review cannot determine recipient permission. Includes conditional thanks for assessment participants so alternate entrants are not mischaracterized.

**C — Marketing.** DRAFT, not final verified promotional copy. Contains the founder's exact required FIRST50 disclosure, all-plan language, payment method requirement, $0 initial promotional subscription payment assuming no other charges, and regular-price automatic renewal unless canceled. The December giveaway is omitted because it is unconfirmed. The footer visibly marks the unsubscribe and postal-address placeholders; neither is operational. A real unsubscribe destination, suppression integration, and approved business postal address are required before final approval. Regular plan price must be visible in signup and verified against the selected live Stripe price; the draft does not invent amounts.

## Stripe verification: not complete

No Stripe connector or Stripe credentials are available in the local environment. Local `.env.local` contains Convex deployment/URL keys, not a Stripe key. Production Convex environment secrets were not exported. There is no FIRST50 definition in the reviewed application source. Do not infer its presence or terms from `allow_promotion_codes`.

`convex/actions/billing.ts` creates subscription Checkout with selected Solo/Team/Pro price variables, `allow_promotion_codes: true`, and **`trial_period_days: 14`**. It does not explicitly set `payment_method_collection` or define FIRST50, discount duration, redemption limits, or expiration. It creates a billing portal session using Stripe's default portal configuration; it does not establish that cancellation is enabled or its timing. The Checkout `cancel_url` only returns from Checkout and is not subscription cancellation.

Read-only evidence required from the actual production Stripe account before finalizing C:

1. Retrieve FIRST50 promotion code and expanded coupon: active/livemode, percent off **100**, duration **once** (or other precisely verified one-month behavior), applicable product restrictions matching **all** subscription plans and intervals. Record sanitized IDs and observation time privately.
2. Verify redemption limits, redemptions used, expiry/redeem-by, first-time-customer restriction, minimum amount/currency, and customer restrictions. Any restrictions must be reconciled with the advertised offer and disclosed. Never repair the configuration without approval.
3. Retrieve configured price/product metadata for Solo, Team, Pro and any other subscription plans; confirm regular price, interval, currency, and tax/additional-charge behavior. An annual plan's first invoice discount is not automatically a free first month.
4. Verify how the existing 14-day trial interacts with the coupon and first paid invoice, zero-dollar signup, payment method collection, billing anchor, and first regular-price renewal date. Use existing sanitized sessions/invoices or a separately approved test-mode validation. Do not create live Checkout sessions or subscriptions for this task.
5. Retrieve default billing portal configuration and confirm cancellation availability, immediate versus period-end behavior, any cancellation conditions, and a working customer cancellation path. Verify relevant subscription/webhook state handling. Record the actual billing/cancellation behavior and revise copy if it differs.

The current evidence does **not** establish that the live implementation matches the founder's terms. All promotion facts above remain release blockers. The winner's three-month bonus is also unverified and must be configured only under separate approval.

## Recipient eligibility and consent review

This is a source/schema review, **not a completed production recipient audit**. Actual counts and suppression status are unknown. No participant email is logged or included in these artifacts.

Proposed future dry run (requires separate approved implementation):

1. Read every paginated campaign entry and the restricted authoritative winner ledger. Confirm selected winner by canonical entry ID and normalized `trim().toLowerCase()` email. Do not merge Gmail aliases or strip dots. Fail closed if the winner cannot be matched uniquely. Never run random selection.
2. Validate campaign, rules version, qualification time within the promotion, eligibility attestation, disqualifications, and legacy acknowledgment evidence. Qualified status is not proof of final eligibility. Preserve both entry methods. Deduplicate by normalized email across methods; contradictory consent must hold the recipient for review, never upgrade consent.
3. Exclude the selected winner from both nonwinner templates. Separate administrative eligibility from marketing eligibility. For C require affirmative giveaway consent with timestamp/version and no later withdrawal, complaint, hard bounce, global/provider suppression, or applicable block. Missing current suppression evidence holds delivery. Do not use assessment report consent or account ownership to infer marketing consent.
4. B remains held pending rules/communication approval even if a recipient declined marketing. For approved nonwinner communications, assign exactly one template per recipient to avoid sending both B and C by default. Report counts only: winner, marketing candidate, administrative candidate, suppressed, duplicate, missing/ambiguous evidence, excluded, and held. Use synthetic fixtures for development.
5. Before any future sender is approved, add a persistent unique campaign/template/entry key and immutable content version; reserve atomically, record provider message ID, timestamps, attempts, failure category, and delivery events privately. Distinguish failed from unknown provider acceptance; retries require reconciliation/provider idempotency to prevent duplicate delivery. Redact raw addresses, message bodies, and tokens from general logs. No such sender or ledger is implemented here.

## Preview and testing process

- Offline HTML and plain-copy review first; synthetic recipient only. The index includes holds next to each email. The HTML itself remains visually reviewable without application authentication or a backend.
- Browser screenshots at desktop 1280px and mobile 375px, plus overflow checks at 320/375/390/768/1280/1440. These are browser renders, not evidence of Gmail/Outlook/Apple Mail client parity. Before approving delivery, review actual email-client rendering through an approved test-only process.
- No test email is sent. Future safe test workflow: founder explicitly approves exact internal test addresses and the rendered content; a separately approved test-only transport must enforce an exact allowlist, use synthetic recipients, reject participant exports, and offer no production bulk/schedule path. Confirm monitored sender/reply-to, text alternative, unsubscribe and provider headers before sending any test. This PR intentionally contains no transport.
- Founder reviews A/B/C appearance and copy, private recipient audit, published rules, promo evidence, and test rendering. Approval of a draft PR is not authorization to deliver. Any production delivery workflow requires explicit separate approval before implementation or execution.

## Validation record

Pending screenshots and offline checks are recorded in `validation.json` after execution. No application runtime files or dependencies are changed, so backend/frontend deployment and application end-to-end testing are outside this preview's scope. No production behavior is changed.
