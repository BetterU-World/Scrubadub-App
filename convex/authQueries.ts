import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { isFounderEmail } from "./lib/founderEmails";
import { requireVerifiedStaffSession } from "./lib/sessionAuth";
import { SESSION_REQUIRED_ERROR } from "./lib/sessionConstants";

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
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    let user;
    try {
      user = await requireVerifiedStaffSession(ctx, args.sessionToken);
    } catch (error) {
      // Hydration fails closed without crashing the authenticated app shell.
      if (error instanceof Error && error.message === SESSION_REQUIRED_ERROR) return null;
      throw error;
    }
    const company = user.companyId ? await ctx.db.get(user.companyId) : null;
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
      canManageBusinessConfiguration: user.canManageBusinessConfiguration,
    };
  },
});
