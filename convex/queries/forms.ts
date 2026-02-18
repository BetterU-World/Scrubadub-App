import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

export const getByJob = query({
  args: { sessionToken: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    if (job.companyId !== user.companyId) throw new Error("Not your company");

    return await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
  },
});

export const getItems = query({
  args: { sessionToken: v.string(), formId: v.id("forms") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.companyId !== user.companyId) throw new Error("Not your company");

    const items = await ctx.db
      .query("formItems")
      .withIndex("by_formId", (q) => q.eq("formId", args.formId))
      .collect();
    return items.sort((a, b) => a.order - b.order);
  },
});

export const getItemsBySection = query({
  args: { sessionToken: v.string(), formId: v.id("forms"), section: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Form not found");
    if (form.companyId !== user.companyId) throw new Error("Not your company");

    const items = await ctx.db
      .query("formItems")
      .withIndex("by_formId_section", (q) =>
        q.eq("formId", args.formId).eq("section", args.section)
      )
      .collect();
    return items.sort((a, b) => a.order - b.order);
  },
});
