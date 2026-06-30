import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/** Verify a user is an active owner of the given company. */
export const verifyOwner = internalQuery({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.status !== "active" || user.role !== "owner") {
      return false;
    }
    return user.companyId === args.companyId;
  },
});
