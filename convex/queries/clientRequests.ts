import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

/**
 * List all client requests for a company.
 * Requires authenticated user who belongs to the company.
 */
export const getCompanyRequests = query({
  args: {
    companyId: v.id("companies"),
    userId: v.optional(v.id("users")),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("accepted"),
        v.literal("declined"),
        v.literal("converted")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.companyId !== args.companyId) {
      throw new Error("Access denied");
    }

    if (args.status) {
      return await ctx.db
        .query("clientRequests")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId).eq("status", args.status!)
        )
        .collect();
    }

    return await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

/**
 * Get a single client request by ID.
 * Requires authenticated user who belongs to the request's company.
 */
export const getRequestById = query({
  args: {
    id: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);

    const request = await ctx.db.get(args.id);
    if (!request) return null;

    if (request.companyId !== user.companyId) {
      throw new Error("Access denied");
    }

    return request;
  },
});
