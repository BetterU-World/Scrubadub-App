# Assessment recovery emergency repair

## Cause and scope

Recovery called `changeLanguage` inside an effect depending on `t`. A
`languageChanged` event replaces `t`, including on a same-language request in the
installed libraries, restarting prepare/recover/events/report/roadmap. The repair
initializes once per mounted page session, defers work past Strict Mode's effect
replay, synchronizes language only when different, cancels stale continuations,
coalesces navigation/completion, and reuses existing snapshots.

This confirms a code defect matching the reported function sequence. Attribution
of all 10.81 GB remains unverified. No production telemetry was collected here.

## Backend protection

Recovery, report generation (including cached returns), and roadmap generation
share 30 admitted requests per attempt per 10-minute fixed window. Normal cached
recovery uses one request; a legacy full recovery uses three. Admission reads only
an indexed, small `rateLimits` record before any attempt/snapshot/definition reads.
Charging occurs only after capability verification. Invalid/nonexistent attempts
create no budget records. Rejections write nothing. A successful admitted request
inserts or updates one reusable row, so growth is at most one row per valid attempt
using these endpoints. Convex transactions/OCC serialize concurrent admissions.

The key is the attempt ID, not IP or a global key. Separate users/attempts do not
contend on one counter, while tabs sharing an attempt share its budget. Existing
generation idempotency and capability checks remain in place. No schema changes.
Recovery throttling throws outside the legacy null/unavailable catch, so old
clients stop their pipeline rather than clear saved progress.

This is containment for the observed valid-attempt loop, not a general abuse
firewall. Rejected calls still incur one small indexed read. Prepare and unrelated
endpoints retain their existing behavior. Extreme repeated reloads of the same
attempt can be throttled for up to 10 minutes. Existing broad admin/operational
queries and the legacy return-link limiter remain separate follow-up work.

## Restoration (operator steps; not executed by this task)

1. Review and merge the draft PR through the normal approval process. Keep
   assessment traffic contained until both backend and frontend repairs are live.
2. **A Convex production deployment is required.** A frontend-only release cannot
   protect already-open old tabs. Deploy the reviewed Convex functions to
   `canny-spider-91` using the established production workflow and verified
   production credentials. Do not run `npm run build` just to validate locally:
   that root script invokes `convex deploy`. `npm run build:frontend` is local only.
3. Publish the repaired frontend through the established hosting workflow. No
   environment, authentication, billing, subscription, or schema changes are needed.
4. If suspension prevents a function deployment, coordinate a controlled
   restoration with Convex support/the existing dashboard workflow so backend
   protection is installed as soon as execution is available. Do not assume a new
   frontend disables old tabs. Do not change billing or delete data as part of this
   repair. A code fix does not reset an exhausted monthly usage allowance.
5. Verify a fresh assessment, in-progress recovery, completed cached recovery,
   missing-snapshot generation, giveaway completion, secure return link, and
   English/Spanish switching. Leave assessment pages idle and confirm their
   initialization calls stop. Reload an old client repeatedly and confirm budget
   rejection without clearing saved progress.
6. Monitor function invocation rates and database read bytes. Compare assessment
   endpoints with assessment admin, dashboard, financial, commercial, and calendar
   queries. If retained execution metrics exist, group read bytes by function and
   minute; examine scheduler/run reasons and OCC retries. Do not infer full byte
   attribution from function names or deduplicated analytics events alone.

Do not restore the unguarded backend as a rollback while old tabs may still loop.
Keep containment in place if validation fails. This repair has not been deployed
or exercised against production; local tests cannot establish actual production
byte totals or distributed OCC behavior.
