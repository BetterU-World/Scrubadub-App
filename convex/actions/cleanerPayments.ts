"use node";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessions";



/** Retired creation endpoint. Historical completion is handled separately. */
export const createCleanerPaymentCheckout = action({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    cleanerPaymentId: v.id("cleanerPayments"),
  },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const principal = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const data = await ctx.runQuery(internal.queries.cleanerPayments.getCleanerPaymentForCheckout, { cleanerPaymentId: args.cleanerPaymentId });
    if (!data || data.companyId !== principal.companyId) throw new Error("Access denied");
    return retireLegacyOutgoing();
  },
});
