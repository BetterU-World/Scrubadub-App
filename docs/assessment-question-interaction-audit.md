# Operations assessment question interaction audit

Audit date: 2026-07-28

## Decision

No questions are converted to multi-select in this bugfix. The current definition remains at version 2, scoring remains at version 1, and the benchmark compatibility key remains `operations_foundation_v1`. Existing completion, report, and roadmap snapshots therefore remain byte-for-byte compatible.

The inventory already distinguishes two useful single-choice patterns:

- **Single Choice** records one factual band, maturity level, frequency, capacity, or visibility state.
- **Single Choice by Design** asks for the primary, usual, best-fitting, or greatest-impact answer. Prioritization is the useful signal; several questions also provide `mixed` or `uncertain` when one exact answer would be misleading.

## Question-by-question classification

| Question | Classification | Reason |
| --- | --- | --- |
| `business.primary_model` | Single Choice by Design | “Best describes” asks for the dominant model and includes `mixed`. |
| `business.service_mix` | Single Choice by Design | Asks what represents most current work and includes `mixed`; selecting every offered service would weaken the benchmark dimension. |
| `business.team_size` | Single Choice | Mutually exclusive size bands drive deterministic solo/team branching. |
| `business.years_operating` | Single Choice | Mutually exclusive duration bands. |
| `business.growth_stage` | Single Choice | One best-fit maturity stage is required for the scored progression. |
| `scheduling.primary_method` | Single Choice by Design | Explicitly asks for the primary method; parallel tools are captured later by fragmentation. |
| `scheduling.recurring_work` | Single Choice | One maturity level summarizes current consistency. |
| `scheduling.assignment_clarity` | Single Choice | One frequency/consistency level. |
| `scheduling.change_handling` | Single Choice | One maturity level summarizes the workflow. |
| `team.assignment_delivery` | Single Choice by Design | “Usually” identifies the normal channel; allowing every occasional channel would overstate fragmentation and disrupt ordinal scoring. |
| `team.material_changes` | Single Choice by Design | “Usually” identifies the operational default channel. |
| `team.confirmation` | Single Choice | One consistency level. |
| `team.instructions_access` | Single Choice | One reliability level. |
| `quality.standard_procedures` | Single Choice | One process-maturity level. |
| `quality.verification` | Single Choice by Design | “Usually” asks for the normal verification control, whose choices form an ordinal maturity ladder. |
| `quality.issue_handling` | Single Choice | One process-maturity level. |
| `quality.rework_pattern` | Single Choice | Mutually exclusive frequency bands. |
| `client.inquiry_followup` | Single Choice | One process-maturity level. |
| `client.expectations` | Single Choice by Design | Asks for the normal documentation control; options are an ordinal ladder, not independent artifacts. |
| `client.updates` | Single Choice | One consistency level. |
| `client.request_handling` | Single Choice | One process-maturity level. |
| `financial.pricing` | Single Choice | One process-maturity level. |
| `financial.invoicing` | Single Choice | One process-maturity level. |
| `financial.payment_visibility` | Single Choice | One current visibility level. |
| `financial.job_profitability` | Single Choice | One current visibility level. |
| `growth.primary_objective` | Single Choice by Design | Explicitly asks for the primary goal; prioritization drives useful recommendations. |
| `growth.bottleneck` | Single Choice by Design | Explicitly asks for the constraint with greatest impact; prioritization drives useful recommendations. |
| `growth.capacity` | Single Choice | Mutually exclusive capacity bands, including `uncertain`. |
| `growth.fragmentation` | Single Choice | Counts the overall number of places used, rather than asking which tools are used. |
| `growth.automation_readiness` | Single Choice | One readiness stage. |
| `perspective.pride` | Single Choice | Free-text reflection; one response can naturally describe several ideas without a selection constraint. |
| `perspective.improve` | Single Choice by Design | Free text intentionally asks for one improvement so the participant identifies a priority; it is optional and unscored. |

## Multi-select implications reviewed

Converting an existing question in place would change persisted response shape from `answerValue` to `answerValues`, require a new immutable definition version, and require an explicit aggregation rule for ordinal scoring. It would also change benchmark meaning and recommendation evidence. Because every apparently multi-answer prompt deliberately asks for the primary/usual/dominant answer or supplies a `mixed` fallback, conversion would reduce rather than improve assessment precision.

The existing multi-select infrastructure remains validated by the shared definition, persistence, applicability, and input components, but this audit does not activate it for version 2.
