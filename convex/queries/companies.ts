import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";

/**
 * Returns the company profile fields for the settings page.
 */
export const getCompanyProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await assertOwnerRole(ctx, args.userId);
    const company = await ctx.db.get(user.companyId);
    if (!company) throw new Error("Company not found");
    return {
      _id: company._id,
      name: company.name,
      companyDisplayName: company.companyDisplayName ?? null,
      contactEmail: company.contactEmail ?? null,
      contactPhone: company.contactPhone ?? null,
      serviceAreaText: company.serviceAreaText ?? null,
    };
  },
});
