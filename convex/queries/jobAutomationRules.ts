import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireStaffCompany } from "../lib/sessionAuth";

export const getByProperty = query({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== args.companyId) throw new Error("Access denied");

    return await ctx.db
      .query("jobAutomationRules")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .first();
  },
});
