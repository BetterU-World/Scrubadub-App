# Giveaway #2 — proposed final rules and remaining release actions

November 11, 2026 follow-up to PR #291. Supersedes the generic legal-review blockers in the original preparation runbook. Proposed public rules are in `convex/lib/giveawayCampaignTwo.ts`, version `scrub-giveaway-2026-002-rules-v1`. Both approval gates remain false; opening remains unset. No publication or activation occurred.

## Resolved in engineering

The public rules now state the sponsor/email, equal entry methods, eligible states, age/business/account/insider exclusions, one-person limit, drawing/response/alternate procedure, gift-card independence, offer terms, advertised ARV, privacy and ordinary administrative limitations without internal legal or engineering placeholders. Prior participants remain eligible subject to #2's own rules. Existing #1 configuration and historical records remain untouched.

Use $949.94 as the maximum combined advertised ARV: $50 + six times $149.99. The optional offer is valued, not ignored. The ordinary 14-day trial is already offered free to ordinary subscribers and has no separately charged incremental price in this offer. This is the stated valuation methodology, not a promise about tax treatment; report the value of benefits actually awarded under applicable reporting rules. A higher separately charged trial benefit would require revisiting the figure.

## Sponsor address: exact scope found

Sources checked November 11, 2026:

- [39 USC 3001(k)(3)(A)(ii)(IV)](https://www.govinfo.gov/content/pkg/USCODE-2024-title39/html/USCODE-2024-title39-partIV.htm) requires sponsor/mailer contact address disclosures for covered **postal sweepstakes matter**. This campaign uses web entry and digital fulfillment, not postal solicitation. Do not apply this mail-specific rule as proof that a public web page must publish a residential address.
- [Washington RCW 19.170.030(1)](https://app.leg.wa.gov/RCW/default.aspx?cite=19.170&full=true) requires promoter/sponsor addresses for covered offers. Its definitions limit an offer to a hand/mail/print notice representing a person has been or will be awarded a prize, and exclude qualifying promotional contests of chance. The general web invitation does not represent that every reader has already won. Do not introduce print winner solicitations without checking this scope.
- [Minnesota 325F.755 subd. 2(a)–(b)](https://www.revisor.mn.gov/statutes/cite/325F.755) requires an actual principal-business address in specified written prize notices before payment-conditioned awards/solicitations. The guaranteed gift card has no payment condition. Keep the subscription invitation separate and never imply it is needed to receive the gift card.
- [Florida 849.094(3), 2026](https://www.flsenate.gov/Laws/Statutes/2026/849.094) permits full rules access via a website, toll-free number **or** mailing address in advertising and has filing/security rules above $5,000 total announced prizes. The proposed single-winner maximum is $949.94. No physical-address requirement for this website was established from that provision.
- [15 USC 7704(a)(5)(A)(iii)](https://www.govinfo.gov/content/pkg/USCODE-2024-title15/html/USCODE-2024-title15-chap103-sec7704.htm) requires a valid physical postal address in covered commercial email. **Before sending promotional emails**, founder must supply an approved business address or permitted registered PO box/private mailbox and configure compliant email content. No address is invented; no residential address is retrieved or published. Pure winner/prize-administration email must not be turned into promotional email to evade this distinction.

These are scoped findings, not a completed 50-state legal opinion. No concrete web-page address requirement was established in these sources. A nonresidential address remains necessary before covered commercial email/postal promotion, rather than a generic unexplained blocker on preparing web rules. Independent legal review remains a recommendation for unresolved jurisdictional interpretations, not an instruction to stop engineering.

## Only remaining launch actions

1. Founder approves the proposed final rules/ARV and an actual **future** opening timestamp (ISO 8601 with offset or UTC). November 11 is not auto-filled. Keep the December 15 11:59 PM Eastern close. Preserve the approved rules snapshot/version before accepting entries.
2. Complete test-mode proof of the optional subscription's full 14 days + six calendar months, cancellation and first paid billing, and the required subscription notices in PR #290. This is a concrete technical prerequisite to advertising an offer SCRUB can fulfill.
3. After explicit activation/deployment authorization: set `startsAt` to the approved future instant, set `rulesApproved` and `enabled` true, set `currentGiveawayId = giveawayTwoId` as the default registry campaign (#1 is independently keyed by `firstGiveawayId`), rebuild static metadata, deploy the approved backend/frontend, and smoke-test before opening. **None of these activation/deployment actions are performed by this PR.**
4. Before separately authorized promotional email: supply the nonresidential postal address noted above. This PR sends none. Preserve the existing private drawing ledger and designate the fulfillment operator; no new winner platform is required.
