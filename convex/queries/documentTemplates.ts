import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

const documentTypeValidator = v.union(
  v.literal("service_agreement"),
  v.literal("proposal"),
  v.literal("employee_agreement"),
  v.literal("nda"),
  v.literal("safety_policy"),
  v.literal("other")
);

async function requireOwnerCompany(ctx: any, userId: any) {
  const user = await getSessionUser(ctx, userId);
  if (user.role !== "owner" || !user.companyId) {
    throw new Error("Owner access required");
  }
  return user;
}

export const listByType = query({
  args: {
    userId: v.id("users"),
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
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
    type: documentTypeValidator,
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerCompany(ctx, args.userId);
    return await (ctx.db as any)
      .query("documentTemplates")
      .withIndex("by_company_type_default", (q: any) =>
        q.eq("companyId", owner.companyId).eq("type", args.type).eq("isDefault", true)
      )
      .first();
  },
});
