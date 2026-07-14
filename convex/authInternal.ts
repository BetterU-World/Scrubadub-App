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
    role: v.union(v.literal("owner"), v.literal("cleaner"), v.literal("maintenance"), v.literal("manager")),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("pending")
    ),
    inviteTokenHash: v.optional(v.string()),
    inviteTokenExpiry: v.optional(v.float64()),
    // Manager permission flags
    canSeeAllJobs: v.optional(v.boolean()),
    canCreateJobs: v.optional(v.boolean()),
    canAssignCleaners: v.optional(v.boolean()),
    canRequestRework: v.optional(v.boolean()),
    canApproveForms: v.optional(v.boolean()),
    canManageSchedule: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", args);
  },
});

const companyTierValidator = v.union(
  v.literal("cleaning_owner"),
  v.literal("str_owner"),
  v.literal("scrub_solo"),
  v.literal("scrub_team"),
  v.literal("scrub_pro")
);

/**
 * Atomically reconcile and complete public-checkout provisioning.
 *
 * The Checkout Session ID is the authoritative idempotency key. Company,
 * default site, owner, subscription linkage, and the completion record are
 * committed together, so retries can never observe a half-created account.
 * Existing pre-hardening accounts are adopted only when both email and Stripe
 * customer linkage prove that they came from this checkout.
 */
export const provisionPublicCheckout = internalMutation({
  args: {
    stripeCheckoutSessionId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    tier: v.optional(companyTierValidator),
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    companyName: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const completed = await ctx.db
      .query("checkoutProvisioning")
      .withIndex("by_stripeCheckoutSessionId", (q) =>
        q.eq("stripeCheckoutSessionId", args.stripeCheckoutSessionId)
      )
      .first();
    if (completed) {
      if (completed.stripeCustomerId !== args.stripeCustomerId) {
        throw new Error("Checkout session/customer mismatch");
      }
      const owner = await ctx.db.get(completed.ownerUserId);
      if (!owner || owner.email !== args.email || owner.role !== "owner") {
        throw new Error("Checkout provisioning record is invalid");
      }
      return {
        userId: completed.ownerUserId,
        companyId: completed.companyId,
        passwordHash: owner.passwordHash,
        alreadyCompleted: true,
      };
    }

    const customerProvisioning = await ctx.db
      .query("checkoutProvisioning")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();
    if (customerProvisioning) {
      throw new Error("Stripe customer is already linked to another checkout");
    }

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    let company = await ctx.db
      .query("companies")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    if (existingUser) {
      if (!existingUser.companyId || existingUser.role !== "owner") {
        throw new Error("An account with this email already exists. Please sign in instead.");
      }
      const existingCompany = await ctx.db.get(existingUser.companyId);
      if (!existingCompany || existingCompany.stripeCustomerId !== args.stripeCustomerId) {
        throw new Error("An account with this email already exists. Please sign in instead.");
      }
      company = existingCompany;
    }

    let companyId;
    if (company) {
      companyId = company._id;
    } else {
      companyId = await ctx.db.insert("companies", {
        name: args.companyName,
        timezone: args.timezone,
        stripeCustomerId: args.stripeCustomerId,
      });
    }

    const existingOwner = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    if (existingOwner && existingOwner._id !== existingUser?._id) {
      throw new Error("Stripe customer is already linked to another account");
    }

    const existingSite = await ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .first();
    if (!existingSite) {
      const slug = await generateUniqueSlug(ctx, args.companyName);
      await ctx.db.insert("companySites", {
        companyId,
        slug,
        templateId: "A",
        brandName: args.companyName,
        bio: "",
        serviceArea: "",
      });
    }

    const ownerUserId = existingUser?._id ?? await ctx.db.insert("users", {
      email: args.email,
      passwordHash: args.passwordHash,
      name: args.name,
      companyId,
      role: "owner",
      status: "active",
    });

    await ctx.db.patch(companyId, {
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePriceId: args.stripePriceId,
      subscriptionStatus: args.subscriptionStatus,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      ...(args.tier ? { tier: args.tier } : {}),
      ...(args.subscriptionStatus === "active" || args.subscriptionStatus === "trialing"
        ? { subscriptionBecameInactiveAt: undefined }
        : {}),
    });

    await ctx.db.insert("checkoutProvisioning", {
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      companyId,
      ownerUserId,
      completedAt: Date.now(),
    });

    return {
      userId: ownerUserId,
      companyId,
      passwordHash: existingUser?.passwordHash ?? args.passwordHash,
      alreadyCompleted: Boolean(existingUser),
    };
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
  args: { tokenHash: v.string(), legacyToken: v.string() },
  handler: async (ctx, args) => {
    const hashedUser = await ctx.db
      .query("users")
      .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", args.tokenHash))
      .first();
    if (hashedUser) return hashedUser;

    // Compatibility for unexpired invitations issued before token hashing.
    return await ctx.db
      .query("users")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.legacyToken))
      .first();
  },
});

export const rotateInviteToken = internalMutation({
  args: {
    userId: v.id("users"),
    inviteTokenHash: v.string(),
    inviteTokenExpiry: v.float64(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      inviteToken: undefined,
      inviteTokenHash: args.inviteTokenHash,
      inviteTokenExpiry: args.inviteTokenExpiry,
    });
  },
});

export const consumeInviteToken = internalMutation({
  args: { userId: v.id("users"), passwordHash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      passwordHash: args.passwordHash,
      status: "active",
      inviteToken: undefined,
      inviteTokenHash: undefined,
      inviteTokenExpiry: undefined,
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
