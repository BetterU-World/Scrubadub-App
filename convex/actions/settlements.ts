"use node";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessions";


/** Retired creation endpoint. Historical completion is handled separately. */

/** Retired creation endpoint. Historical completion is handled separately. */
export const createSettlementPayCheckout = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    settlementId: v.id("companySettlements"),
  },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const data = await ctx.runQuery(internal.queries.settlements.getSettlementForPayment, { settlementId: args.settlementId });
    if (!data || data.fromCompanyId !== principal.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});

/** Retired creation endpoint. Historical completion is handled separately. */
export const createSettlementBatchCheckout = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    batchId: v.id("settlementBatches"),
  },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const data = await ctx.runQuery(internal.queries.settlements.getSettlementBatchForPayment, { batchId: args.batchId });
    if (!data || data.fromCompanyId !== principal.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});
