import { query } from "./_generated/server";
import { v } from "convex/values";

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      status: user.status,
      phone: user.phone,
    };
  },
});

export const getCurrentUser = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return null;
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const company = await ctx.db.get(user.companyId);
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: company?.name ?? "",
      status: user.status,
      phone: user.phone,
    };
  },
});