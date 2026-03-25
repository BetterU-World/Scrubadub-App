import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "../lib/auth";

/**
 * List all affiliate users (pending, active, inactive/revoked).
 * Superadmin only. Returns data needed for the founder invite management UI.
 */
export const listAffiliateInvites = query({
  args: { callerUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.callerUserId);

    // Collect all affiliate-role users. For v1 the count is small
    // (invite-only), so a full scan with filter is acceptable.
    const affiliates = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("role"), "affiliate"))
      .collect();

    return affiliates.map((u) => ({
      _id: u._id,
      email: u.email,
      name: u.name,
      status: u.status,
      inviteTokenExpiry: u.inviteTokenExpiry ?? null,
      referralCode: u.referralCode ?? null,
      affiliateStripeAccountId: u.affiliateStripeAccountId ?? null,
      affiliateInvitedBy: u.affiliateInvitedBy ?? null,
      _creationTime: u._creationTime,
    }));
  },
});
