import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth, requireOwner } from "../lib/helpers";

/** Cleaner reads their own weekly availability */
export const getMyWeeklyAvailability = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    return ctx.db
      .query("cleanerAvailability")
      .withIndex("by_cleanerId_dayOfWeek", (q) => q.eq("cleanerId", user._id))
      .collect();
  },
});

/** Cleaner reads their own overrides for the next 14 days */
export const getMyOverrides = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    return ctx.db
      .query("cleanerAvailabilityOverrides")
      .withIndex("by_cleanerId_date", (q) => q.eq("cleanerId", user._id))
      .collect();
  },
});

/** Owner reads a single cleaner's availability for a specific date */
export const getCleanerAvailabilityForDate = query({
  args: {
    userId: v.id("users"),
    cleanerId: v.id("users"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx, args.userId);

    // Check day-level override first
    const override = await ctx.db
      .query("cleanerAvailabilityOverrides")
      .withIndex("by_cleanerId_date", (q) =>
        q.eq("cleanerId", args.cleanerId).eq("date", args.date)
      )
      .first();

    if (override?.unavailable) {
      return { isUnavailable: true, weeklyBlocks: [] };
    }

    // Get day-of-week from date string
    const dayOfWeek = new Date(args.date + "T12:00:00").getDay();

    const weeklyBlocks = await ctx.db
      .query("cleanerAvailability")
      .withIndex("by_cleanerId_dayOfWeek", (q) =>
        q.eq("cleanerId", args.cleanerId).eq("dayOfWeek", dayOfWeek)
      )
      .collect();

    const enabledBlocks = weeklyBlocks.filter((b) => b.enabled);

    return {
      isUnavailable: enabledBlocks.length === 0,
      weeklyBlocks: enabledBlocks.map((b) => ({
        startMinutes: b.startMinutes,
        endMinutes: b.endMinutes,
      })),
    };
  },
});

/** Owner lists all cleaners with availability status for a given date */
export const listCleanersWithAvailability = query({
  args: {
    userId: v.id("users"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);

    // Get all active cleaners in company
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
      .collect();
    const activecleaners = users.filter(
      (u) => u.role === "cleaner" && u.status === "active"
    );

    const dayOfWeek = new Date(args.date + "T12:00:00").getDay();

    const results = await Promise.all(
      activecleaners.map(async (cleaner) => {
        // Check override
        const override = await ctx.db
          .query("cleanerAvailabilityOverrides")
          .withIndex("by_cleanerId_date", (q) =>
            q.eq("cleanerId", cleaner._id).eq("date", args.date)
          )
          .first();

        if (override?.unavailable) {
          return { _id: cleaner._id, name: cleaner.name, email: cleaner.email, isUnavailable: true };
        }

        // Check weekly
        const weeklyBlocks = await ctx.db
          .query("cleanerAvailability")
          .withIndex("by_cleanerId_dayOfWeek", (q) =>
            q.eq("cleanerId", cleaner._id).eq("dayOfWeek", dayOfWeek)
          )
          .collect();

        const hasAvailability = weeklyBlocks.some((b) => b.enabled);

        // If cleaner has never set availability, treat as available (don't block)
        const hasAnyAvailability = await ctx.db
          .query("cleanerAvailability")
          .withIndex("by_cleanerId_dayOfWeek", (q) =>
            q.eq("cleanerId", cleaner._id)
          )
          .first();

        const isUnavailable = hasAnyAvailability ? !hasAvailability : false;

        return {
          _id: cleaner._id,
          name: cleaner.name,
          email: cleaner.email,
          isUnavailable,
        };
      })
    );

    return results;
  },
});
