import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../lib/helpers";

export const list = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const companyId = user.companyId;

    let jobs;
    if (args.status) {
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", companyId).eq("status", args.status as any)
        )
        .collect();
    } else {
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_companyId_scheduledDate", (q) =>
          q.eq("companyId", companyId)
        )
        .collect();
    }

    return Promise.all(
      jobs.map(async (job) => {
        const property = await ctx.db.get(job.propertyId);
        const cleaners = await Promise.all(
          job.cleanerIds.map(async (id) => {
            const user = await ctx.db.get(id);
            return user ? { _id: user._id, name: user.name } : null;
          })
        );
        return {
          ...job,
          propertyName: property?.name ?? "Unknown",
          propertyAddress: property?.address ?? "",
          cleaners: cleaners.filter(Boolean),
        };
      })
    );
  },
});

export const get = query({
  args: { sessionToken: v.string(), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    if (job.companyId !== user.companyId) throw new Error("Not your company");

    const property = await ctx.db.get(job.propertyId);
    const cleaners = await Promise.all(
      job.cleanerIds.map(async (id) => {
        const u = await ctx.db.get(id);
        return u ? { _id: u._id, name: u.name, email: u.email } : null;
      })
    );

    const form = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    const redFlags = await ctx.db
      .query("redFlags")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    return {
      ...job,
      property: property ?? null,
      cleaners: cleaners.filter(Boolean),
      form: form ?? null,
      redFlags,
    };
  },
});

export const getForCleaner = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const companyId = user.companyId;

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", companyId)
      )
      .collect();

    const myJobs = jobs.filter(
      (j) => j.cleanerIds.includes(user._id) && j.status !== "cancelled"
    );

    return Promise.all(
      myJobs.map(async (job) => {
        const property = await ctx.db.get(job.propertyId);
        return {
          ...job,
          propertyName: property?.name ?? "Unknown",
          propertyAddress: property?.address ?? "",
        };
      })
    );
  },
});

export const getCalendarJobs = query({
  args: {
    sessionToken: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx, args.sessionToken);
    const companyId = user.companyId;

    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", companyId)
      )
      .collect();

    const filtered = jobs.filter(
      (j) =>
        j.scheduledDate >= args.startDate &&
        j.scheduledDate <= args.endDate &&
        j.status !== "cancelled"
    );

    return Promise.all(
      filtered.map(async (job) => {
        const property = await ctx.db.get(job.propertyId);
        const cleaners = await Promise.all(
          job.cleanerIds.map(async (id) => {
            const u = await ctx.db.get(id);
            return u ? { _id: u._id, name: u.name } : null;
          })
        );
        return {
          ...job,
          propertyName: property?.name ?? "Unknown",
          cleaners: cleaners.filter(Boolean),
        };
      })
    );
  },
});
