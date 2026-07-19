import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedStaffSession } from "../lib/sessionAuth";
import { copyScheduleAddOnSnapshots } from "../lib/acceptedProposalAddOnSnapshots";

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

const addOnSelectionsValidator = v.optional(v.array(v.object({
  sourceProposalLineItemId: v.string(),
  executionApplicability: v.union(v.literal("every_job"), v.literal("first_job")),
})));

async function requireCompanyUser(ctx: any, sessionToken: string, userId: any) {
  const user = await requireVerifiedStaffSession(ctx, sessionToken, userId);
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

async function getOwnedSchedule(ctx: any, sessionToken: string, userId: any, scheduleId: any) {
  const user = await requireCompanyUser(ctx, sessionToken, userId);
  const schedule = (await ctx.db.get(scheduleId)) as any;
  if (!schedule) throw new Error("Commercial schedule not found");
  if (schedule.companyId !== user.companyId) throw new Error("Access denied");
  return { user, schedule };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string, label: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} must be a valid date`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a valid date`);
  }
  return date;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS);
}

function clampStart(date: Date, scheduleStart: string | undefined) {
  if (!scheduleStart) return date;
  const start = parseDate(scheduleStart, "Schedule start date");
  return start > date ? start : date;
}

function clampEnd(date: Date, scheduleEnd: string | undefined) {
  if (!scheduleEnd) return date;
  const end = parseDate(scheduleEnd, "Schedule end date");
  return end < date ? end : date;
}

function anchorDate(schedule: any, fallback: Date) {
  return schedule.startDate ? parseDate(schedule.startDate, "Schedule start date") : fallback;
}

function scheduledDays(schedule: any, anchor: Date) {
  if (schedule.daysOfWeek?.length) return schedule.daysOfWeek;
  return [anchor.getUTCDay()];
}

function shouldGenerateForDate(schedule: any, date: Date, anchor: Date) {
  if (schedule.frequency === "daily") return true;

  if (schedule.frequency === "monthly") {
    const day = schedule.dayOfMonth ?? anchor.getUTCDate();
    return date.getUTCDate() === day;
  }

  const days = scheduledDays(schedule, anchor);
  if (!days.includes(date.getUTCDay())) return false;

  if (schedule.frequency === "biweekly") {
    const weeksFromAnchor = Math.floor(diffDays(anchor, date) / 7);
    return weeksFromAnchor % 2 === 0;
  }

  return true;
}

function generateServiceDates(schedule: any, start: Date, end: Date) {
  const anchor = anchorDate(schedule, start);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (date < anchor && schedule.frequency === "biweekly") continue;
    if (shouldGenerateForDate(schedule, date, anchor)) {
      dates.push(formatDate(date));
    }
  }
  return dates;
}

function firstEligibleServiceDate(schedule: any) {
  if (!schedule.startDate) throw new Error("A schedule start date is required before assigning proposal add-ons");
  const start = parseDate(schedule.startDate, "Schedule start date");
  const dates = generateServiceDates(schedule, start, addDays(start, 370));
  if (!dates.length) throw new Error("Schedule does not contain an eligible first service date");
  return dates[0];
}

async function buildScheduleAddOns(ctx: any, account: any, companyId: any, selections: any[] | undefined, schedule: any) {
  if (!selections?.length) return {};
  if (!account.sourceProposalId) throw new Error("This commercial account has no accepted proposal");
  const copied = await copyScheduleAddOnSnapshots(ctx, account.sourceProposalId, companyId, selections);
  return {
    sourceProposalId: copied.proposal._id,
    acceptedProposalAddOnSnapshots: copied.snapshots,
    firstJobAddOnTargetDate: copied.snapshots.some((item) => item.executionApplicability === "first_job")
      ? firstEligibleServiceDate(schedule)
      : undefined,
  };
}

function durationFromTimes(startTime: string | undefined, dueTime: string | undefined) {
  if (!startTime || !dueTime) return 60;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [dueHour, dueMinute] = dueTime.split(":").map(Number);
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(dueHour) ||
    !Number.isFinite(dueMinute)
  ) {
    return 60;
  }
  const start = startHour * 60 + startMinute;
  const due = dueHour * 60 + dueMinute;
  return due > start ? due - start : 60;
}

export const create = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    commercialAccountId: v.id("commercialAccounts"),
    addOnSelections: addOnSelectionsValidator,
    ...scheduleFields,
  },
  handler: async (ctx, args) => {
    const user = await requireCompanyUser(ctx, args.sessionToken, args.userId);
    const account = await ctx.db.get(args.commercialAccountId);
    if (!account) throw new Error("Commercial account not found");
    if (account.companyId !== user.companyId) throw new Error("Access denied");

    const now = Date.now();
    const schedulePatch = await buildSchedulePatch(ctx, account.companyId, args);
    return await ctx.db.insert("commercialSchedules", {
      companyId: account.companyId,
      commercialAccountId: account._id,
      status: "active",
      ...schedulePatch,
      ...(await buildScheduleAddOns(ctx, account, account.companyId, args.addOnSelections, schedulePatch)),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    scheduleId: v.id("commercialSchedules"),
    addOnSelections: addOnSelectionsValidator,
    ...scheduleFields,
  },
  handler: async (ctx, args) => {
    const { schedule } = await getOwnedSchedule(ctx, args.sessionToken, args.userId, args.scheduleId);
    const schedulePatch = await buildSchedulePatch(ctx, schedule.companyId, args);
    if (args.addOnSelections?.length && schedule.acceptedProposalAddOnSnapshots !== undefined) {
      throw new Error("Schedule add-on snapshots are immutable once assigned");
    }
    const account = await ctx.db.get(schedule.commercialAccountId) as any;
    if (!account || account.companyId !== schedule.companyId) throw new Error("Commercial account must belong to your company");
    await ctx.db.patch(args.scheduleId, {
      ...schedulePatch,
      ...(await buildScheduleAddOns(ctx, account, schedule.companyId, args.addOnSelections, schedulePatch)),
      updatedAt: Date.now(),
    });
  },
});

export const pause = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), scheduleId: v.id("commercialSchedules") },
  handler: async (ctx, args) => {
    await getOwnedSchedule(ctx, args.sessionToken, args.userId, args.scheduleId);
    await ctx.db.patch(args.scheduleId, {
      status: "paused",
      updatedAt: Date.now(),
    });
  },
});

export const reactivate = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), scheduleId: v.id("commercialSchedules") },
  handler: async (ctx, args) => {
    await getOwnedSchedule(ctx, args.sessionToken, args.userId, args.scheduleId);
    await ctx.db.patch(args.scheduleId, {
      status: "active",
      updatedAt: Date.now(),
    });
  },
});

export const end = mutation({
  args: { userId: v.id("users"), sessionToken: v.string(), scheduleId: v.id("commercialSchedules") },
  handler: async (ctx, args) => {
    await getOwnedSchedule(ctx, args.sessionToken, args.userId, args.scheduleId);
    await ctx.db.patch(args.scheduleId, {
      status: "ended",
      updatedAt: Date.now(),
    });
  },
});

export const generateCommercialJobsFromSchedule = mutation({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    commercialScheduleId: v.id("commercialSchedules"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { schedule } = await getOwnedSchedule(
      ctx,
      args.sessionToken,
      args.userId,
      args.commercialScheduleId
    );
    if (schedule.status !== "active") {
      throw new Error("Only active commercial schedules can generate jobs");
    }

    const account = (await ctx.db.get(schedule.commercialAccountId)) as any;
    if (!account || account.companyId !== schedule.companyId) {
      throw new Error("Commercial account must belong to your company");
    }

    await assertProperty(ctx, schedule.propertyId, schedule.companyId);
    await assertUserAssignment(ctx, schedule.assignedCleanerId, schedule.companyId, "cleaner");
    await assertUserAssignment(ctx, schedule.assignedManagerId, schedule.companyId, "manager");
    await assertTeamAssignment(ctx, schedule.assignedTeamId, schedule.companyId);

    const requestedStart = parseDate(args.startDate, "Start date");
    const requestedEnd = parseDate(args.endDate, "End date");
    if (requestedEnd < requestedStart) {
      throw new Error("End date must be after start date");
    }
    if (diffDays(requestedStart, requestedEnd) > 89) {
      throw new Error("Date range cannot exceed 90 days");
    }

    const start = clampStart(requestedStart, schedule.startDate);
    const end = clampEnd(requestedEnd, schedule.endDate);
    if (end < start) {
      return { createdCount: 0, skippedDuplicateCount: 0 };
    }

    const serviceDates = generateServiceDates(schedule, start, end);
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_commercialSchedule", (q: any) =>
        q.eq("commercialScheduleId", schedule._id)
      )
      .collect();
    const existingDates = new Set(existing.map((job: any) => job.scheduledDate));

    let createdCount = 0;
    let skippedDuplicateCount = 0;
    for (const scheduledDate of serviceDates) {
      if (existingDates.has(scheduledDate)) {
        skippedDuplicateCount += 1;
        continue;
      }

      const firstJobItems = !schedule.firstJobAddOnsAppliedAt && scheduledDate === schedule.firstJobAddOnTargetDate
        ? (schedule.acceptedProposalAddOnSnapshots ?? []).filter((item: any) => item.executionApplicability === "first_job")
        : [];
      const recurringItems = (schedule.acceptedProposalAddOnSnapshots ?? []).filter((item: any) => item.executionApplicability === "every_job");
      const jobAddOns = [...recurringItems, ...firstJobItems].map((item: any) => ({ ...item, snapshotId: crypto.randomUUID() }));
      const jobId = await ctx.db.insert("jobs", {
        companyId: schedule.companyId,
        clientRelationshipId: account.clientRelationshipId,
        propertyId: schedule.propertyId,
        cleanerIds: schedule.assignedCleanerId ? [schedule.assignedCleanerId] : [],
        assignedManagerId: schedule.assignedManagerId,
        assignedTeamId: schedule.assignedTeamId,
        type: "standard",
        status: "scheduled",
        scheduledDate,
        startTime: schedule.defaultStartTime,
        durationMinutes: durationFromTimes(schedule.defaultStartTime, schedule.defaultDueTime),
        notes: schedule.notes,
        commercialAccountId: account._id,
        commercialScheduleId: schedule._id,
        generatedFromCommercialSchedule: true,
        sourceProposalId: jobAddOns.length ? schedule.sourceProposalId : undefined,
        acceptedProposalAddOnSnapshots: jobAddOns.length ? jobAddOns : undefined,
        reworkCount: 0,
        acceptanceStatus: "pending",
      });
      if (firstJobItems.length) {
        await ctx.db.patch(schedule._id, {
          firstJobAddOnsAppliedAt: Date.now(),
          firstJobAddOnsAppliedToJobId: jobId,
          updatedAt: Date.now(),
        });
        schedule.firstJobAddOnsAppliedAt = Date.now();
      }
      existingDates.add(scheduledDate);
      createdCount += 1;
    }

    return { createdCount, skippedDuplicateCount };
  },
});

