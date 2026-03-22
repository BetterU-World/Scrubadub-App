import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin, isSuperAdminEmail } from "../lib/auth";

export const getPlatformStats = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const today = new Date().toISOString().slice(0, 10);
    const date7 = new Date(sevenDaysAgo).toISOString().slice(0, 10);
    const date30 = new Date(thirtyDaysAgo).toISOString().slice(0, 10);

    // Hard cap to prevent unbounded memory usage at scale
    const SCAN_CAP = 10_000;

    // Companies
    const companies = await ctx.db.query("companies").take(SCAN_CAP);
    const totalCompanies = companies.length;

    // Users
    const users = await ctx.db.query("users").take(SCAN_CAP);
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.status === "active").length;

    // Jobs — only load last 30 days via scheduledDate window
    const allJobs = await ctx.db.query("jobs").take(SCAN_CAP);
    const recentJobs = allJobs.filter((j) => j.scheduledDate >= date30);
    const jobsCreated7d = allJobs.filter((j) => j._creationTime >= sevenDaysAgo).length;
    const jobsCreated30d = allJobs.filter((j) => j._creationTime >= thirtyDaysAgo).length;
    const jobsCompleted7d = recentJobs.filter(
      (j) => j.status === "approved" && j.scheduledDate >= date7
    ).length;
    const jobsCompleted30d = recentJobs.filter(
      (j) => j.status === "approved"
    ).length;
    const maintenanceCompleted7d = recentJobs.filter(
      (j) => j.status === "approved" && j.type === "maintenance" && j.scheduledDate >= date7
    ).length;
    const maintenanceCompleted30d = recentJobs.filter(
      (j) => j.status === "approved" && j.type === "maintenance"
    ).length;

    // Red flags
    const allFlags = await ctx.db.query("redFlags").take(SCAN_CAP);
    const redFlags7d = allFlags.filter((f) => f._creationTime >= sevenDaysAgo).length;
    const redFlags30d = allFlags.filter((f) => f._creationTime >= thirtyDaysAgo).length;

    // Active users (approximation: users who had a job in last 7 days)
    const recentJobUserIds = new Set<string>();
    for (const j of recentJobs.filter((j) => j.scheduledDate >= date7)) {
      for (const cid of j.cleanerIds) recentJobUserIds.add(cid);
    }
    const usersActive7d = recentJobUserIds.size;

    // Top companies by jobs (30d)
    const companyJobCounts: Record<string, number> = {};
    for (const j of recentJobs) {
      companyJobCounts[j.companyId] = (companyJobCounts[j.companyId] ?? 0) + 1;
    }
    const companyMap = new Map(companies.map((c) => [c._id, c.name]));
    const topCompanies = Object.entries(companyJobCounts)
      .map(([id, count]) => ({ name: companyMap.get(id as any) ?? "Unknown", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalCompanies,
      totalUsers,
      activeUsers,
      usersActive7d,
      jobsCreated7d,
      jobsCreated30d,
      jobsCompleted7d,
      jobsCompleted30d,
      maintenanceCompleted7d,
      maintenanceCompleted30d,
      redFlags7d,
      redFlags30d,
      topCompanies,
    };
  },
});

export const isSuperAdmin = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return false;
    return isSuperAdminEmail(user.email);
  },
});
