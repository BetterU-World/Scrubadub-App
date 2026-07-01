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

function cleanOptional(value: string | undefined, max = 4000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanColor(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    throw new Error("Colors must use hex format, like #2563eb");
  }
  return trimmed;
}

export const upsertCompanySettings = mutation({
  args: {
    userId: v.id("users"),
    logoUrl: v.optional(v.string()),
    companyName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    licenseNumber: v.optional(v.string()),
    insuranceInformation: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    emailSignature: v.optional(v.string()),
    documentHeader: v.optional(v.string()),
    documentFooter: v.optional(v.string()),
    defaultFont: v.optional(v.string()),
    defaultDateFormat: v.optional(v.string()),
    defaultCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await assertOwnerRole(ctx, args.userId);
    const now = Date.now();
    const patch = {
      logoUrl: cleanOptional(args.logoUrl, 1000),
      companyName: cleanOptional(args.companyName, 200),
      phone: cleanOptional(args.phone, 100),
      email: cleanOptional(args.email, 200),
      website: cleanOptional(args.website, 500),
      address: cleanOptional(args.address, 1000),
      licenseNumber: cleanOptional(args.licenseNumber, 200),
      insuranceInformation: cleanOptional(args.insuranceInformation, 2000),
      primaryColor: cleanColor(args.primaryColor),
      secondaryColor: cleanColor(args.secondaryColor),
      accentColor: cleanColor(args.accentColor),
      emailSignature: cleanOptional(args.emailSignature, 4000),
      documentHeader: cleanOptional(args.documentHeader, 4000),
      documentFooter: cleanOptional(args.documentFooter, 4000),
      defaultFont: cleanOptional(args.defaultFont, 100),
      defaultDateFormat: cleanOptional(args.defaultDateFormat, 50),
      defaultCurrency: cleanOptional(args.defaultCurrency, 10),
      updatedAt: now,
    };

    const existing = await (ctx.db as any)
      .query("companySettings")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", user.companyId))
      .first();

    if (existing) {
      await (ctx.db as any).patch(existing._id, patch);
    } else {
      await (ctx.db as any).insert("companySettings", {
        companyId: user.companyId,
        ...patch,
        createdAt: now,
      });
    }

    await ctx.db.patch(user.companyId, {
      companyDisplayName: patch.companyName,
      contactEmail: patch.email,
      contactPhone: patch.phone,
    });

    return { success: true };
  },
});

/** Set or clear the company's default manager. */
export const setDefaultManager = mutation({
  args: {
    userId: v.id("users"),
    managerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await assertOwnerRole(ctx, args.userId);
    const company = await ctx.db.get(user.companyId);
    if (!company) throw new Error("Company not found");

    // Validate the manager if provided
    if (args.managerId) {
      const manager = await ctx.db.get(args.managerId);
      if (!manager || manager.companyId !== user.companyId || manager.role !== "manager") {
        throw new Error("Invalid manager");
      }
    }

    await ctx.db.patch(company._id, {
      defaultManagerId: args.managerId ?? undefined,
    });
  },
});
