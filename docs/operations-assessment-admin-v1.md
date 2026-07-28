# Operations Assessment Results Admin V1

Assessment Results Admin V1 is a founder-only operational inbox for reviewing assessment performance, recent completed results, and follow-up signals. It is intentionally smaller than a future Founder Dashboard.

## Access

Both aggregate and detail queries require the existing verified superadmin session and founder-email allowlist. Frontend routes are rendered only inside the existing superadmin route gate:

- `/admin/assessments`
- `/admin/assessments/:attemptId`

Ordinary owners, managers, workers, affiliates, anonymous visitors, and holders of public assessment capabilities cannot use these queries.

## Overview

The overview displays:

- assessment starts and completions;
- completion rate;
- average Operations Score;
- high-confidence result rate;
- contact capture and SCRUB-interest counts;
- solo/team and English/Spanish completion counts in the query result;
- most common first-priority and strongest areas;
- up to 100 recent completed assessments.

Aggregates use a bounded 10,000-attempt scan and disclose when that limit is reached. Recent results use the completed-attempt status index.

## Results inbox

The responsive inbox supports:

- business, name, email, or area search;
- solo/team filtering;
- interested, captured, or anonymous filtering;
- score, operating stage, confidence, first priority, and contact status;
- mobile result cards and an accessible desktop table.

## Frozen report detail

The detail view returns the immutable report and roadmap snapshots already generated for the participant. It also returns the explicitly captured prospect fields needed for follow-up:

- first name;
- business name;
- normalized email;
- preferred language;
- delivery status;
- marketing consent;
- SCRUB interest.

The public report renderer is reused without public continuity or product-interest controls.

## Privacy boundary

The admin API intentionally excludes:

- raw assessment responses;
- qualitative response text;
- capability and browser-key hashes;
- secure return tokens or token hashes;
- scoring evidence IDs outside the already frozen public report;
- deleted or anonymized attempts.

No new analytics events, assessment schema fields, scoring rules, recommendation rules, or public access mechanisms are introduced.
