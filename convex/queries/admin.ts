import { query } from "../_generated/server";
import { v } from "convex/values";
import { hasPlatformAdmin } from "../lib/platformEntitlements";
import { requireSuperadminSession, requireVerifiedStaffSession } from "../lib/sessionAuth";

export const getPlatformStats = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  returns: v.object({ totalCompanies: v.number(), totalUsers: v.number(), activeUsers: v.number(), assignedWorkerAccounts7d: v.number(), jobsCreated7d: v.number(), jobsCreated30d: v.number(), jobsCompleted7d: v.number(), jobsCompleted30d: v.number(), maintenanceCompleted7d: v.number(), maintenanceCompleted30d: v.number(), redFlags7d: v.number(), redFlags30d: v.number(), topCompanies: v.array(v.object({ name: v.string(), count: v.number() })) }),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const today = new Date().toISOString().slice(0, 10);
    const date7 = new Date(sevenDaysAgo).toISOString().slice(0, 10);
    const date30 = new Date(thirtyDaysAgo).toISOString().slice(0, 10);

    // Hard cap to prevent unbounded memory usage at scale
    const SCAN_CAP = 10_000;

    // Companies
    const companies = await ctx.db.query("companies").take(SCAN_CAP + 1);
    const totalCompanies = companies.length;

    // Users
    const users = await ctx.db.query("users").take(SCAN_CAP + 1);
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.status === "active").length;

    // Legacy bounded scan; the V2 action uses complete paginated reads.
    const allJobs = await ctx.db.query("jobs").take(SCAN_CAP + 1);
    const recentJobs = allJobs.filter((j) => j.scheduledDate >= date30 && j.scheduledDate <= today && j.status !== "cancelled" && !j.sharedFromJobId);
    const canonicalJobs = allJobs.filter(j => !j.sharedFromJobId);
    const jobsCreated7d = canonicalJobs.filter((j) => j._creationTime > sevenDaysAgo && j._creationTime <= now).length;
    const jobsCreated30d = canonicalJobs.filter((j) => j._creationTime > thirtyDaysAgo && j._creationTime <= now).length;
    const completed7 = canonicalJobs.filter(j => j.completedAt !== undefined && j.completedAt > sevenDaysAgo && j.completedAt <= now);
    const completed30 = canonicalJobs.filter(j => j.completedAt !== undefined && j.completedAt > thirtyDaysAgo && j.completedAt <= now);
    const jobsCompleted7d = completed7.length;
    const jobsCompleted30d = completed30.length;
    const maintenanceCompleted7d = completed7.filter(j => j.type === "maintenance").length;
    const maintenanceCompleted30d = completed30.filter(j => j.type === "maintenance").length;

    // Red flags
    const allFlags = await ctx.db.query("redFlags").take(SCAN_CAP + 1);
    if ([companies, users, allJobs, allFlags].some(rows => rows.length > SCAN_CAP)) {
      throw new Error("Legacy report exceeds its read limit. Use the paginated Hub V2 report; no partial total is available.");
    }
    const redFlags7d = allFlags.filter((f) => f._creationTime > sevenDaysAgo && f._creationTime <= now).length;
    const redFlags30d = allFlags.filter((f) => f._creationTime > thirtyDaysAgo && f._creationTime <= now).length;

    // Assignment evidence only, never authenticated foreground activity.
    const recentJobUserIds = new Set<string>();
    for (const j of recentJobs.filter((j) => j.scheduledDate >= date7)) {
      for (const cid of j.cleanerIds) recentJobUserIds.add(cid);
    }
    const assignedWorkerAccounts7d = recentJobUserIds.size;

    // Top companies by jobs (30d)
    const companyJobCounts: Record<string, number> = {};
    for (const j of recentJobs) {
      companyJobCounts[j.companyId] = (companyJobCounts[j.companyId] ?? 0) + 1;
    }
    const companyMap = new Map<string, string>(companies.map((c) => [c._id, c.name]));
    const topCompanies = Object.entries(companyJobCounts)
      .map(([id, count]) => ({ name: companyMap.get(id) ?? "Unknown", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalCompanies,
      totalUsers,
      activeUsers,
      assignedWorkerAccounts7d,
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

export const getCompaniesWithUsers = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  returns: v.array(v.object({ name: v.string(), users: v.array(v.object({ name: v.string(), email: v.string() })) })),
  handler: async (ctx, args) => {
    await requireSuperadminSession(ctx, args.sessionToken, args.userId);

    const SCAN_CAP = 10_000;
    const companies = await ctx.db.query("companies").take(SCAN_CAP + 1);
    const users = await ctx.db.query("users").take(SCAN_CAP + 1);
    if (companies.length > SCAN_CAP || users.length > SCAN_CAP) throw new Error("Use the paginated Hub V2 company directory; no partial directory is available.");

    const usersByCompany = new Map<string, { name: string; email: string }[]>();
    for (const u of users) {
      if (!u.companyId) continue;
      const key = u.companyId as string;
      if (!usersByCompany.has(key)) usersByCompany.set(key, []);
      usersByCompany.get(key)!.push({ name: u.name, email: u.email });
    }

    return companies
      .map((c) => ({
        name: c.name,
        users: usersByCompany.get(c._id as string) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const isSuperAdmin = query({
  args: { userId: v.id("users"), sessionToken: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    // This eligibility probe is rendered in the ordinary sidebar. Legacy-only
    // users must fail closed without crashing unrelated navigation.
    if (!args.sessionToken) return false;
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    return await hasPlatformAdmin(ctx, user._id);
  },
});
