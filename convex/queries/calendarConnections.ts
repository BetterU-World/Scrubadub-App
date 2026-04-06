import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess } from "../lib/auth";

export const listByProperty = query({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    return await ctx.db
      .query("calendarConnections")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();
  },
});
