# Operations Assessment scoring v1

This document makes the server-authoritative completion calculation auditable. It is implementation guidance, not public-facing copy.

## Question classification

- Scored operational evidence: 23 questions across Business, Scheduling and Organization, Team Communication, Quality and Consistency, Client Experience, Financial Visibility, and Growth and Operational Goals.
- Non-scored profile information: primary model, service mix, team size, and years operating.
- Branch control: team size; `solo` removes all Team Communication questions and its section weight.
- Context only: primary growth objective, primary bottleneck, and capacity.
- Reflection: the two optional Your Perspective text questions.

Every scored option has an explicit 0-100 definition value. Array position is never used by the scoring engine. Process, consistency, verification, documentation, visibility, and readiness choices progress from weaker to stronger evidence. Process fragmentation is explicitly reverse-directed: one system is strongest and messages/paper is weakest. `uncertain` for fragmentation is not assigned a score and lowers confidence rather than being treated as failure.

## Section weights

| Section | Weight |
| --- | ---: |
| Your Business | 10 |
| Scheduling and Organization | 18 |
| Team Communication | 14 |
| Quality and Consistency | 18 |
| Client Experience | 14 |
| Financial Visibility | 16 |
| Growth and Operational Goals | 10 |

Your Perspective is non-scored. For solo operators, Team Communication is inapplicable and the remaining weights are renormalized.

## Formula

Within each applicable section, the section score is the weighted mean of valid, scorable responses, rounded to an integer. The Operations Score is the weighted mean of applicable normalized section scores, again rounded to an integer. Hidden questions, non-scored questions, reflection text, and uncertain/null-scored choices do not enter either numerator or denominator.

## Operational Maturity

- 0-39: `establishing_foundations`
- 40-59: `building_consistency`
- 60-74: `operating_reliably`
- 75-89: `ready_to_scale`
- 90-100: `operationally_advanced`

## Confidence

Confidence reflects evidence coverage, not business size or score. High requires complete scorable coverage, sufficient evidence in each section, and no configured contradictory pattern. Moderate requires at least 85% scorable coverage with no more than one thin section or contradiction. All other cases are Limited. V1 flags a self-described scaling/optimizing stage paired with an Operations Score below 60 as contradictory evidence; it does not change the score. The snapshot retains coverage, reason keys, section coverage, uncertain-response count, thin-section keys, and contradiction count.

## Frozen result

Completion uses the definition ID and version already attached to the attempt. The resulting snapshot stores scoring version 1, score, section evidence, maturity, confidence, branch context, compatibility keys, and completion time. Repeated completion returns this snapshot unchanged; completed responses are immutable.
