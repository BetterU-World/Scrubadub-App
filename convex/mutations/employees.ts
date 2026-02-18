import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit } from "../lib/helpers";

export const inviteCleaner = mutation({
  args: {
    sessionToken: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
    const companyId = owner.companyId;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
    if (existing) throw new Error("Email already registered");

    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

    const userId = await ctx.db.insert("users", {
      email: args.email.toLowerCase(),
      passwordHash: "",
      name: args.name,
      companyId,
      role: "cleaner",
      status: "pending",
      inviteToken: token,
    });

    await logAudit(ctx, {
      companyId,
      userId: owner._id,
      action: "invite_cleaner",
      entityType: "user",
      entityId: userId,
      details: `Invited ${args.email}`,
    });

    return { token, userId };
  },
});

// acceptInvite moved to authActions.ts (requires bcrypt for password hashing)

export const updateEmployeeStatus = mutation({
  args: {
    sessionToken: v.string(),
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.sessionToken);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");
    if (target.companyId !== owner.companyId) throw new Error("Not your company");

    await ctx.db.patch(args.userId, { status: args.status });

    await logAudit(ctx, {
      companyId: owner.companyId,
      userId: owner._id,
      action: args.status === "active" ? "activate_employee" : "deactivate_employee",
      entityType: "user",
      entityId: args.userId,
    });
  },
});
