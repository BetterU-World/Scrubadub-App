"use node";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperadminSession } from "../lib/sessions";

/** Retired creation endpoint. Historical completion is handled separately. */
export const payPayoutBatchViaStripe = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    batchId: v.id("affiliatePayoutBatches"),
  },
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);
    return retireLegacyOutgoing();
  },
});
