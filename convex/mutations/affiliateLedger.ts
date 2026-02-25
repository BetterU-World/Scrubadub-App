import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, isSuperAdminEmail } from "../lib/auth";

const AFFILIATE_RATE = 0.10;

/** Return UTC month boundaries [start, end) for the given timestamp. */
function getMonthBoundaries(nowMs: number): { start: number; end: number } {
  const d = new Date(nowMs);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { start, end };
}

export const upsertMyCurrentPeriodLedger = mutation({
  args: {
    userId: v.id("users"),
    periodType: v.optional(
      v.union(v.literal("monthly"), v.literal("weekly"))
    ),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const periodType = args.periodType ?? "monthly";

    const now = Date.now();
    const { start: periodStart, end: periodEnd } = getMonthBoundaries(now);

    // Check for existing ledger entry
    const existing = await ctx.db
      .query("affiliateLedger")
      .withIndex("by_referrerUserId_periodType_periodStart", (q) =>
        q
          .eq("referrerUserId", user._id)
          .eq("periodType", periodType)
          .eq("periodStart", periodStart)
      )
      .first();

    // Do not modify locked/paid entries
    if (existing && (existing.status === "locked" || existing.status === "paid")) {
      return existing;
    }

    // Sum invoice_paid attributions in [periodStart, periodEnd)
    const attributions = await ctx.db
      .query("affiliateAttributions")
      .withIndex("by_referrerUserId", (q) =>
        q.eq("referrerUserId", user._id)
      )
      .collect();

    let attributedRevenueCents = 0;
    for (const a of attributions) {
      if (
        a.attributionType === "invoice_paid" &&
        a.createdAt >= periodStart &&
        a.createdAt < periodEnd
      ) {
        attributedRevenueCents += a.amountCents ?? 0;
      }
    }

    const commissionCents = Math.round(attributedRevenueCents * AFFILIATE_RATE);

    if (existing) {
      // Update existing open entry
      await ctx.db.patch(existing._id, {
        attributedRevenueCents,
        commissionRate: AFFILIATE_RATE,
        commissionCents,
      });
      return { ...existing, attributedRevenueCents, commissionRate: AFFILIATE_RATE, commissionCents };
    }

    // Create new entry
    const id = await ctx.db.insert("affiliateLedger", {
      referrerUserId: user._id,
      periodType,
      periodStart,
      periodEnd,
      attributedRevenueCents,
      commissionRate: AFFILIATE_RATE,
      commissionCents,
      status: "open",
      createdAt: now,
    });

    return await ctx.db.get(id);
  },
});

export const lockLedgerPeriod = mutation({
  args: {
    userId: v.id("users"),
    ledgerId: v.id("affiliateLedger"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    const entry = await ctx.db.get(args.ledgerId);
    if (!entry) throw new Error("Ledger entry not found");

    // Only the referrer (or a super admin) can lock
    if (entry.referrerUserId !== user._id && !isSuperAdminEmail(user.email)) {
      throw new Error("Access denied");
    }

    // Only open entries can be locked
    if (entry.status !== "open") {
      return entry; // no-op for locked/paid
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: "locked",
      lockedAt: now,
    };

    if (args.notes !== undefined) {
      patch.notes = args.notes.trim().slice(0, 280);
    }

    await ctx.db.patch(entry._id, patch);

    return { ...entry, ...patch };
  },
});
