import { planOutsideAllocation } from "./lib/outgoingAllocation";
import { approvedExecution } from "./lib/performedWorkers";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "./lib/sessionAuth";
import {
  outgoingSource,
  outgoingLineInput,
  outgoingRecipientInput,
  outsideMethod,
} from "./lib/outgoingValidators";
import {
  buildTerms,
  sourceKey,
  recipientKey,
  cents,
  boundedTotal,
  usd,
  text,
  projection,
  obligationForPayer,
  event,
  eventRetry,
  fingerprint,
  settlementReversal,
  MAX_OUTGOING_LINES,
  MAX_RECIPIENT_OBLIGATIONS,
} from "./lib/outgoingLedger";
import type { Doc } from "./_generated/dataModel";

const auth = { userId: v.id("users"), sessionToken: v.string() };

export const createDraftTerms = mutation({
  args: {
    ...auth,
    source: outgoingSource,
    currency: v.string(),
    lines: v.array(outgoingLineInput),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const snapshot = await buildTerms(
      ctx,
      owner.companyId,
      args.source,
      args.currency,
      args.lines,
    );
    const key = sourceKey(args.source);
    const latest = await ctx.db
      .query("outgoingTerms")
      .withIndex("by_source_version", (q) =>
        q.eq("payerCompanyId", owner.companyId).eq("sourceKey", key),
      )
      .order("desc")
      .first();
    const now = Date.now();
    return ctx.db.insert("outgoingTerms", {
      payerCompanyId: owner.companyId,
      source: args.source,
      sourceKey: key,
      version: (latest?.version ?? 0) + 1,
      revision: 1,
      lifecycle: "draft",
      currency: args.currency,
      ...snapshot,
      createdById: owner._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});
export const updateDraftTerms = mutation({
  args: {
    ...auth,
    termsId: v.id("outgoingTerms"),
    expectedRevision: v.number(),
    currency: v.string(),
    lines: v.array(outgoingLineInput),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    const terms = await ctx.db.get(args.termsId);
    if (!terms || terms.payerCompanyId !== owner.companyId)
      throw new Error("Access denied");
    if (terms.lifecycle !== "draft")
      throw new Error("Approved terms are immutable");
    if (terms.revision !== args.expectedRevision)
      throw new Error("Stale terms revision");
    const snapshot = await buildTerms(
      ctx,
      owner.companyId,
      terms.source,
      args.currency,
      args.lines,
    );
    await ctx.db.patch(terms._id, {
      ...snapshot,
      currency: args.currency,
      revision: terms.revision + 1,
      updatedAt: Date.now(),
    });
    return terms._id;
  },
});

/** Internal only: PR C/E must supply real source eligibility before invoking this path. No UI/API creates arbitrary approved debt. */
export const approveAndMaterialize = internalMutation({
  args: {
    termsId: v.id("outgoingTerms"),
    approverUserId: v.id("users"),
    expectedRevision: v.number(),
    partnerAcceptance: v.optional(
      v.object({ actorUserId: v.id("users"), evidence: v.string() }),
    ),
  },
  handler: materializeTerms,
});

export async function materializeTerms(
  ctx: MutationCtx,
  args: {
    termsId: Id<"outgoingTerms">;
    approverUserId: Id<"users">;
    expectedRevision: number;
    partnerAcceptance?: { actorUserId: Id<"users">; evidence: string };
  },
) {
  const terms = await ctx.db.get(args.termsId);
  const approver = await ctx.db.get(args.approverUserId);
  if (
    !terms ||
    !approver ||
    approver.status !== "active" ||
    approver.role !== "owner" ||
    approver.companyId !== terms.payerCompanyId
  )
    throw new Error("Owner approval required");
  if (terms.revision !== args.expectedRevision)
    throw new Error("Stale terms revision");
  if (terms.lifecycle === "approved") {
    if (
      terms.approvedById !== approver._id ||
      fingerprint(args.partnerAcceptance) !==
        fingerprint(
          terms.acceptance && {
            actorUserId: terms.acceptance.actorUserId,
            evidence: terms.acceptance.evidence,
          },
        )
    )
      throw new Error("Approval retry content mismatch");
    const existing = [];
    for (const line of terms.lines) {
      const obligation = await ctx.db
        .query("outgoingObligations")
        .withIndex("by_terms_line", (q) =>
          q.eq("termsId", terms._id).eq("lineId", line.lineId),
        )
        .unique();
      if (!obligation)
        throw new Error("Approved terms have missing materialization");
      existing.push(obligation._id);
    }
    return existing;
  }
  // Validate current structural identities, but preserve draft financial/display snapshots.
  await buildTerms(
    ctx,
    terms.payerCompanyId,
    terms.source,
    terms.currency,
    terms.lines,
  );
  const versions = await ctx.db
    .query("outgoingTerms")
    .withIndex("by_source_version", (q) =>
      q
        .eq("payerCompanyId", terms.payerCompanyId)
        .eq("sourceKey", terms.sourceKey),
    )
    .collect();
  if (
    terms.source.type !== "worker_job" &&
    versions.some((version) => version.lifecycle === "approved")
  )
    throw new Error("Source already materialized: use explicit adjustments");
  let acceptance: Doc<"outgoingTerms">["acceptance"];
  if (terms.source.type === "worker_job") {
    if (args.partnerAcceptance)
      throw new Error("Worker terms do not accept partner evidence");
    const job = await ctx.db.get(terms.source.jobId);
    if (job?.status !== "approved")
      throw new Error("Approved source work required");
    const evidence = approvedExecution(job!);
    if (
      terms.executionSequence !== undefined &&
      terms.executionSequence !== evidence?.sequence
    )
      throw new Error("Execution evidence changed: review compensation again");
    for (const line of terms.lines) {
      if (
        line.recipient.type !== "worker" ||
        !evidence?.workers.some(
          (w) =>
            w.userId === (line.recipient as { userId: Id<"users"> }).userId &&
            w.role !== "owner",
        )
      )
        throw new Error("Approved performed-worker evidence required");
      const existing = await ctx.db
        .query("outgoingObligations")
        .withIndex("by_source", (q) =>
          q
            .eq("payerCompanyId", terms.payerCompanyId)
            .eq("sourceKey", terms.sourceKey),
        )
        .collect();
      if (existing.some((o) => o.recipientKey === recipientKey(line.recipient)))
        throw new Error(
          "Worker source already materialized: use explicit adjustments",
        );
    }
    if (
      new Set(terms.lines.map((l) => recipientKey(l.recipient))).size !==
      terms.lines.length
    )
      throw new Error("Duplicate worker compensation unit");
  } else {
    const share = await ctx.db.get(terms.source.sharedJobId);
    const acceptor =
      args.partnerAcceptance &&
      (await ctx.db.get(args.partnerAcceptance.actorUserId));
    if (
      !share ||
      !["accepted", "in_progress", "completed"].includes(share.status) ||
      !acceptor ||
      acceptor.role !== "owner" ||
      acceptor.status !== "active" ||
      acceptor.companyId !== share.toCompanyId
    )
      throw new Error("Partner acceptance required");
    text(args.partnerAcceptance!.evidence, "acceptance evidence");
    acceptance = { ...args.partnerAcceptance!, acceptedAt: Date.now() };
  }
  const now = Date.now();
  await ctx.db.patch(terms._id, {
    lifecycle: "approved",
    approvedById: approver._id,
    approvedAt: now,
    updatedAt: now,
    acceptance,
  });
  await event(ctx, terms.payerCompanyId, approver._id, `terms:${terms._id}`, {
    type: "terms_approved",
    termsId: terms._id,
  });
  const ids = [];
  for (const line of terms.lines) {
    const prior = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_terms_line", (q) =>
        q.eq("termsId", terms._id).eq("lineId", line.lineId),
      )
      .unique();
    if (prior) throw new Error("Duplicate materialization");
    const id = await ctx.db.insert("outgoingObligations", {
      payerCompanyId: terms.payerCompanyId,
      recipient: line.recipient,
      recipientKey: recipientKey(line.recipient),
      source: terms.source,
      sourceKey: terms.sourceKey,
      termsId: terms._id,
      termsVersion: terms.version,
      lineId: line.lineId,
      basePrincipalCents: line.amountCents,
      currency: terms.currency,
      basis: line.basis,
      payerName: terms.payerName,
      sourceLabel: terms.sourceLabel,
      approvedById: approver._id,
      approvedAt: now,
      executionSequence: terms.executionSequence,
      createdAt: now,
      adjustmentCents: 0,
      adjustmentCount: 0,
      settledCents: 0,
      ledgerVersion: 1,
    });
    await event(ctx, terms.payerCompanyId, approver._id, `obligation:${id}`, {
      type: "obligation_created",
      obligationId: id,
      termsId: terms._id,
    });
    ids.push(id);
  }
  return ids;
}

export const recordOutsideSettlement = mutation({
  args: {
    ...auth,
    recipient: outgoingRecipientInput,
    currency: v.string(),
    amountCents: v.number(),
    paymentDate: v.string(),
    method: outsideMethod,
    publicReference: v.optional(v.string()),
    administrativeNote: v.optional(v.string()),
    idempotencyKey: v.string(),
    selectedObligationIds: v.optional(v.array(v.id("outgoingObligations"))),
    allocations: v.optional(
      v.array(
        v.object({
          obligationId: v.id("outgoingObligations"),
          amountCents: v.number(),
          expectedVersion: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    cents(args.amountCents);
    usd(args.currency);
    text(args.idempotencyKey, "idempotency key", 200);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(args.paymentDate) ||
      !Number.isFinite(Date.parse(args.paymentDate)) ||
      new Date(args.paymentDate).toISOString().slice(0, 10) !== args.paymentDate
    )
      throw new Error("Invalid payment date");
    if (args.publicReference !== undefined)
      text(args.publicReference, "public reference", 300);
    if (args.administrativeNote !== undefined)
      text(args.administrativeNote, "administrative note", 2000);
    if (args.allocations && args.selectedObligationIds)
      throw new Error("Choose explicit allocations or selected obligations");
    const key = recipientKey(args.recipient);
    const normalized = {
      type: "record_outside",
      actor: owner._id,
      recipientKey: key,
      currency: args.currency,
      amountCents: args.amountCents,
      paymentDate: args.paymentDate,
      method: args.method,
      publicReference: args.publicReference,
      administrativeNote: args.administrativeNote,
      selectedObligationIds: args.selectedObligationIds?.slice().sort(),
      allocations: args.allocations
        ?.slice()
        .sort((a, b) => a.obligationId.localeCompare(b.obligationId)),
    };
    const requestFingerprint = fingerprint(normalized);
    const prior = await ctx.db
      .query("outgoingSettlements")
      .withIndex("by_idempotency", (q) =>
        q
          .eq("payerCompanyId", owner.companyId)
          .eq("idempotencyKey", args.idempotencyKey),
      )
      .unique();
    if (prior) {
      if (prior.requestFingerprint !== requestFingerprint)
        throw new Error("Idempotency key content mismatch");
      return prior._id;
    }
    if (
      await ctx.db
        .query("outgoingEvents")
        .withIndex("by_idempotency", (q) =>
          q
            .eq("payerCompanyId", owner.companyId)
            .eq("idempotencyKey", args.idempotencyKey),
        )
        .unique()
    )
      throw new Error("Idempotency key content mismatch");
    const planned = await planOutsideAllocation(
      ctx,
      owner.companyId,
      key,
      args,
    );
    const now = Date.now();
    const settlementId = await ctx.db.insert("outgoingSettlements", {
      payerCompanyId: owner.companyId,
      recipient: planned[0].obligation.recipient,
      recipientKey: key,
      currency: args.currency,
      amountCents: args.amountCents,
      paymentDate: args.paymentDate,
      method: args.method,
      publicReference: args.publicReference,
      administrativeNote: args.administrativeNote,
      recordedById: owner._id,
      recordedAt: now,
      provenance: "outside_declared",
      idempotencyKey: args.idempotencyKey,
      requestFingerprint,
    });
    for (const allocation of planned) {
      await ctx.db.insert("outgoingSettlementAllocations", {
        payerCompanyId: owner.companyId,
        settlementId,
        obligationId: allocation.obligation._id,
        amountCents: allocation.amountCents,
        createdAt: now,
      });
      await ctx.db.patch(allocation.obligation._id, {
        settledCents: boundedTotal(
          allocation.obligation.settledCents + allocation.amountCents,
        ),
        ledgerVersion: allocation.obligation.ledgerVersion + 1,
      });
    }
    await event(ctx, owner.companyId, owner._id, `settlement:${settlementId}`, {
      type: "outside_settlement_recorded",
      settlementId,
    });
    return settlementId;
  },
});

export const adjustObligation = mutation({
  args: {
    ...auth,
    obligationId: v.id("outgoingObligations"),
    deltaCents: v.number(),
    reason: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    cents(args.deltaCents, true);
    text(args.reason, "adjustment reason");
    const requestFingerprint = fingerprint({
      type: "adjust",
      actor: owner._id,
      obligationId: args.obligationId,
      deltaCents: args.deltaCents,
      reason: args.reason,
      expectedVersion: args.expectedVersion,
    });
    const prior = await eventRetry(
      ctx,
      owner.companyId,
      args.idempotencyKey,
      requestFingerprint,
    );
    if (prior) return prior._id;
    const obligation = await obligationForPayer(
      ctx,
      args.obligationId,
      owner.companyId,
    );
    if (obligation.voidedAt !== undefined)
      throw new Error("Voided obligation cannot be adjusted");
    if (obligation.ledgerVersion !== args.expectedVersion)
      throw new Error("Stale obligation version");
    const adjustmentCents = obligation.adjustmentCents + args.deltaCents;
    const adjusted = boundedTotal(
      obligation.basePrincipalCents + adjustmentCents,
    );
    if (adjusted < obligation.settledCents)
      throw new Error(
        "Adjustment would reduce principal below recorded settlement",
      );
    await ctx.db.patch(obligation._id, {
      adjustmentCents,
      adjustmentCount: obligation.adjustmentCount + 1,
      ledgerVersion: obligation.ledgerVersion + 1,
    });
    return event(
      ctx,
      owner.companyId,
      owner._id,
      `obligation:${obligation._id}`,
      {
        type: "principal_adjusted",
        obligationId: obligation._id,
        deltaCents: args.deltaCents,
        reason: args.reason,
      },
      { idempotencyKey: args.idempotencyKey, requestFingerprint },
    );
  },
});
export const voidObligation = mutation({
  args: {
    ...auth,
    obligationId: v.id("outgoingObligations"),
    reason: v.string(),
    expectedVersion: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    text(args.reason, "void reason");
    const requestFingerprint = fingerprint({
      type: "void",
      actor: owner._id,
      obligationId: args.obligationId,
      reason: args.reason,
      expectedVersion: args.expectedVersion,
    });
    const prior = await eventRetry(
      ctx,
      owner.companyId,
      args.idempotencyKey,
      requestFingerprint,
    );
    if (prior) return prior._id;
    const obligation = await obligationForPayer(
      ctx,
      args.obligationId,
      owner.companyId,
    );
    if (obligation.voidedAt !== undefined || obligation.settledCents !== 0)
      throw new Error("Only unsettled, non-voided obligations may be voided");
    if (obligation.ledgerVersion !== args.expectedVersion)
      throw new Error("Stale obligation version");
    await ctx.db.patch(obligation._id, {
      voidedAt: Date.now(),
      ledgerVersion: obligation.ledgerVersion + 1,
    });
    return event(
      ctx,
      owner.companyId,
      owner._id,
      `obligation:${obligation._id}`,
      {
        type: "obligation_voided",
        obligationId: obligation._id,
        reason: args.reason,
      },
      { idempotencyKey: args.idempotencyKey, requestFingerprint },
    );
  },
});
export const reverseOutsideSettlement = mutation({
  args: {
    ...auth,
    settlementId: v.id("outgoingSettlements"),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    text(args.reason, "reversal reason");
    const requestFingerprint = fingerprint({
      type: "reverse",
      actor: owner._id,
      settlementId: args.settlementId,
      reason: args.reason,
    });
    const prior = await eventRetry(
      ctx,
      owner.companyId,
      args.idempotencyKey,
      requestFingerprint,
    );
    if (prior) return prior._id;
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement || settlement.payerCompanyId !== owner.companyId)
      throw new Error("Access denied");
    if (await settlementReversal(ctx, settlement))
      throw new Error("Settlement already reversed in SCRUB ledger");
    const allocations = await ctx.db
      .query("outgoingSettlementAllocations")
      .withIndex("by_settlement", (q) => q.eq("settlementId", settlement._id))
      .collect();
    if (allocations.length === 0 || allocations.length > MAX_OUTGOING_LINES)
      throw new Error("Invalid settlement allocations");
    let total = 0;
    for (const allocation of allocations) {
      const obligation = await obligationForPayer(
        ctx,
        allocation.obligationId,
        owner.companyId,
      );
      if (
        obligation.settledCents < allocation.amountCents ||
        obligation.voidedAt !== undefined
      )
        throw new Error("Invalid reversal accounting");
      total = boundedTotal(total + allocation.amountCents);
      await ctx.db.patch(obligation._id, {
        settledCents: obligation.settledCents - allocation.amountCents,
        ledgerVersion: obligation.ledgerVersion + 1,
      });
    }
    if (total !== settlement.amountCents)
      throw new Error("Invalid reversal accounting");
    // Append only. This neutralizes ledger allocations, never refunds an external payment.
    return event(
      ctx,
      owner.companyId,
      owner._id,
      `settlement:${settlement._id}`,
      {
        type: "outside_settlement_reversed",
        settlementId: settlement._id,
        reason: args.reason,
      },
      { idempotencyKey: args.idempotencyKey, requestFingerprint },
    );
  },
});
