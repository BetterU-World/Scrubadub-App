import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess, getSessionUser } from "../lib/auth";

export const list = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

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
        // Check if any outgoing shared job was rejected
        const sharedRecords = await ctx.db
          .query("sharedJobs")
          .withIndex("by_originalJobId", (q) => q.eq("originalJobId", job._id))
          .collect();
        const hasRejectedShare = sharedRecords.some(
          (s) => s.fromCompanyId === args.companyId && s.status === "rejected"
        );
        return {
          ...job,
          propertyName: property?.name ?? "Unknown",
          propertyAddress: property?.address ?? "",
          cleaners: cleaners.filter(Boolean),
          hasRejectedShare,
        };
      })
    );
  },
});

export const get = query({
  args: { jobId: v.id("jobs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    if (job.companyId !== user.companyId) throw new Error("Access denied");

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
  args: {
    cleanerId: v.id("users"),
    companyId: v.id("companies"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await assertCompanyAccess(ctx, args.userId, args.companyId);
    if ((user.role === "cleaner" || user.role === "maintenance") && user._id !== args.cleanerId) {
      throw new Error("Access denied");
    }

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
    userId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

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
