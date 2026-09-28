import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  requireOwnerSession,
  requireOwnerOrManagerCapability,
} from "./lib/sessionAuth";
import {
  buildTerms,
  sourceKey,
  cents,
  projection,
  boundedTotal,
} from "./lib/outgoingLedger";
import { sharedSource, partnerEligibility } from "./lib/partnerCompensation";
import { approvedExecution } from "./lib/performedWorkers";
import { materializeTerms } from "./outgoingMutations";

const auth = { userId: v.id("users"), sessionToken: v.string() };
type Ctx = MutationCtx | QueryCtx;
async function activeConnection(ctx: Ctx, share: Doc<"sharedJobs">) {
  for (const [a, b] of [
    [share.fromCompanyId, share.toCompanyId],
    [share.toCompanyId, share.fromCompanyId],
  ]) {
    const rows = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", a))
      .take(501);
    if (rows.length > 500) throw new Error("Connection history too large");
    const match = rows.find(
      (c) => c.companyBId === b && (c.status ?? "active") === "active",
    );
    if (match) return match;
  }
  throw new Error("Active partner connection required");
}
async function versions(ctx: Ctx, share: Doc<"sharedJobs">) {
  const rows = await ctx.db
    .query("outgoingTerms")
    .withIndex("by_source_version", (q) =>
      q
        .eq("payerCompanyId", share.fromCompanyId)
        .eq(
          "sourceKey",
          sourceKey({ type: "partner_shared_job", sharedJobId: share._id }),
        ),
    )
    .take(501);
  if (rows.length > 500) throw new Error("Source terms history too large");
  return rows;
}
export const propose = mutation({
  args: {
    ...auth,
    sharedJobId: v.id("sharedJobs"),
    amountCents: v.number(),
    expectedLatestVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const { share } = await sharedSource(ctx, args.sharedJobId);
    if (share.fromCompanyId !== owner.companyId)
      throw new Error("Access denied");
    if (share.status === "rejected") throw new Error("Shared work rejected");
    const connection = await activeConnection(ctx, share);
    cents(args.amountCents);
    const history = await versions(ctx, share);
    if (history.some((t) => t.lifecycle === "approved"))
      throw new Error("Source already materialized: use explicit adjustments");
    const latest = history.sort((a, b) => b.version - a.version)[0];
    // Exact retry returns the same immutable proposal. Changed inputs require a fresh version.
    if (
      latest?.version === args.expectedLatestVersion + 1 &&
      latest.createdById === owner._id &&
      latest.partner?.state === "proposed" &&
      latest.lines[0]?.amountCents === args.amountCents
    )
      return latest._id;
    if ((latest?.version ?? 0) !== args.expectedLatestVersion)
      throw new Error("Stale terms revision");
    const source = {
      type: "partner_shared_job" as const,
      sharedJobId: share._id,
    };
    const snapshot = await buildTerms(ctx, owner.companyId, source, "USD", [
      {
        lineId: "partner",
        recipient: { type: "partner_company", companyId: share.toCompanyId },
        amountCents: args.amountCents,
        basis: "Agreed shared-work compensation",
      },
    ]);
    const now = Date.now();
    for (const t of history.filter((t) => t.partner?.state === "proposed"))
      await ctx.db.patch(t._id, {
        partner: {
          ...t.partner!,
          state: "superseded",
          supersededById: owner._id,
          supersededAt: now,
        },
      });
    return ctx.db.insert("outgoingTerms", {
      payerCompanyId: owner.companyId,
      source,
      sourceKey: sourceKey(source),
      version: (latest?.version ?? 0) + 1,
      revision: 1,
      lifecycle: "draft",
      currency: "USD",
      ...snapshot,
      createdById: owner._id,
      createdAt: now,
      updatedAt: now,
      partner: {
        connectionId: connection._id,
        originalJobId: share.originalJobId,
        copiedJobId: share.copiedJobId,
        recipientCompanyId: share.toCompanyId,
        state: "proposed",
        proposedByName: owner.name,
      },
    });
  },
});
export const respond = mutation({
  args: {
    ...auth,
    termsId: v.id("outgoingTerms"),
    expectedRevision: v.number(),
    accept: v.boolean(),
    expectedGoverningTermsId: v.optional(v.id("outgoingTerms")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const terms = await ctx.db.get(args.termsId);
    if (
      !terms?.partner ||
      terms.source.type !== "partner_shared_job" ||
      terms.partner.recipientCompanyId !== owner.companyId
    )
      throw new Error("Access denied");
    const { share } = await sharedSource(ctx, terms.source.sharedJobId);
    if (
      share.toCompanyId !== owner.companyId ||
      terms.revision !== args.expectedRevision
    )
      throw new Error("Stale terms revision");
    const state = args.accept ? "accepted" : "declined";
    if (
      terms.partner.state === state &&
      terms.partner.respondedById === owner._id
    )
      return terms._id;
    if (terms.partner.state !== "proposed" || terms.lifecycle !== "draft")
      throw new Error("Proposal no longer pending");
    await activeConnection(ctx, share);
    if (share.status === "rejected") throw new Error("Shared work rejected");
    const history = await versions(ctx, share);
    if (history.some((t) => t.lifecycle === "approved"))
      throw new Error("Source already materialized: use explicit adjustments");
    if (share.governingTermsId !== args.expectedGoverningTermsId)
      throw new Error("Governing terms changed: review again");
    const now = Date.now();
    await ctx.db.patch(terms._id, {
      partner: {
        ...terms.partner,
        state,
        respondedById: owner._id,
        respondedByName: owner.name,
        respondedAt: now,
        replacesTermsId: args.accept ? share.governingTermsId : undefined,
      },
      acceptance: args.accept
        ? {
            actorUserId: owner._id,
            acceptedAt: now,
            evidence: `Accepted immutable proposal ${terms._id} version ${terms.version} revision ${terms.revision}`,
          }
        : undefined,
      updatedAt: now,
    });
    if (args.accept)
      await ctx.db.patch(share._id, { governingTermsId: terms._id });
    return terms._id;
  },
});
export const approve = mutation({
  args: {
    ...auth,
    termsId: v.id("outgoingTerms"),
    expectedRevision: v.number(),
    expectedExecutionSequence: v.number(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const terms = await ctx.db.get(args.termsId);
    if (
      !terms?.partner ||
      terms.payerCompanyId !== owner.companyId ||
      !terms.acceptance
    )
      throw new Error("Access denied");
    if (terms.lifecycle !== "approved") {
      const { copy, execution } = await partnerEligibility(ctx, terms);
      if (execution.sequence !== args.expectedExecutionSequence)
        throw new Error(
          "Execution evidence changed: review compensation again",
        );
      await ctx.db.patch(terms._id, {
        partner: {
          ...terms.partner,
          approvalExecutionSequence: execution.sequence,
          fulfillmentApprovedAt: copy.approvedAt,
        },
        executionSequence: execution.sequence,
      });
    } else if (
      terms.partner.approvalExecutionSequence !== args.expectedExecutionSequence
    )
      throw new Error("Approval retry content mismatch");
    return materializeTerms(ctx, {
      termsId: terms._id,
      approverUserId: owner._id,
      expectedRevision: args.expectedRevision,
      partnerAcceptance: {
        actorUserId: terms.acceptance.actorUserId,
        evidence: terms.acceptance.evidence,
      },
    });
  },
});
export const detail = query({
  args: { ...auth, sharedJobId: v.id("sharedJobs") },
  handler: async (ctx, args) => {
    const reader = await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
    const { share, copy } = await sharedSource(ctx, args.sharedJobId);
    if (
      reader.companyId !== share.fromCompanyId &&
      reader.companyId !== share.toCompanyId
    )
      throw new Error("Access denied");
    const history = await versions(ctx, share);
    const execution = approvedExecution(copy);
    const payer = await ctx.db.get(share.fromCompanyId),
      recipient = await ctx.db.get(share.toCompanyId);
    let connected = true;
    try {
      await activeConnection(ctx, share);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "Active partner connection required"
      )
        throw error;
      connected = false;
    }
    return {
      sharedJobId: share._id,
      payerCompanyId: share.fromCompanyId,
      recipientCompanyId: share.toCompanyId,
      payerName: payer?.name,
      recipientName: recipient?.name,
      governingTermsId: share.governingTermsId,
      connected,
      workRejected: share.status === "rejected",
      jobId:
        reader.companyId === share.fromCompanyId
          ? share.originalJobId
          : share.copiedJobId,
      fulfillment:
        copy.status === "approved" &&
        copy.approvedAt !== undefined &&
        ["accepted", "in_progress", "completed"].includes(share.status) &&
        execution?.provenance === "submission_confirmed"
          ? {
              sequence: execution.sequence,
              approvedAt: copy.approvedAt,
              confirmedAt: execution.confirmedAt,
            }
          : null,
      terms: history.sort((a, b) => b.version - a.version),
    };
  },
});
export const listWork = query({
  args: {
    ...auth,
    direction: v.union(v.literal("payable"), v.literal("receivable")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const reader = await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
    if (args.paginationOpts.numItems > 100)
      throw new Error("Page size exceeds safe bounds");
    const page =
      args.direction === "payable"
        ? await ctx.db
            .query("sharedJobs")
            .withIndex("by_fromCompanyId", (q) =>
              q.eq("fromCompanyId", reader.companyId),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("sharedJobs")
            .withIndex("by_toCompanyId", (q) =>
              q.eq("toCompanyId", reader.companyId),
            )
            .order("desc")
            .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (s) => {
          const job = await ctx.db.get(
            args.direction === "payable" ? s.originalJobId : s.copiedJobId,
          );
          const company = await ctx.db.get(
            args.direction === "payable" ? s.toCompanyId : s.fromCompanyId,
          );
          return {
            ...s,
            label: `${job?.scheduledDate ?? ""} ${job?.propertySnapshot?.name ?? job?.type ?? ""}`,
            counterpartyName: company?.name,
          };
        }),
      ),
    };
  },
});

export const balances = query({
  args: {
    ...auth,
    direction: v.union(v.literal("payable"), v.literal("receivable")),
  },
  handler: async (ctx, args) => {
    const reader = await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
    const rows =
      args.direction === "payable"
        ? await ctx.db
            .query("outgoingObligations")
            .withIndex("by_payer", (q) =>
              q.eq("payerCompanyId", reader.companyId),
            )
            .take(5001)
        : await ctx.db
            .query("outgoingObligations")
            .withIndex("by_recipient_global", (q) =>
              q.eq("recipientKey", `partner_company:${reader.companyId}`),
            )
            .take(5001);
    if (rows.length > 5000)
      throw new Error("Company history too large for summary");
    const groups = new Map<
      string,
      {
        payerCompanyId: Id<"companies">;
        recipientCompanyId: Id<"companies">;
        name: string;
        approvedCents: number;
        recordedPaidCents: number;
        outstandingCents: number;
        openCount: number;
        oldestApprovedAt?: number;
      }
    >();
    for (const o of rows) {
      if (o.recipient.type !== "partner_company") continue;
      if (o.currency !== "USD")
        throw new Error("Unsupported currency in ledger");
      const key = `${o.payerCompanyId}:${o.recipient.companyId}`;
      const g = groups.get(key) ?? {
        payerCompanyId: o.payerCompanyId,
        recipientCompanyId: o.recipient.companyId,
        name:
          args.direction === "payable" ? o.recipient.displayName : o.payerName,
        approvedCents: 0,
        recordedPaidCents: 0,
        outstandingCents: 0,
        openCount: 0,
      };
      const state = projection(o);
      g.approvedCents = boundedTotal(g.approvedCents + o.basePrincipalCents);
      g.recordedPaidCents = boundedTotal(
        g.recordedPaidCents + state.recordedPaidCents,
      );
      g.outstandingCents = boundedTotal(
        g.outstandingCents + state.collectibleOutstandingCents,
      );
      if (state.collectibleOutstandingCents > 0) {
        g.openCount++;
        g.oldestApprovedAt = Math.min(
          g.oldestApprovedAt ?? o.approvedAt,
          o.approvedAt,
        );
      }
      groups.set(key, g);
    }
    return [...groups.values()].sort(
      (a, b) =>
        b.outstandingCents - a.outstandingCents || a.name.localeCompare(b.name),
    );
  },
});
