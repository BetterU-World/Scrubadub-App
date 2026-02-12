import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner, logAudit, createNotification } from "../lib/helpers";

export const inviteCleaner = mutation({
  args: {
    companyId: v.id("companies"),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (owner.companyId !== args.companyId) throw new Error("Not your company");

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
      companyId: args.companyId,
      role: "cleaner",
      status: "pending",
      inviteToken: token,
    });

    await logAudit(ctx, {
      companyId: args.companyId,
      userId: owner._id,
      action: "invite_cleaner",
      entityType: "user",
      entityId: userId,
      details: `Invited ${args.email}`,
    });

    return { token, userId };
  },
});

export const acceptInvite = mutation({
  args: {
    token: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.token))
      .first();
    if (!user) throw new Error("Invalid invite link");
    if (user.status !== "pending") throw new Error("Invite already used");

    // Simple hash matching auth.ts
    let hash = 0;
    for (let i = 0; i < args.password.length; i++) {
      const char = args.password.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const passwordHash = `sh_${Math.abs(hash).toString(36)}_${args.password.length}`;

    await ctx.db.patch(user._id, {
      passwordHash,
      status: "active",
      inviteToken: undefined,
    });

    await logAudit(ctx, {
      companyId: user.companyId,
      userId: user._id,
      action: "accept_invite",
      entityType: "user",
      entityId: user._id,
    });

    return {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };
  },
});

export const updateEmployeeStatus = mutation({
  args: {
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
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
