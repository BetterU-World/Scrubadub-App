"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { OperationalEmailOutcome } from "./lib/operationalEmailModel";
import { deliverJobAssignedEmail, deliverJobCompletedEmail, deliverJobApprovedEmail } from "./lib/email";

export const dispatch = internalAction({
  args: { deliveryId: v.id("operationalEmailDeliveries") }, returns: v.null(),
  handler: async (ctx, { deliveryId }) => {
    const claimed = await ctx.runMutation(internal.operationalEmailDelivery.claim, { deliveryId });
    if (!claimed) return null;
    const { event, attemptNumber } = claimed;
    const finish = (outcome: OperationalEmailOutcome) => ctx.runMutation(internal.operationalEmailDelivery.finish,
      { deliveryId, attemptNumber, outcome });
    // No external call has occurred if these reads fail. All recipients/details are re-read on every attempt.
    let send: () => Promise<OperationalEmailOutcome>;
    try {
      if (event.kind === "assignment") {
        const state = await ctx.runQuery(internal.jobAssignmentNotifications.assignmentEmailState,
          { jobId: event.jobId, workerId: event.recipientId, revision: event.revision, companyId: event.companyId });
        if (!state) { await finish({ status: "skipped", category: "ineligible" }); return null; }
        send = () => deliverJobAssignedEmail(state.email, state.propertyName, state.scheduledDate, state.startTime,
          { companyName: state.companyName, replyTo: state.replyTo });
      } else if (event.kind === "completion") {
        const { kind: _kind, ...context } = event;
        const state = await ctx.runQuery(internal.jobReviewNotifications.completionEmailState, context);
        if (!state) { await finish({ status: "skipped", category: "ineligible" }); return null; }
        send = () => deliverJobCompletedEmail(state.email, state.propertyName, state.cleanerName, state.completedAt,
          { companyName: state.companyName, replyTo: state.replyTo });
      } else {
        const { kind: _kind, ...context } = event;
        const state = await ctx.runQuery(internal.jobReviewNotifications.approvalEmailState, context);
        if (!state) { await finish({ status: "skipped", category: "ineligible" }); return null; }
        send = () => deliverJobApprovedEmail(state.email, state.propertyName,
          { companyName: state.companyName, replyTo: state.replyTo });
      }
    } catch {
      await finish({ status: "failed", category: "pre_send_unavailable" });
      return null;
    }
    if (!await ctx.runMutation(internal.operationalEmailDelivery.beginSend, { deliveryId, attemptNumber })) return null;
    let outcome: OperationalEmailOutcome;
    try { outcome = await send(); }
    catch { outcome = { status: "unknown", category: "provider_uncertain" }; }
    // If persistence fails after the external call, leave the claim for conservative unknown recovery.
    // Never catch this and turn it into a retryable pre-send failure.
    await finish(outcome);
    return null;
  },
});
