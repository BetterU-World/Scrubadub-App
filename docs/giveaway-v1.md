# SCRUB Giveaway V1 — Assessment + free alternate entry runbook

## Architecture audit: PR #199 reused

PR #199 is merged in `main` (merge commit `48f1f7e`). The AMOE follow-up uses a new branch and does not change PR #199's branch.

- The frontend is a Vite/React SPA with Wouter. `/giveaway` is a permanent public route before authentication/subscription guards and is reserved from customer mini-site slug routing. Its existing logo, green/gray styling, cards, buttons, header, rules, and footer are retained.
- `convex/lib/giveawayCampaigns.ts` is the single shared public/server campaign registry. It controls copy, prize/ARV, dates, eligibility, entry methods, sponsor, rules/version, state gates, and post-close messages. Keep historical campaigns in the registry; `/giveaway?campaign=...#official-rules` preserves their details.
- The original Assessment is capability-protected and anonymous: intro → sections/questions → canonical server completion → report/roadmap. It validates applicable required answers and freezes a completion snapshot. `sourceSnapshot` stores `utmSource=giveaway` and `utmCampaign`. Local progress/recovery preserves this; unfinished attempts may be attributed with their capability. Completed attempts cannot be retroactively entered.
- Normal Assessment email remains optional, collected after the report by `AssessmentContinuity` for report delivery. Its `assessmentProspects` consent/delivery conventions are separate. Giveaway contact is collected before completion. Neither entry method creates a prospect, sends an email, or automatically enrolls someone in marketing.
- The original `giveawayEntries` campaign/normalized-email index and Convex transaction protect idempotent qualification. Repeated Assessment submissions remain valid Assessments but do not add entries. The follow-up routes AMOE through the same index and transactional helper, not a new table or pool.
- `giveaways.entrants` retains verified superadmin-session authorization and pagination. Existing cleanup protects completed Assessment records. There is no automated winner-management surface.
- Vercel Analytics and Convex `assessmentEvents` are reused. The latter already permitted events without an Assessment reference. No new analytics vendor or authorization framework is introduced.
- Existing Assessment entry/disclosure copy is bilingual (English/Spanish); Giveaway page, rules, and AMOE remain English, consistent with the original public/legal page architecture. Spanish Assessment links explicitly identify the English alternate form/rules.
- Static social metadata from the existing Vite helper/Vercel rewrite and the reusable public page remain intact. Existing public/Showcase tests use Vitest rendering/source assertions rather than a shared live viewport harness.
- Original Terms/Privacy referenced Scrubadub Solutions and Florida law. The owner has now confirmed **Scrubadub Solutions LLC, operator of SCRUB** as this promotion's Sponsor. Sponsor-address disclosure remains a legal-review item. No separate SCRUB entity, d/b/a, or residential address is invented.

## Confirmed campaign decisions and state

Campaign ID: `scrub-giveaway-2026-001`.

- Opening: **September 21, 2026 at 12:00 AM ET**, stored as `2026-09-21T04:00:00.000Z`.
- Closing displayed: **October 30, 2026 at 11:59 PM ET**. The entire 11:59 PM minute is included; exclusive close remains `2026-10-31T04:00:00.000Z` (midnight EDT).
- Drawing: **on or about November 2, 2026**.
- Prize: **one $100 Digital Visa Gift Card**, ARV **$100 USD**. Sponsor intends to purchase and fulfill that prize. Visa is the advertised prize brand, not the Sponsor, endorser, administrator, or affiliate of this Giveaway. Issuer-specific terms have not been invented.
- Sponsor: **Scrubadub Solutions LLC, operator of SCRUB**.

**`enabled` and `rulesApproved` both remain false.** Knowing the opening time, merging the follow-up, or reaching September 21 does not activate entries. The shared state function returns upcoming while either gate is false or before opening; active at/after opening and before exclusive close; ended thereafter; optional winner messaging appears only after close with explicit publicity approval. Frontend state refreshes each second, but server time determines qualification for both methods.

## Eligibility: consistent across methods

Entrants must be legal residents of the 50 United States or District of Columbia, age 18+ at entry, and currently own or operate a qualifying professional cleaning-services business. Sole proprietors may qualify. A formal LLC/corporation, EIN, website, employees, or business license is not inherently required by this campaign definition.

Qualifying services include residential, commercial, janitorial, housekeeping, vacation-rental/short-term-rental, move-in/out, post-construction, carpet, upholstery, window cleaning, pressure washing, and other substantially similar professional cleaning services. Automotive-detailing-only and car-wash-only businesses are outside this campaign's eligibility.

The narrow insider exclusion covers Sponsor personnel directly administering the Giveaway or selecting/validating the winner, their immediate family, and household members. Other workers, cleaners, or contractors are not excluded merely because they worked with Sponsor. Exact family/household definitions and final wording remain for owner/legal review.

Entrants attest to eligibility. The selected entrant may be verified before fulfillment, without consulting Assessment answers or score. V1 does not automatically prove age, residence, inbox ownership, or that one person is not using multiple emails. Apply any verification and one-person exclusion consistently across both methods and record reasons privately.

## AMOE UX and backend

The Assessment remains the primary hero CTA. A readable disclosure/link beside it, the Method B explanation under How to enter, and the bilingual Assessment entry links lead to `/giveaway#alternate-entry` (with campaign query parameter when needed). AMOE does not visually replace the primary Assessment acquisition experience.

`GiveawayAlternateEntry.tsx` adds a small inline form, enabled only during active campaign state. It collects first name, last name, email, required eligibility attestation, separate required Official Rules acknowledgment, and optional unchecked marketing consent. Names assist winner contact/verification. It does not collect phone, address, business records, Assessment answers, essays, or uploads. No Assessment, account, trial, subscription, payment information, purchase, follow, share, or marketing consent is required.

`giveaways.enterAlternate` is an anonymous write-only mutation. It validates campaign/time/gates, bounded nonblank names, email using the existing trim/lowercase convention, and both confirmations. It passes entry creation to the same `recordGiveawayEntry` helper used by `qualifyGiveaway` during canonical Assessment completion.

The helper reads and inserts against `by_campaign_email` in the caller's Convex mutation transaction. That index deliberately does not contain entry method. Concurrent mutations use Convex's transaction retries. The first qualifying entry is retained across Assessment→AMOE, AMOE→Assessment, repeated AMOE, repeated Assessment, and mixed concurrent submissions. A later Assessment still completes normally and receives its duplicate outcome. Duplicates do not modify the original entry's identity, method, timestamp, or consent.

AMOE returns the same `{status: "received"}` receipt for a new or duplicate submission. It does not expose whether an email is already entered, nor return names, email, entry IDs, Assessment IDs, or entrant counts. The UI explains that prior entries through either method do not gain another entry. No public list/query was added.

The existing rate-limit helper caps AMOE at 10 submissions/hour per hashed browser key and per hashed normalized email/campaign. Hashes use the existing token-pepper convention; raw emails are not rate-limit keys. This is modest abuse control, not identity verification or protection against all rotating-browser abuse. Rejection of a repeat does not remove an existing entry. Only the existing random browser key is stored locally, with an in-memory fallback if storage is unavailable; contact fields are not persisted in browser storage.

## Minimal model extension / compatibility

The one `giveawayEntries` table now supports:

- `entryMethod`: `assessment` / `alternate`, optional only for legacy schema compatibility. Every new entry explicitly writes its method.
- `attemptId`: optional because alternate entries do not create Assessments.
- `firstName`, `lastName`: present on alternate entries; not retroactively required on Assessment entries.
- `rulesAcknowledgedAt`: written for new entries, optional for legacy rows. The existing Assessment checkbox explicitly combines eligibility and rules confirmation; AMOE has separate required checkboxes.
- Existing normalized/original email, campaign, qualified status/time, rules version, eligibility timestamp, and marketing consent/time/version remain unchanged.

The private export normalizes legacy rows without `entryMethod` to `assessment`. No migration rewrites historical consent or entries. No second entrant database, winner table, sponsor portal, campaign CMS, account flow, or new dependency is introduced.

## Consent, privacy, and analytics

Entry information may be used to administer the promotion, verify eligibility, contact the selected winner, and fulfill the prize. Marketing requires separate optional consent where applicable. Consent remains unchecked by default, is not required by the backend, and never affects odds. The existing `giveaway_followup_v1` audit convention is reused; repeat submissions do not overwrite the first entry's consent. Optional report-delivery consent remains independent.

Privacy copy now distinguishes alternate-entry names and Assessment references, and explains both entry methods and their administrative uses. No entrant name/email is displayed publicly or sent to analytics. Winner publicity requires appropriate explicit permission.

Existing Vercel `giveaway_page_viewed` and `giveaway_assessment_cta_clicked` remain. `giveaway_alternate_entry_started` fires once on first interaction with the form per mount. Existing Convex Assessment milestones remain; AMOE adds `giveaway_alternate_entry_qualified` and reuses `giveaway_duplicate_entry_detected`. Server AMOE events are deduplicated per entry/event/browser and their metadata contains campaign ID only. Client analytics remain best effort under the existing setup/CSP; no new vendor is introduced.

## Private unified export and manual drawing

Use the existing authenticated internal client/session convention to call `giveaways.entrants`:

```ts
{
  userId, sessionToken,
  campaignId: "scrub-giveaway-2026-001",
  paginationOpts: { cursor: null, numItems: 250 }
}
```

Append each `page` to a private JSON export; use `continueCursor` until `isDone`, including a possible empty final page. Maximum page size is 250. The combined row count is the qualifying total without a scan cap. Export **both methods together** and retain method for audit. Do not require an Assessment reference for alternate entries. Legacy method-less rows are classified as Assessment. Never expose exports/session tokens in public issues, PRs, or logs. A deployment operator may also use the restricted Convex dashboard table export, interpreting legacy rows the same way.

Winner management remains manual. On or about November 2, 2026, after close:

1. Freeze the full combined export in restricted storage. Record campaign/rules version, export time, row count, file SHA-256, and operator. Check normalized-email uniqueness and server qualification timestamps for both methods. Verify eligibility/one-person limits consistently; record exclusions/reasons privately without deleting Assessments or entry records. Absence of an Assessment is not a reason to exclude an alternate entry.
2. Freeze/hash an ordered list of eligible unique entry IDs. Each has exactly one position. Select a uniform random index, e.g. Node `crypto.randomInt(eligibleEntries.length)`. Record list hash, time, operator, random index, and selected ID in a restricted append-only/private ledger before notification. Do not rerun to replace the canonical drawing silently.
3. Neither Assessment completion, answers/score, entry method, marketing consent, nor account/subscription status is a drawing input or priority. Do not create separate pools or weights. Method counts may be reported for audit only.
4. Contact the selected entrant by email; record notification time and the response deadline 72 hours later. Verify eligibility before fulfillment as appropriate, independently of Assessment responses.
5. If unreachable, nonresponsive after 72 hours, or ineligible, record the reason/time. Exclude that entry, freeze/hash the remaining eligible list, and record a new uniform alternate drawing linked to the original. Never overwrite the original event.
6. Record delivery/fulfillment and retain correspondence privately. Publish identifying winner information only after appropriate explicit permission; only then configure approved public announcement text.

The retained private drawing ledger is authoritative for selection, disqualification, alternates, and fulfillment. Database entry status records qualification at submission/completion; no automated winner state is claimed.

## Advertising / promotional disclosure

Assessment-first messaging is permitted, but it must not imply that Assessment completion is the exclusive method or improves odds. Recommended compact disclosure:

> No purchase necessary. Alternate free entry available. Limit one entry per person/email. See Official Rules.

Link to `/giveaway` for the full explanation, both methods, and rules. Never advertise bonus entries or priority for completing an Assessment, purchasing, consenting to marketing, or having an account/subscription. This is copy guidance only; no advertising-management system is added.

## Exact remaining activation steps and legal questions

1. Obtain final owner/professional review of draft rules and Privacy copy. Determine whether sponsor-address disclosure is required and a lawful non-residential publication/contact arrangement if necessary. No residential address is invented or exposed. Review applicable state requirements, narrow insider/family/household definitions, actual gift-card product terms, delivery/tax language, retention/deletion, supportable release/limitations/dispute provisions, and relevant platform/channel disclaimers. Existing Florida-law language alone does not establish promotion-specific legal approval.
2. Replace draft-review placeholders, version/freeze the approved rules, and retain the approval record. Sponsor is confirmed as **Scrubadub Solutions LLC, operator of SCRUB**; no d/b/a or separate SCRUB entity should be asserted without verified support. Opening, closing, drawing, and prize are confirmed as above.
3. Designate the restricted export/drawing ledger location and responsible operator. Confirm the uniform verification/one-person procedure and notification/72-hour response/alternate/fulfillment process. Do not collect extra documentation from every entrant by default.
4. Validate an approved non-production preview at 320/375/390, 768, and 1280/1440px: no horizontal overflow, readable disclosures/rules, primary Assessment CTA, discoverable alternate form, visible keyboard focus and usable mobile controls. Exercise both methods, mixed duplicates, and closing boundaries against a non-production backend.
5. **Only after deliberate final approval**, separately change `rulesApproved: true` and `enabled: true` in `convex/lib/giveawayCampaigns.ts`. Keep the confirmed timestamps. Verify `VITE_ENABLE_OPERATIONS_ASSESSMENT=true` for the primary Assessment route and deploy matching backend/frontend configuration through the approved release process. AMOE depends on campaign gates, not the Assessment feature flag. This follow-up changes neither activation gate.
6. Review advertising disclosure before publication and retain frozen rules/configuration for the drawing. Winner identity stays private until explicit publicity permission is recorded.

These rules are draft, subject to final owner/legal review, and not represented as attorney-approved or independently verified legal advice. This follow-up does not deploy production, activate the giveaway, perform a drawing, or send email.

## Validation

PR #199 history: full suite 115 files / 606 tests passed, then 4 files / 50 focused tests passed; frontend/Convex typechecks, production build, literal $100 social metadata check, and diff check passed. Its browser viewport testing was blocked by `ERR_BLOCKED_BY_CLIENT`.

The follow-up adds regression coverage for valid anonymous AMOE, invalid/missing email/name/eligibility/rules, optional consent, repeated/mixed/concurrent duplicates, method persistence, legacy export normalization, combined superadmin-only export, no PII in receipts/events, exact date/gate behavior, equal-method rules/public copy, and unchanged normal Assessment behavior.

Follow-up results:

- Focused giveaway/AMOE/Assessment regressions: **3 files / 64 tests passed**.
- Full suite: **634 passed, 1 timed out** out of 635 tests in 115 files. The unrelated `managerV2OperationalAdministration.test.ts` hit its existing 5-second timeout while other validation was running. An isolated rerun passed both tests in that file without code or timeout changes. No unrelated failure was modified, and the full invocation is not represented as entirely green.
- Frontend and Convex typechecks passed. Production frontend build passed; existing Browserslist and large-bundle warnings remain. `git diff --check` passed.
- Browser retry succeeded at `http://127.0.0.1:5173/giveaway`. The disabled public Giveaway and an isolated static rendering of the real AMOE form had no horizontal overflow at **320, 375, 390, 768, 1280, and 1440px**. Alternate-entry navigation, readable mobile disclosure/rules, labeled controls, visible keyboard focus, native required-field validation, and unchecked optional marketing consent were checked.
- The form fixture used the existing component/styles with network connections and submissions blocked by CSP; it did not alter campaign flags or contact a backend. Temporary fixture files were removed. This is responsive/native-control validation, not a live browser-to-Convex submission test; qualification/deduplication are covered by Convex tests. A final non-production end-to-end release check remains before activation.
- `enabled: false` and `rulesApproved: false` were reconfirmed. No Convex deployment, manual production deployment, campaign activation, winner drawing, or email sending occurred.
