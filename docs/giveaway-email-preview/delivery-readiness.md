# Manual operation and final approval gates

**Current authorization: implementation only. No deployment, merge, test email, production email, scheduling or Stripe modifications.** This supersedes earlier readiness-only plans. UI/API controls exist in code but have not been deployed or invoked against production.

## Configure privately after explicit deployment/configuration authorization

Use the existing Convex deployment's protected server environment; never a `VITE_` variable, client bundle, committed `.env`, screenshot, log or public template. Do not put secret values in shell command history. Configure through the authorized private dashboard/workflow:

| Variable | Purpose |
| --- | --- |
| Existing `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Verified SCRUB sender mailbox/domain; campaign display name is always SCRUB Team. |
| `SCRUB_CAMPAIGN_REPLY_TO` | Founder-approved, monitored reply mailbox; required and validated. |
| `SCRUB_CAMPAIGN_POSTAL_ADDRESS` | Founder-supplied private mailing address. Required, escaped into both outgoing HTML/text; never read by offline generator or sample preview. |
| Existing `CONVEX_SITE_URL` | HTTPS origin hosting `/giveaway/unsubscribe` and `/giveaway/resend-webhook`. |
| `SCRUB_CAMPAIGN_UNSUBSCRIBE_SECRET` | Stable random secret, at least 32 characters, for HMAC opt-out tokens. Retain it so delivered links remain valid. |
| `SCRUB_CAMPAIGN_RESEND_WEBHOOK_SECRET` | Resend webhook signing secret. Configure complaint, bounce and suppression events to the campaign webhook URL. |
| `SCRUB_GIVEAWAY_WINNER_EMAIL` | Founder-confirmed private winner mailbox. Never hard-code it. Match privately to the authoritative entry/ledger. |
| Existing `TOKEN_PEPPER` | Stable identity hashing used for existing sessions and campaign suppressions. Rotation requires a migration; do not rotate casually. |
| `SCRUB_CAMPAIGN_TEST_RECIPIENTS` | Comma-separated exact internal addresses explicitly approved for testing. Participant and winner addresses are rejected even if allowlisted. |
| `SCRUB_CAMPAIGN_ALLOWED_SEND_MODE` | Leave unset/disabled. Only `test` or `production` permits the corresponding mode, in addition to a separate recorded approval. Never enable both. |

The existing `SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS` gate and local APP_URL protection also block sending. No secrets or private address have been configured by this PR. Configuration/content changes invalidate prepared/approved snapshots.

Confirm privately that the supplied postal address is current, complete, legitimately used by the sponsor and deliverable; its formatting is not postal validation. The [FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) permits a valid current street address, registered USPS PO box or properly registered private mailbox. This PR does not establish postal validity and never transmits the address to a public validator. Delivered recipients necessarily see it. Do not omit or substitute an invented address.

## Private dry run — no sends

Use the existing superadmin Giveaway operator page. Both existing verified session and active platform-admin entitlement are required. Review A/C in the sandboxed sample preview. B is absent from campaign selection.

1. **Prepare production dry run** creates an immutable private run with a config/content fingerprint. **Process next 100 entrants** until ready. No cap silently truncates the pool; cursor/counters live in the run. These operations do not call the provider.
2. Reconcile aggregate categories: total = winner + marketing + invalid + duplicate + noConsent + invalidConsent + suppressed. Duplicate counts refer to records in duplicate groups, all held. Ready approval requires exactly one valid winner.
3. Privately verify winner identity, eligibility/disqualification, frozen rules and binding correspondence. Founder confirms TikTok was preliminary and official email starts 72 hours. Current public rules were verified against all 10 registry bodies. Ensure November 6 gift-card fulfillment is still accurate at release time.
4. Import all known previous opt-outs/provider suppressions using superadmin `giveawayEmailCampaign.suppress` before approval. Review consent Yes plus timestamp/version and any external withdrawals. Current entry/consent/suppression are rechecked immediately before each reservation. New webhook complaints/bounces/suppressions persist automatically when the verified endpoint is configured. Winner suppression never removes prize administration or conditions the gift card on marketing consent.
5. Keep roster and source records private. Status and ledger views return aggregate counts/opaque record IDs and delivery metadata without participant addresses. Counts have not been run against production in this task and remain unknown.

A snapshot can be approved within 24 hours of creation. Approval binds the snapshot digest, configuration and content version and expires after one hour. New approval cannot bypass prior campaign-level delivery keys. A new content version does not create permission to send an already-accepted notification again.

## Exact test approval

First obtain explicit authorization to deploy/merge/configure the reviewed implementation. No deploy is implied by implementation approval.

Then founder specifies the exact internal test inbox(es) and says: **“I approve sending test A and C to these exact internal addresses only.”** Configure the private allowlist and mode `test`. Prepare a test review; it uses synthetic greeting/content and no participant snapshot. Founder/operator reviews copy, private footer, monitored sender/reply-to, bonus disclosures and opt-out. Type **`APPROVE TEST SCRUB GIVEAWAY A AND C`**, check readiness, record approval, then separately click **Send up to 10 test emails now**. This is an actual send and is not authorized yet.

Check real desktop/mobile Gmail, Outlook and Apple Mail as available; inspect HTML/text, reply routing, footer, CTA and opt-out. GET must not suppress; explicit POST must suppress persistently. Verify signed provider-webhook handling. Keep any real private-footer screenshots out of GitHub. Disable the mode after testing. A test approval can never authorize production.

## Exact production approval and coordinated release

After successful approved tests and private recipient/configuration review, show the founder the final A/C copy, real privately rendered footer, aggregate dry-run counts, snapshot digest, sender/reply-to and any remaining bonus activation details. FREESCRUB timeline is founder-confirmed; optional operational invoice verification is described separately and is not a connector blocker.

Founder must explicitly say: **“I approve sending official winner A and promotional C for this campaign using the reviewed snapshot and content, audited recipient counts, SCRUB Team sender/reply-to, and approved billing/bonus/footer terms.”** Approval of design, PR, infrastructure, deployment or tests is insufficient.

Only then set mode `production`, prepare/review the current production snapshot, type **`APPROVE PRODUCTION SCRUB GIVEAWAY A AND C`**, check readiness and record approval. Click **Send up to 10 production emails now** only under that permission. Each invocation is bounded and manual. Continue only while approved and within the reviewed scope; no scheduling or automatic continuation occurs. Pause at any time to prevent later reservations (an already-started provider call cannot be recalled).

Winner A is attempted first; C starts only after known provider acceptance of A. Acceptance is not delivery confirmation. The provider cannot deliver an entire campaign atomically. The ledger records winner acceptance and a deadline 72 hours later; verify actual notification/delivery and any binding correspondence privately. A replayed/new snapshot copies the original accepted timestamp rather than restarting the deadline. Prize fulfillment is separate and is never contingent on the bonus.

## Partial sends, interruption and reconciliation

A persistent unique key binds campaign + mode + template + normalized-email hash (test keys additionally include run ID). The mutation atomically reserves the key and run's in-flight slot. Resend receives the same idempotency key. Reserved, uncertain and rejected attempts cannot be resent by this implementation; no blind network/provider retry is performed. Ledger protection outlives provider idempotency retention.

Known rejection pauses the run. Unknown timeout/5xx or an action interrupted after reservation also blocks progress. Do not infer acceptance/rejection from an exception. Inspect the private ledger IDs and provider records. `reconcileAccepted` requires superadmin authorization, provider message ID, private evidence reference and verified accepted timestamp; it clears the in-flight slot but returns the run to review, requiring fresh explicit approval. It never authorizes another send by itself.

An operator-paused run without unresolved deliveries may return to review through **Return resolved run to approval review**, then obtain new approval. A definitely rejected or unresolved message has no retry/reset endpoint in this minimal version. Correct/reconcile the provider issue and review a separately authorized recovery change if another actual attempt is necessary; do not delete ledger records, change campaign IDs or use a new snapshot to bypass it. This deliberately conservative limit prevents duplicate notifications.

Only HTTP opt-out actions and verified provider suppression events are anonymous; every campaign administration, approval, reconciliation and delivery control verifies platform-admin permission. No raw addresses, secret values, message bodies or provider error bodies are printed by campaign code.
