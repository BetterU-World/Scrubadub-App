import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { sameSchedule, scheduleWindow } from "./jobScheduleModel";
type Ctx = MutationCtx | QueryCtx;
type LocationRecord = { companyId: Doc<"companies">["_id"]; clientRelationshipId?: Doc<"clientRelationships">["_id"]; propertyId?: Doc<"properties">["_id"]; commercialAccountId?: Doc<"commercialAccounts">["_id"] };
/** Current service location ownership, never historical property/client snapshots. */
export async function currentClientLocation(ctx: Ctx, record: LocationRecord) {
  if (record.propertyId) {
    const property = await ctx.db.get(record.propertyId);
    return property?.active && property.companyId === record.companyId && property.clientRelationshipId === record.clientRelationshipId
      ? { name: property.name, address: property.address } : null;
  }
  if (record.commercialAccountId) {
    const account = await ctx.db.get(record.commercialAccountId);
    return account && account.companyId === record.companyId && account.clientRelationshipId === record.clientRelationshipId
      ? { name: account.clientName, address: account.serviceAddress } : null;
  }
  return null;
}

export async function clientVisibleService(ctx: Ctx, job: Doc<"jobs">, clientUserId?: Doc<"clientUsers">["_id"]) {
  if (clientUserId && job.sourceClientRequestId) {
    const request = await ctx.db.get(job.sourceClientRequestId);
    if (!request || request.companyId !== job.companyId || request.clientRelationshipId !== job.clientRelationshipId ||
        (request.originClientUserId && request.originClientUserId !== clientUserId)) return false;
  }
  if (job.sharedFromJobId || job.sharedFromCompanyName || !job.clientRelationshipId) return false;
  if (await ctx.db.query("sharedJobs").withIndex("by_copiedJobId", q => q.eq("copiedJobId", job._id)).first()) return false;
  return !!await currentClientLocation(ctx, job);
}

async function audience(ctx: Ctx, job: Doc<"jobs">) {
  if (!job.sourceClientRequestId || !job.clientRelationshipId || job.sharedFromJobId || job.sharedFromCompanyName) return null;
  if (await ctx.db.query("sharedJobs").withIndex("by_copiedJobId", q => q.eq("copiedJobId", job._id)).first()) return null;
  const request = await ctx.db.get(job.sourceClientRequestId);
  if (!request || request.status !== "converted" || request.companyId !== job.companyId || request.clientRelationshipId !== job.clientRelationshipId ||
      request.propertyId !== job.propertyId || request.commercialAccountId !== job.commercialAccountId) return null;
  const relationship = await ctx.db.get(job.clientRelationshipId);
  if (!relationship || relationship.companyId !== job.companyId || relationship.status !== "active" || !relationship.clientUserId) return null;
  const client = await ctx.db.get(relationship.clientUserId);
  const location = await currentClientLocation(ctx, job);
  if (!client || client.status !== "active" || !location ||
      (request.originClientUserId && request.originClientUserId !== client._id)) return null;
  return { request, relationship, client, location };
}

/** Only canonical company commitment boundaries call this, within their transaction. */
export async function recordClientSchedulingEvent(ctx: MutationCtx, job: Doc<"jobs">,
  kind: Doc<"clientSchedulingEvents">["kind"], before?: Doc<"jobs">) {
  if (kind === "service_confirmed" ? job.status !== "confirmed" : kind === "service_cancelled" ? job.status !== "cancelled" :
      !["confirmed", "scheduled", "denied", "in_progress", "rework_requested"].includes(job.status)) return;
  const eligible = await audience(ctx, job);
  if (!eligible) return;
  const revision = kind === "service_confirmed" ? 0 : job.scheduleRevision ?? 0;
  const prior = await ctx.db.query("clientSchedulingEvents").withIndex("by_job_kind_revision",
    q => q.eq("jobId", job._id).eq("kind", kind).eq("revision", revision)).unique();
  if (prior) return;
  const company = await ctx.db.get(job.companyId);
  if (!company) return;
  await ctx.db.insert("clientSchedulingEvents", { companyId: job.companyId, clientUserId: eligible.client._id,
    clientRelationshipId: eligible.relationship._id, requestId: eligible.request._id, jobId: job._id,
    propertyId: job.propertyId, commercialAccountId: job.commercialAccountId, kind, revision,
    occurredAt: kind === "service_cancelled" ? job.cancelledAt ?? Date.now() : Date.now(), timezone: company.timezone,
    before: before ? scheduleWindow(before) : undefined, after: scheduleWindow(job) });
}

/** Bounded current-authority projection for both existing request timeline and Services. */
export async function clientSchedulingEvents(ctx: Ctx, client: Doc<"clientUsers">, requestId?: Doc<"clientRequests">["_id"]) {
  const rows = requestId
    ? await ctx.db.query("clientSchedulingEvents").withIndex("by_client_request", q => q.eq("clientUserId", client._id).eq("requestId", requestId)).order("desc").take(100)
    : await ctx.db.query("clientSchedulingEvents").withIndex("by_client_created", q => q.eq("clientUserId", client._id)).order("desc").take(100);
  const result = [];
  for (const event of rows) {
    const job = await ctx.db.get(event.jobId);
    if (!job || job.companyId !== event.companyId || job.sourceClientRequestId !== event.requestId ||
        job.clientRelationshipId !== event.clientRelationshipId || job.propertyId !== event.propertyId || job.commercialAccountId !== event.commercialAccountId) continue;
    const eligible = await audience(ctx, job);
    if (!eligible || eligible.client._id !== client._id || event.clientUserId !== client._id) continue;
    if (event.kind === "service_rescheduled" &&
        (event.revision !== (job.scheduleRevision ?? 0) || !sameSchedule(event.after, job))) continue;
    if (event.kind === "service_cancelled" && job.status !== "cancelled") continue;
    const company = await ctx.db.get(event.companyId);
    if (!company) continue;
    // Explicit allowlist: no worker identity, private notes, diagnostics, access codes or finances.
    result.push({ id: String(event._id), kind: event.kind, occurredAt: event.occurredAt, revision: event.revision,
      requestId: event.requestId, timezone: event.timezone, before: event.before, after: event.after,
      locationName: eligible.location.name, providerName: company.name });
  }
  return result;
}
