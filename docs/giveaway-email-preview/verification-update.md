# Copy and campaign scope update — November 2, 2026

This supersedes the original three-template campaign scope. Only the official winner (A) and explicitly marketing-consented nonwinners (C) are authorized for future consideration. B is archived, not a fallback for nonconsenting entrants. No sender or production recipient-selection operation is implemented.

## Founder confirmation versus verified behavior

The founder confirms the intended combination: a 14-day free trial followed by a first subscription billing month discounted 100% by FIRST50, for Solo, Team, and Pro. Payment method required; no subscription charge during that period; then regular-price billing unless canceled. Approximately six weeks is an estimate, not an exact 42-day guarantee. A calendar billing month and actual invoice/payment dates must be checked.

The HTML and text include this intended offer as **draft copy pending live verification**. They do not promise a particular charge date or an exact six-week period. The cancellation sentence states the intended deadline (before the promotional period ends); no unverified immediate/period-end cancellation outcome or working cancellation mechanism is asserted. Final copy cannot be approved until the actual cancellation path and cutoff are verified; add those confirmed instructions before delivery.

Further read-only source review:

| Evidence | Finding | Limit |
| --- | --- | --- |
| `convex/actions/publicBilling.ts:createPublicCheckoutSession` | Public acquisition path creates a subscription with `trial_period_days: 14`, permits promotion codes, selects Solo/Team/Pro price environment variables, and blocks an email that already has a SCRUB account. | Does not define FIRST50 or show actual hosted Checkout behavior. Existing customers may need a different path; promotion eligibility remains unknown. The action was not invoked. |
| `convex/actions/billing.ts:createCheckoutSession` | Authenticated owner path also sets 14 trial days and permits codes for the same three plan choices. | No code-specific coupon logic or explicit `payment_method_collection` setting; the trial flag alone does not prove card collection or combined invoice timing. |
| `convex/lib/plans.ts` | App advertises monthly Solo, Team, Pro prices and maps each to a Stripe price variable. | Display strings are not evidence of the deployed Stripe Price interval, currency, or amount. |
| `BillingSection.tsx` and `SubscribePage.tsx` | Owner UI provides Manage Billing, which calls the existing authenticated portal-session action. | No portal session created. Live portal cancellation settings and accessibility remain unverified. |
| `convex/http.ts` subscription lifecycle handlers | Sync subscription status, period end, and `cancel_at_period_end` from Stripe events. | Event handling does not prove cancellation is enabled or what the next invoice will charge. |

Stripe's [free trial period documentation](https://docs.stripe.com/billing/subscriptions/trials/free-trials) explains that trials create an immediate zero-amount invoice and a new billing period/invoice when the trial ends. Its [coupon documentation](https://docs.stripe.com/billing/subscriptions/coupons) defines discount duration and promotion restrictions. These explain why live invoice evidence is necessary; neither page verifies SCRUB's configuration. **Do not infer that a once-only discount necessarily survives the initial trial invoice or covers the intended post-trial month without inspecting the actual discount/invoice sequence.**

## Required private evidence before final promotional approval

No Stripe connector or local Stripe credential is available. No secrets were exported, Stripe writes performed, existing customer invoices retrieved, or test/live sessions created. The existing settings must remain unchanged.

Obtain a read-only, sanitized evidence set from the actual account:

1. FIRST50's active/livemode state, expanded coupon percent/duration, all restrictions, expiration/redemption limits, and product eligibility matching deployed Solo/Team/Pro monthly prices.
2. Existing applicable Checkout/subscription records for each plan showing trial start/end, payment method collection, applied promotion/discount, billing anchor and interval. Keep customer identities and raw records private.
3. Invoice timeline: signup trial invoice; first subscription-month invoice at trial end with 100% discount and zero subscription amount; next invoice at the end of that billing month at the regular selected plan price. Record invoice period boundaries, discount application, amount due, and expected regular-charge date. Distinguish invoice creation from payment collection timing and disclose any taxes or extra charges. If existing evidence cannot establish this, any new test Checkout/invoice simulation requires separately approved test-mode work; do not use live customers.
4. Portal cancellation enabled, tested customer path, effective cancellation time, and confirmation that canceling before the first regular billing deadline avoids that charge. Do not confuse leaving Checkout with canceling a subscription. Revise disclosures if the actual behavior differs.

The published giveaway URL was retried with the web reader and remained inaccessible. Published/frozen rule parity, private winner match/claim status, bonus activation terms, current consent/suppressions, real unsubscribe destination, and sponsor postal address remain unresolved. No production recipient count is claimed.

## Campaign safety and appearance

- C requires explicit Yes (strict boolean `true` in the schema), valid consent audit evidence, and a current suppression/unsubscribe check. Winner, No, missing/invalid consent, unsubscribed/suppressed addresses, and duplicate email records are excluded. Ambiguous normalized-email duplicate groups stay held for review. No B recipient list is authorized.
- Next-giveaway invitation promises no date and explicitly requires the future giveaway's own entry instructions and Official Rules. The current assessment does not automatically enter anyone.
- Existing email HTML layout, styles, branding, header/footer, green palette, gold winner accent, and responsive breakpoints are preserved. Only content and review-gallery campaign/archive categorization change.
- Regenerate HTML/text and browser screenshots; check all three stored templates at six widths, including the preserved archive. Browser rendering is not email-client verification. No test email may be sent without explicit approval.

No merge, deployment, test/production email, schedule, drawing, Stripe mutation, or production delivery workflow is authorized by this copy update.
