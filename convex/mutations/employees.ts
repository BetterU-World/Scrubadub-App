import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit } from "../lib/helpers";

// inviteCleaner and acceptInvite have been moved to convex/employeeActions.ts
// for secure token generation (crypto.randomBytes).

export const updateEmployeeStatus = mutation({
  args: {
    employeeId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("inactive")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const target = await ctx.db.get(args.employeeId);
    if (!target) throw new Error("User not found");
    if (target.companyId !== owner.companyId) throw new Error("Access denied");

    await ctx.db.patch(args.employeeId, { status: args.status });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: args.status === "active" ? "activate_employee" : "deactivate_employee",
      entityType: "user",
      entityId: args.employeeId,
    });
  },
});
