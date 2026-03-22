import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess, getSessionUser, hasManagerPermission } from "../lib/auth";
import { withPerfLog } from "../lib/perfLog";

const RED_FLAG_CAP = 2_000;

export const listByCompany = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await withPerfLog(ctx, "redFlags:listByCompany", async () => {
      await assertCompanyAccess(ctx, args.userId, args.companyId);

      let flags;
      if (args.status) {
        flags = await ctx.db
          .query("redFlags")
          .withIndex("by_companyId_status", (q) =>
            q.eq("companyId", args.companyId).eq("status", args.status as any)
          )
          .take(RED_FLAG_CAP);
      } else {
        flags = await ctx.db
          .query("redFlags")
          .withIndex("by_companyId_status", (q) =>
            q.eq("companyId", args.companyId)
          )
          .take(RED_FLAG_CAP);
      }

      return Promise.all(
        flags.map(async (flag) => {
          const property = await ctx.db.get(flag.propertyId);
          const job = await ctx.db.get(flag.jobId);
          return {
            ...flag,
            propertyName: property?.name ?? "Unknown",
            jobDate: job?.scheduledDate ?? "Unknown",
          };
        })
      );
    });
  },
});

/** Manager-scoped: list red flags only for jobs the manager can see. */
export const listForManager = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    if (user.role !== "manager") throw new Error("Manager access required");
    if (user.companyId !== args.companyId) throw new Error("Access denied");

    let flags;
    if (args.status) {
      flags = await ctx.db
        .query("redFlags")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId).eq("status", args.status as any)
        )
        .collect();
    } else {
      flags = await ctx.db
        .query("redFlags")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId)
        )
        .collect();
    }

    // If manager can't see all jobs, filter to only their assigned jobs
    if (!hasManagerPermission(user, "canSeeAllJobs")) {
      const visibleJobIds = new Set<string>();
      for (const flag of flags) {
        const job = await ctx.db.get(flag.jobId);
        if (job && job.assignedManagerId === user._id) {
          visibleJobIds.add(flag.jobId);
        }
      }
      flags = flags.filter((f) => visibleJobIds.has(f.jobId));
    }

    return Promise.all(
      flags.map(async (flag) => {
        const property = await ctx.db.get(flag.propertyId);
        const job = await ctx.db.get(flag.jobId);
        return {
          ...flag,
          propertyName: property?.name ?? "Unknown",
          jobDate: job?.scheduledDate ?? "Unknown",
        };
      })
    );
  },
});

export const listByJob = query({
  args: { jobId: v.id("jobs"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) return [];
    if (job.companyId !== user.companyId) throw new Error("Access denied");

    // Manager visibility: if manager can't see all jobs, only allow assigned jobs
    if (user.role === "manager" && !hasManagerPermission(user, "canSeeAllJobs")) {
      if (job.assignedManagerId !== user._id) throw new Error("Access denied");
    }

    return await ctx.db
      .query("redFlags")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();
  },
});
