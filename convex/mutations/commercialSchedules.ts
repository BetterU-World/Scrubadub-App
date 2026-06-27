import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

const frequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("biweekly"),
  v.literal("monthly"),
  v.literal("custom")
);

const scheduleFields = {
  propertyId: v.optional(v.id("properties")),
  title: v.string(),
  frequency: frequencyValidator,
  daysOfWeek: v.optional(v.array(v.number())),
  dayOfMonth: v.optional(v.number()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  defaultStartTime: v.optional(v.string()),
  defaultDueTime: v.optional(v.string()),
  assignedCleanerId: v.optional(v.id("users")),
  assignedManagerId: v.optional(v.id("users")),
  assignedTeamId: v.optional(v.id("teams")),
  notes: v.optional(v.string()),
};

async function requireCompanyUser(ctx: any, userId: any) {
  const user = await getSessionUser(ctx, userId);
  if (!user.companyId) throw new Error("Company access required");
  return user;
}

function cleanOptional(value: string | undefined, max = 1000) {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
}

function cleanRequired(value: string, fallback: string, max = 200) {
  return value.trim().slice(0, max) || fallback;
}

function cleanDays(days: number[] | undefined) {
  if (!days) return undefined;
  const unique = [...new Set(days)];
  for (const day of unique) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new Error("Days of week must be between 0 and 6");
    }
  }
  return unique.sort((a, b) => a - b);
}

function cleanDayOfMonth(day: number | undefined) {
  if (day === undefined) return undefined;
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("Day of month must be between 1 and 31");
  }
  return day;
}

async function assertProperty(ctx: any, propertyId: any, companyId: any) {
  if (!propertyId) return undefined;
  const property = await ctx.db.get(propertyId);
  if (!property || property.companyId !== companyId) {
    throw new Error("Property must belong to your company");
  }
  return propertyId;
}

async function assertUserAssignment(ctx: any, userId: any, companyId: any, role: string) {
  if (!userId) return undefined;
  const user = await ctx.db.get(userId);
  if (!user || user.companyId !== companyId || user.status !== "active" || user.role !== role) {
    throw new Error(`Assigned ${role} must be active in your company`);
  }
  return userId;
}

async function assertTeamAssignment(ctx: any, teamId: any, companyId: any) {
  if (!teamId) return undefined;
  const team = await ctx.db.get(teamId);
  if (!team || team.companyId !== companyId || !team.active) {
    throw new Error("Assigned team must be active in your company");
  }
  return teamId;
}

async function buildSchedulePatch(ctx: any, companyId: any, args: any) {
  return {
    propertyId: await assertProperty(ctx, args.propertyId, companyId),
    title: cleanRequired(args.title, "Commercial Schedule", 200),
    frequency: args.frequency,
    daysOfWeek: cleanDays(args.daysOfWeek),
    dayOfMonth: cleanDayOfMonth(args.dayOfMonth),
    startDate: cleanOptional(args.startDate, 50),
    endDate: cleanOptional(args.endDate, 50),
    defaultStartTime: cleanOptional(args.defaultStartTime, 50),
    defaultDueTime: cleanOptional(args.defaultDueTime, 50),
    assignedCleanerId: await assertUserAssignment(
      ctx,
      args.assignedCleanerId,
      companyId,
      "cleaner"
    ),
    assignedManagerId: await assertUserAssignment(
      ctx,
      args.assignedManagerId,
      companyId,
      "manager"
    ),
    assignedTeamId: await assertTeamAssignment(ctx, args.assignedTeamId, companyId),
    notes: cleanOptional(args.notes, 4000),
  };
}

async function getOwnedSchedule(ctx: any, userId: any, scheduleId: any) {
  const user = await requireCompanyUser(ctx, userId);
  const schedule = await ctx.db.get(scheduleId);
  if (!schedule) throw new Error("Commercial schedule not found");
  if (schedule.companyId !== user.companyId) throw new Error("Access denied");
  return { user, schedule };
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    commercialAccountId: v.id("commercialAccounts"),
    ...scheduleFields,
  },
  handler: async (ctx, args) => {
    const user = await requireCompanyUser(ctx, args.userId);
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account) throw new Error("Commercial account not found");
    if (account.companyId !== user.companyId) throw new Error("Access denied");

    const now = Date.now();
    return await ctx.db.insert("commercialSchedules", {
      companyId: account.companyId,
      commercialAccountId: account._id,
      status: "active",
      ...(await buildSchedulePatch(ctx, account.companyId, args)),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    scheduleId: v.id("commercialSchedules"),
    ...scheduleFields,
  },
  handler: async (ctx, args) => {
    const { schedule } = await getOwnedSchedule(ctx, args.userId, args.scheduleId);
    await ctx.db.patch(args.scheduleId, {
      ...(await buildSchedulePatch(ctx, schedule.companyId, args)),
      updatedAt: Date.now(),
    });
  },
});

export const pause = mutation({
  args: { userId: v.id("users"), scheduleId: v.id("commercialSchedules") },
  handler: async (ctx, args) => {
    await getOwnedSchedule(ctx, args.userId, args.scheduleId);
    await ctx.db.patch(args.scheduleId, {
      status: "paused",
      updatedAt: Date.now(),
    });
  },
});

export const reactivate = mutation({
  args: { userId: v.id("users"), scheduleId: v.id("commercialSchedules") },
  handler: async (ctx, args) => {
    await getOwnedSchedule(ctx, args.userId, args.scheduleId);
    await ctx.db.patch(args.scheduleId, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

export const end = mutation({
  args: { userId: v.id("users"), scheduleId: v.id("commercialSchedules") },
  handler: async (ctx, args) => {
    await getOwnedSchedule(ctx, args.userId, args.scheduleId);
    await ctx.db.patch(args.scheduleId, {
      status: "ended",
      updatedAt: Date.now(),
    });
  },
});

