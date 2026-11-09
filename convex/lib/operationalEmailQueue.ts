import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { emailEventKey, type OperationalEmailEvent } from "./operationalEmailModel";

/** Unique creation and scheduling share the producer's transaction. No historical scans. */
export async function ensureOperationalEmail(ctx: MutationCtx, event: OperationalEmailEvent,
  schedule?: (id: Id<"operationalEmailDeliveries">) => Promise<Id<"_scheduled_functions">>) {
  const eventKey = emailEventKey(event);
  const existing = await ctx.db.query("operationalEmailDeliveries")
    .withIndex("by_company_event_recipient", q => q.eq("companyId", event.companyId)
      .eq("eventKey", eventKey).eq("recipientId", event.recipientId)).unique();
  if (existing) return existing._id;
  const now = Date.now();
  const id = await ctx.db.insert("operationalEmailDeliveries", { companyId: event.companyId, jobId: event.jobId,
    recipientId: event.recipientId, eventKey, event, state: "pending", attemptCount: 0, attempts: [],
    createdAt: now, updatedAt: now, nextAttemptAt: now });
  if (schedule) await ctx.db.patch(id, { scheduledFunctionId: await schedule(id) });
  return id;
}
