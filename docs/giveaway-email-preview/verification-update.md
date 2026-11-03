# FREESCRUB requirements and optional test-mode follow-up

Founder confirmation is accepted as evidence of successful actual checkout redemption and as the product requirement for this implementation:

1. Standard 14-day free trial begins at signup.
2. First subscription invoice after the trial is $0 with FREESCRUB.
3. Following monthly invoice charges the selected plan's regular price.
4. Solo, Team and Pro are eligible; payment method required; automatic renewal unless canceled.

This is **founder-confirmed**, not an independently inspected invoice sequence. There is no Stripe connector dependency and no request for repeated confirmation. No Stripe setting, Checkout Session, subscription, coupon, Test Clock, or invoice has been created or changed by this PR.

Both `convex/actions/publicBilling.ts` and `convex/actions/billing.ts` set `trial_period_days: 14`, permit promotion codes and select Solo/Team/Pro price variables. The existing owner Manage Billing path creates a Stripe portal session. Existing lifecycle webhooks sync subscription state and period-end cancellation. Source inspection establishes those integration choices, not the deployed coupon's detailed restrictions or invoice timeline.

A separately authorized test-mode check is possible if the chosen sandbox already has equivalent monthly Prices and FREESCRUB coupon/promotion configuration. Inspect that configuration first; do not edit it. After explicit Stripe test-only authorization, test Checkout plus a Test Clock or approved invoice simulation can establish the trial-end $0 invoice and following regular monthly invoice for each plan, payment collection and cancellation behavior. Record test account/mode, subscription billing boundaries and sanitized invoice amounts/discounts. A test result establishes sandbox behavior, not production equivalence.

If no equivalent sandbox configuration exists and Stripe changes remain prohibited, request only sanitized evidence showing the coupon's percentage/duration and eligible products, the matching monthly price references, and an existing subscription's trial end, discounted first post-trial invoice and next regular monthly invoice/billing date. No customer name, email, address, payment details or full export is needed. This optional follow-up does not block implementing the campaign or require another connector attempt.

The separate three-month winner offer is not FREESCRUB. The founder has approved all-plan eligibility and automatic regular-price renewal. Before activation, choose/confirm an existing customer-bound bonus mechanism, payment-method requirement, whether the 14-day trial stacks or is replaced, three monthly periods versus a fixed-day period, first regular charge date and cancellation deadline/path. The winner email offers the bonus separately and promises these details before activation; it creates no billing configuration.
