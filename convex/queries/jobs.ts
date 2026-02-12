import { query } from "../_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    companyId: v.id("companies"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let jobs;
    if (args.status) {
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId).eq("status", args.status as any)
        )
        .collect();
    } else {
      jobs = await ctx.db
        .query("jobs")
        .withIndex("by_companyId_scheduledDate", (q) =>
          q.eq("companyId", args.companyId)
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
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    const property = await ctx.db.get(job.propertyId);
    const cleaners = await Promise.all(
      job.cleanerIds.map(async (id) => {
        const user = await ctx.db.get(id);
        return user ? { _id: user._id, name: user.name, email: user.email } : null;
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
  args: { cleanerId: v.id("users"), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", args.companyId)
      )
      .collect();

    const myJobs = jobs.filter(
      (j) => j.cleanerIds.includes(args.cleanerId) && j.status !== "cancelled"
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
    companyId: v.id("companies"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", args.companyId)
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
            const user = await ctx.db.get(id);
            return user ? { _id: user._id, name: user.name } : null;
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
