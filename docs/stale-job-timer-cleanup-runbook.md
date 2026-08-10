# One-Time Stale Job Timer Cleanup

Run this only after the hotfix has been deployed to the production Convex deployment. It is a manual, one-time operation; there is no recurring cleanup or automatic timeout.

Choose a conservative cutoff timestamp at least 24 hours old and identify the target company ID. Preview candidates first:

```bash
npx convex run --prod staleJobTimersInternal:preview '{"companyId":"<company_id>","cutoffBefore":<unix_timestamp_ms>}'
```

Review every returned job ID against production operations. Current work and any ambiguous candidate should be omitted. Close only the explicitly confirmed IDs, using the same company and cutoff:

```bash
npx convex run --prod staleJobTimersInternal:closeConfirmed '{"companyId":"<company_id>","cutoffBefore":<unix_timestamp_ms>,"jobIds":["<job_id_1>","<job_id_2>"]}'
```

Run the preview again with the same arguments. Confirm that the selected IDs are absent and that current legitimate jobs remain. A retry is safe: already-closed or no-longer-eligible IDs are returned in `skipped`.

The cleanup preserves `startedAt`, closes an open pause at the cleanup execution timestamp, retains pause history, and writes `timerStoppedAt`. Because no truthful historical end time exists, the cleanup execution timestamp is the recorded administrative closure time. It does not mark the job completed, approved, or cancelled.
