# Legacy billing inventory before #249

Production read-only inventory completed at **2026-10-15T18:55:58.234Z** on
main `b0795349ae42e67368a90ed97b3e24a7d27a5996` (one bounded user page).

| Company ID | Stored subscription status | Explicit complimentary entitlement | Operational access change at cutover |
| --- | --- | --- | --- |
| `j97f1fffrb6re88kfyz41akaf182mjd5` | Unset (`null`) | Active | None: owner workspace and backend writes remain allowed |

No additional legacy-exempt companies were found. No additional complimentary
exception is indicated by this inventory. The active entitlement is consistent
with the already-provisioned founder-company access reported by the operator;
the diagnostic intentionally does not return owner identities or approval audit
records. Retain the existing approved-ID readiness record as the identity check.
No Stripe subscription, trial, or discount was created, changed, or inspected.

## Exact scope

`convex/lib/subscriptionGating.ts:23` and `convex/queries/billing.ts:32`
exempt an existing company if **any user whose `companyId` matches it has role
`owner` and an email accepted by `isFounderEmail`**. Owner status is ignored:
active, inactive and pending owners qualify. All duplicate-email owner records
qualify independently, including records linked to different companies. An
unlinked owner or matching nonowner does not exempt a company. Contact email,
company name and platform administrator entitlements do not establish this rule.

`convex/lib/founderEmails.ts:11` combines the hardcoded fallback with the
deployment's comma-separated `FOUNDER_EMAILS`. Configuration entries are trimmed
and lowercased; stored user emails are lowercased but not trimmed. Configuration
values and owner emails must stay inside the trusted query runtime.

This bypass only overrides access gates. Ordinary Stripe `active` subscriptions
and `trialing` subscriptions independently allow access. Promo codes affect Stripe
pricing, not founder-email eligibility (`convex/actions/billing.ts:86`). An unset
status is not evidence of a paid subscription or trial: the backend currently
permits writes for it, while the owner workspace needs a bypass or its own grace.
Workspace grace uses `subscriptionBecameInactiveAt`; backend `past_due` grace
uses `currentPeriodEnd`, including legacy seconds conversion. Both are evaluated
independently at one supplied timestamp by the diagnostic.

## Authorized operator procedure

Preferred no-deployment path: run the installed Convex MCP `runOneoffQuery`
against the **production selector returned by `status`**, with every tool except
`status` and `runOneoffQuery` disabled. This installed tool executes the submitted
query in a sandbox that cannot modify the database or access the network. Its
implementation is `node_modules/convex/src/cli/lib/mcp/tools/runOneoffQuery.ts`.
Do not use `convex dev`, `convex deploy`, `--push`, data export, or environment
listing. Use existing operator authentication; never print credentials.

The completed inventory used the tested handler in `convex/legacyBillingInventory.ts`
with its exact local founder-email and Stripe compatibility helpers bundled into
the one-off query. The only runtime import was
`convex:/_system/repl/wrappers.js`. No diagnostic was deployed or made public.
The reproducible runner is `scripts/legacy-billing-inventory.cjs`; from the
repository root, run:

```powershell
node scripts/legacy-billing-inventory.cjs --confirm-read-only-production
```

The runner uses the installed Convex CLI and TypeScript, suppresses runtime logs,
and prints only completion metadata and the four-field company projection. Keep
the output in an operator-restricted location. It does not print customer records,
user IDs, emails, Stripe IDs, environment values or authentication material.

The internal query is also available for a separately approved future deployment,
but deploying it is **not authorized by this inventory task**. Its arguments are:

```json
{"paginationOpts":{"cursor":null,"numItems":50},"asOf":1792090558234,"confirmation":"READ ONLY LEGACY BILLING INVENTORY"}
```

For any rerun, use the current epoch-millisecond timestamp consistently for every
page. Follow `continueCursor` until `isDone` is true, **including empty pages**.
Deduplicate companies by ID across pages; duplicate owner rows can cross page
boundaries. Conflicting projections, duplicate entitlement rows, dangling
relationships, missing pages, query errors or authentication errors mean the
inventory is incomplete, not that there are zero affected companies. Multiple
pages are not a transaction-wide snapshot; if billing/ownership/configuration
changes during the scan, rerun in a quiet window before cutover.

`complimentaryEntitlement` distinguishes active, inactive and absent records.
Each `operationalAccessChange` boolean means that gate would become restricted
after removing the legacy bypass. No automatic grant follows from any result.
For any newly discovered nonfounder company, obtain an explicit retain-or-end
exception decision before cutover; the intended default is no new exception.
Grace windows may expire after the observation timestamp, so rerun near cutover.

## Validation and boundaries

Focused in-memory tests cover inactive/pending owners, duplicate emails,
deduplication, empty-page traversal, normalization, nonowner exclusions, explicit
entitlements, independent grace boundaries, missing status, minimal projection,
read-only behavior, invalid arguments and ambiguous entitlement data.

This diagnostic branch is based on main, independent of #249. Both remain Draft.
Neither PR is merged or deployed by this task. No production writes, grants,
Stripe lifecycle operations, schema changes or public endpoints are included.
