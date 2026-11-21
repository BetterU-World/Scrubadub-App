# Founder notifications V1

Server-only email to one mailbox, reusing the existing Convex scheduler and Resend platform sender. No frontend recipient, general inbox, analytics expansion, merge, deployment, or production configuration changes.

## Event triggers and launch boundary

Stripe notifications require `SCRUB_FOUNDER_STRIPE_LAUNCH_AT`, an explicitly chosen, fixed UTC instant in exactly `YYYY-MM-DDTHH:mm:ssZ` format. Set it to the approved launch time before releasing these functions. It is inclusive, persisted as deployment configuration, and must never be advanced on redeploy, reset to the current time, or backdated to enable historical notifications. There is no Date.now fallback. Missing, malformed, or impossible dates disable Stripe recording/delivery and produce a configuration warning; signup, assessment and giveaway emails are independent of this boundary.

- **New Company Signup:** `authInternal.provisionPublicCheckout` after atomic company/site/owner/Stripe linkage and checkout completion; also legacy active-owner creation in `authInternal.createUser`. Key `signup:<companyId>`. Empty companies, incomplete checkout, worker/client/affiliate accounts, showcase and QA direct inserts do not generate signup mail.
- **Subscription/Trial Started:** requires Stripe `subscription.created >= launch`, plus active/trialing initial access. The verified platform webhook accepts a `customer.subscription.created` snapshot or an initial `incomplete` to active/trialing transition identified by `previous_attributes.status`. Ordinary subscription updates, renewals, billing edits and trial-to-active changes cannot create access mail. Public checkout provisioning can also use the actual Stripe-retrieved subscription creation evidence. Current company status alone is never evidence of a new subscription. Key `access:<companyId>:<subscriptionId>`. Out-of-order creation/access evidence is retained before provisioning and deduplicated afterwards. A prelaunch trial never generates a new access email on a later update.
- **First Paid Subscription:** signed platform `invoice.paid` records an invoice-deduplicated verification job, independently of canonical attribution. The action validates invoice/customer/subscription linkage, then paginates paid subscription invoice history across that Stripe customer. It requires positive paid InvoicePayment allocation plus a succeeded positive PaymentIntent or captured standalone Charge, matching customer/currency. The earliest verified allocation's `status_transitions.paid_at` determines the first payment and launch eligibility, not invoice creation, invoice settlement, webhook receipt time, active status or coupon presence. A prelaunch partial payment remains historical even if the invoice settles after launch. Key `paid:<companyId>` across subscriptions. No email is generated when the original first collection predates launch, even if a postlaunch renewal triggers verification. A company trialing before launch still qualifies if its first genuine positive collection occurs at/after launch. An earlier free/100%-discounted invoice or credit-only settlement is not a paid conversion; a partial coupon with positive cash collection qualifies. Delayed/reversed webhook order selects the actual first collection, and renewals cannot resend it.
- **Assessment Completed:** `assessments.complete` after required-answer validation, scoring, giveaway validation, completion snapshot and milestone persistence; once per attempt. Includes available contact at completion, score/result, time and the existing protected `/admin/assessments/:attemptId` route. No answers, capability/report tokens or later contact backfill. In-progress/abandoned/repeated completion does not send again.
- **Giveaway Entry:** shared `recordGiveawayEntry` after qualified insertion, once per entry across assessment/alternate methods. Includes eligibility, method, consent, campaign, time and assessment reference where present. Existing lifecycle, eligibility and submission rules are unchanged. Assessment-only completion is not an entry; duplicate entry attempts do not resend.

Access/payment facts are checked against the launch boundary during recording, reconciliation and delivery claim. Unsent records from the earlier draft without reliable postlaunch proof are skipped; new verified evidence can replace a pending/skipped stale row. Sending/accepted/unknown rows are never automatically reopened.

## Failure isolation and delivery

Canonical signup/assessment/giveaway mutations append durable outbox rows. A one-minute cron schedules committed work in bounded batches: 25 emails and 10 payment verification jobs.

In Stripe HTTP processing, subscription sync and affiliate attribution run first with their existing error handling. Only the founder-specific mutation call is inside `bestEffortFounder`. Founder facts/outbox/payment-check write failures are logged generically and cannot prevent canonical work or webhook completion. Real billing/attribution failures still mark the webhook failed and return HTTP 500 for Stripe retry. Signature validation and existing event/invoice deduplication remain intact. Cron scheduling and provider delivery occur outside the webhook entirely. A failed founder recording can lose an alert: Stripe does not replay an already successful canonical event just to repair founder mail. There is no automatic historical repair/backfill or new operator UI.

Delivery reuses the Resend client, verified platform sender headers, HTML escaping/detail rows and conservative outcome classifier in `lib/email.ts`. HTML and text fallback use the five distinct subjects. Atomic single-use claims and Resend key `founder/<deliveryId>` prevent ordinary retry duplicates. At most one provider attempt per event: accepted, failed, skipped or unknown. Missing recipient skips safely with a warning. Timeout/uncertainty or a claim older than ten minutes becomes unknown. Acceptance followed by failed persistence never causes an automatic resend. Investigate failed/unknown/skipped rows server-side; do not reset unknown claims without checking the provider.

Read-only Stripe verification retries four times, fifteen minutes apart. History is paginated with a 1,000-invoice safety bound. Missing collection timestamps, inaccessible/incomplete legacy payment evidence, API failure or history overflow require investigation instead of inventing a first-payment time. Unsupported payment records and manual/out-of-band settlement do not prove actual collection. Correctness assumes the existing one-company/Stripe-customer mapping and accessible Stripe payment history. No data migration or historical scan is run. Once a genuine conversion row exists, renewals skip history reads. Warnings never include provider error bodies, addresses, secrets or assessment answers.

## Deployment-specific configuration

Repository release records identify production **`canny-spider-91`**. The local `.env.local` identifies development **`majestic-turtle-198`**, project **`scrubadub`**, team **`zellsworld11`**. Configure each independently:

- `canny-spider-91`: production founder mailbox and fixed approved launch instant, only after explicit founder authorization.
- `majestic-turtle-198`: controlled test mailbox and a fixed test launch instant if testing outbound founder email is intentionally enabled.
- Any separately selected preview/test deployment: independent mailbox/boundary configuration if enabled; variables are not inherited from production. No other active deployment was confirmed.

Required server-only variables are `SCRUB_FOUNDER_EMAIL` (one bare mailbox) and `SCRUB_FOUNDER_STRIPE_LAUNCH_AT`. Existing `RESEND_API_KEY`, verified `RESEND_FROM_EMAIL`, `STRIPE_SECRET_KEY`, platform webhook secret and `APP_URL` are reused. No new sender, domain or provider integration is required by the code. Existing sender configuration is sufficient **if** that deployment's Resend key can send from its configured verified domain. The live configuration lookup on this correction pass returned `401 MissingAccessToken`, so current mailbox presence and live Resend domain verification could not be confirmed. This is an authentication limitation, not evidence that the variables are absent. No credentials were printed and no configuration was modified.

Dashboard steps (for an authorized operator): open https://dashboard.convex.dev, choose team `zellsworld11`, project `scrubadub`, select the exact deployment above, open **Settings → Environment Variables**, and set the two server-only variables. Review existing Resend configuration in that same deployment; verify the sender domain in Resend's Domains page. Do not add these values to frontend/Vercel `VITE_` configuration. Keep external-side-effect kill switch/local URL protections in place for local tests.

Equivalent PowerShell commands from the repository, **for the authorized operator to run later**, not executed by this PR:

```powershell
$founderMailbox = Read-Host 'Founder mailbox'
$fixedLaunchUtc = Read-Host 'Approved fixed launch UTC (YYYY-MM-DDTHH:mm:ssZ)'
npx convex env set SCRUB_FOUNDER_EMAIL $founderMailbox --deployment-name canny-spider-91
npx convex env set SCRUB_FOUNDER_STRIPE_LAUNCH_AT $fixedLaunchUtc --deployment-name canny-spider-91
```

Authenticate with the normal organization CLI workflow first and ensure no unrelated `CONVEX_DEPLOY_KEY` override redirects the target. For intentional dev testing, substitute `majestic-turtle-198` and use test values. The installed CLI's `env set --help` confirms `--deployment-name` support. Configure before releasing the additive schema/internal functions/cron; no merge/deploy or production environment change is authorized by this draft. Existing sender and domain verification should be checked by an authenticated operator before the approved smoke test.

## Validation and manual smoke checks

Regression tests exercise exact launch boundaries, prelaunch subscribers/renewals, postlaunch initial access, prelaunch trials converting after launch, 100%/partial coupons, credit-only invoices, partial collection before invoice settlement, duplicate/out-of-order events and stale unsent draft rows. Fault injection fails founder fact insert/patch, outbox insertion, payment-check insertion, cron scheduling, provider calls and acknowledgement persistence. Canonical subscription/affiliate/event work still completes. Separate tests retain HTTP 500 for actual sync/attribution failures and HTTP 400 for bad signatures. Existing onboarding, assessment, giveaway and operational email suites remain in the focused regression run.

After an approved test release:

- Set a fixed launch instant and controlled mailbox. Replay an old active subscription, ordinary billing edit, renewal and prelaunch positive payment: no access/historical conversion mail.
- Create a new trial or active promotional subscription at/after launch. Complete setup and reverse/replay its create/access events: one signup and one access email. Test an incomplete subscription that later gains access.
- Convert a prelaunch trial with zero/100%-discounted/credit-only invoices followed by a genuine positive partial-coupon payment after launch: one first-payment email. Replay/reverse invoice events and renew: no duplicates.
- Test partial cash collection before launch with invoice settlement after launch: no first-payment alert.
- Confirm missing boundary disables Stripe notifications without blocking subscription sync/affiliate attribution; missing mailbox skips delivery safely.
- Inject founder storage/scheduler/provider/acknowledgement failures: canonical billing continues. Inject an actual billing failure: webhook fails and remains retryable.
- Complete an assessment twice: one assessment mail, protected admin link, no giveaway mail unless an actual valid entry is recorded. During an open campaign submit both entry methods for one email: one entry mail.

Full frontend/Convex typechecks, focused tests, frontend-only build and diff checks are recorded in PR #296. No live provider email, production write, merge or deployment is performed for validation.
