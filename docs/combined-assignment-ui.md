# Combined assignment owner/manager UI (Phase 4)

Based on main `c1de98c`, including merged #279, #280 and #281. This is a frontend-only change: no Convex functions, schema, authentication, billing, payroll or production data changes.

## User flow and routes

- Standard create `/jobs/new`, quick create `/jobs/quick`, and edit `/jobs/:id/edit`: optional team plus independent direct-worker checkboxes. Both, either, or neither can be saved. Team changes never clear individuals; direct-worker changes never clear the team. Use “No team” to remove the team and uncheck individuals to remove direct assignments.
- Owner and delegated managers with assignment permission see the controls. Managers without it retain a read-only assignment summary and omit all assignment fields on edits. Existing backend authorization remains authoritative.
- Overlapping team/direct workers have one direct-worker row marked “Also on selected team.” Sources are displayed separately; counts are not added together. Membership queries use the existing authorized company-team endpoint; the UI uses eligible local membership IDs and does not render a partner-company roster.
- Existing inactive/unavailable direct workers and archived/missing teams remain visible as retained choices rather than disappearing on load. Already-selected unavailable workers may be unchecked. Changing job type does not silently drop either source; retained incompatible direct workers are shown with a warning and must be explicitly removed/replaced to satisfy existing backend validation.
- Owner/manager job detail, owner/manager lists, manager home, month/week/day calendar job entries and commercial account list show both sources. Team-only jobs no longer appear in the owner list's unassigned filter. Manager list search includes team names. Commercial account detail, request detail and recurring schedule cards already show separate team/individual fields and remain unchanged.
- Dedicated owner reassignment retains the singleton replacement contract. Its localized explanatory copy directs multi-worker edits to Edit Job and explains that the team/acceptance remain intact.

## Serialization and preservation

Creation sends deduplicated `cleanerIds` and optionally `assignedTeamId`. Partner-company creation sends no local team/workers. Quick creation uses the existing maintenance-worker list for maintenance jobs.

Edit serialization compares each source with its opening snapshot as sets, omitting unchanged sources. A notes/schedule save of an existing combined job therefore sends neither assignment field. This also preserves newer server assignments if another staff member edits them while the first form stays open. The form initializes once per job instead of overwriting local input on every reactive query refresh.

An explicit direct-worker change sends `cleanerIds` (including `[]`); a team change sends `assignedTeamId` or `clearAssignedTeam: true`. Never send team-set and team-clear together. Editing either source omits the other unless that source was also explicitly changed. No acceptance/status/history fields are serialized. Explicit concurrent edits to the same source retain existing last-write-wins behavior; this PR does not add a conflict-resolution workflow.

Pending/rejected/manual-review shared jobs keep their existing blocked-edit notice. Accepted recipient copies use the recipient company's normal assignment controls and existing shared-work guards. This PR adds no broader partner access or membership reconciliation.

## Verification

Focused React DOM tests exercise the actual standard/quick forms, the serializer and assignment summary, owner/manager lists and all three calendar views. Coverage includes team/direct/combined/unassigned creation, independent clears, unchanged and notes-only saves, reactive updates while editing, retained archived/inactive assignments, unavailable workers, permission-based controls/payload omission, shared-copy boundaries, EN/ES text, overlap and HTML-like names. Existing shared-work and backend assignment tests verify compatibility.

Visual evidence uses the actual components and production CSS in an isolated local synthetic-data fixture, not a live Convex deployment. Headless Edge viewport measurements reported document width equal to viewport width (no horizontal overflow): 320px and 375px standard edit, 375px quick creation and 1280px desktop. Screenshots were inspected visually:

- [Standard edit, desktop English](combined-assignment-ui/standard-desktop.png)
- [Standard edit, 375px Spanish](combined-assignment-ui/standard-mobile-es.png)
- [Standard edit, 320px English](combined-assignment-ui/standard-mobile-320.png)
- [Combined quick creation, 375px English](combined-assignment-ui/quick-mobile.png)

Both typechecks, local `build:frontend`, focused/full tests and diff validation are recorded in the draft PR. Root `build` is deliberately not used because it deploys Convex. Production-authenticated browser-to-Convex writes were not exercised; no production mutation, migration, manual Vercel deployment or merge was performed.

## Remaining boundaries

No per-worker acceptance, team-membership reconciliation, archive-policy change or Phase 5 work. Lists without member rosters show source labels without claiming a unique effective-worker count. Backend validation still determines actual eligible recipients. Existing manually changing assignments and their audit/notification/review lifecycle remain as implemented in #281.
