import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { assertOwnerRole } from "../lib/auth";

/**
 * Update company-level profile defaults.
 * Only provided fields are written; omitted fields stay untouched.
 */
export const updateCompanyProfile = mutation({
  args: {
    userId: v.id("users"),
    companyDisplayName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    serviceAreaText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await assertOwnerRole(ctx, args.userId);
    const company = await ctx.db.get(user.companyId);
    if (!company) throw new Error("Company not found");

    const updates: Record<string, string> = {};
    if (args.companyDisplayName !== undefined)
      updates.companyDisplayName = args.companyDisplayName;
    if (args.contactEmail !== undefined)
      updates.contactEmail = args.contactEmail;
    if (args.contactPhone !== undefined)
      updates.contactPhone = args.contactPhone;
    if (args.serviceAreaText !== undefined)
      updates.serviceAreaText = args.serviceAreaText;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(company._id, updates);
    }

    return await ctx.db.get(company._id);
  },
});
