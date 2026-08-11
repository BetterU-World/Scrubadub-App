import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerOrManagerCapability } from "../lib/sessionAuth";

const CAP = 5_000;
const date = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export const getOperationalSummary = query({
  args: { companyId: v.id("companies"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireOwnerOrManagerCapability(ctx, args.sessionToken, args.userId, "canViewAnalytics");
    if (actor.companyId !== args.companyId) throw new Error("Access denied");
    const now = Date.now();
    const today = date(now);
    const sevenAgo = date(now - 7 * 86400000);
    const thirtyAgo = date(now - 30 * 86400000);
    const [jobs, flags, users, properties] = await Promise.all([
      ctx.db.query("jobs").withIndex("by_companyId_scheduledDate", (q) => q.eq("companyId", args.companyId)).take(CAP),
      ctx.db.query("redFlags").withIndex("by_companyId_status", (q) => q.eq("companyId", args.companyId)).take(CAP),
      ctx.db.query("users").withIndex("by_companyId", (q) => q.eq("companyId", args.companyId)).collect(),
      ctx.db.query("properties").withIndex("by_companyId", (q) => q.eq("companyId", args.companyId)).collect(),
    ]);
    const names = new Map(users.map((user) => [String(user._id), user.name]));
    const propertyNames = new Map(properties.map((property) => [String(property._id), property.name]));
    const completionDate = (job: typeof jobs[number]) => job.completedAt ? date(job.completedAt) : job.scheduledDate;
    const completed = jobs.filter((job) => job.status === "approved");
    const jobs30 = jobs.filter((job) => job.scheduledDate >= thirtyAgo && job.status !== "cancelled");
    const flags30 = flags.filter((flag) => date(flag._creationTime) >= thirtyAgo);
    const propertyCounts = new Map<string, number>();
    for (const flag of flags30) propertyCounts.set(String(flag.propertyId), (propertyCounts.get(String(flag.propertyId)) ?? 0) + 1);
    const cleanerCompleted = new Map<string, number>();
    for (const job of completed.filter((job) => completionDate(job) >= thirtyAgo)) for (const id of job.cleanerIds) cleanerCompleted.set(String(id), (cleanerCompleted.get(String(id)) ?? 0) + 1);
    const quality = new Map<string, { total: number; reworks: number }>();
    for (const job of jobs30) for (const id of job.cleanerIds) { const key = String(id); const item = quality.get(key) ?? { total: 0, reworks: 0 }; item.total++; if (job.reworkCount > 0) item.reworks++; quality.set(key, item); }
    const reworked30 = jobs30.filter((job) => job.reworkCount > 0).length;
    return {
      completedToday: completed.filter((job) => completionDate(job) === today).length,
      completed7: completed.filter((job) => completionDate(job) >= sevenAgo).length,
      completed30: completed.filter((job) => completionDate(job) >= thirtyAgo).length,
      reworkRate: jobs30.length ? Math.round(reworked30 / jobs30.length * 100) : 0,
      reworked30, jobs30Count: jobs30.length, flagsOpened30: flags30.length,
      topProperties: [...propertyCounts].map(([id, count]) => ({ name: propertyNames.get(id) ?? "Unknown", count })).sort((a, b) => b.count - a.count).slice(0, 5),
      topCleaners: [...cleanerCompleted].map(([id, count]) => ({ name: names.get(id) ?? "Unknown", count })).sort((a, b) => b.count - a.count).slice(0, 5),
      bestQuality: [...quality].filter(([, item]) => item.total >= 2).map(([id, item]) => ({ name: names.get(id) ?? "Unknown", ...item })).sort((a, b) => a.reworks / a.total - b.reworks / b.total || b.total - a.total).slice(0, 5),
    };
  },
});
