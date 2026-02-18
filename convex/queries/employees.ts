import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireOwner } from "../lib/helpers";

export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
    return await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
      .collect();
  },
});

// Public query for invite acceptance flow - no auth required
// Only returns safe, non-sensitive fields
export const getByInviteToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.token))
      .first();
    if (!user) return null;
    const company = await ctx.db.get(user.companyId);
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      status: user.status,
      companyName: company?.name ?? "",
    };
  },
});

export const getCleaners = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", user.companyId))
      .collect();
    return users.filter((u) => u.role === "cleaner" && u.status === "active");
  },
});
