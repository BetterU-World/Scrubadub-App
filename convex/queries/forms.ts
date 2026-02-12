import { query } from "../_generated/server";
import { v } from "convex/values";

export const getByJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
  },
});

export const getItems = query({
  args: { formId: v.id("forms") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("formItems")
      .withIndex("by_formId", (q) => q.eq("formId", args.formId))
      .collect();
    return items.sort((a, b) => a.order - b.order);
  },
});

export const getItemsBySection = query({
  args: { formId: v.id("forms"), section: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("formItems")
      .withIndex("by_formId_section", (q) =>
        q.eq("formId", args.formId).eq("section", args.section)
      )
      .collect();
    return items.sort((a, b) => a.order - b.order);
  },
});
