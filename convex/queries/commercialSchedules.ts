import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerManagerSession } from "../lib/sessionAuth";

async function requireCompanyUser(ctx: any, sessionToken: string, userId: any) {
  return await requireOwnerManagerSession(ctx, sessionToken, userId);
}

async function decorateSchedule(ctx: any, schedule: any) {
  const [property, cleaner, manager, team] = await Promise.all([
    schedule.propertyId ? ctx.db.get(schedule.propertyId) : null,
    schedule.assignedCleanerId ? ctx.db.get(schedule.assignedCleanerId) : null,
    schedule.assignedManagerId ? ctx.db.get(schedule.assignedManagerId) : null,
    schedule.assignedTeamId ? ctx.db.get(schedule.assignedTeamId) : null,
  ]);

  return {
    ...schedule,
    propertyName: property?.companyId === schedule.companyId ? property.name : null,
    assignedCleanerName:
      cleaner?.companyId === schedule.companyId ? cleaner.name : null,
    assignedManagerName:
      manager?.companyId === schedule.companyId ? manager.name : null,
    assignedTeamName: team?.companyId === schedule.companyId ? team.name : null,
  };
}

export const getByCommercialAccount = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    commercialAccountId: v.id("commercialAccounts"),
  },
  handler: async (ctx, args) => {
    const user = await requireCompanyUser(ctx, args.sessionToken, args.userId);
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account) return [];
    if (account.companyId !== user.companyId) throw new Error("Access denied");

    const schedules = await ctx.db
      .query("commercialSchedules")
      .withIndex("by_commercialAccount", (q) =>
        q.eq("commercialAccountId", args.commercialAccountId)
      )
      .collect();

    schedules.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(schedules.map((schedule) => decorateSchedule(ctx, schedule)));
  },
});

export const getById = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    scheduleId: v.id("commercialSchedules"),
  },
  handler: async (ctx, args) => {
    const user = await requireCompanyUser(ctx, args.sessionToken, args.userId);
    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule) return null;
    if (schedule.companyId !== user.companyId) throw new Error("Access denied");
    return await decorateSchedule(ctx, schedule);
  },
});

