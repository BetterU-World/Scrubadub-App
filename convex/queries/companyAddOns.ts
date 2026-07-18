import { query } from "../_generated/server";
import { v } from "convex/values";
import { canManageBusinessConfiguration } from "../lib/auth";
import { COMPANY_ADD_ON_PRESETS } from "../lib/companyAddOnPresets";
import { requireOwnerManagerSession } from "../lib/sessionAuth";

async function requireCatalogManager(ctx: any, sessionToken: string, claimedUserId?: any) {
  const user = await requireOwnerManagerSession(ctx, sessionToken, claimedUserId);
  if (!canManageBusinessConfiguration(user)) throw new Error("Business configuration permission required");
  return user;
}

function stableOrder(a: any, b: any) {
  return a.displayOrder - b.displayOrder || a.createdAt - b.createdAt || String(a._id).localeCompare(String(b._id));
}

export const list = query({
  args: { userId: v.optional(v.id("users")), sessionToken: v.string(), includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireCatalogManager(ctx, args.sessionToken, args.userId);
    const records = await ctx.db.query("companyAddOns").withIndex("by_companyId", (q: any) => q.eq("companyId", user.companyId)).collect();
    return records.filter((record: any) => args.includeArchived || record.archivedAt === undefined).sort(stableOrder);
  },
});

export const listPresets = query({
  args: { userId: v.optional(v.id("users")), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireCatalogManager(ctx, args.sessionToken, args.userId);
    return COMPANY_ADD_ON_PRESETS;
  },
});

export const listPublic = query({
  args: { slug: v.optional(v.string()), publicRequestToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if ((args.slug ? 1 : 0) + (args.publicRequestToken ? 1 : 0) !== 1) throw new Error("Provide exactly one public company identifier");
    let companyId;
    if (args.slug) {
      const site = await ctx.db.query("companySites").withIndex("by_slug", (q: any) => q.eq("slug", args.slug!.trim().toLowerCase())).first();
      companyId = site?.companyId;
    } else {
      const company = await ctx.db.query("companies").withIndex("by_publicRequestToken", (q: any) => q.eq("publicRequestToken", args.publicRequestToken!)).first();
      companyId = company?._id;
    }
    if (!companyId) return [];
    const records = await ctx.db.query("companyAddOns").withIndex("by_companyId_active_displayOrder", (q: any) => q.eq("companyId", companyId).eq("isActive", true)).collect();
    return records
      .filter((record: any) => record.isPublic && record.archivedAt === undefined)
      .sort(stableOrder)
      .map((record: any) => ({
        addOnId: record._id,
        name: record.name,
        description: record.description ?? null,
        pricingMethod: record.pricingMethod,
        priceCents: record.priceCents,
        unitLabel: record.unitLabel ?? null,
        estimatedDurationMinutes: record.estimatedDurationMinutes ?? null,
        displayOrder: record.displayOrder,
      }));
  },
});
