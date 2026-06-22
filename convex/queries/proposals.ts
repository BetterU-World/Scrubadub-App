import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

/**
 * Get the proposal for a client request.
 * Owner-only; verifies the request and proposal belong to the caller's company.
 */
export const getProposalByClientRequest = query({
  args: {
    userId: v.id("users"),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.clientRequestId);
    if (!request) return null;
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    const proposal = await ctx.db
      .query("proposals")
      .withIndex("by_clientRequestId", (q) =>
        q.eq("clientRequestId", args.clientRequestId)
      )
      .first();

    if (!proposal) return null;
    if (proposal.companyId !== owner.companyId) throw new Error("Access denied");

    return proposal;
  },
});
