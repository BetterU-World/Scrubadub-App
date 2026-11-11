# Giveaway #2 — November 12 release preparation

This is the current release record for PR #291. It supersedes earlier generic launch blockers in the preparation documents. The founder approved the rules/valuation and **November 12, 2026, 9:00 AM Eastern** opening, and committed to honoring the entire optional award. No production deployment or activation is authorized by this document.

## Approved configuration

Campaign `scrub-giveaway-2026-002`; rules `scrub-giveaway-2026-002-rules-v1`; opening `2026-11-12T09:00:00-05:00` (`2026-11-12T14:00:00Z`). Exclusive close `2026-12-16T00:00:00-05:00` (`2026-12-16T05:00:00Z`), including the entire December 15 11:59 PM Eastern minute. Drawing December 17; response within 72 elapsed hours; gift-card delivery target December 25; optional offer redemption deadline January 5, 2027.

One guaranteed $50 Visa gift card. Optional winner-only six full months of the chosen SCRUB plan plus the ordinary fourteen-day trial. Maximum advertised ARV $949.94. Gift-card eligibility and delivery do not depend on subscription enrollment, payment-card details, marketing consent or accepting the offer. Entry is free through the existing assessment or equal-odds alternate form. U.S./DC residents, 18+, qualifying cleaning-business owners/operators, excluding Rhode Island, existing SCRUB account holders and designated insiders. One entry per eligible person/email; email deduplication is transactional and person-level review remains part of verification.

Sponsor/contact remain Scrubadub Solutions LLC / scrubadubsolutionsllc@gmail.com. No residential address is published. Existing scoped address findings remain in `giveaway-two-release-decisions.md`; covered promotional email still needs compliant sender information and separate consent/authorization. No marketing email is sent by campaign entry code.

## Entry launch versus fulfillment

**No Stripe code or subscription PR is needed to accept free entries.** PR #290 stays separate and is not merged/deployed to launch #2. The founder explicitly deferred actual Stripe Test Clock proof and creation of the winner's single-use code until before winner fulfillment/redemption. These are fulfillment tasks, not automatic entry-launch blockers. Entry code neither enrolls a subscription nor collects payment information.

The founder's full award obligation remains outstanding despite unresolved Stripe configuration. Do not prematurely charge the winner, describe unverified billing dates as verified, shorten awarded access, or mark the offer delivered merely because a code was issued. Before redemption, test/adjust the actual billing path and preserve the entire fourteen-day-plus-six-month entitlement, including after renewal cancellation. Gift-card fulfillment proceeds independently even if subscription work is pending.

## Restricted manual obligation ledger

Use the existing restricted drawing/fulfillment ledger from `giveaway-v1.md`; no new platform/table is introduced. Copy the template below into the designated private ledger, not public PR comments. It establishes a campaign obligation now, before a winner is selected. Record actor/time/evidence on each transition and retain prior records.

| Obligation | Initial status | Required completion evidence |
| --- | --- | --- |
| Guaranteed $50 Visa gift card | Outstanding; recipient pending drawing | Verified winner, independent notification/response, digital fulfillment reference and date |
| Optional full SCRUB award | Outstanding, subject to winner's voluntary choice; recipient pending drawing | Chosen plan; actual trial start, complete free-end date and regular billing terms; tested cancellation protection; winner access confirmation |

After drawing, record the selected Entry ID privately, notification time, exact +72-hour response deadline and eligibility outcome. If an alternate is necessary, retain the original event and reason and link a new equally weighted drawing. Assessments, entry methods, marketing choices and optional-offer choices never add weight.

For the offer record `pending_choice → accepted_pending_billing_verification → ready_for_redemption → delivered` only with supporting evidence. Code issuance alone stays pending. A voluntary decline is recorded separately as `declined_by_winner`, never as gift-card disqualification. If SCRUB's configuration prevents timely redemption, retain the obligation as `outstanding_issue` and obtain a founder-approved remedy before the deadline; do not silently expire an accepted award because SCRUB was not ready. Owner: Sponsor, via the contact above; designate the operating founder/admin before drawing.

## Prepared activation change — source only

A separate small commit on PR #291 sets `startsAt` to the approved instant, `rulesApproved: true`, `enabled: true`, and the default to `giveawayTwoId`. Giveaway #1 remains independently keyed by `firstGiveawayId`; its complete configuration/rules hash and entries remain unchanged. The shared server state gate rejects both entry methods before opening and at/after exclusive close. The approved rules version is captured on entry; stale acknowledgments fail closed. Static social title/description follow the selected default through the existing build hook; the generic SCRUB social image does not advertise the old prize.

**Armed source is not production activation.** No merge/deploy/production entry/email occurs in this preparation. If release cannot complete before the target, stop and obtain an approved future opening rather than silently backdating publication.

## Exact authorization and production checklist

Required founder authorization: **“I authorize merging PR #291 at the reviewed activation commit, deploying its Convex backend and frontend, and activating Giveaway #2 for November 12, 2026 at 9:00 AM Eastern. PR #290 remains separate; no live emails or Stripe promotions are authorized.”** Pin the actual reviewed SHA in the release record when giving authorization.

After that authorization only:

1. Verify the pinned #291 commit and current gates/date/version; confirm #290 is excluded. Finish release before 09:00 Eastern. Use the established production release pipeline; do not use root deployment scripts as a validation command.
2. Build the frontend with the actual production `VITE_CONVEX_URL` and **`VITE_ENABLE_OPERATIONS_ASSESSMENT=true`**. A synthetic QA URL/build is not a deployable artifact. Deploy the #291 Convex functions/registry/validators and frontend/static giveaway metadata from the same approved commit. No schema migration or subscription email flags are required for #291.
3. Before opening, read `/giveaway` and `?campaign=scrub-giveaway-2026-001`: #2 is default/upcoming with both entry methods closed, #1 remains historical. Verify mobile and language controls, final rule dates and rules version, public auth bypass, social metadata and both entry paths. Do not create production test entries without separate authorization.
4. At 09:00 Eastern, verify the public state changes to open and the attributed assessment/alternate form are available; read server logs/entry counts without manufacturing live entries. The server clock remains authoritative. Keep the existing manual drawing/export process.
5. If a release defect requires closure, disable the campaign and redeploy through the approved process; preserve all received entries, rules acknowledgments and audit history. Reopening or changing the schedule requires an explicit decision. Do not reset/delete entries or activate #290 as a workaround.

## Validation boundaries

Backend/data regressions use `convex-test` and synthetic entries only. Browser layout/interaction QA uses a localhost-only harness, actual page components and a captured mutation transport; external HTTP requests are blocked. It proves presentation/payload/receipt behavior, not a production Convex round trip. The actual mutations and stored rows are exercised separately in isolated backend tests. English official rules are retained as approved; a Spanish material-terms summary, alternate form and assessment presentation identify the official rules as English. No automated drawing, winner email, card issuance or subscription activation is added.
