import { query } from "../_generated/server";
import { v } from "convex/values";
import { assertCompanyAccess } from "../lib/auth";

export const getStats = query({
  args: { companyId: v.id("companies"), userId: v.id("users") },
  handler: async (ctx, args) => {
    await assertCompanyAccess(ctx, args.userId, args.companyId);

    const properties = await ctx.db
      .query("properties")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    const employees = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    const today = new Date().toISOString().split("T")[0];

    const allJobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) =>
        q.eq("companyId", args.companyId)
      )
      .collect();

    const activeJobs = allJobs.filter(
      (j) => j.status !== "cancelled" && j.status !== "approved"
    );

    const upcomingJobs = allJobs
      .filter(
        (j) =>
          j.scheduledDate >= today &&
          j.status !== "cancelled" &&
          j.status !== "approved"
      )
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
      .slice(0, 5);

    const enrichedJobs = await Promise.all(
      upcomingJobs.map(async (job) => {
        const property = await ctx.db.get(job.propertyId);
        return {
          ...job,
          propertyName: property?.name ?? "Unknown Property",
        };
      })
    );

    const openRedFlags = await ctx.db
      .query("redFlags")
      .withIndex("by_companyId_status", (q) =>
        q.eq("companyId", args.companyId).eq("status", "open")
      )
      .collect();

    return {
      propertyCount: properties.filter((p) => p.active).length,
      employeeCount: employees.filter((e) => e.status === "active").length,
      activeJobCount: activeJobs.length,
      openRedFlagCount: openRedFlags.length,
      upcomingJobs: enrichedJobs,
      recentRedFlags: openRedFlags.slice(0, 5),
    };
  },
});
