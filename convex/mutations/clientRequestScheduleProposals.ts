import { mutation } from "../_generated/server";
import { v } from "convex/values";
import {
  requireOwnerManagerSession,
  requireVerifiedClientSession,
  requireActiveClientRelationship,
} from "../lib/sessionAuth";
import {
  createJobFromClientRequest,
  validateClientRequestSchedule,
} from "../lib/clientRequestScheduling";
import { createNotification, logAudit } from "../lib/helpers";

const jobType = v.union(
  v.literal("standard"),
  v.literal("deep_clean"),
  v.literal("turnover"),
  v.literal("move_in_out"),
  v.literal("maintenance"),
  v.literal("post_construction"),
);
const staffArgs = {
  userId: v.optional(v.id("users")),
  sessionToken: v.string(),
};
const clientArgs = {
  clientUserId: v.id("clientUsers"),
  sessionToken: v.string(),
};

async function requireSchedulingActor(ctx: any, args: any) {
  const actor = await requireOwnerManagerSession(
    ctx,
    args.sessionToken,
    args.userId,
  );
  if (actor.role === "manager" && actor.canManageSchedule !== true)
    throw new Error("Schedule management permission required");
  return actor;
}

async function notifyBusiness(
  ctx: any,
  request: any,
  actingClient: any,
  title: string,
  message: string,
) {
  const users = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", request.companyId))
    .collect();
  for (const user of users.filter(
    (item: any) =>
      item.status === "active" &&
      (item.role === "owner" ||
        (item.role === "manager" && item.canManageSchedule)),
  )) {
    await createNotification(ctx, {
      companyId: request.companyId,
      userId: user._id,
      type: "new_client_request",
      title,
      message,
      relatedClientRequestId: request._id,
    });
  }
}

export const createOrReplace = mutation({
  args: {
    ...staffArgs,
    requestId: v.id("clientRequests"),
    proposedDate: v.string(),
    proposedStartTime: v.string(),
    durationMinutes: v.number(),
    jobType,
    clientNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireSchedulingActor(ctx, args);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.companyId !== actor.companyId)
      throw new Error("Access denied");
    const existingJob = await ctx.db
      .query("jobs")
      .withIndex("by_sourceClientRequestId", (q) =>
        q.eq("sourceClientRequestId", request._id),
      )
      .first();
    if (existingJob) throw new Error("Request already scheduled");
    const note = args.clientNote?.trim();
    await validateClientRequestSchedule(ctx, request, {
      scheduledDate: args.proposedDate,
      startTime: args.proposedStartTime,
      durationMinutes: args.durationMinutes,
      type: args.jobType,
      clientSchedulingNote: note,
    });
    const pending = await ctx.db
      .query("clientRequestScheduleProposals")
      .withIndex("by_clientRequestId_status", (q) =>
        q.eq("clientRequestId", request._id).eq("status", "pending"),
      )
      .collect();
    const now = Date.now();
    for (const proposal of pending)
      await ctx.db.patch(proposal._id, {
        status: "replaced",
        replacedAt: now,
        respondedAt: now,
      });
    const proposalId = await ctx.db.insert("clientRequestScheduleProposals", {
      companyId: actor.companyId,
      clientRequestId: request._id,
      clientRelationshipId: request.clientRelationshipId!,
      proposedDate: args.proposedDate,
      proposedStartTime: args.proposedStartTime,
      durationMinutes: args.durationMinutes,
      jobType: args.jobType,
      clientNote: note || undefined,
      status: "pending",
      createdByUserId: actor._id,
      createdAt: now,
    });
    await logAudit(ctx, {
      companyId: actor.companyId,
      userId: actor._id,
      action: pending.length
        ? "replace_request_schedule_proposal"
        : "create_request_schedule_proposal",
      entityType: "clientRequestScheduleProposal",
      entityId: proposalId,
      details: JSON.stringify({ requestId: request._id }),
    });
    return { proposalId, replacedProposalIds: pending.map((item) => item._id) };
  },
});

export const withdraw = mutation({
  args: { ...staffArgs, proposalId: v.id("clientRequestScheduleProposals") },
  handler: async (ctx, args) => {
    const actor = await requireSchedulingActor(ctx, args);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.companyId !== actor.companyId)
      throw new Error("Access denied");
    if (proposal.status === "withdrawn") return { replayed: true };
    if (proposal.status !== "pending")
      throw new Error("Proposal no longer available");
    const now = Date.now();
    await ctx.db.patch(proposal._id, {
      status: "withdrawn",
      withdrawnAt: now,
      respondedAt: now,
    });
    await logAudit(ctx, {
      companyId: actor.companyId,
      userId: actor._id,
      action: "withdraw_request_schedule_proposal",
      entityType: "clientRequestScheduleProposal",
      entityId: proposal._id,
    });
    return { replayed: false };
  },
});

export const accept = mutation({
  args: { ...clientArgs, proposalId: v.id("clientRequestScheduleProposals") },
  handler: async (ctx, args) => {
    const client = await requireVerifiedClientSession(
      ctx,
      args.sessionToken,
      args.clientUserId,
    );
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal no longer available");
    const request = await ctx.db.get(proposal.clientRequestId);
    if (!request) throw new Error("Request not found");
    await requireActiveClientRelationship(
      ctx,
      client,
      proposal.clientRelationshipId,
    );
    if (
      request.clientRelationshipId !== proposal.clientRelationshipId ||
      request.companyId !== proposal.companyId
    )
      throw new Error("Access denied");
    if (proposal.status === "accepted" && proposal.resultingJobId)
      return { jobId: proposal.resultingJobId, replayed: true };
    if (proposal.status !== "pending")
      throw new Error("Proposal no longer available");
    const current = await ctx.db
      .query("clientRequestScheduleProposals")
      .withIndex("by_clientRequestId_status", (q) =>
        q.eq("clientRequestId", request._id).eq("status", "pending"),
      )
      .collect();
    if (current.length !== 1 || current[0]._id !== proposal._id)
      throw new Error("Proposal no longer available");
    const result = await createJobFromClientRequest(
      ctx,
      request,
      {
        scheduledDate: proposal.proposedDate,
        startTime: proposal.proposedStartTime,
        durationMinutes: proposal.durationMinutes,
        type: proposal.jobType,
        clientSchedulingNote: proposal.clientNote,
      },
      {
        userId: proposal.createdByUserId,
        action: "client_accept_request_schedule_proposal",
        details: { proposalId: proposal._id, clientUserId: client._id },
      },
    );
    if (
      result.replayed &&
      result.job?.sourceClientRequestId === request._id &&
      proposal.resultingJobId !== result.job._id
    )
      throw new Error("Request already scheduled");
    const now = Date.now();
    await ctx.db.patch(proposal._id, {
      status: "accepted",
      acceptedAt: now,
      respondedAt: now,
      resultingJobId: result.job!._id,
    });
    await notifyBusiness(
      ctx,
      request,
      client,
      "Proposed time accepted",
      `${client.displayName} accepted the proposed schedule.`,
    );
    return { jobId: result.job!._id, replayed: false };
  },
});

export const decline = mutation({
  args: { ...clientArgs, proposalId: v.id("clientRequestScheduleProposals") },
  handler: async (ctx, args) => {
    const client = await requireVerifiedClientSession(
      ctx,
      args.sessionToken,
      args.clientUserId,
    );
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal no longer available");
    const request = await ctx.db.get(proposal.clientRequestId);
    if (!request) throw new Error("Request not found");
    await requireActiveClientRelationship(
      ctx,
      client,
      proposal.clientRelationshipId,
    );
    if (
      request.clientRelationshipId !== proposal.clientRelationshipId ||
      request.companyId !== proposal.companyId
    )
      throw new Error("Access denied");
    if (proposal.status === "declined") return { replayed: true };
    if (proposal.status !== "pending")
      throw new Error("Proposal no longer available");
    const now = Date.now();
    await ctx.db.patch(proposal._id, {
      status: "declined",
      declinedAt: now,
      respondedAt: now,
    });
    await notifyBusiness(
      ctx,
      request,
      client,
      "Proposed time declined",
      `${client.displayName} declined the proposed schedule. The request remains open.`,
    );
    return { replayed: false };
  },
});
