# Invoice email delivery safety and status accuracy

Base: main `a4324f8`, the verified merge of #284 including its provider-evidence
fix. This PR extends invoice delivery only. Job mail, invoice types, financial
lifecycle, amounts/taxes, Checkout URLs, Stripe/payment attempts and collection are
unchanged. All validation uses local fixtures and mocked provider delivery.

## Confirmed original flow and failure modes

- `mutations/invoices.ts` creates commercial/job invoice drafts, issues them,
  records outside payment and voids them. Financial statuses are `draft`, `issued`,
  `paid`, `void`; issuing publishes the invoice to the portal without sending mail.
- `invoiceActions.sendInvoice` was the only email entry point: owner or Manager
  with `canManageInvoices` → `getForOwnerDelivery` → boolean `sendInvoiceEmail` →
  `markSent`. Send/resend used the same action and no idempotency identity or lock.
- Preflight checked tenant, issued state, linked relationship, active portal
  client and email, but the action later trusted the resulting recipient snapshot.
- Concurrent requests could each call the provider. Network failures collapsed
  into false; even `{error:null,data:null}` counted as success. Provider acceptance
  followed by `markSent` failure (including concurrent paid/void transitions) was
  reported as failure without durable evidence, inviting another send.
- `CommercialInvoiceDetailPage` used `sentAt` to choose Send/Resend, showed “Last
  emailed” and toasted “Invoice sent” after any successful action return. It did
  not distinguish transport evidence from historical timestamps.
- No queued invoice email callback/automatic resend producer exists in inspected
  scheduler/action callers. `markSent` was an internal finalize mutation, not a
  standalone public send endpoint. Existing invoice payment/Stripe relations use
  `invoicePaymentAttempts`, canonical payment pointers and their existing financial
  reconciliation; email delivery never creates or changes them.

## Prepare, dispatch and finalize contract

Reuse `transactionalDocumentDeliveryAttempts`, extending its kind with `invoice`
and adding optional request/actor/relationship/client/claim fields and `skipped`.
Invoice `issueId` equals the existing invoice ID: this is not a new invoice issue,
financial revision or document. New invoice attempts store no recipient email,
body, property details or raw provider error. They store immutable IDs, opaque
request key, claim/result timestamps, safe category and actual provider message ID.

1. `prepareEmail` rechecks the active verified staff session, invoice capability
   and tenant. Its atomic transaction looks up `(kind, documentId, requestKey)`,
   reserves the first attempt and writes `invoice.latestEmailAttemptId`. Competing
   requests serialize on this invoice metadata; only the creator gets `claimed`.
2. Ordinary initial requests converge on the current attempt even when their keys
   differ. Repeating a key returns that attempt's result without another send.
3. A deliberate resend/retry requires `resend:true`, a fresh opaque key and the
   exact current `previousAttemptId`. It is allowed only after a definite failure,
   skip or accepted send. Stale predecessor requests cannot create another attempt.
   Historical `sentAt` without evidence requires explicit resend confirmation.
4. `authorizeDispatch` again checks session/capability/company, the current issued
   invoice, unchanged relationship/client identity, active relationship and portal
   account, and current valid contact email. It recomputes the existing integrity
   checks without changing totals. Changed contact email is freshly resolved;
   relinking to another client or revoking access suppresses the attempt. The
   send-stage marker permits only one dispatch for the claim. No session token is
   persisted in attempt metadata.
5. `deliverInvoiceEmail` preserves the renderer/payment destination, adds the
   existing company reply routing, and uses #284's structured classifier. Accepted
   requires valid `data.id` with `error:null`. Missing/malformed IDs, network errors,
   timeouts, 409 and 5xx are unknown. Definite rejection/rate limiting and known
   pre-send failures are recorded separately. No invoice email is automatically
   retried, including a rate-limited one.
   Sender precedence remains company contact email, then the oldest active owner
   with a valid email; the invoice-only fallback uses an indexed, capped owner
   lookup rather than loading all company users.
6. `finishEmail` records the actual attempt outcome independently of current
   financial state. Acceptance requires ID evidence again at finalization. It may
   update the same-company invoice's compatibility `sentAt`, including after a
   paid/void transition; it never changes financial status, amounts, timestamps of
   payment or Stripe references. A deleted invoice retains evidence on its attempt.

The claim expires after ten minutes through a durable internal watchdog mutation.
Expiry becomes `unknown`, never an unlocked retry. Repeated requests also recognize
expired claims. An action resuming after expiry cannot authorize dispatch. If
finalization fails after sending, the action returns unknown and the watchdog
preserves that uncertainty. There is no second provider call or automatic retry.
Late positive evidence from the same expired attempt can resolve it without a send.

Pending and unknown attempts block all new sends/resends. There is no manual
unknown-reconciliation endpoint in this PR: consult provider evidence/support;
any future reconciliation needs a separately reviewed path. A failed or skipped
attempt permits a deliberate retry after its cause is resolved, not a silent
background retry.

## UI, permissions and legacy compatibility

Financial badges still show the existing invoice status. The detail page presents
separate email evidence: no attempt, unverified historical timestamp, pending,
provider accepted (mailbox delivery unconfirmed), failed, unknown, skipped.
Pending/unknown disables another send. Definite outcomes require a confirmation
dialog before another email, a captured predecessor and a new request key. A local
synchronous guard prevents double clicks; any uncertain action/network exception
blocks immediate retry even before reactive evidence arrives. Copy is EN/ES.

Existing invoice readers (Owner or authorized financial/invoice Manager) see only
same-company safe delivery metadata. Only invoice managers/Owners can send. The
Client Portal is not redesigned and receives no new delivery diagnostics.

Old invoices need no migration. An old `sentAt` remains historical/unverified and
is never treated as provider evidence. All original `sendInvoice` arguments remain
valid; absent request keys use a stable legacy initial key. Old callers converge
on the first/current attempt and cannot repeatedly resend. They must refresh to
use the explicit resend and truthful result UX. The old `markSent` argument
validator remains as a no-write tombstone returning the existing timestamp/null;
an old in-flight action cannot manufacture new acceptance evidence through it.
Already-running pre-release provider calls cannot be recalled or reconstructed.

## Validation, rollout and limitations

Local validation passed: 2,042 tests across 215 files, frontend and Convex
typechecks, frontend-only build, and `git diff --check`. External email delivery
is mocked in tests; no real emails or production mutations were performed.
The root deploy-capable build command was not run. Existing source-map,
Node deprecation and frontend chunk-size warnings remain nonblocking.

New tests cover concurrent/double-click requests, in-flight overlap, explicit
resend/predecessor races, fresh email, removed/disabled/relinked clients, actor
revocation/capability/tenant changes, stale invoice states, positive/invalid/unknown
provider results, definite rejection/rate limit, expired/lost finalization,
financial isolation, legacy calls and EN/ES invoice evidence/action presentation.
Existing invoice, client, Stripe, document and job-email suites are regression gates.

Schema additions are optional/enum/index widening only; no historical replay,
invoice creation, production migration or environment change is required. The new
watchdog is invoice-specific; no new cron, general email framework or job-mail
change is added. No temporary Vercel deployment holds are introduced. Existing Git
integration may create automatic previews when the draft is pushed; no deployment
is manually triggered and no project/environment/billing settings are changed.

Do not blindly roll back to the old schema: invoice attempt kinds, optional fields,
skipped results and invoice pointer metadata must remain readable. Preserve new
callback validators/watchdog compatibility and attempt records during a reviewed
rollback. Restoring the old send implementation restores its duplicate/ambiguity
risks; refreshing open tabs is part of an authorized rollout. No rollback or
production reconciliation is performed here.

An eligibility change after the final read/external boundary remains a race.
Provider acceptance is not proof of inbox delivery; no delivery webhook is added.
Conservative unknown handling can block a mail that was never sent. No global rate
controller, automatic retry, payment reminder, new charge or exactly-once external
delivery guarantee is introduced. Financial semantics require no founder decision
change for this slice. Keep the PR draft for founder review; do not merge/deploy.
