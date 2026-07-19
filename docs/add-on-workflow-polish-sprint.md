# Add-On Workflow Polish Sprint

## Authoritative record

Once a proposal is accepted, its proposal-owned add-on line items are the authoritative business record. Downstream records must copy immutable snapshots from that accepted proposal. They must never read pricing or descriptions from the live company add-on catalog or from mutable request snapshots.

## Immediate follow-up PRs

1. **Accepted Proposal → Direct Jobs and Service Agreements** — copy accepted proposal line items into directly created jobs and service agreements. Worker projections contain operational requirements only.
2. **Commercial Schedule and Partner Job Propagation** — add schedule-owned snapshots, explicit every-job/first-job applicability, deterministic generation, and sanitized partner copies.
3. **Invoice Add-On Propagation** — create invoice-owned line items independently from the accepted proposal, retaining traceability and preventing catalog/request drift.

These are the next scoped PRs in this sprint, not indefinite deferred work. Each downstream model owns its historical copy; future catalog, request, or proposal-draft changes cannot alter an accepted or billed record.
