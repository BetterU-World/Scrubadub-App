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
    attributionType: v.optional(
      v.union(v.literal("subscription_created"), v.literal("invoice_paid"))
    ),
    stripeInvoiceId: v.optional(v.string()),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[attribution:mutation] recordAttribution called", {
      stripeCustomerId: args.stripeCustomerId,
      attributionType: args.attributionType,
      stripeInvoiceId: args.stripeInvoiceId,
      stripeSubscriptionId: args.stripeSubscriptionId,
    });

    // 1. Find the company by stripeCustomerId
    const company = await ctx.db
      .query("companies")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    if (!company) {
      console.warn("[attribution:mutation] EXIT — no company found for stripeCustomerId:", args.stripeCustomerId);
      return;
    }
    console.log("[attribution:mutation] company found", {
      companyId: company._id,
      companyStripeCustomerId: company.stripeCustomerId,
    });

    // 2. Find the owner user of the company
    const owner = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();

    if (!owner) {
      console.warn("[attribution:mutation] EXIT — no owner found for company:", company._id);
      return;
    }
    console.log("[attribution:mutation] owner found", {
      ownerId: owner._id,
      referredByUserId: owner.referredByUserId ?? "NONE",
    });

    // 3. Check if user was referred
    if (!owner.referredByUserId) {
      console.log("[attribution:mutation] EXIT — owner has no referredByUserId");
      return;
    }

    // 4. Idempotent dedup
    if (args.attributionType === "invoice_paid" && args.stripeInvoiceId) {
      // Dedup by invoice ID for invoice_paid events
      const existingInvoice = await ctx.db
        .query("affiliateAttributions")
        .withIndex("by_stripeInvoiceId", (q) =>
          q.eq("stripeInvoiceId", args.stripeInvoiceId)
        )
        .first();
      if (existingInvoice) {
        console.log("[attribution:mutation] EXIT — duplicate invoice_paid for invoiceId:", args.stripeInvoiceId);
        return;
      }
    } else {
      // Dedup by subscription ID for subscription_created events
      const existingSub = await ctx.db
        .query("affiliateAttributions")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
        )
        .first();
      if (existingSub) {
        console.log("[attribution:mutation] EXIT — duplicate subscription_created for subscriptionId:", args.stripeSubscriptionId);
        return;
      }
    }

    // 5. Create the attribution record
    const insertedId = await ctx.db.insert("affiliateAttributions", {
      purchaserUserId: owner._id,
      referrerUserId: owner.referredByUserId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      attributionType: args.attributionType,
      stripeInvoiceId: args.stripeInvoiceId,
      amountCents: args.amountCents,
      currency: args.currency,
      createdAt: Date.now(),
    });
    console.log("[attribution:mutation] SUCCESS — inserted affiliateAttribution:", insertedId);
  },
});
