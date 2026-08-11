import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";

export const list = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageBusinessConfiguration");
    if (user.companyId !== args.companyId) throw new Error("Access denied");

    return await ctx.db
      .query("inventoryTemplates")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
  },
});

export const get = query({
  args: { templateId: v.id("inventoryTemplates"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) return null;

    const user = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canManageBusinessConfiguration");
    if (user.companyId !== template.companyId) throw new Error("Access denied");
    return template;
  },
});
