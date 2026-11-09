import { v, type Infer } from "convex/values";
import { completionContext, approvalContext } from "./jobReviewEmailContext";

export const assignmentEvent = v.object({ kind: v.literal("assignment"), companyId: v.id("companies"),
  jobId: v.id("jobs"), recipientId: v.id("users"), revision: v.number() });
export const completionEvent = v.object({ kind: v.literal("completion"), ...completionContext.fields });
export const approvalEvent = v.object({ kind: v.literal("approval"), ...approvalContext.fields });
export const operationalEmailEvent = v.union(assignmentEvent, completionEvent, approvalEvent);
export type OperationalEmailEvent = Infer<typeof operationalEmailEvent>;

export const deliveryState = v.union(v.literal("pending"), v.literal("claimed"), v.literal("provider_accepted"),
  v.literal("failed"), v.literal("unknown"), v.literal("skipped"));
export const errorCategory = v.union(v.literal("rate_limited"), v.literal("pre_send_unavailable"),
  v.literal("configuration"), v.literal("provider_rejected"), v.literal("provider_uncertain"),
  v.literal("claim_expired"), v.literal("ineligible"), v.literal("retry_window_expired"));
export const sendOutcome = v.union(
  v.object({ status: v.literal("provider_accepted"), providerMessageId: v.optional(v.string()) }),
  v.object({ status: v.literal("failed"), category: v.union(v.literal("rate_limited"),
    v.literal("pre_send_unavailable"), v.literal("configuration"), v.literal("provider_rejected")) }),
  v.object({ status: v.literal("unknown"), category: v.literal("provider_uncertain") }),
  v.object({ status: v.literal("skipped"), category: v.literal("ineligible") }),
);
export type OperationalEmailOutcome = Infer<typeof sendOutcome>;
export const attemptSummary = v.object({ number: v.number(), claimedAt: v.number(), finishedAt: v.optional(v.number()),
  state: deliveryState, category: v.optional(errorCategory), providerMessageId: v.optional(v.string()) });

export const MAX_EMAIL_ATTEMPTS = 4;
export const EMAIL_CLAIM_MS = 10 * 60_000;
export const EMAIL_RECOVERY_WINDOW_MS = 60 * 60_000;
export const EMAIL_RECOVERY_BATCH = 25;
export function retryDelay(attempt: number, id: string) {
  const jitter = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 30_001;
  return [60_000, 300_000, 900_000][attempt - 1] + jitter;
}
export function emailEventKey(event: OperationalEmailEvent) {
  switch (event.kind) {
    case "assignment": return JSON.stringify([event.kind, event.jobId, event.revision]);
    case "completion": return JSON.stringify([event.kind, event.jobId, event.formId, event.completedAt, event.executionSequence]);
    case "approval": return JSON.stringify([event.kind, event.jobId, event.formId, event.approvedAt, event.reworkCount, event.executionSequence ?? null]);
  }
}
