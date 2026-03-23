import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess } from "../lib/auth";

export const list = query({
  args: { companyId: v.id("companies"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    return await ctx.db
      .query("inventoryTemplates")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const get = query({
  args: { templateId: v.id("inventoryTemplates"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;

    await assertCompanyAccess(ctx, args.userId, template.companyId);
    return template;
  },
});
