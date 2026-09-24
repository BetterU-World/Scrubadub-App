import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";
import { approvedServiceAgreementTemplates } from "../lib/serviceAgreementTemplates";

const documentTypeValidator = v.union(
  v.literal("service_agreement"),
  v.literal("proposal"),
  v.literal("employee_agreement"),
  v.literal("nda"),
  v.literal("safety_policy"),
  v.literal("other")
);

async function requireOwnerCompany(ctx: any, sessionToken: string, userId: any) {
  const user = await requireOwnerOrManagerCapability(ctx, sessionToken, userId, "canManageDocuments");
  if (!user.companyId) throw new Error("Company access required");
  return user;
}

export const listByType = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    const templates = await (ctx.db as any)
      .query("documentTemplates")
      .withIndex("by_company_type", (q: any) =>
        q.eq("companyId", owner.companyId).eq("type", args.type)
      )
      .collect();

    return templates
      .filter((template: any) => template.status !== "archived")
      .sort((a: any, b: any) => b.updatedAt - a.updatedAt);
  },
});

export const getDefaultByType = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.sessionToken, args.userId);
    return await (ctx.db as any)
      .query("documentTemplates")
      .withIndex("by_company_type_default", (q: any) =>
        q.eq("companyId", owner.companyId).eq("type", args.type).eq("isDefault", true)
      )
      .first();
  },
});

/** Approved choices for agreement authoring; library editing still requires canManageDocuments. */
export const listServiceAgreementChoicesForSales = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageSalesAndCommercial");
    if (!user.companyId) throw new Error("Company access required");
    const templates = await approvedServiceAgreementTemplates(ctx, user.companyId);
    return templates.map((template: any) => ({
      _id: template._id, name: template.name, version: template.version ?? null,
      isDefault: template.isDefault === true, source: template.source ?? null,
      updatedAt: template.updatedAt,
    })).sort((a: any, b: any) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  },
});
