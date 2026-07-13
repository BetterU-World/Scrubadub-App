import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { logAudit } from "../lib/helpers";
import { requireOwnerSession } from "../lib/sessionAuth";
import { revokeAllSessionsForPrincipal } from "../lib/sessionRevocation";
import { writeSecurityEvent } from "../lib/securityEvents";

// inviteCleaner and acceptInvite have been moved to convex/employeeActions.ts
// for secure token generation (crypto.randomBytes).

export const updateEmployeeStatus = mutation({
  args: {
    employeeId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("inactive")),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const target = await ctx.db.get(args.employeeId);
    if (!target) throw new Error("User not found");
    if (target.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.employeeId, { status: args.status });
    if (args.status === "inactive" && target.status !== "inactive") {
      await revokeAllSessionsForPrincipal(ctx, { principalType: "staff", userId: target._id }, Date.now(), "account_disabled");
    }
    if (target.status !== args.status) await writeSecurityEvent(ctx, {
      eventType: args.status === "active" ? "account_reactivated" : "account_disabled",
      principalType: "staff", staffUserId: target._id, companyId: owner.companyId, outcome: "success",
      metadata: { previousStatus: target.status, newStatus: args.status, source: "employee_status" },
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: args.status === "active" ? "activate_employee" : "deactivate_employee",
      entityType: "user",
      entityId: args.employeeId,
    });
  },
});

/** Owner-only: update manager permission flags on a manager user. */
export const updateManagerPermissions = mutation({
  args: {
    employeeId: v.id("users"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    canSeeAllJobs: v.boolean(),
    canCreateJobs: v.boolean(),
    canAssignCleaners: v.boolean(),
    canRequestRework: v.boolean(),
    canApproveForms: v.boolean(),
    canManageSchedule: v.boolean(),
    canResolveRedFlags: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const target = await ctx.db.get(args.employeeId);
    if (!target) throw new Error("User not found");
    if (target.companyId !== owner.companyId) throw new Error("Access denied");
    if (target.role !== "manager") throw new Error("User is not a manager");

    await ctx.db.patch(args.employeeId, {
      canSeeAllJobs: args.canSeeAllJobs,
      canCreateJobs: args.canCreateJobs,
      canAssignCleaners: args.canAssignCleaners,
      canRequestRework: args.canRequestRework,
      canApproveForms: args.canApproveForms,
      canManageSchedule: args.canManageSchedule,
      canResolveRedFlags: args.canResolveRedFlags,
    });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: "update_manager_permissions",
      entityType: "user",
      entityId: args.employeeId,
      details: JSON.stringify({
        canSeeAllJobs: args.canSeeAllJobs,
        canCreateJobs: args.canCreateJobs,
        canAssignCleaners: args.canAssignCleaners,
        canRequestRework: args.canRequestRework,
        canApproveForms: args.canApproveForms,
        canManageSchedule: args.canManageSchedule,
        canResolveRedFlags: args.canResolveRedFlags,
      }),
    });
  },
});
