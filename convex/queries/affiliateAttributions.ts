import { query } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { getSessionUser } from "../lib/auth";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const AFFILIATE_RATE = 0.10;

export const getMyAttributionSummary = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    const attributions = await ctx.db
      .query("affiliateAttributions")
      .withIndex("by_referrerUserId", (q) =>
        q.eq("referrerUserId", user._id)
      )
      .collect();

    const now = Date.now();
    const thirtyDaysAgo = now - THIRTY_DAYS_MS;
    const sevenDaysAgo = now - SEVEN_DAYS_MS;

    let lifetimeRevenueCents = 0;
    let last30dRevenueCents = 0;
    let last7dRevenueCents = 0;
    let totalAttributedInvoices = 0;
    const referredUserIds = new Set<Id<"users">>();
    const referredCompanyIds = new Set<Id<"companies">>();

    for (const a of attributions) {
      if (a.attributionType === "invoice_paid") {
        const cents = a.amountCents ?? 0;
        lifetimeRevenueCents += cents;
        totalAttributedInvoices += 1;

        if (a.createdAt >= thirtyDaysAgo) last30dRevenueCents += cents;
        if (a.createdAt >= sevenDaysAgo) last7dRevenueCents += cents;
      }
      referredUserIds.add(a.purchaserUserId);
    }

    // Resolve distinct companies via purchaserUserId -> users.companyId
    for (const uid of referredUserIds) {
      const purchaser = await ctx.db.get(uid);
      if (purchaser?.companyId) {
        referredCompanyIds.add(purchaser.companyId);
      }
    }

    return {
      lifetimeRevenueCents,
      last30dRevenueCents,
      last7dRevenueCents,
      totalAttributedInvoices,
      totalReferredCompanies: referredCompanyIds.size,
      totalReferredUsers: referredUserIds.size,
      commissionRate: AFFILIATE_RATE,
      lifetimeCommissionCents: Math.round(lifetimeRevenueCents * AFFILIATE_RATE),
      last30dCommissionCents: Math.round(last30dRevenueCents * AFFILIATE_RATE),
      last7dCommissionCents: Math.round(last7dRevenueCents * AFFILIATE_RATE),
    };
  },
});

export const listMyAttributions = query({
  args: {
    userId: v.id("users"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const limit = args.limit ?? 50;

    let attributions = await ctx.db
      .query("affiliateAttributions")
      .withIndex("by_referrerUserId", (q) =>
        q.eq("referrerUserId", user._id)
      )
      .order("desc")
      .collect();

    // Manual cursor-based pagination using createdAt
    if (args.cursor !== undefined) {
      attributions = attributions.filter((a) => a.createdAt < args.cursor!);
    }

    const page = attributions.slice(0, limit);
    const nextCursor =
      page.length === limit ? page[page.length - 1].createdAt : undefined;

    // Resolve company names via purchaserUserId -> users.companyId -> companies.name
    const userCache = new Map<
      Id<"users">,
      { companyId?: Id<"companies">; name?: string; email?: string }
    >();
    const companyNameCache = new Map<Id<"companies">, string>();

    const rows = [];
    for (const a of page) {
      if (!userCache.has(a.purchaserUserId)) {
        const purchaser = await ctx.db.get(a.purchaserUserId);
        userCache.set(a.purchaserUserId, {
          companyId: purchaser?.companyId,
          name: purchaser?.name,
          email: purchaser?.email,
        });
      }
      const cached = userCache.get(a.purchaserUserId)!;

      let companyName: string | undefined;
      if (cached.companyId) {
        if (!companyNameCache.has(cached.companyId)) {
          const company = await ctx.db.get(cached.companyId);
          companyNameCache.set(cached.companyId, company?.name ?? "Unknown");
        }
        companyName = companyNameCache.get(cached.companyId);
      }

      rows.push({
        _id: a._id,
        createdAt: a._creationTime,
        attributionType: a.attributionType ?? null,
        amountCents: a.amountCents ?? 0,
        currency: a.currency ?? "usd",
        stripeInvoiceId: a.stripeInvoiceId ?? null,
        stripeSubscriptionId: a.stripeSubscriptionId ?? null,
        purchaserCompanyName: companyName ?? null,
        purchaserUserName: cached.name ?? null,
        purchaserUserEmail: cached.email ?? null,
      });
    }

    return { rows, nextCursor };
  },
});
