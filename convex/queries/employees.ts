import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireStaffCompany } from "../lib/sessionAuth";

export const list = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

    return await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const getByInviteToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Public endpoint for invite acceptance page - no auth required
    const user = await ctx.db
      .query("users")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.token))
      .first();
    if (!user) return null;
    const company = user.companyId ? await ctx.db.get(user.companyId) : null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      companyName: company?.name ?? "",
    };
  },
});

export const getCleaners = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users.filter((u) => u.role === "cleaner" && u.status === "active");
  },
});

export const getManagers = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users.filter((u) => u.role === "manager" && u.status === "active");
  },
});

export const getMaintenanceWorkers = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users.filter((u) => u.role === "maintenance" && u.status === "active");
  },
});
