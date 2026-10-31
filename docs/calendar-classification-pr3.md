# Calendar reliability PR 3 — classification research and design

## Baseline findings (recorded before implementation)

Fetched main at `346e0b0`, which contains merged PR #270 and #271 and their
validated/empty snapshot, missing-episode, explicit cancellation and attempt-fence
implementations. This establishes source history, not production deployment status.

`icalParser.ts` retains UID, SUMMARY, normalized DTSTART/DTEND, date-only DTSTAMP
and a SHA-256 hash of UID/dates/summary. DESCRIPTION, STATUS except cancellation,
TRANSP, CATEGORIES, LOCATION, URL and provider extension fields are discarded.
Those fields can describe an event but are untrusted feed content.
`calendarConnections.create/update` accepts an owner-selected airbnb/vrbo/other
label and arbitrary URL. No provider identity or per-event booking evidence is
verified. Hostaway/Guesty have no dedicated verified integration.

`maybeCreateJobForReservation` currently gates on linked job, permanent historical
skip, past date, enabled property automation and same-property/date calendar-job
deduplication. It has no classification gate. The missing-review tab and existing
audit log can host classification decisions without a new review platform. The
property rule selects job type/time/duration, not a booking-verification policy.

## Primary sources and exact rule

- [Airbnb calendar documentation](https://www.airbnb.com/help/article/99): both
  booked nights and host-blocked nights propagate to other calendars.
- [Vrbo export documentation](https://www.vrbo.com/en-gb/help/articles/Export-your-reservation-calendar):
  optional tentative bookings appear as blocked dates.
- [Hostaway iCal documentation](https://support.hostaway.com/hc/en-us/articles/360002562334-Custom-iCal-Setup-Sync-and-Limitations):
  iCal is an availability integration; exported details vary with permissions.
- [Guesty iCal documentation](https://help.guesty.com/hc/en-gb/articles/11725829430045-Syncing-your-iCal-with-the-Guesty-calendar):
  exports include manual blocks, owner reservations and availability-rule blocks,
  as well as confirmed/reserved reservations.
- [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545): VEVENT status and transparency
  describe calendar semantics; they do not authenticate a paid/confirmed guest stay.

No documented, authenticated event contract is available in SCRUB that can
positively distinguish guest bookings or non-guest blocks. Therefore the automatic
classifier will always return `needs_review`. Titles, descriptions, dates, UIDs,
user-selected provider labels, STATUS:CONFIRMED, TRANSP and custom reservation IDs
will not authorize jobs. Owner confirmation is the only positive classification
source in this PR. This deliberately reduces automatic coverage rather than
inventing provider guarantees. No positive provider-automatic test will be fabricated.

## Planned compatibility and decision guard

New events receive explicit review-required classification. Existing linked jobs
are untouched. Unchanged legacy rows remain legacy/unconfirmed without mass review
episodes or backfill, but unconfirmed unlinked rows can no longer auto-create jobs.
Materially changed legacy events become review-required. Owners can classify legacy
rows explicitly. Existing date cutoffs and other job gates continue to apply.

Decisions will bind to an event evidence version and revision, including feed URL
generation. Identical snapshots retain owner decisions. Material metadata changes
invalidate job eligibility, retain the prior human decision for transparency/audit,
and require renewed review. Routine timestamp/sequence churn will not trigger this.
Owner requests must reject stale versions, conflicting concurrent decisions and
changed missing episodes; cancellation, disabled feeds and missing records cannot
silently authorize a new job. Missing acknowledgement remains a separate action.

## Implemented classification and versioning

`classifyICalEvent` is a deterministic conservative fallback returning
`needs_review / unverified_ical / insufficient_verified_evidence` for every input.
There is no positive automated provider rule. The three categories are persisted
separately from active/cancelled status and missing episodes. Positive guest/block
decisions carry `source: owner`, a revision, actor, time and exact evidence version.

The parser now retains STATUS, TRANSP and CATEGORIES for owner-visible context,
without trusting them. A SHA-256 digest covers normalized/unfolded top-level VEVENT
properties, including description, URL, location, recurrence and custom fields,
without persisting/logging those raw values. Property order is canonicalized;
DTSTAMP, LAST-MODIFIED, CREATED and SEQUENCE churn is excluded. Alarm properties are
not classification evidence. The event version also includes operational date/
summary hash and the configured feed URL generation. Changing the URL increments
an optional connection `feedRevision`, invalidating old-source decisions without
copying private feed URLs into review metadata or logs.

Material changes place the current event back into review, increment its revision,
retain the prior `ownerDecision`, and audit the evidence transition. This revokes
job eligibility rather than erasing the human decision. Identical snapshots retain
the decision and revision. No notification or duplicate review record is generated
each hour. An older in-flight action lacking the richer metadata remains safe and
may conservatively cause renewed review when its evidence version is upgraded.

Unchanged legacy rows gain observed versions/context only during their normal
sync; classification remains absent, with no backfill or mass classification
review episodes. Their linked jobs are preserved. Unlinked legacy records no
longer create jobs without explicit confirmation. A legacy row must first be
observed under the versioned ingestion path before the owner can classify it.
Materially changed legacy rows join review. Tradeoff: unchanged legacy rows are
not elevated as new classification alerts, so owners may need to open their
ordinary list entries to classify them. Missing/operational alerts remain visible.

## Owner workflow and job protection

The property list distinguishes missing acknowledgement from classification.
It shows all unresolved classification, missing and operational review rows rather
than hiding them behind the first five rows; ordinary rows remain collapsible.
Native guest/block buttons explain job creation, display job outcomes, wrap on
small screens, have touch-sized targets/focus styles, and announce results/errors.
Stale result messages are hidden when the displayed evidence version changes.

`confirmEventClassification` derives the owner from the verified session and
verifies company, property and connection relationships. It requires matching
event version, classification revision, feed revision and current missing episode;
cancelled/removed-source events and stale/spoofed requests fail. Two owners cannot
commit conflicting decisions from the same revision. Fresh repeats of the same
decision are idempotent and do not add duplicate decision audits.

Guest confirmation attempts job creation transactionally through the existing
helper. It requires a current owner-confirmed guest, active/present reservation,
enabled connection/rules, valid cutoff/past-date eligibility and existing checkout
deduplication. The initial cutoff is checked even on legacy rows missing old skip
flags. Missing or disabled records may be classified, but cannot create a job;
later presence/enabled rules can retry only while that same guest decision remains
valid. Outcomes explicitly distinguish created, already linked and not eligible.

Non-guest confirmation creates no job. A linked job is always retained unchanged,
with a separate manual operational-review warning. No linked job, assignment,
execution evidence, approval, payment or compensation record is mutated. Existing
same-property/date calendar-job deduplication remains in place; manual jobs and
cross-feed booking identity are not newly matched by this PR.

## Validation and limitations

Synthetic tests cover conservative fallback despite booking/block titles,
CONFIRMED/OPAQUE/categories/custom IDs, owner-positive classifications, all job
gates, idempotency, evidence churn/change, feed replacement, stale/unauthorized/
cross-company decisions, concurrent owners and cross-feed checkout deduplication,
legacy compatibility, financial/job preservation, missing/cancellation and unsafe
snapshot fencing. Older job-focused regressions now explicitly confirm a guest
through the authorized mutation before expecting a job; ambiguous-import admission
tests correctly expect no automatic jobs. No production data/backfill or real
provider feed is used.

DOM tests exercise native button focus/activation, pending/duplicate-click guards,
live results, stale errors, missing-vs-classification semantics, all-attention row
visibility, responsive wrapping and touch-target classes. No real mobile-device
visual audit or live-provider certification was performed. Provider-specific
automatic-positive tests are intentionally absent because no defensible contract
was established. Unrecognized/unverified metadata remains review-required.

Classification keywords/AI, PMS APIs/OAuth, automatic existing-job rescheduling or
cancellation, identity migration, SSRF/response limits, timezone redesign,
historical repair and notification infrastructure remain excluded. Existing
per-connection transaction/read scale limits and English-only tab copy remain.

### Verified local results

- 208 tests passed across 11 files: classifier, parser, missing-review,
  containment, admission, calendar sessions, operational-data authorization,
  job cancellation, relationship propagation, Calendar Sync presentation and
  interactive classification controls. This includes 35 classifier integration
  cases and eight interactive DOM cases. Vitest used `--configLoader runner` to
  avoid the sandbox's default config-bundler directory-access restriction.
- Convex and frontend typechecks passed. The local frontend production build
  passed with the existing large-chunk warning. Its config bundler required
  filesystem escalation; no deployment command was used.
- Final attention-list DOM regressions also passed (16 tests across the two UI
  files). Whitespace checks passed. Unrelated generated API edits and pre-existing
  untracked cache/capture files are excluded.

## Release and rollback — approval required

All new stored fields are optional; no migration/backfill is required. Existing
status values, empty/missing/cancellation handling and public read arguments are
unchanged. The new owner mutation must exist before classification controls call
it. The frontend guards controls on versioned observation data; against the old
backend it treats rows as legacy and does not call the missing mutation. This
avoids a client exception, but cannot enforce the new backend job-safety policy.

Safest order after explicit approval: deploy this additive Convex schema/action/
parser/mutations together from the approved revision, then promote the frontend.
The old frontend ignores classification metadata; during that short gap new jobs
are held safely for review, but cannot be confirmed until the new UI arrives.

The standard merge -> Vercel frontend -> Git Bash Convex production workflow is
client-compatible, but leaves the old unsafe automation running until the backend
step completes. Do not describe that interval as classification-safe. Prefer
staging the backend safety gate before frontend promotion; if the standard order
is mandatory, an explicitly approved temporary pause of affected calendar syncing
through existing owner controls avoids that interval. No such production action
is performed by this task, and Git history does not prove deployment state.

Rollback must retain the classification gate, additive schema and owner mutation.
A frontend rollback holds new unconfirmed work rather than restoring unsafe jobs.
If a backend rollback is unavoidable, disable affected syncs first through existing
authorized controls under separate production approval; do not resume with the old
all-events-create-jobs implementation. Keep stored owner decisions/audits and
linked jobs intact; do not narrow populated schema fields or perform cleanup.
