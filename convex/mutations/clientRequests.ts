import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Public mutation – called by external visitors via a company's public
 * booking-request link.  No authentication required; the company is
 * resolved server-side from the token.  companyId is NEVER accepted
 * from the client.
 */
export const createClientRequestByToken = mutation({
  args: {
    token: v.string(),
    requesterName: v.string(),
    requesterEmail: v.string(),
    requesterPhone: v.optional(v.string()),
    propertySnapshot: v.optional(
      v.object({
        name: v.optional(v.string()),
        address: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
    requestedDate: v.optional(v.string()),
    requestedStart: v.optional(v.string()),
    requestedEnd: v.optional(v.string()),
    timeWindow: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Resolve company from token – never trust a client-supplied companyId
    const company = await ctx.db
      .query("companies")
      .withIndex("by_publicRequestToken", (q) =>
        q.eq("publicRequestToken", args.token)
      )
      .first();

    if (!company) {
      throw new Error("Invalid request link");
    }

    const requestId = await ctx.db.insert("clientRequests", {
      companyId: company._id,
      createdAt: Date.now(),
      status: "new",
      requesterName: args.requesterName,
      requesterEmail: args.requesterEmail,
      requesterPhone: args.requesterPhone,
      propertySnapshot: args.propertySnapshot ?? {},
      requestedDate: args.requestedDate,
      requestedStart: args.requestedStart,
      requestedEnd: args.requestedEnd,
      timeWindow: args.timeWindow,
      notes: args.notes,
      source: "public_link",
    });

    return requestId;
  },
});
