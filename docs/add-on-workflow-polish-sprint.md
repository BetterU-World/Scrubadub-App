# Add-On Workflow Polish Sprint

## Authoritative record

Once a proposal is accepted, its proposal-owned add-on line items are the authoritative business record. Downstream records must copy immutable snapshots from that accepted proposal. They must never read pricing or descriptions from the live company add-on catalog or from mutable request snapshots.

## Immediate follow-up PRs

1. **Job and Service Agreement Add-On Propagation** — copy accepted proposal line items, including source traceability, finalized pricing, quantity, and billing cadence, into job and service-agreement-owned snapshots.
2. **Invoice Add-On Propagation** — create invoice-owned line items from the accepted proposal (or the immutable downstream snapshot selected by the workflow), retaining the proposal reference and preventing catalog/request drift.

These are the next scoped PRs in this sprint, not indefinite deferred work. Each downstream model owns its historical copy; future catalog, request, or proposal-draft changes cannot alter an accepted or billed record.
