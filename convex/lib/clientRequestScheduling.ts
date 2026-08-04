import { logAudit } from "./helpers";
import { isExistingClientServiceRequest } from "./requestContext";

export const REQUEST_JOB_TYPES = [
  "standard",
  "deep_clean",
  "turnover",
  "move_in_out",
  "maintenance",
  "post_construction",
] as const;

function localDate(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function localTime(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

export async function validateClientRequestSchedule(
  ctx: any,
  request: any,
  schedule: any,
) {
  if (!request.clientRelationshipId)
    throw new Error("Active client relationship required");
  const relationship = await ctx.db.get(request.clientRelationshipId);
  if (
    !relationship ||
    relationship.companyId !== request.companyId ||
    relationship.status !== "active"
  )
    throw new Error("Active client relationship required");
  if (["declined", "archived"].includes(request.status))
    throw new Error("Request cannot be scheduled in its current state");
  if (!(await isExistingClientServiceRequest(ctx, request)))
    throw new Error("Request is not an existing-client job request");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(schedule.scheduledDate) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.startTime)
  )
    throw new Error("Invalid final schedule");
  const company = await ctx.db.get(request.companyId);
  const timeZone = company?.timezone || "UTC";
  if (
    !company ||
    schedule.scheduledDate < localDate(timeZone) ||
    (schedule.scheduledDate === localDate(timeZone) &&
      schedule.startTime < localTime(timeZone))
  )
    throw new Error("Final schedule cannot be in the past");
  if (
    !Number.isInteger(schedule.durationMinutes) ||
    schedule.durationMinutes < 30 ||
    schedule.durationMinutes > 1440
  )
    throw new Error("Invalid service duration");
  if (!REQUEST_JOB_TYPES.includes(schedule.type))
    throw new Error("Unsupported service type");
  const clientSchedulingNote = schedule.clientSchedulingNote?.trim();
  if (clientSchedulingNote && clientSchedulingNote.length > 500)
    throw new Error("Scheduling note must be 500 characters or fewer");
  let propertyId;
  let commercialAccountId;
  if (request.propertyId) {
    const property = await ctx.db.get(request.propertyId);
    if (
      !property ||
      property.companyId !== request.companyId ||
      property.clientRelationshipId !== relationship._id ||
      !property.active
    )
      throw new Error("Service location is unavailable");
    propertyId = property._id;
  } else if (request.commercialAccountId) {
    const account = await ctx.db.get(request.commercialAccountId);
    if (
      !account ||
      account.companyId !== request.companyId ||
      account.clientRelationshipId !== relationship._id ||
      account.status !== "active"
    )
      throw new Error("Service location is unavailable");
    commercialAccountId = account._id;
  } else throw new Error("Service location is unavailable");
  return {
    company,
    relationship,
    propertyId,
    commercialAccountId,
    clientSchedulingNote,
  };
}

export async function createJobFromClientRequest(
  ctx: any,
  request: any,
  schedule: any,
  audit: { userId: any; action: string; details?: any },
) {
  const existing = await ctx.db
    .query("jobs")
    .withIndex("by_sourceClientRequestId", (q: any) =>
      q.eq("sourceClientRequestId", request._id),
    )
    .first();
  if (existing) return { job: existing, replayed: true };
  const validated = await validateClientRequestSchedule(ctx, request, schedule);
  const jobId = await ctx.db.insert("jobs", {
    companyId: request.companyId,
    clientRelationshipId: validated.relationship._id,
    propertyId: validated.propertyId,
    commercialAccountId: validated.commercialAccountId,
    cleanerIds: [],
    type: schedule.type,
    status: "confirmed",
    scheduledDate: schedule.scheduledDate,
    startTime: schedule.startTime,
    durationMinutes: schedule.durationMinutes,
    sourceClientRequestId: request._id,
    clientSchedulingNote: validated.clientSchedulingNote || undefined,
    requireConfirmation: false,
    acceptanceStatus: "accepted",
    reworkCount: 0,
    requiredAddOnSnapshots: request.requestedAddOnSnapshots?.map(
      (item: any, index: number) => ({
        snapshotId: `request:${request._id}:${index}`,
        name: item.name,
        quantity: item.quantity,
        unitLabel: item.unitLabel,
      }),
    ),
  });
  await ctx.db.patch(request._id, {
    status: "converted",
    leadStage: "converted",
    lastStageChangedAt: Date.now(),
  });
  await logAudit(ctx, {
    companyId: request.companyId,
    userId: audit.userId,
    action: audit.action,
    entityType: "job",
    entityId: jobId,
    details: JSON.stringify({ requestId: request._id, ...audit.details }),
  });
  return { job: await ctx.db.get(jobId), replayed: false };
}
