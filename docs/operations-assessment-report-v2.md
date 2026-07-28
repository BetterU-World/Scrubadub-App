# Operations Assessment report v2

Report version 2 is a deterministic UX revision of the frozen Operations Assessment report. It preserves scoring version 1, server-authoritative generation, immutable snapshots, roadmap selection, secure returns, and English/Spanish parity.

## Executive Diagnosis

The report opens with a concise bilingual diagnosis selected entirely from frozen report facts:

- strongest applicable section;
- lowest-scoring applicable section;
- confidence tier;
- solo or team branch.

Stable confidence templates control the tone. The diagnosis identifies the strongest foundation and first priority without interpreting qualitative responses, generating prose with AI, or changing scoring.

## Humanized findings

Section findings use fixed bilingual operational observations and rationales instead of repeating one generic consistency statement. These remain category-driven templates; report version 2 does not add answer-derived evidence catalogs or alter finding eligibility.

## Presentation hierarchy

The public report renders information in this order:

1. Executive Diagnosis
2. Now priorities
3. Operational Scorecard
4. Next and Later priorities
5. Maintain strengths
6. Optional report preservation and one restrained SCRUB support section

The separate Strengths and Improvement Opportunities grids are no longer rendered because their observations and rationale repeated the roadmap. Existing report and roadmap payload fields remain available for frozen version 1 compatibility.

## Roadmap presentation

Roadmap generation is unchanged. The public cards show Current Situation, Why It Matters, up to three Practical Actions, and What Success Looks Like. Target-state and per-card SCRUB support copy remain frozen in the payload but are not separately rendered because they duplicated nearby guidance.

## Completion and metrics

The final assessment response now transitions through a brief professional completion state while the existing completion, report, and roadmap mutations run. Operations Score, Operating Stage, and Confidence each include a concise explanation. Reduced-motion behavior, focus recovery, responsive layouts, and print-safe card boundaries remain part of the presentation contract.

Version 1 secure-return snapshots remain renderable through frontend fallbacks when `executiveDiagnosis` is absent.
