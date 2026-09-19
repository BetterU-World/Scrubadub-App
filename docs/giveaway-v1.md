# SCRUB Giveaway V1 — implementation and launch runbook

## Repository audit (before implementation)

- Frontend: Vite/React SPA, Wouter routes in `packages/frontend/src/App.tsx`. Public routes bypass authentication/subscription guards; reserved paths avoid customer mini-site slug routing. Vercel rewrites normally serve the common index.
- Public styling: existing SCRUB logo, gray/white backgrounds, primary green, rounded cards, `btn-primary`, `btn-secondary`, `input-field`, responsive utility classes. The Assessment has its own compact public header; Terms/Privacy are standalone English pages. Giveaway follows those patterns without redesigning the landing page.
- Assessment: `OperationsAssessmentPage.tsx` uses one frozen definition, intro → section introductions → applicable questions → server completion → report → roadmap. Definition includes 30 required and two optional reflection questions; solo branching reduces applicable required answers.
- Persistence: local progress stores answers, capability, attempt ID, current question and language. `assessments.start` creates an attempt only after a substantive answer. `recover`, `saveResponse`, `complete`, `generateReport`, and `generateRoadmap` verify the hashed capability. Attempt IDs uniquely identify submissions.
- Canonical completion: `assessments.complete` verifies applicable required answers, computes the score, freezes `completionSnapshot`, and sets server `completedAt` and `status: completed` in one Convex mutation. Retries return the original snapshot.
- Contact collection: the normal assessment is anonymous. After report/roadmap generation, optional `AssessmentContinuity` captures email, optional first/business names, and separate unchecked marketing consent for report delivery. `assessmentProspects` stores contact and consent audit data. Email is not required to complete the normal assessment. Giveaway contact must therefore be collected earlier; it does not create a delivery prospect or trigger a report email.
- Attribution: `assessmentAttempts.sourceSnapshot` already supports `utmSource`, `utmMedium`, `utmCampaign`, and referrer, but the Assessment did not populate it. This is reused rather than adding a second campaign attribution system.
- Idempotency: attempt creation uses a capability hash; responses use attempt/question indexes; milestone events use deduplication keys; completion snapshots are immutable. Existing email normalization trims and lowercases, with a 254-character cap and basic email syntax check.
- Analytics: Vercel Analytics already supplies page analytics; Convex `assessmentEvents` stores idempotent milestones and metadata. No new vendor is needed.
- Internal access: existing Assessment results/cleanup pages use `requireSuperadminSession`, which verifies an active session and founder allowlist. A small paginated query provides entrant access; no giveaway admin application is added. Existing duplicate cleanup absolutely protects completed attempts, completion snapshots and timestamps.
- Legal: Terms and Privacy say “SCRUB (powered by Scrubadub Solutions).” Terms reference Florida law. Neither establishes a confirmed full sponsor legal identity and mailing address for this promotion. Do not infer an LLC identity from a support email address.
- SEO: common index has canonical, Open Graph, Twitter metadata and `scrub-social-preview.png`; public mini-sites update head tags in React. Giveaway updates/restores its own metadata and emits a route-specific HTML head so social crawlers also receive it.
- Language/accessibility: Assessment uses matched English/Spanish i18next catalogs; existing legal pages are English. Giveaway and draft rules are explicitly English, and the Assessment entry/consent/outcome step is bilingual. No shared browser viewport test harness was found in the public/Showcase tests; those tests use Vitest rendering and source assertions.

## Architecture and files

`convex/lib/giveawayCampaigns.ts` is the single campaign registry used by both the server and frontend. It contains copy, prize/ARV, eligibility, entry method, dates/timezone, enabled and rules-review gates, CTA, rules/version, ended and optional winner messaging, and optional sponsor name/logo/URL/disclosure. For Giveaway #002, add a new registry entry and change `currentGiveawayId`; retain #001 unchanged. Prior details/rules remain accessible at `/giveaway?campaign=scrub-giveaway-2026-001#official-rules`.

`GiveawayPage.tsx` renders permanent `/giveaway`. `GiveawayAssessmentContact.tsx` supplies the pre-completion contact step. Assessment page/persistence and both language catalogs carry attribution and outcomes. `App.tsx` adds the public route before auth guards and reserves its slug. Privacy adds an assessment/giveaway data-use explanation. `build/giveawayMetadata.ts`, Vite configuration and the explicit Vercel rewrite emit/serve `dist/giveaway/index.html`; the main landing page metadata remains unchanged.

Schema additions:

- `assessmentAttempts.giveawayOutcome`: qualified / duplicate / outside_period; optional for existing and ordinary attempts.
- `giveawayEntries`: campaign ID, assessment ID, original/normalized email, server qualification time, qualified status, rules version, eligibility confirmation time, optional consent audit. It contains no answers, score, name, business name, capability, or token. Index: `by_campaign_email`.
- `assessmentEvents.metadata.campaignId`.

Backend additions/extensions: `assessments.start`, `attributeGiveaway`, `complete`; internal helper `qualifyGiveaway`; authenticated `giveaways.entrants` query. No winner-selection mutation, public list, CMS, sponsor accounts, or marketing-list automation.

## Campaign timing and attribution

The opening time is deliberately `null`, `enabled` is false, and `rulesApproved` is false. All three must be finalized before entries open. State is upcoming before opening or while disabled/unapproved; active at/after opening and before the exclusive close; ended at/after close; winner messaging appears only after close with `winnerPublicityApproved` explicitly true.

Public deadline: **October 30, 2026 at 11:59 PM ET**. The entire displayed minute is included. The exclusive server boundary is `2026-10-31T04:00:00.000Z` (midnight EDT in `America/New_York`). A completion at the boundary does not qualify; one millisecond before does. No countdown is displayed. Frontend state refreshes every second; server time is authoritative.

Active CTA: `/assessment?campaign=scrub-giveaway-2026-001`. The recognized campaign is saved with local progress and written as `{utmSource: "giveaway", utmCampaign: campaignId}` on the attempt. Reload recovery uses server attribution. An explicit giveaway visit may attach attribution to an unfinished ordinary attempt with its capability. Existing campaign attribution is not overwritten. Completed attempts cannot be retroactively attributed/qualified. Lost start-response retries reuse the capability and can safely attach missing attribution.

The final Assessment question leads to a contact step for attributed attempts. A valid email and eligibility/rules confirmation are required only when the server finds the campaign active. The separate marketing checkbox defaults to false and is optional. Completion outside the window still produces normal assessment results but records `outside_period` and creates no entry. Client outcomes explain qualification, duplication, and closed-period completion; recovered completed assessments retain the outcome.

`qualifyGiveaway` runs inside canonical completion after answer validation and before committing the completion snapshot. It reads the campaign/email index and inserts only if no entry exists. Convex transactional conflict retries serialize concurrent attempts for the same normalized email. Repeated completion of one attempt returns its original snapshot; another assessment with the same email is preserved and marked duplicate. Assessment scores/answers are not inputs to the qualification helper. The one-person restriction additionally requires operator verification; V1 cannot detect one person using different email addresses, nor prove inbox ownership, age or residence through syntax validation alone.

## Private entrant retrieval and manual drawing

From an authenticated internal client, call `giveaways.entrants` using the same verified superadmin `userId` and `sessionToken` conventions as the Assessment admin. Arguments:

```ts
{
  userId, sessionToken,
  campaignId: "scrub-giveaway-2026-001",
  paginationOpts: { cursor: null, numItems: 250 }
}
```

Append each response's `page` to a private JSON export. Continue with `continueCursor` until `isDone` is true, including a possible empty last page. The backend caps page size at 250. The combined row count is the qualifying entry total, without the existing analytics scan cap. Never paste session tokens or entrant exports into public tickets, logs, or PRs. Deployment operators may also use the private Convex dashboard's table export with equivalent restricted access.

V1 intentionally leaves drawing/fulfillment manual to avoid a new irreversible winner-management workflow. After the deadline:

1. Export all pages for the campaign and freeze the original file in restricted storage. Record campaign/rules version, export time, row count, file SHA-256, and operator. Confirm campaign/email uniqueness and completion timestamps; verify eligibility using the Official Rules, without consulting assessment scores/answers. Preserve exclusions and reasons in a private audit ledger; do not delete assessments or entry records.
2. Freeze an ordered eligible list of entry IDs and hash that file. Use a cryptographically secure uniform draw, e.g. Node's `crypto.randomInt(eligibleEntries.length)` against that frozen list. Record the list hash, draw timestamp, operator, random index and selected entry ID in an append-only private drawing ledger **before notification**. Retain the original draw; do not rerun to replace it silently. Do not use scores, answers, or weighted selection.
3. Email the selected entrant. Record notification time and the response deadline 72 hours later. Keep correspondence and eligibility/fulfillment state in the restricted ledger.
4. If unreachable, nonresponsive after 72 hours, or ineligible, record the reason and time. Exclude that entry and any other verified ineligible entries, freeze/hash the remaining list, and record an alternate random draw as a new ledger event linked to the original. Never overwrite the original selection.
5. Record delivery/fulfillment. Do not publish identifying information without explicit permission. Only then configure approved announcement copy and `winnerPublicityApproved` as applicable.

There is no automated canonical winner or ineligibility/fulfillment status in the database: the retained private drawing ledger is the authoritative manual record. Entry status in the database records qualification at completion. This tradeoff keeps V1 small and avoids accidental repeated server selections. Establish the storage location and responsible operator before drawing.

## Privacy, consent and analytics

Entry email is used for administration/contact, not automatic marketing enrollment. Consent boolean/time/version are recorded on the entry only when appropriate; optional report-delivery consent remains separate. No entry email is stored in local progress or analytics. Duplicate entry submissions do not change the original entry's contact or consent. Rules and the Privacy Policy explain collection/use; no public entrant endpoint exists.

Vercel: `giveaway_page_viewed`, `giveaway_assessment_cta_clicked` with campaign ID. Convex milestones: `giveaway_assessment_started`, `giveaway_assessment_completed`, `giveaway_entry_qualified`, `giveaway_duplicate_entry_detected` with campaign ID. Server milestones are authoritative; page analytics remain best effort and depend on the existing Analytics configuration/CSP. No marketing emails or winner notifications are sent by this implementation.

## Owner/legal launch decisions

- Set the exact opening date/time with an explicit offset. Do not infer it from this branch or deployment date.
- Confirm sponsor full legal identity and mailing address; replace draft sponsor language.
- Review state-specific eligibility, employee/household restrictions, gift-card issuer restrictions, taxes, delivery timing, retention/deletion policy, releases/liability, disputes/applicable law and any social-platform disclaimers. No new legal exclusions or sponsor identity were invented.
- Approve final rules and privacy copy, replace the draft review placeholders, and version/freeze the final rules. Generated rules are owner/legal-review-required content, not verified legal advice.
- Confirm the private export/drawing ledger location and operator, eligibility verification process, notification/delivery process, and handling of one person using multiple emails.
- Set `enabled: true`, `rulesApproved: true` and a valid `startsAt` only after approval; deploy the shared backend/frontend configuration together. Ensure existing `VITE_ENABLE_OPERATIONS_ASSESSMENT=true` is enabled in production. Giveaway hides its entry CTA when the Assessment feature is off.
- Keep announcement copy private unless publicity permission has been obtained and recorded.

## Validation

Focused Convex tests cover canonical completion/contact/eligibility, email normalization, optional consent, duplicate attempts and completion retries, concurrent submissions, lost-start-response recovery, attribution persistence, ordinary assessment behavior, varied scores, disabled/prelaunch/exact-close/post-close states, capability checks, and paginated superadmin-only export.

Public rendering tests cover upcoming/active/ended/permission-gated winner states, CTA URL, permanent rules access, route guard ordering, local persistence, and static social metadata including the literal `$100` description. Existing bilingual catalog parity tests pass.

Results at implementation: full suite **115 files / 606 tests passed**; final focused Assessment/giveaway regression suite **4 files / 50 tests passed**. Frontend and Convex typechecks passed. Production frontend build passed and emits the separate giveaway HTML. Build warns about the existing large bundle and stale Browserslist data. `git diff --check` passed. Final typechecks and production build were rerun successfully; all three generated social/description fields were checked against the exact literal $100 copy.

Live browser viewport checks could not be completed: the Codex browser blocked `http://localhost:5173/giveaway` with `ERR_BLOCKED_BY_CLIENT`. No visual viewport pass is claimed. Before launch, verify 320/375/390px mobile, 768px tablet, and 1280/1440px desktop; keyboard focus, contact validation/optional consent, rules links, and no horizontal overflow in an approved preview environment. No production entry/test submission was made and no backend deployment was run.
