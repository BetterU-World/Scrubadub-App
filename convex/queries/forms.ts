import { query } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, hasManagerPermission } from "../lib/auth";
import { isUserAssignedToJob } from "../lib/teams";

async function canReadForm(ctx: any, form: any, user: any) {
  if (form.companyId !== user.companyId) throw new Error("Access denied");
  const job = await ctx.db.get(form.jobId);
  if (!job) return false;
  if (user.role === "owner") return true;
  if (user.role === "manager") {
    return hasManagerPermission(user, "canSeeAllJobs") || job.assignedManagerId === user._id || await isUserAssignedToJob(ctx, job, user._id);
  }
  return await isUserAssignedToJob(ctx, job, user._id);
}

export const getByJob = query({
  args: { jobId: v.id("jobs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    if (job.companyId !== user.companyId) throw new Error("Access denied");
    if (user.role === "manager") {
      const canSee = hasManagerPermission(user, "canSeeAllJobs") || job.assignedManagerId === user._id || await isUserAssignedToJob(ctx, job, user._id);
      if (!canSee) return null;
    } else if (user.role !== "owner" && !(await isUserAssignedToJob(ctx, job, user._id))) return null;

    return await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
  },
});

export const getItems = query({
  args: { formId: v.id("forms"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const form = await ctx.db.get(args.formId);
    if (!form) return [];
    if (!(await canReadForm(ctx, form, user))) return [];

    const items = await ctx.db
      .query("formItems")
      .withIndex("by_formId", (q) => q.eq("formId", args.formId))
      .collect();
    return items.sort((a, b) => a.order - b.order);
  },
});

export const getItemsBySection = query({
  args: {
    formId: v.id("forms"),
    section: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const form = await ctx.db.get(args.formId);
    if (!form) return [];
    if (!(await canReadForm(ctx, form, user))) return [];

    const items = await ctx.db
      .query("formItems")
      .withIndex("by_formId_section", (q) =>
        q.eq("formId", args.formId).eq("section", args.section)
      )
      .collect();
    return items.sort((a, b) => a.order - b.order);
  },
});
