import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { isFounderEmail } from "./lib/founderEmails";

export const getUser = internalQuery({
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
      referralCode: user.referralCode,
      referredByCode: user.referredByCode,
      isSuperadmin: isFounderEmail(user.email),
      // Manager permission flags (only meaningful when role === "manager")
      canSeeAllJobs: user.canSeeAllJobs,
      canCreateJobs: user.canCreateJobs,
      canAssignCleaners: user.canAssignCleaners,
      canRequestRework: user.canRequestRework,
      canApproveForms: user.canApproveForms,
      canManageSchedule: user.canManageSchedule,
      canResolveRedFlags: user.canResolveRedFlags,
    };
  },
});