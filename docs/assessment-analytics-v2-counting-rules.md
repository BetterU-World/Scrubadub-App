# Assessment Analytics V2 counting rules

- **Start:** one non-deleted assessment attempt. The server-created `assessment_started` event is idempotent per attempt.
- **Completion:** an attempt with `status = completed` and a completion timestamp. Completion is never inferred from client events.
- **Abandonment:** an attempt explicitly marked `abandoned`. In-progress attempts are shown separately and are not treated as abandoned.
- **Completion time:** wall-clock time from `startedAt` to `completedAt`, clamped at zero. Average and median use completed attempts only.
- **Abandonment location:** the most recent privacy-safe `assessment_progress` event for an abandoned attempt. It contains question and section keys only—never answers.
- **Device:** the viewport-width category recorded at first persisted answer (`mobile` below 768px, otherwise `desktop`). No user agent or fingerprint is collected. Older attempts remain unclassified.
- **Resume:** one unique attempt with at least one `assessment_resumed` event. An event is deduplicated per attempt and page session.
- **Session:** a random, short-lived page-session ID on start or resume. Average sessions uses only completed attempts that have session instrumentation.
- **Secure return:** one unique completed attempt whose secure report link was opened at least once.
- **SCRUB CTA click:** one unique completed attempt that clicked the report support CTA. Repeated clicks are intentionally deduplicated per attempt.
- **Interest submission:** one unique completed attempt that successfully saved an interest choice. Successfully associated interest is reported separately from CTA navigation.
- **Daily rate:** completions occurring on a UTC calendar day divided by starts occurring on that same UTC day. It is a daily activity ratio, not a cohort conversion rate.

All metrics are founder-only aggregates. Analytics does not expose raw answers, qualitative text, capabilities, tokens, browser hashes, full user-agent strings, or new identifying information.
