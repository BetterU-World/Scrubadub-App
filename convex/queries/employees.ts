import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireStaffCompany } from "../lib/sessionAuth";
import { hashTokenForLookup } from "../lib/tokenHash";

function toEmployeeDirectoryEntry(user: Doc<"users">) {
  return {
    _id: user._id,
    _creationTime: user._creationTime,
    email: user.email,
    name: user.name,
    companyId: user.companyId,
    role: user.role,
    status: user.status,
    phone: user.phone,
    canSeeAllJobs: user.canSeeAllJobs,
    canCreateJobs: user.canCreateJobs,
    canAssignCleaners: user.canAssignCleaners,
    canRequestRework: user.canRequestRework,
    canApproveForms: user.canApproveForms,
    canManageSchedule: user.canManageSchedule,
    canResolveRedFlags: user.canResolveRedFlags,
  };
}

export const list = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users.map(toEmployeeDirectoryEntry);
  },
});

export const getByInviteToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Public endpoint for invite acceptance page - no auth required
    const tokenHash = await hashTokenForLookup(args.token);
    const hashedUser = await ctx.db
      .query("users")
      .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", tokenHash))
      .first();
    // Compatibility for already-issued invitations only. Their existing expiry
    // bounds the fallback while newly-issued invitations store only a digest.
    const user = hashedUser ?? await ctx.db
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
    return users
      .filter((u) => u.role === "cleaner" && u.status === "active")
      .map(toEmployeeDirectoryEntry);
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
    return users
      .filter((u) => u.role === "manager" && u.status === "active")
      .map(toEmployeeDirectoryEntry);
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
    return users
      .filter((u) => u.role === "maintenance" && u.status === "active")
      .map(toEmployeeDirectoryEntry);
  },
});
