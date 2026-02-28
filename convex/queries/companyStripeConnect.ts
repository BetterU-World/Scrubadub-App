import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";

/**
 * Public query: returns the company's Stripe Connect status.
 */
export const getCompanyConnectStatus = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await assertOwnerRole(ctx, args.userId);
    const company = await ctx.db.get(user.companyId);
    if (!company) throw new Error("Company not found");
    return {
      stripeConnectAccountId: company.stripeConnectAccountId ?? null,
      stripeConnectOnboardedAt: company.stripeConnectOnboardedAt ?? null,
    };
  },
});

/**
 * Internal query: get owner + company data for Connect actions.
 */
export const getOwnerAndCompany = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.status === "inactive") return null;
    if (user.role !== "owner") return null;
    const company = await ctx.db.get(user.companyId);
    if (!company) return null;
    return {
      userId: user._id,
      email: user.email,
      companyId: company._id,
      stripeConnectAccountId: company.stripeConnectAccountId ?? null,
    };
  },
});
