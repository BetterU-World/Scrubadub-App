import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess } from "../lib/auth";

/**
 * List reservations for a property, most recent first.
 * Used by the Calendar Sync tab on the property detail page.
 */
export const listByProperty = query({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    const reservations = await ctx.db
      .query("calendarReservations")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    // Sort by checkOut descending (most recent first)
    reservations.sort((a, b) => (b.checkOut > a.checkOut ? 1 : -1));

    return reservations;
  },
});
