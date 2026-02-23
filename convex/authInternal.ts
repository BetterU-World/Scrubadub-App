import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { slugify, SLUG_RE, RESERVED_SLUGS, randomSuffix } from "./lib/slugs";

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
    const companyId = await ctx.db.insert("companies", args);

    // Auto-provision a default mini-site for the new company
    const existing = await ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .first();

    if (!existing) {
      const slug = await generateUniqueSlug(ctx, args.name);
      await ctx.db.insert("companySites", {
        companyId,
        slug,
        templateId: "A",
        brandName: args.name,
        bio: "",
        serviceArea: "",
      });
    }

    return companyId;
  },
});

/**
 * Generate a unique slug from a company name.
 * Tries the base slug first, then appends random suffixes.
 * Falls back to a fully random slug after 10 attempts.
 */
async function generateUniqueSlug(
  ctx: { db: any },
  name: string
): Promise<string> {
  const base = slugify(name);

  // Ensure base meets minimum length (3 chars)
  const safeBase = base.length >= 3 ? base : `co-${base || randomSuffix(4)}`;

  const candidates: string[] = [safeBase];
  for (let i = 0; i < 9; i++) {
    const suffix = randomSuffix(4);
    const candidate = `${safeBase}-${suffix}`.slice(0, 50);
    candidates.push(candidate);
  }
  // Last resort: fully random
  candidates.push(randomSuffix(8));

  for (const slug of candidates) {
    if (!SLUG_RE.test(slug)) continue;
    if (RESERVED_SLUGS.has(slug)) continue;

    const taken = await ctx.db
      .query("companySites")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first();

    if (!taken) return slug;
  }

  // Should never reach here, but safety fallback
  return `site-${randomSuffix(8)}`;
}

export const createUser = internalMutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    companyId: v.id("companies"),
    role: v.union(v.literal("owner"), v.literal("cleaner"), v.literal("maintenance")),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending")
    ),
    inviteToken: v.optional(v.string()),
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
    resetToken: v.string(),
    resetTokenExpiry: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      resetToken: args.resetToken,
      resetTokenExpiry: args.resetTokenExpiry,
    });
  },
});

export const getUserByresetToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_resetToken", (q) => q.eq("resetToken", args.tokenHash))
      .first();
  },
});

export const consumeResetToken = internalMutation({
  args: { userId: v.id("users"), passwordHash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
      resetToken: undefined,
      resetTokenExpiry: undefined,
    });
  },
});

export const getUserByinviteToken = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.tokenHash))
      .first();
  },
});

export const consumeInviteToken = internalMutation({
  args: { userId: v.id("users"), passwordHash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
      status: "active",
      inviteToken: undefined,
    });
  },
});

export const setInviteToken = internalMutation({
  args: {
    userId: v.id("users"),
    inviteToken: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      inviteToken: args.inviteToken,
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
      console.warn(
        `No company found for Stripe customer ${args.stripeCustomerId}`
      );
      return;
    }
    await ctx.db.patch(company._id, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      subscriptionStatus: args.status as any,
      currentPeriodEnd: args.currentPeriodEnd,
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