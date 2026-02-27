import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

/** Cleaner sets their weekly availability (bulk upsert for all 7 days) */
export const setWeeklyAvailability = mutation({
  args: {
    userId: v.id("users"),
    availability: v.array(
      v.object({
        dayOfWeek: v.number(),
        startMinutes: v.number(),
        endMinutes: v.number(),
        enabled: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "cleaner" && user.role !== "maintenance") {
      throw new Error("Only cleaners can set availability");
    }

    // Validate each entry
    for (const entry of args.availability) {
      if (entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
        throw new Error("dayOfWeek must be 0-6");
      }
      if (
        entry.startMinutes < 0 ||
        entry.startMinutes > 1439 ||
        entry.endMinutes < 0 ||
        entry.endMinutes > 1439
      ) {
        throw new Error("Minutes must be 0-1439");
      }
      if (entry.enabled && entry.startMinutes >= entry.endMinutes) {
        throw new Error("Start must be before end");
      }
    }

    // Delete existing entries for this cleaner, then insert new ones
    const existing = await ctx.db
      .query("cleanerAvailability")
      .withIndex("by_cleanerId_dayOfWeek", (q) =>
        q.eq("cleanerId", user._id)
      )
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const entry of args.availability) {
      await ctx.db.insert("cleanerAvailability", {
        cleanerId: user._id,
        dayOfWeek: entry.dayOfWeek,
        startMinutes: entry.startMinutes,
        endMinutes: entry.endMinutes,
        enabled: entry.enabled,
      });
    }
  },
});

/** Cleaner sets an override for a specific date (next 14 days only) */
export const setAvailabilityOverride = mutation({
  args: {
    userId: v.id("users"),
    date: v.string(),
    unavailable: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.userId);
    if (user.role !== "cleaner" && user.role !== "maintenance") {
      throw new Error("Only cleaners can set availability overrides");
    }

    // Validate date is within next 14 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(args.date + "T12:00:00");
    const diffDays = Math.round(
      (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDays < 0 || diffDays > 14) {
      throw new Error("Override date must be within the next 14 days");
    }

    // Upsert
    const existing = await ctx.db
      .query("cleanerAvailabilityOverrides")
      .withIndex("by_cleanerId_date", (q) =>
        q.eq("cleanerId", user._id).eq("date", args.date)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { unavailable: args.unavailable });
    } else {
      await ctx.db.insert("cleanerAvailabilityOverrides", {
        cleanerId: user._id,
        date: args.date,
        unavailable: args.unavailable,
      });
    }
  },
});
