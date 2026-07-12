import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";

/**
 * Returns the company profile fields for the settings page.
 */
export const getCompanyProfile = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const company = await ctx.db.get(user.companyId);
    if (!company) throw new Error("Company not found");
    return {
      _id: company._id,
      name: company.name,
      companyDisplayName: company.companyDisplayName ?? null,
      contactEmail: company.contactEmail ?? null,
      contactPhone: company.contactPhone ?? null,
      serviceAreaText: company.serviceAreaText ?? null,
      defaultManagerId: company.defaultManagerId ?? null,
    };
  },
});

export const getCompanySettings = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const company = await ctx.db.get(user.companyId);
    if (!company) throw new Error("Company not found");

    const settings = await (ctx.db as any)
      .query("companySettings")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", user.companyId))
      .first();

    return {
      _id: settings?._id ?? null,
      companyId: user.companyId,
      logoUrl: settings?.logoUrl ?? null,
      companyName: settings?.companyName ?? company.companyDisplayName ?? company.name ?? "",
      phone: settings?.phone ?? company.contactPhone ?? "",
      email: settings?.email ?? company.contactEmail ?? "",
      website: settings?.website ?? "",
      address: settings?.address ?? "",
      licenseNumber: settings?.licenseNumber ?? "",
      insuranceInformation: settings?.insuranceInformation ?? "",
      primaryColor: settings?.primaryColor ?? "",
      secondaryColor: settings?.secondaryColor ?? "",
      accentColor: settings?.accentColor ?? "",
      emailSignature: settings?.emailSignature ?? "",
      documentHeader: settings?.documentHeader ?? "",
      documentFooter: settings?.documentFooter ?? "",
      defaultFont: settings?.defaultFont ?? "",
      defaultDateFormat: settings?.defaultDateFormat ?? "MM/dd/yyyy",
      defaultCurrency: settings?.defaultCurrency ?? "USD",
    };
  },
});
