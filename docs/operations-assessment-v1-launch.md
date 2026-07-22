# Operations Assessment V1 launch and retention

## Funnel and privacy

Participants receive the complete score, report, findings, and Growth Roadmap before contact fields. Contact capture is optional. Requesting a return link authorizes only that transactional delivery; marketing consent is separate, optional, false by default, versioned, and timestamped only when granted. SCRUB interest is a separate preference and creates no user, company, trial, subscription, or payment.

Return links use 256-bit random single-purpose tokens. Only a peppered SHA-256 hash is stored. Tokens authorize read-only access to one frozen report/roadmap, expire after 60 days, and rotate on resend by revoking earlier active tokens. New assessment starts remain feature-flagged; existing secure return links remain available when starts are disabled.

## Retention assumptions

- Incomplete attempts: existing 30-day expiry; cleanup remains operational follow-up.
- Completed attempts, report snapshots, and roadmap snapshots: retained under current completed-assessment behavior; no automatic deletion claim.
- Prospect records and privacy-conscious funnel events: retained for V1 learning until a formal retention/deletion policy is implemented.
- Report tokens: unusable after 60 days or revocation; expired rows are retained for audit until cleanup is added.

## Configuration

- `VITE_ENABLE_OPERATIONS_ASSESSMENT=true` for new public starts
- deployed Convex schema/functions
- `APP_URL` for secure-link construction
- `TOKEN_PEPPER` for hashes
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for transactional delivery
- verified SCRUB sender identity and reply behavior

## Launch smoke checklist

- [ ] Start team and solo assessments in English and Spanish
- [ ] Refresh/resume, complete, and view full report and roadmap before contact capture
- [ ] Request link, receive bilingual HTML/plain-text email, verify 60-day copy, and open frozen result
- [ ] Resend and confirm the previous token is rejected
- [ ] Verify invalid and expired links show the same safe message
- [ ] Submit interested and not-now preferences; confirm no account/company/trial/payment is created
- [ ] Disable feature flag: new entry CTA/start is unavailable while an existing return link still opens
- [ ] Confirm capabilities never enter URLs and raw return tokens are absent from database rows/logging added by this feature
- [ ] Confirm rate limits for starts, writes, delivery, return verification, and events
- [ ] Test narrow mobile, desktop, zoom, keyboard-only flow, focus recovery, screen-reader labels, and contrast

Email delivery cannot be exercised without production-like Resend credentials. Before launch, send both language variants to controlled inboxes and verify sender identity, plain text, CTA URL, expiration copy, delivery status, rotation, and failure recovery.
