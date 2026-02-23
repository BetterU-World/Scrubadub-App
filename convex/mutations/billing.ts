import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

const PRICE_TO_TIER: Record<string, "cleaning_owner" | "str_owner"> = {
  price_1T1qhM9bHruUzqYi7qMlyhFq: "cleaning_owner",
  price_1T1qhu9bHruUZqYiR0lus6To: "str_owner",
};

const ACTIVE_STATUSES = ["active", "trialing"];

export const setStripeCustomerId = internalMutation({
  args: {
    companyId: v.id("companies"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      stripeCustomerId: args.stripeCustomerId,
    });
  },
});

export const syncSubscription = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    status: v.string(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    if (!company) {
      console.error(
        `No company found for stripeCustomerId: ${args.stripeCustomerId}`
      );
      return;
    }

    const tier = PRICE_TO_TIER[args.stripePriceId];
    const isActive = ACTIVE_STATUSES.includes(args.status);

    // Track when subscription first becomes inactive
    let subscriptionBecameInactiveAt = company.subscriptionBecameInactiveAt;
    if (isActive) {
      subscriptionBecameInactiveAt = undefined;
    } else if (subscriptionBecameInactiveAt === undefined) {
      subscriptionBecameInactiveAt = Date.now();
    }

    await ctx.db.patch(company._id, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePriceId: args.stripePriceId,
      subscriptionStatus: args.status,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      subscriptionBecameInactiveAt,
      ...(tier ? { tier } : {}),
    });
  },
});

/**
 * Record affiliate attribution when a referred user subscribes.
 * Called from Stripe webhook on subscription created events.
 * Idempotent: skips if attribution for this subscription already exists.
 */
export const recordAttribution = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Find the company by stripeCustomerId
    const company = await ctx.db
      .query("companies")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    if (!company) return;

    // 2. Find the owner user of the company
    const owner = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();

    if (!owner) return;

    // 3. Check if user was referred
    if (!owner.referredByUserId) return;

    // 4. Idempotent: check if attribution already exists for this subscription
    const existing = await ctx.db
      .query("affiliateAttributions")
      .withIndex("by_stripeSubscriptionId", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (existing) return;

    // 5. Create the attribution record
    await ctx.db.insert("affiliateAttributions", {
      purchaserUserId: owner._id,
      referrerUserId: owner.referredByUserId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      createdAt: Date.now(),
    });
  },
});
