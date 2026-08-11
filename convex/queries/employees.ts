import { query } from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { requireStaffCompany } from "../lib/sessionAuth";
import { hasOwnerOrManagerPermission } from "../lib/auth";
import { hashTokenForLookup } from "../lib/tokenHash";

function toEmployeeDirectoryEntry(user: Doc<"users">, includeManagerPermissions = true) {
  const invitationStatus = user.invitationStatus === "revoked"
    ? "revoked"
    : user.invitationStatus === "accepted" || user.status === "active"
      ? "accepted"
      : user.status === "pending" && user.inviteTokenExpiry && user.inviteTokenExpiry < Date.now()
        ? "expired"
        : user.status === "pending"
          ? "pending"
          : undefined;
  return {
    _id: user._id,
    _creationTime: user._creationTime,
    email: user.email,
    name: user.name,
    companyId: user.companyId,
    role: user.role,
    status: user.status,
    invitationStatus,
    phone: user.phone,
    ...(includeManagerPermissions ? {
      canSeeAllJobs: user.canSeeAllJobs,
      canCreateJobs: user.canCreateJobs,
      canAssignCleaners: user.canAssignCleaners,
      canRequestRework: user.canRequestRework,
      canApproveForms: user.canApproveForms,
      canManageSchedule: user.canManageSchedule,
      canResolveRedFlags: user.canResolveRedFlags,
      canManageBusinessConfiguration: user.canManageBusinessConfiguration,
      canManageClients: user.canManageClients,
      canManageSalesAndCommercial: user.canManageSalesAndCommercial,
      canManageTeam: user.canManageTeam,
      canViewFinancials: user.canViewFinancials,
      canManageInvoices: user.canManageInvoices,
      canManageDocuments: user.canManageDocuments,
      canViewAnalytics: user.canViewAnalytics,
    } : {}),
  };
}

async function requireAssignmentDirectory(ctx: any, args: { sessionToken: string; companyId: any; userId: any }) {
  const user = await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);
  if (!hasOwnerOrManagerPermission(user, "canAssignCleaners") &&
      !hasOwnerOrManagerPermission(user, "canManageTeam")) {
    throw new Error("Worker assignment or team management permission required");
  }
  return user;
}

export const list = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAssignmentDirectory(ctx, args);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users.map((user) => toEmployeeDirectoryEntry(user, actor.role === "owner"));
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
    if (!user) return { state: "invalid" as const };
    if (user.invitationStatus === "revoked") return { state: "revoked" as const };
    if (user.invitationStatus === "accepted" || user.status === "active") {
      return { state: "accepted" as const };
    }
    if (!user.inviteTokenExpiry) return { state: "invalid" as const };
    if (user.inviteTokenExpiry < Date.now()) return { state: "expired" as const };
    if (user.status !== "pending") return { state: "invalid" as const };
    const company = user.companyId ? await ctx.db.get(user.companyId) : null;
    return {
      state: "valid" as const,
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
      .map((user) => toEmployeeDirectoryEntry(user));
  },
});

/** Active staff who may be explicitly assigned to perform a cleaning job. */
export const getJobAssignees = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAssignmentDirectory(ctx, args);
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users
      .filter((user) => user.status === "active" && ["cleaner", "manager", "owner"].includes(user.role))
      .map((user) => toEmployeeDirectoryEntry(user));
  },
});

export const getManagers = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAssignmentDirectory(ctx, args);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users
      .filter((u) => u.role === "manager" && u.status === "active")
      .map((user) => toEmployeeDirectoryEntry(user));
  },
});

export const getWalkthroughAssignees = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users
      .filter((u) =>
        u.status === "active" && (u.role === "owner" || u.role === "manager")
      )
      .map((user) => toEmployeeDirectoryEntry(user));
  },
});

export const getMaintenanceWorkers = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAssignmentDirectory(ctx, args);

    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return users
      .filter((u) => u.role === "maintenance" && u.status === "active")
      .map((user) => toEmployeeDirectoryEntry(user));
  },
});
