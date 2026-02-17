import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const createCompany = internalMutation({
  args: { name: v.string(), timezone: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert("companies", args);
  },
});

export const createUser = internalMutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    companyId: v.id("companies"),
    role: v.union(v.literal("owner"), v.literal("cleaner")),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending")
    ),
    inviteTokenHash: v.optional(v.string()),
    inviteTokenExpiry: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", args);
  },
});

export const updatePasswordHash = internalMutation({
  args: { userId: v.id("users"), passwordHash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { passwordHash: args.passwordHash });
  },
});

export const setResetToken = internalMutation({
  args: {
    userId: v.id("users"),
    resetTokenHash: v.string(),
    resetTokenExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      resetTokenHash: args.resetTokenHash,
      resetTokenExpiry: args.resetTokenExpiry,
      // Clear legacy field
      resetToken: undefined,
    });
  },
});

export const getUserByResetTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_resetTokenHash", (q) =>
        q.eq("resetTokenHash", args.tokenHash)
      )
      .first();
  },
});

export const consumeResetToken = internalMutation({
  args: { userId: v.id("users"), passwordHash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
      resetTokenHash: undefined,
      resetTokenExpiry: undefined,
      resetToken: undefined,
    });
  },
});

export const getUserByInviteTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_inviteTokenHash", (q) =>
        q.eq("inviteTokenHash", args.tokenHash)
      )
      .first();
  },
});

export const consumeInviteToken = internalMutation({
  args: { userId: v.id("users"), passwordHash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
      status: "active",
      inviteTokenHash: undefined,
      inviteTokenExpiry: undefined,
      inviteToken: undefined,
    });
  },
});

export const setInviteToken = internalMutation({
  args: {
    userId: v.id("users"),
    inviteTokenHash: v.string(),
    inviteTokenExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      inviteTokenHash: args.inviteTokenHash,
      inviteTokenExpiry: args.inviteTokenExpiry,
      inviteToken: undefined,
    });
  },
});

const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export const checkSubscription = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) throw new Error("Company not found");
    const status = company.subscriptionStatus;
    if (!status) return; // no subscription → allow
    if (status === "active" || status === "trialing") return;
    if (status === "past_due") {
      const periodEnd = company.currentPeriodEnd ?? 0;
      if (Date.now() < periodEnd + PAST_DUE_GRACE_MS) return;
    }
    throw new Error("Subscription inactive. Please update billing to continue.");
  },
});

export const upsertSubscription = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.string(),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();
    if (!company) {
      console.warn(`No company found for Stripe customer ${args.stripeCustomerId}`);
      return;
    }
    await ctx.db.patch(company._id, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      subscriptionStatus: args.status as any,
      currentPeriodEnd: args.currentPeriodEnd,
      subscriptionUpdatedAt: Date.now(),
    });
  },
});

export const logAuditEntry = internalMutation({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", { ...args, timestamp: Date.now() });
  },
});
