import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireOwnerSession,
  requireOwnerOrManagerCapability,
} from "./lib/sessionAuth";
import {
  approvedExecution,
  freezePerformedWorkers,
} from "./lib/performedWorkers";
import {
  buildTerms,
  sourceKey,
  recipientKey,
  projection,
  text,
  boundedTotal,
} from "./lib/outgoingLedger";
import { materializeTerms } from "./outgoingMutations";
import { planOutsideAllocation } from "./lib/outgoingAllocation";
import { requireAssignedJobExecutor } from "./lib/jobExecutionAuth";
import { getJobRecipientUserIds } from "./lib/teams";

const auth = { userId: v.id("users"), sessionToken: v.string() };

export const submissionCandidates = query({
  args: { ...auth, jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    let job;
    const actor = await ctx.db.get(args.userId);
    if (actor?.role === "owner") {
      const owner = await requireOwnerSession(
        ctx,
        args.sessionToken,
        args.userId,
      );
      job = await ctx.db.get(args.jobId);
      if (!job || job.companyId !== owner.companyId)
        throw new Error("Access denied");
    } else
      ({ job } = await requireAssignedJobExecutor(
        ctx,
        args.sessionToken,
        args.jobId,
        args.userId,
      ));
    const ids = new Set(await getJobRecipientUserIds(ctx, job));
    if (job.assignedManagerId) ids.add(job.assignedManagerId);
    const users = await Promise.all([...ids].map((id) => ctx.db.get(id)));
    return users
      .filter(
        (u) => u && u.status === "active" && u.companyId === job.companyId,
      )
      .map((u) => ({ userId: u!._id, displayName: u!.name }));
  },
});

export const confirmHistoricalWorkers = mutation({
  args: {
    ...auth,
    jobId: v.id("jobs"),
    performedWorkerIds: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId)
      throw new Error("Access denied");
    if (job.status !== "approved" || job.executionHistory?.length)
      throw new Error(
        "Only historical approved work without execution evidence may be confirmed",
      );
    return freezePerformedWorkers(
      ctx,
      job,
      owner,
      args.performedWorkerIds,
      true,
    );
  },
});

export const reviewCompensation = mutation({
  args: {
    ...auth,
    jobId: v.id("jobs"),
    workerId: v.id("users"),
    amountCents: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== owner.companyId)
      throw new Error("Access denied");
    // Retry against frozen financial evidence before consulting mutable operational state.
    const source = { type: "worker_job" as const, jobId: job._id };
    const key = sourceKey(source);
    const obligations = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_source", (q) =>
        q.eq("payerCompanyId", owner.companyId).eq("sourceKey", key),
      )
      .take(501);
    if (obligations.length > 500)
      throw new Error("Job compensation history too large");
    const existing = obligations.find(
      (o) => o.recipientKey === `worker:${args.workerId}`,
    );
    if (existing) {
      if (
        existing.basePrincipalCents !== args.amountCents ||
        existing.basis !== args.reason
      )
        throw new Error("Compensation already approved: use an adjustment");
      return existing._id;
    }
    const evidence = approvedExecution(job);
    const worker = evidence?.workers.find((w) => w.userId === args.workerId);
    if (job.status !== "approved" || !worker || worker.role === "owner")
      throw new Error("Approved performed-worker evidence required");
    text(args.reason, "review reason");
    boundedTotal(args.amountCents);
    const reviews = job.compensationReviews ?? [];
    const prior = reviews.find((r) => r.workerId === args.workerId);
    if (prior) {
      if (args.amountCents === 0 && prior.reason === args.reason) return null;
      throw new Error("Compensation already reviewed without obligation");
    }
    if (args.amountCents === 0) {
      if (args.reason.trim().length < 5)
        throw new Error("Invalid no-compensation reason: explain the decision");
      await ctx.db.patch(job._id, {
        compensationReviews: [
          ...reviews,
          {
            workerId: args.workerId,
            executionSequence: evidence!.sequence,
            reason: args.reason,
            reviewedById: owner._id,
            reviewedAt: Date.now(),
          },
        ],
      });
      return null;
    }
    const snapshot = await buildTerms(ctx, owner.companyId, source, "USD", [
      {
        lineId: `worker:${args.workerId}`,
        recipient: { type: "worker", userId: args.workerId },
        amountCents: args.amountCents,
        basis: args.reason,
      },
    ]);
    // Display identity comes from the approved execution, never a later rename.
    snapshot.lines[0].recipient.displayName = worker.displayName;
    snapshot.sourceLabel =
      evidence!.sourceLabel ?? `${evidence!.scheduledDate} ${job.type}`;
    const latest = await ctx.db
      .query("outgoingTerms")
      .withIndex("by_source_version", (q) =>
        q.eq("payerCompanyId", owner.companyId).eq("sourceKey", key),
      )
      .order("desc")
      .first();
    const now = Date.now();
    const termsId = await ctx.db.insert("outgoingTerms", {
      payerCompanyId: owner.companyId,
      source,
      sourceKey: key,
      version: (latest?.version ?? 0) + 1,
      revision: 1,
      lifecycle: "draft",
      currency: "USD",
      executionSequence: evidence!.sequence,
      ...snapshot,
      createdById: owner._id,
      createdAt: now,
      updatedAt: now,
    });
    return (
      await materializeTerms(ctx, {
        termsId,
        approverUserId: owner._id,
        expectedRevision: 1,
      })
    )[0];
  },
});

export const jobCompensation = query({
  args: { ...auth, jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const reader = await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
    const job = await ctx.db.get(args.jobId);
    if (!job || job.companyId !== reader.companyId)
      throw new Error("Access denied");
    const evidence = approvedExecution(job);
    const obligations = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_source", (q) =>
        q
          .eq("payerCompanyId", reader.companyId)
          .eq("sourceKey", sourceKey({ type: "worker_job", jobId: job._id })),
      )
      .take(501);
    if (obligations.length > 500)
      throw new Error("Job compensation history too large");
    const eligible = evidence?.workers.filter((w) => w.role !== "owner") ?? [];
    const workers = await Promise.all(
      eligible.map(async (w) => {
        const profile = await ctx.db
          .query("workerProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", w.userId))
          .unique();
        const current = await ctx.db.get(w.userId);
        const profileSuggestion =
          profile?.payProfile?.payType === "per_job" &&
          [undefined, "USD", "usd"].includes(profile.payProfile.currency)
            ? profile.payProfile.defaultRateCents
            : undefined;
        return {
          ...w,
          inactive: current?.status !== "active",
          suggestionCents:
            profileSuggestion ??
            (eligible.length === 1 ? job.plannedCleanerPayCents : undefined),
          noCompensation: job.compensationReviews?.find(
            (r) => r.workerId === w.userId,
          ),
        };
      }),
    );
    return {
      operationallyApproved: job.status === "approved",
      evidence,
      workers,
      obligations: obligations.map((o) => ({ ...o, ...projection(o) })),
    };
  },
});

export const historicalCandidates = query({
  args: { ...auth },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", owner.companyId))
      .collect();
    return users
      .filter((u) =>
        ["owner", "manager", "cleaner", "maintenance"].includes(u.role),
      )
      .map((u) => ({ userId: u._id, displayName: u.name, role: u.role }));
  },
});

export const previewPayment = query({
  args: {
    ...auth,
    workerId: v.id("users"),
    amountCents: v.number(),
    selectedObligationIds: v.optional(v.array(v.id("outgoingObligations"))),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    try {
      const plan = await planOutsideAllocation(
        ctx,
        owner.companyId,
        recipientKey({ type: "worker", userId: args.workerId }),
        { ...args, currency: "USD" },
      );
      const recipientHistory = await ctx.db
        .query("outgoingObligations")
        .withIndex("by_recipient", (q) =>
          q
            .eq("payerCompanyId", owner.companyId)
            .eq(
              "recipientKey",
              recipientKey({ type: "worker", userId: args.workerId }),
            ),
        )
        .take(501);
      if (recipientHistory.some((o) => o.currency !== "USD"))
        throw new Error("Unsupported currency in ledger");
      const remainingRecipientCents =
        recipientHistory.length > 500
          ? null
          : recipientHistory.reduce(
              (total, obligation) =>
                boundedTotal(
                  total + projection(obligation).collectibleOutstandingCents,
                ),
              0,
            ) - args.amountCents;
      return {
        error: null,
        remainingRecipientCents,
        allocatedCents: plan.reduce(
          (total, p) => boundedTotal(total + p.amountCents),
          0,
        ),
        allocations: plan.map((p) => ({
          obligationId: p.obligation._id,
          sourceLabel: p.obligation.sourceLabel,
          amountCents: p.amountCents,
          expectedVersion: p.obligation.ledgerVersion,
          remainingCents:
            projection(p.obligation).collectibleOutstandingCents -
            p.amountCents,
        })),
      };
    } catch (error) {
      return { error: (error as Error).message, allocations: [] };
    }
  },
});

export const workerBalances = query({
  args: { ...auth },
  handler: async (ctx, args) => {
    const reader = await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
    const rows = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_payer", (q) => q.eq("payerCompanyId", reader.companyId))
      .take(5001);
    if (rows.length > 5000)
      throw new Error("Company history too large for summary");
    const balances = new Map<
      string,
      {
        workerId: typeof args.userId;
        displayName: string;
        approvedCents: number;
        outstandingCents: number;
        recordedPaidCents: number;
        openCount: number;
        oldestApprovedAt?: number;
      }
    >();
    for (const o of rows) {
      if (o.recipient.type !== "worker") continue;
      const b = balances.get(o.recipient.userId) ?? {
        workerId: o.recipient.userId,
        displayName: o.recipient.displayName,
        approvedCents: 0,
        outstandingCents: 0,
        recordedPaidCents: 0,
        openCount: 0,
      };
      const state = projection(o);
      b.approvedCents = boundedTotal(b.approvedCents + o.basePrincipalCents);
      b.outstandingCents = boundedTotal(
        b.outstandingCents + state.collectibleOutstandingCents,
      );
      b.recordedPaidCents = boundedTotal(
        b.recordedPaidCents + state.recordedPaidCents,
      );
      if (state.collectibleOutstandingCents > 0) {
        b.openCount++;
        b.oldestApprovedAt = Math.min(
          b.oldestApprovedAt ?? o.approvedAt,
          o.approvedAt,
        );
      }
      balances.set(o.recipient.userId, b);
    }
    return [...balances.values()].sort(
      (a, b) =>
        b.outstandingCents - a.outstandingCents ||
        a.displayName.localeCompare(b.displayName),
    );
  },
});
