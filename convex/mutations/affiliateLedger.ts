import { mutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import {
  getSessionUser,
  isSuperAdminEmail,
  requireSuperAdmin,
} from "../lib/auth";

const AFFILIATE_RATE = 0.10;

/* ── Period boundary helpers ──────────────────────────────────────── */

/** Parse "YYYY-MM-DD" or "YYYY-MM-01" into a UTC ms timestamp. */
function parsePeriodStart(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Return UTC month boundaries [start, end) for the given timestamp. */
function getMonthBoundaries(ms: number): { start: number; end: number } {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return { start, end };
}

/** Return UTC ISO-week boundaries [start, end) for the given timestamp. */
function getWeekBoundaries(ms: number): { start: number; end: number } {
  const d = new Date(ms);
  const day = d.getUTCDay(); // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + mondayOffset
  );
  return { start, end: start + 7 * 24 * 60 * 60 * 1000 };
}

/* ── Shared upsert logic ──────────────────────────────────────────── */

async function upsertLedgerForPeriod(
  ctx: MutationCtx,
  referrerUserId: Id<"users">,
  periodType: "monthly" | "weekly",
  periodStartMs: number
) {
  const { start: periodStart, end: periodEnd } =
    periodType === "monthly"
      ? getMonthBoundaries(periodStartMs)
      : getWeekBoundaries(periodStartMs);

  // Lookup existing entry
  const existing = await ctx.db
    .query("affiliateLedger")
    .withIndex("by_referrerUserId_periodType_periodStart", (q) =>
      q
        .eq("referrerUserId", referrerUserId)
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
      q.eq("referrerUserId", referrerUserId)
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
    await ctx.db.patch(existing._id, {
      attributedRevenueCents,
      commissionRate: AFFILIATE_RATE,
      commissionCents,
    });
    return {
      ...existing,
      attributedRevenueCents,
      commissionRate: AFFILIATE_RATE,
      commissionCents,
    };
  }

  const id = await ctx.db.insert("affiliateLedger", {
    referrerUserId,
    periodType,
    periodStart,
    periodEnd,
    attributedRevenueCents,
    commissionRate: AFFILIATE_RATE,
    commissionCents,
    status: "open",
    createdAt: Date.now(),
  });

  return await ctx.db.get(id);
}

/* ── Mutations ────────────────────────────────────────────────────── */

/**
 * Upsert ledger for an arbitrary period (by periodStart string).
 * Any authenticated user can refresh their own ledger.
 */
export const upsertMyLedgerForPeriod = mutation({
  args: {
    userId: v.id("users"),
    periodType: v.optional(
      v.union(v.literal("monthly"), v.literal("weekly"))
    ),
    periodStart: v.string(), // "YYYY-MM-DD"
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const periodType = args.periodType ?? "monthly";
    const periodStartMs = parsePeriodStart(args.periodStart);
    return upsertLedgerForPeriod(ctx, user._id, periodType, periodStartMs);
  },
});

/**
 * Upsert ledger for the current period (convenience wrapper).
 * Kept for backwards compatibility.
 */
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
    return upsertLedgerForPeriod(ctx, user._id, periodType, Date.now());
  },
});

/**
 * Lock an open ledger period. Accepts optional notes (280 char max).
 */
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

/**
 * Mark a locked ledger period as paid (manual bookkeeping, no Stripe).
 * Super-admin only. Only allowed on status === "locked".
 */
export const markLedgerPaid = mutation({
  args: {
    userId: v.id("users"),
    ledgerId: v.id("affiliateLedger"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    const entry = await ctx.db.get(args.ledgerId);
    if (!entry) throw new Error("Ledger entry not found");

    if (entry.status !== "locked") {
      if (entry.status === "paid") return entry; // already paid, no-op
      throw new Error("Only locked entries can be marked as paid");
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: "paid",
      paidAt: now,
    };

    if (args.notes !== undefined) {
      patch.notes = args.notes.trim().slice(0, 280);
    }

    await ctx.db.patch(entry._id, patch);

    return { ...entry, ...patch };
  },
});

/**
 * Undo a paid ledger period back to locked (admin mistake recovery).
 * Super-admin only. Only allowed on status === "paid".
 */
export const unmarkLedgerPaid = mutation({
  args: {
    userId: v.id("users"),
    ledgerId: v.id("affiliateLedger"),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    const entry = await ctx.db.get(args.ledgerId);
    if (!entry) throw new Error("Ledger entry not found");

    if (entry.status !== "paid") {
      if (entry.status === "locked") return entry; // already locked, no-op
      throw new Error("Only paid entries can be unmarked");
    }

    const patch: Record<string, unknown> = {
      status: "locked",
      paidAt: undefined,
    };

    if (args.notes !== undefined) {
      patch.notes = args.notes.trim().slice(0, 280);
    }

    await ctx.db.patch(entry._id, patch);

    return { ...entry, ...patch };
  },
});
