import { query } from "../_generated/server";
import { v } from "convex/values";
import {
  requireOwnerManagerSession,
  requireOwnerSession,
  requireStaffCompany,
  requireVerifiedStaffSession,
} from "../lib/sessionAuth";
import { deriveLeadPipelineState } from "../lib/leadPipelineState";
import {
  classifyRequestContext,
  isExistingClientServiceRequest,
} from "../lib/requestContext";

const REQUEST_LIST_CAP = 2_000;
const PIPELINE_LINKED_RECORD_CAP = 5_000;

/**
 * Public query – returns minimal branding info for a company given its
 * publicRequestToken.  No auth required.  Returns null for invalid tokens
 * so the UI can show an error state without leaking data.
 */
export const getCompanyByRequestToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_publicRequestToken", (q) =>
        q.eq("publicRequestToken", args.token),
      )
      .first();

    if (!company) return null;

    return { companyName: company.name };
  },
});

/**
 * List all client requests for a company.
 * Requires authenticated user who belongs to the company.
 */
export const getCompanyRequests = query({
  args: {
    companyId: v.id("companies"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("accepted"),
        v.literal("declined"),
        v.literal("converted"),
        v.literal("contacted"),
        v.literal("archived"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireStaffCompany(
      ctx,
      args.sessionToken,
      args.companyId,
      args.userId,
    );

    if (args.status) {
      const requests = await ctx.db
        .query("clientRequests")
        .withIndex("by_companyId_status", (q) =>
          q.eq("companyId", args.companyId).eq("status", args.status!),
        )
        .take(REQUEST_LIST_CAP);
      const classified = await Promise.all(
        requests.map(async (request) => ({
          request,
          operational: await isExistingClientServiceRequest(ctx, request),
        })),
      );
      return classified
        .filter((item) => !item.operational)
        .map((item) => item.request);
    }

    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .take(REQUEST_LIST_CAP);
    const classified = await Promise.all(
      requests.map(async (request) => ({
        request,
        operational: await isExistingClientServiceRequest(ctx, request),
      })),
    );
    return classified
      .filter((item) => !item.operational)
      .map((item) => item.request);
  },
});

/**
 * Get a single client request by ID.
 * Requires authenticated user who belongs to the request's company.
 */
export const getRequestById = query({
  args: {
    id: v.id("clientRequests"),
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireVerifiedStaffSession(
      ctx,
      args.sessionToken,
      args.userId,
    );

    const request = await ctx.db.get(args.id);
    if (!request) return null;

    if (request.companyId !== user.companyId) {
      throw new Error("Access denied");
    }

    const clientRelationship = request.clientRelationshipId
      ? await ctx.db.get(request.clientRelationshipId)
      : null;
    const linkedClientUser = clientRelationship?.clientUserId
      ? await ctx.db.get(clientRelationship.clientUserId)
      : null;
    const pendingClientUser = clientRelationship?.pendingInviteClientUserId
      ? await ctx.db.get(clientRelationship.pendingInviteClientUserId)
      : null;
    const clientPortalStatus =
      linkedClientUser?.status === "active"
        ? "active"
        : clientRelationship?.inviteTokenHash ||
            linkedClientUser?.status === "pending" ||
            pendingClientUser
          ? "pending"
          : "not_invited";
    const [
      walkthroughs,
      proposals,
      agreements,
      commercialAccounts,
      scheduledJob,
    ] = await Promise.all([
      ctx.db
        .query("walkthroughs")
        .withIndex("by_clientRequest", (q) =>
          q.eq("clientRequestId", request._id),
        )
        .collect(),
      ctx.db
        .query("proposals")
        .withIndex("by_clientRequestId", (q) =>
          q.eq("clientRequestId", request._id),
        )
        .collect(),
      ctx.db
        .query("serviceAgreements")
        .withIndex("by_clientRequest", (q) =>
          q.eq("clientRequestId", request._id),
        )
        .collect(),
      ctx.db
        .query("commercialAccounts")
        .withIndex("by_clientRequestId", (q) =>
          q.eq("clientRequestId", request._id),
        )
        .collect(),
      ctx.db
        .query("jobs")
        .withIndex("by_sourceClientRequestId", (q) =>
          q.eq("sourceClientRequestId", request._id),
        )
        .first(),
    ]);
    const pipeline = deriveLeadPipelineState({
      request,
      walkthroughs,
      proposals,
      agreements,
      commercialAccounts,
      clientPortalStatus,
    });

    return {
      ...request,
      requestContext: await classifyRequestContext(ctx, request),
      clientRelationship:
        clientRelationship?.companyId === request.companyId
          ? {
              _id: clientRelationship._id,
              displayName: clientRelationship.displayName,
              businessName: clientRelationship.businessName,
              clientType: clientRelationship.clientType,
              status: clientRelationship.status,
              email: clientRelationship.email,
            }
          : null,
      clientPortalStatus,
      clientPortalInviteSentAt: clientRelationship?.inviteSentAt,
      pipeline,
      scheduledJob:
        scheduledJob?.companyId === request.companyId
          ? {
              _id: scheduledJob._id,
              scheduledDate: scheduledJob.scheduledDate,
              startTime: scheduledJob.startTime,
              durationMinutes: scheduledJob.durationMinutes,
              status: scheduledJob.status,
              clientSchedulingNote: scheduledJob.clientSchedulingNote,
            }
          : null,
    };
  },
});

async function requireJobRequestStaff(
  ctx: any,
  args: { userId?: any; sessionToken: string },
) {
  const actor = await requireOwnerManagerSession(
    ctx,
    args.sessionToken,
    args.userId,
  );
  if (actor.role === "manager" && actor.canManageSchedule !== true)
    throw new Error("Schedule management permission required");
  return actor;
}

function operationalStatus(
  request: any,
  job: any,
  currentProposal: any,
  latestProposal: any,
) {
  if (job?.status === "in_progress") return "in_progress";
  if (job && (job.status === "approved" || job.completedAt)) return "completed";
  if (job && !["cancelled", "approved"].includes(job.status))
    return "scheduled";
  if (request.status === "declined") return "declined";
  if (request.status === "archived") return "closed";
  if (currentProposal) return "awaiting_client";
  if (latestProposal?.status === "declined") return "proposal_declined";
  return "action_required";
}

async function projectJobRequest(ctx: any, request: any) {
  const [relationship, property, account, jobs, scheduleProposals] =
    await Promise.all([
      ctx.db.get(request.clientRelationshipId),
      request.propertyId ? ctx.db.get(request.propertyId) : null,
      request.commercialAccountId
        ? ctx.db.get(request.commercialAccountId)
        : null,
      ctx.db
        .query("jobs")
        .withIndex("by_sourceClientRequestId", (q: any) =>
          q.eq("sourceClientRequestId", request._id),
        )
        .collect(),
      ctx.db
        .query("clientRequestScheduleProposals")
        .withIndex("by_clientRequestId_createdAt", (q: any) =>
          q.eq("clientRequestId", request._id),
        )
        .collect(),
    ]);
  const job =
    jobs.find((item: any) => item.status === "in_progress") ??
    jobs.find(
      (item: any) => !["cancelled", "approved"].includes(item.status),
    ) ??
    jobs.find((item: any) => item.status === "approved" || item.completedAt) ??
    null;
  const currentProposal =
    scheduleProposals.find((item: any) => item.status === "pending") ?? null;
  const latestProposal =
    [...scheduleProposals].sort(
      (a: any, b: any) => b.createdAt - a.createdAt,
    )[0] ?? null;
  return {
    _id: request._id,
    source: request.source,
    requesterName: request.requesterName,
    relationshipName: relationship?.businessName || relationship?.displayName,
    locationName:
      property?.name || account?.clientName || request.propertySnapshot?.name,
    locationAddress:
      property?.address ||
      account?.serviceAddress ||
      request.propertySnapshot?.address,
    locationType: property ? "property" : "commercial_account",
    propertyId: request.propertyId,
    commercialAccountId: request.commercialAccountId,
    clientRelationship: relationship
      ? {
          _id: relationship._id,
          status: relationship.status,
          displayName: relationship.displayName,
          businessName: relationship.businessName,
        }
      : null,
    requestedService: request.requestedService,
    requestedDate: request.requestedDate,
    timeWindow: request.timeWindow,
    requestedAddOns: request.requestedAddOnSnapshots ?? [],
    notes: request.notes,
    submittedAt: request.createdAt,
    status: operationalStatus(request, job, currentProposal, latestProposal),
    declinedAt: request.declinedAt,
    clientFacingDecisionNote: request.clientFacingDecisionNote,
    linkedJob: job
      ? {
          _id: job._id,
          status: job.status,
          scheduledDate: job.scheduledDate,
          startTime: job.startTime,
          durationMinutes: job.durationMinutes,
        }
      : null,
    scheduledJob: job
      ? {
          _id: job._id,
          status: job.status,
          scheduledDate: job.scheduledDate,
          startTime: job.startTime,
          durationMinutes: job.durationMinutes,
        }
      : null,
    currentScheduleProposal: currentProposal
      ? {
          _id: currentProposal._id,
          proposedDate: currentProposal.proposedDate,
          proposedStartTime: currentProposal.proposedStartTime,
          durationMinutes: currentProposal.durationMinutes,
          jobType: currentProposal.jobType,
          clientNote: currentProposal.clientNote,
          createdAt: currentProposal.createdAt,
        }
      : null,
    latestScheduleProposal: latestProposal
      ? {
          _id: latestProposal._id,
          status: latestProposal.status,
          proposedDate: latestProposal.proposedDate,
          proposedStartTime: latestProposal.proposedStartTime,
          createdAt: latestProposal.createdAt,
          declinedAt: latestProposal.declinedAt,
        }
      : null,
  };
}

export const listJobRequests = query({
  args: { userId: v.optional(v.id("users")), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireJobRequestStaff(ctx, args);
    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", actor.companyId))
      .take(REQUEST_LIST_CAP);
    const eligible = (
      await Promise.all(
        requests.map(async (request) => ({
          request,
          eligible: await isExistingClientServiceRequest(ctx, request),
        })),
      )
    ).filter((item) => item.eligible);
    return Promise.all(
      eligible.map((item) => projectJobRequest(ctx, item.request)),
    );
  },
});

export const getJobRequestDetail = query({
  args: {
    userId: v.optional(v.id("users")),
    sessionToken: v.string(),
    requestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const actor = await requireJobRequestStaff(ctx, args);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.companyId !== actor.companyId)
      throw new Error("Access denied");
    if (
      (await classifyRequestContext(ctx, request)) !==
      "existing_client_service_request"
    )
      return null;
    return projectJobRequest(ctx, request);
  },
});

// ── Lead Pipeline queries ─────────────────────────────────────

/**
 * List requests for the pipeline board.
 * Owner/manager, company-scoped operational projection. Pipeline stage is
 * derived from canonical linked records; legacy leadStage is never rewritten.
 */
export const listRequestsForPipeline = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    leadStage: v.optional(
      v.union(
        v.literal("new"),
        v.literal("contacted"),
        v.literal("walkthrough_scheduled"),
        v.literal("proposal_needed"),
        v.literal("proposal_sent"),
        v.literal("negotiating"),
        v.literal("accepted"),
        v.literal("declined"),
        v.literal("converted"),
        v.literal("quoted"),
        v.literal("won"),
        v.literal("lost"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerManagerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const companyId = user.companyId;

    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .take(REQUEST_LIST_CAP);

    const [
      proposals,
      walkthroughs,
      agreements,
      commercialAccounts,
      relationships,
    ] = await Promise.all([
      ctx.db
        .query("proposals")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .take(PIPELINE_LINKED_RECORD_CAP),
      ctx.db
        .query("walkthroughs")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .take(PIPELINE_LINKED_RECORD_CAP),
      ctx.db
        .query("serviceAgreements")
        .withIndex("by_company", (q) => q.eq("companyId", companyId))
        .take(PIPELINE_LINKED_RECORD_CAP),
      ctx.db
        .query("commercialAccounts")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .take(PIPELINE_LINKED_RECORD_CAP),
      ctx.db
        .query("clientRelationships")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .take(PIPELINE_LINKED_RECORD_CAP),
    ]);
    const relationshipMap = new Map(
      relationships.map((record) => [record._id, record]),
    );
    const group = <T extends { clientRequestId?: any }>(records: T[]) => {
      const map = new Map<string, T[]>();
      for (const record of records) {
        if (!record.clientRequestId) continue;
        const key = String(record.clientRequestId);
        map.set(key, [...(map.get(key) ?? []), record]);
      }
      return map;
    };
    const proposalsByRequest = group(proposals);
    const walkthroughsByRequest = group(walkthroughs);
    const agreementsByRequest = group(agreements);
    const accountsByRequest = group(commercialAccounts);

    const prospectRequests = (
      await Promise.all(
        requests.map(async (request) => ({
          request,
          operational: await isExistingClientServiceRequest(ctx, request),
        })),
      )
    )
      .filter((item) => !item.operational)
      .map((item) => item.request);
    const enriched = prospectRequests.map((request) => {
      const relationship = request.clientRelationshipId
        ? relationshipMap.get(request.clientRelationshipId)
        : undefined;
      const clientPortalStatus = relationship?.clientUserId
        ? ("active" as const)
        : relationship?.inviteTokenHash ||
            relationship?.pendingInviteClientUserId
          ? ("pending" as const)
          : ("not_invited" as const);
      const pipeline = deriveLeadPipelineState({
        request,
        proposals: proposalsByRequest.get(String(request._id)) ?? [],
        walkthroughs: walkthroughsByRequest.get(String(request._id)) ?? [],
        agreements: agreementsByRequest.get(String(request._id)) ?? [],
        commercialAccounts: accountsByRequest.get(String(request._id)) ?? [],
        clientPortalStatus,
      });
      return { ...request, pipeline };
    });

    const filtered = args.leadStage
      ? enriched.filter((r) => r.leadStage === args.leadStage)
      : enriched;

    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * List upcoming follow-ups for the owner.
 * Returns requests with nextFollowUpAt set, not in terminal stages (won/lost/archived).
 * dueOnly=true returns only overdue/today items.
 */
export const listFollowUps = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    dueOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const companyId = user.companyId;

    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .take(REQUEST_LIST_CAP);

    const withFollowUp = requests.filter((r) => {
      if (!(r as any).nextFollowUpAt) return false;
      // Exclude terminal stages
      const stage = (r as any).leadStage ?? "new";
      if (stage === "won" || stage === "lost") return false;
      if (r.status === "archived") return false;
      return true;
    });

    let results = withFollowUp;
    if (args.dueOnly) {
      const now = Date.now();
      results = withFollowUp.filter((r) => (r as any).nextFollowUpAt <= now);
    }

    // Sort soonest first
    results.sort(
      (a, b) =>
        ((a as any).nextFollowUpAt ?? 0) - ((b as any).nextFollowUpAt ?? 0),
    );

    if (args.limit) {
      results = results.slice(0, args.limit);
    }

    return results;
  },
});

// ── Client Portal queries ─────────────────────────────────────

/**
 * Public query – returns safe fields for a client portal given a portalToken.
 * No auth required; token scopes access.  Returns null for invalid/disabled.
 */
export const getClientPortalByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("clientRequests")
      .withIndex("by_portalToken", (q) => q.eq("portalToken", args.token))
      .first();

    if (!request || !request.portalEnabled) return null;

    // Fetch company branding from companySites (optional)
    const site = await ctx.db
      .query("companySites")
      .withIndex("by_companyId", (q) => q.eq("companyId", request.companyId))
      .first();

    const company = await ctx.db.get(request.companyId);

    return {
      requestId: request._id,
      requesterName: request.requesterName,
      propertyName: request.propertySnapshot?.name ?? null,
      propertyAddress: request.propertySnapshot?.address ?? null,
      requestedDate: request.requestedDate ?? null,
      timeWindow: request.timeWindow ?? null,
      status: request.status,
      clientNotes: request.clientNotes ?? "",
      notes: request.notes ?? null,
      // Company branding
      companyName: site?.brandName ?? company?.name ?? "Your Cleaning Company",
      companyLogoUrl: site?.logoUrl ?? null,
      companyPhone: site?.publicPhone ?? null,
      companyEmail: site?.publicEmail ?? null,
    };
  },
});

/**
 * List client feedback for the caller's company.
 * Owner-only, scoped to company's clientRequests.
 */
export const listClientFeedback = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    status: v.optional(v.union(v.literal("new"), v.literal("reviewed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const companyId = user.companyId;

    // Get all company requests
    const requests = await ctx.db
      .query("clientRequests")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .take(REQUEST_LIST_CAP);

    const requestMap = new Map(requests.map((r) => [r._id, r]));

    // Fetch feedback scoped to this company's requests via index
    const feedbackPerRequest = await Promise.all(
      requests.map((r) =>
        ctx.db
          .query("clientFeedback")
          .withIndex("by_clientRequestId_createdAt", (q) =>
            q.eq("clientRequestId", r._id),
          )
          .order("desc")
          .collect(),
      ),
    );
    let companyFeedback = feedbackPerRequest.flat();

    if (args.status) {
      companyFeedback = companyFeedback.filter((f) => f.status === args.status);
    }

    // Sort all results newest-first
    companyFeedback.sort((a, b) => b.createdAt - a.createdAt);

    const limited = args.limit
      ? companyFeedback.slice(0, args.limit)
      : companyFeedback;

    return limited.map((f) => {
      const req = requestMap.get(f.clientRequestId);
      return {
        ...f,
        requesterName: req?.requesterName ?? "Unknown",
        requesterEmail: req?.requesterEmail ?? "",
        requestSummary: req
          ? [req.propertySnapshot?.address, req.requestedDate]
              .filter(Boolean)
              .join(" — ") || "Request"
          : "Unknown request",
      };
    });
  },
});

/**
 * Get the latest feedback for a specific client request.
 * Owner-only, scoped to caller's company.
 */
export const getLatestFeedbackForRequest = query({
  args: {
    userId: v.id("users"),
    sessionToken: v.string(),
    clientRequestId: v.id("clientRequests"),
  },
  handler: async (ctx, args) => {
    const user = await requireOwnerSession(ctx, args.sessionToken, args.userId);

    const request = await ctx.db.get(args.clientRequestId);
    if (!request) return null;
    if (request.companyId !== user.companyId) throw new Error("Access denied");

    const feedback = await ctx.db
      .query("clientFeedback")
      .withIndex("by_clientRequestId_createdAt", (q) =>
        q.eq("clientRequestId", args.clientRequestId),
      )
      .order("desc")
      .first();

    return feedback;
  },
});
