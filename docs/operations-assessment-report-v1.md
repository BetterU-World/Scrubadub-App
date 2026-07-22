# Operations Assessment report v1

Report version 1 is a deterministic Convex transformation of a frozen completion snapshot. It never recalculates the Operations Score and does not use AI or external services.

## Snapshot

The existing attempt `reportSnapshot` stores report/scoring versions, the original generation time, and a structured payload containing identity metadata, score/maturity/confidence, bilingual Executive Summary paragraphs, applicable scorecard entries, selected strengths and opportunities, branch context, internal evidence references, roadmap compatibility metadata, and a reserved roadmap state.

## Rules and selection

Versioned `FINDING_RULES` declare stable IDs, kind, score range, evidence family, priority, mutual-exclusion group, branch applicability, and roadmap compatibility. Section rules require both a qualifying score and frozen evidence. Strengths require a section score of at least 75 and positive evidence. Opportunities require a score of at most 59 and opportunity evidence. Results sort by score/materiality and then stable section key, which makes ties deterministic. One finding per section and class prevents duplicates; hidden sections are removed before selection. Limited-confidence reports select at most two findings of each kind.

Scorecard bands cover 0-100 exactly once: Priority Opportunity (0-39), Developing Consistency (40-59), Generally Reliable (60-79), and Strong Foundation (80-100).

High-confidence summaries state findings directly. Moderate-confidence summaries use measured language. Limited-confidence summaries disclose the evidence limitation and deliberately return fewer findings. Public React components render bilingual frozen content and never interpret raw answers or display evidence IDs, weights, formulas, compatibility keys, or free-text reflections.

## Immutability and access

Generation requires the attempt capability, completed status, completion snapshot, and matching frozen definition. The first generation persists report version 1. Later requests return that snapshot and timestamp unchanged, even after report rules or published definitions evolve. Completed reports remain available under completed-attempt retention behavior; capabilities are not placed in URLs.

## Deferred to PR4

The report only reserves the Growth Roadmap transition. Now / Next / Later / Maintain prioritization, action details, dependencies, and roadmap presentation are intentionally deferred.
