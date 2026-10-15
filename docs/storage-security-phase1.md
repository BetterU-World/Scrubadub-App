# Storage security Phase 1

## Security boundary

The public `mutations/storage:getUrl` arbitrary-storage-ID endpoint is removed.
No checked-in application caller needs it. A storage ID is never sufficient
authority to attach a new file. Current parent-resource queries remain the read
boundary; no new generic URL endpoint replaces the removed function.

New `attachmentUploads.begin` uses the existing Resource upload-intent model:

1. Verify the staff session and authorize the exact target: editable form,
   checklist item, inspection job, red-flag job, or company onboarding document key.
   Company and user come from the verified session. Existing subscription checks
   on upload issuance remain in place.
2. Persist a one-hour intent containing company, user, purpose/target key,
   unpredictable nonce, declared MIME type and creation time. Issue an upload URL
   and the exact `Content-Type` value required for that upload.
3. The frontend uploads with that server-issued metadata. The file ID and intent
   ID travel together to the existing committing mutation.
4. Inside that transaction, recheck the session and current resource permissions,
   then verify the intent belongs to this user/company/target, is pending and
   unexpired, and matches the stored object's immutable nonce/MIME metadata and
   creation time. Authoritative stored size must be 1 byte–10 MB. Photos permit
   JPEG/PNG/WebP/GIF metadata; onboarding permits PDF metadata.
5. Atomically mark the intent consumed with its storage ID and attach the file.
   No intent can be reused or used for another purpose, user or resource. A failed
   inspection batch rolls back all consumption. Inspection batches are bounded to
   50 photos. Intent IDs cannot be substituted for the authenticated principal.

Inspection/evidence intents bind to the exact job and purpose because the new
inspection/red-flag row does not exist until commit. The committing mutation
still verifies the job/property relationships and all existing workflow rules.
Other intents bind to the exact existing form/item or company-scoped document key.

This proves provenance, not the semantic truth of an image or PDF. A malicious
authorized uploader can still upload misleading content; this phase does not
claim malware scanning or file-signature validation.

## Workflows and compatibility

- Cleaner, maintenance, manager inspection and onboarding upload interfaces now
  use bound intents. Checklist and evidence API callers must supply an intent
  when adding a file; nonphoto edits and photo-free submissions are unchanged.
- The generic upload URL function remains for compatibility, but its unbound
  output cannot be attached through any of the five protected setters.
- Existing stored attachments are read through their authorized parent as before,
  even if they have no intent. No read backfills or assigns file ownership.
  Supplying a legacy ID to a new write fails; reselect/reupload a file to attach it
  to another record. Existing nonphoto edits preserve attached IDs.
- Checklist items and red flags project photo URLs after their existing parent,
  tenant and role checks. This preserves resource-specific evidence access after
  removal of the generic URL endpoint.
- Partner completion photos are projected only to the originating company's
  verified owner, with `sharePackage=true`, completed state and matching original /
  copied job company links. This is a deliberate cross-company read grant, not
  cross-company upload ownership. Private IDs and URLs are omitted when the grant
  does not qualify. The partner query accepts a job ID, not an arbitrary file ID.
- A lost upload response, expired intent or failed/closed workflow may require
  selecting the file again. Consumption is single-use, not a generic file-copy or
  cross-resource retry mechanism. Do not weaken provenance for old clients.

## Deployment ordering — approval required, no deployment performed

1. Review this Draft PR and require CI. First verify a synthetic upload in an
   approved nonproduction environment: the upload service must retain the exact
   nonce-bearing Content-Type, as already required by Resource uploads. Verify
   image/PDF rendering with MIME parameters and actual browser upload errors.
   In-memory tests do not replace this storage-service/browser check.
2. Deploy the additive `attachmentUploadIntents` table and index with the backend
   functions only after approval. No required fields are added to existing tables;
   no data backfill is needed to enforce new writes or preserve existing reads.
3. Release the frontend using bound uploads immediately after the backend (or in
   the same coordinated release). Old clients fail closed on new file attachment
   and must refresh/reupload. Do not deploy frontend-first or temporarily restore
   arbitrary-ID attachment acceptance to support stale clients.
4. Smoke-test cleaning/checklist execution, maintenance, manager inspections,
   worker onboarding visibility and explicit partner completion packages using
   synthetic data in the approved environment. Production remains on hold until
   the owner explicitly approves deployment.
5. A rollback must retain these backend guards. A frontend rollback can interrupt
   new uploads; restoring the previous vulnerable backend is not a safe rollback.

## Separate read-only historical inventory and migration proposal

`legacyAttachmentInventory:page` is an **internal query**, callable only through
trusted deployment tooling after a separately approved deployment. It never gets
a file URL, downloads bytes, writes a record or claims legacy ownership.

Example arguments (use a fresh cursor per source):

```json
{"source":"forms","paginationOpts":{"cursor":null,"numItems":25}}
```

Scan `forms`, `formItems`, `managerInspections`, `redFlags`,
`companyOnboardingDocuments` and `sharedJobs`. Follow every cursor, including
empty pages, until `isDone`. Each row contains only parent ID, company ID, storage
ID and a provenance classification: `bound`, `legacy_unverified`, `explicit_share`
or `conflict`. Sources with more than 100 references on one row fail for separate
operator reconciliation; never interpret a failed scan as complete.

The operator must aggregate storage IDs across **all** pages/sources to identify
legacy reuse across companies. A parent reference alone is not proof of uploader
ownership; sharing records alone are not permission to reassign a file. The
inventory reports known metadata bindings, not a forensic judgment about file
contents. Missing parent/company associations require review.

Proposed follow-up: review conflicting references and intended partner grants,
approve exact target associations, then design a separately reviewed migration
with a dry-run report. Unknown/conflicting files must not be automatically adopted,
deleted, moved, or exposed. Legacy reads remain compatible, so historically
misbound references remain an explicitly unverified residual until reconciled.

## Residual risks deferred to Phase 2

- Direct storage URLs already returned by authorized photo/document queries remain
  bearer URLs. Later session, assignment, document-visibility or partner-share
  revocation blocks future application projections, not an already-issued URL or
  downloaded bytes. Per-request authenticated byte delivery is Phase 2.
- The manual action still copies a private Blob to Convex and returns a reusable
  URL. Its existing "short-lived" comment is not a valid expiry guarantee.
- Abandoned/expired upload objects and pending intent records need a separately
  approved retention/rate-limit/cleanup design. This PR performs no destructive
  cleanup or legacy migration. An issued upload URL may remain usable until its
  own expiry after app access changes; it cannot bypass commit authorization.
- This phase validates authoritative object metadata and size, not byte signatures,
  image decoding, malware content or historical misattachment. Public branding
  and intentionally shared copies need explicit policies in Phase 2.
- No production data, files, credentials or live storage-service behavior were
  inspected to validate this implementation.

## Validation

New regression coverage exercises all five write boundaries and subsequent reads,
cross-company and unbound objects, uploader/purpose/target mismatch, single use,
expiry and transaction rollback; missing/invalid/revoked/expired/inactive sessions;
client-vs-staff sessions; worker/team assignment and manager scope/capability
changes; maintenance uploads; onboarding visibility; legacy compatibility and
metadata-only inventory; explicit partner-share checks; and nonce-preserving
frontend upload transport/error handling.

Existing manager execution lifecycle fixtures now obtain a genuine bound test
upload instead of directly attaching an arbitrary synthetic storage ID.
