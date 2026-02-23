import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

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

/**
 * Update the status of a client request.
 * Auth-gated: caller must be an owner in the same company as the request.
 */
export const updateRequestStatus = mutation({
  args: {
    requestId: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
    status: v.union(v.literal("declined"), v.literal("converted")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Request not found");
    }
    if (request.companyId !== owner.companyId) {
      throw new Error("Access denied");
    }

    await ctx.db.patch(args.requestId, { status: args.status });
  },
});

/**
 * Create a property from a client request's propertySnapshot.
 * Auth-gated: caller must be an owner in the same company as the request.
 * No-op if the request already has a propertyId.
 */
export const createPropertyFromRequest = mutation({
  args: {
    requestId: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.companyId !== owner.companyId) throw new Error("Access denied");

    // No-op if already linked
    if (request.propertyId) return request.propertyId;

    const snap = request.propertySnapshot ?? {};
    const address = snap.address || "Address pending";

    const propertyId = await ctx.db.insert("properties", {
      companyId: request.companyId,
      name: snap.name || address,
      type: "residential" as const,
      address,
      amenities: [],
      active: true,
      ownerNotes: snap.notes || undefined,
    });

    await ctx.db.patch(args.requestId, { propertyId });

    return propertyId;
  },
});
