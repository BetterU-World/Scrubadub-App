import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireStaffCompany } from "../lib/sessionAuth";

/**
 * List reservations for a property, most recent first.
 * Used by the Calendar Sync tab on the property detail page.
 */
export const listByProperty = query({
  args: {
    userId: v.id("users"),
    companyId: v.id("companies"),
    propertyId: v.id("properties"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireStaffCompany(ctx, args.sessionToken, args.companyId, args.userId);
    const property = await ctx.db.get(args.propertyId);
    if (!property || property.companyId !== args.companyId) throw new Error("Access denied");

    const reservations = await ctx.db
      .query("calendarReservations")
      .withIndex("by_propertyId", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    // Sort by checkOut descending (most recent first)
    reservations.sort((a, b) => (b.checkOut > a.checkOut ? 1 : -1));

    return reservations;
  },
});
