import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  requireOwnerOrManagerCapability,
  requireVerifiedStaffSession,
} from "./lib/sessionAuth";
import { outgoingRecipientInput } from "./lib/outgoingValidators";
import { requireOwnerSession } from "./lib/sessionAuth";
import { paymentPreview } from "./lib/outgoingPaymentPreview";
import {
  projection,
  recipientKey,
  settlementReversal,
  targetEvents,
  boundedTotal,
  MAX_RECIPIENT_OBLIGATIONS,
} from "./lib/outgoingLedger";

async function safeSettlement(
  ctx: QueryCtx,
  args: { userId: Doc<"users">["_id"]; sessionToken: string },
  settlement: Doc<"outgoingSettlements">,
  reversed: boolean,
) {
  const reader = await requireVerifiedStaffSession(
    ctx,
    args.sessionToken,
    args.userId,
  );
  if (reader.role === "owner" && reader.companyId === settlement.payerCompanyId)
    return { ...settlement, ledgerReversed: reversed };
  return publicSettlement(settlement, reversed);
}

const auth = { userId: v.id("users"), sessionToken: v.string() };
function publicObligation(o: Doc<"outgoingObligations">) {
  return {
    _id: o._id,
    payerCompanyId: o.payerCompanyId,
    payerName: o.payerName,
    recipient: o.recipient,
    source: o.source,
    sourceLabel: o.sourceLabel,
    currency: o.currency,
    basis: o.basis,
    termsVersion: o.termsVersion,
    termsId: o.termsId,
    approvedAt: o.approvedAt,
    ...projection(o),
  };
}
function publicSettlement(s: Doc<"outgoingSettlements">, reversed: boolean) {
  return {
    _id: s._id,
    payerCompanyId: s.payerCompanyId,
    recipient: s.recipient,
    currency: s.currency,
    amountCents: s.amountCents,
    paymentDate: s.paymentDate,
    recordedAt: s.recordedAt,
    method: s.method,
    publicReference: s.publicReference,
    provenance: s.provenance,
    ledgerReversed: reversed,
  };
}
async function canReadTarget(
  ctx: QueryCtx,
  args: { userId: Doc<"users">["_id"]; sessionToken: string },
  payerCompanyId: Doc<"companies">["_id"],
  key: string,
) {
  const user = await requireVerifiedStaffSession(
    ctx,
    args.sessionToken,
    args.userId,
  );
  if (user.companyId !== payerCompanyId) {
    if (!user.companyId || key !== `partner_company:${user.companyId}`)
      throw new Error("Access denied");
    await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
    return false;
  }
  if (key === `worker:${user._id}`) return false; // Frozen identity; no current job/team lookup.
  await requireOwnerOrManagerCapability(
    ctx,
    args.sessionToken,
    args.userId,
    "canViewFinancials",
  );
  return true;
}
async function historyAuthority(
  ctx: QueryCtx,
  args: {
    userId: Doc<"users">["_id"];
    sessionToken: string;
    payerCompanyId?: Doc<"companies">["_id"];
    recipient?:
      | { type: "worker"; userId: Doc<"users">["_id"] }
      | { type: "partner_company"; companyId: Doc<"companies">["_id"] };
  },
) {
  const user = await requireVerifiedStaffSession(
    ctx,
    args.sessionToken,
    args.userId,
  );
  if (!user.companyId) throw new Error("Access denied");
  const recipient = args.recipient ?? {
    type: "worker" as const,
    userId: user._id,
  };
  const key = recipientKey(recipient);
  if (args.payerCompanyId && args.payerCompanyId !== user.companyId) {
    await canReadTarget(ctx, args, args.payerCompanyId, key);
    return { payerCompanyId: args.payerCompanyId, key, companyRead: false };
  }
  const companyRead = key !== `worker:${user._id}`;
  if (companyRead)
    await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
  return { payerCompanyId: user.companyId, key, companyRead };
}

export const listCompanyObligations = query({
  args: { ...auth, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const reader = await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
    const page = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_payer", (q) => q.eq("payerCompanyId", reader.companyId))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((o) => ({ ...o, ...projection(o) })),
    };
  },
});
export const getTerms = query({
  args: { ...auth, termsId: v.id("outgoingTerms") },
  handler: async (ctx, args) => {
    const reader = await requireOwnerOrManagerCapability(
      ctx,
      args.sessionToken,
      args.userId,
      "canViewFinancials",
    );
    const terms = await ctx.db.get(args.termsId);
    if (!terms || terms.payerCompanyId !== reader.companyId)
      throw new Error("Access denied");
    return terms;
  },
});
export const getObligationDetail = query({
  args: { ...auth, obligationId: v.id("outgoingObligations") },
  handler: async (ctx, args) => {
    const obligation = await ctx.db.get(args.obligationId);
    if (!obligation) throw new Error("Access denied");
    const companyRead = await canReadTarget(
      ctx,
      args,
      obligation.payerCompanyId,
      obligation.recipientKey,
    );
    const allocations = await ctx.db
      .query("outgoingSettlementAllocations")
      .withIndex("by_obligation", (q) => q.eq("obligationId", obligation._id))
      .take(MAX_RECIPIENT_OBLIGATIONS + 1);
    if (allocations.length > MAX_RECIPIENT_OBLIGATIONS)
      throw new Error("Payment history too large for detail query");
    const payments = [];
    for (const allocation of allocations) {
      const settlement = await ctx.db.get(allocation.settlementId);
      if (
        !settlement ||
        settlement.payerCompanyId !== obligation.payerCompanyId ||
        settlement.recipientKey !== obligation.recipientKey
      )
        throw new Error("Invalid ledger evidence");
      const reversal = await settlementReversal(ctx, settlement);
      payments.push({
        allocation,
        settlement: companyRead
          ? await safeSettlement(ctx, args, settlement, !!reversal)
          : publicSettlement(settlement, !!reversal),
        reversal: reversal
          ? {
              createdAt: reversal.createdAt,
              reason:
                reversal.payload.type === "outside_settlement_reversed"
                  ? reversal.payload.reason
                  : undefined,
            }
          : undefined,
      });
    }
    const events = await targetEvents(
      ctx,
      obligation.payerCompanyId,
      `obligation:${obligation._id}`,
    );
    return {
      obligation: companyRead
        ? { ...obligation, ...projection(obligation) }
        : publicObligation(obligation),
      payments,
      events: companyRead
        ? events
        : events.map((e) => ({
            _id: e._id,
            createdAt: e.createdAt,
            payload: e.payload,
          })),
    };
  },
});
export const listRecipientHistory = query({
  args: {
    ...auth,
    recipient: v.optional(outgoingRecipientInput),
    payerCompanyId: v.optional(v.id("companies")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const access = await historyAuthority(ctx, args);
    const page = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_recipient", (q) =>
        q
          .eq("payerCompanyId", access.payerCompanyId)
          .eq("recipientKey", access.key),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((o) =>
        access.companyRead ? { ...o, ...projection(o) } : publicObligation(o),
      ),
    };
  },
});
export const recipientOutstandingTotals = query({
  args: {
    ...auth,
    recipient: v.optional(outgoingRecipientInput),
    payerCompanyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const access = await historyAuthority(ctx, args);
    const obligations = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_recipient", (q) =>
        q
          .eq("payerCompanyId", access.payerCompanyId)
          .eq("recipientKey", access.key),
      )
      .take(MAX_RECIPIENT_OBLIGATIONS + 1);
    if (obligations.length > MAX_RECIPIENT_OBLIGATIONS)
      throw new Error("Recipient history too large for aggregate query");
    let approvedCents = 0;
    let openObligationCount = 0;
    let outstandingCents = 0;
    let recordedPaidCents = 0;
    for (const obligation of obligations) {
      if (obligation.currency !== "USD")
        throw new Error(
          "Unsupported currency in ledger: totals cannot mix currencies",
        );
      approvedCents = boundedTotal(
        approvedCents + obligation.basePrincipalCents,
      );
      const state = projection(obligation);
      if (state.collectibleOutstandingCents > 0) openObligationCount++;
      outstandingCents = boundedTotal(
        outstandingCents + state.collectibleOutstandingCents,
      );
      recordedPaidCents = boundedTotal(
        recordedPaidCents + state.recordedPaidCents,
      );
    }
    return {
      currency: "USD",
      approvedCents,
      outstandingCents,
      recordedPaidCents,
      obligationCount: obligations.length,
      openObligationCount,
    };
  },
});
export const getSettlementDetail = query({
  args: { ...auth, settlementId: v.id("outgoingSettlements") },
  handler: async (ctx, args) => {
    const settlement = await ctx.db.get(args.settlementId);
    if (!settlement) throw new Error("Access denied");
    const companyRead = await canReadTarget(
      ctx,
      args,
      settlement.payerCompanyId,
      settlement.recipientKey,
    );
    const allocations = await ctx.db
      .query("outgoingSettlementAllocations")
      .withIndex("by_settlement", (q) => q.eq("settlementId", settlement._id))
      .collect();
    // A settlement has at most 100 allocations. Labels come from frozen obligations,
    // avoiding one full obligation-history query per displayed allocation in React.
    const labeledAllocations = await Promise.all(
      allocations.map(async (allocation) => {
        const obligation = await ctx.db.get(allocation.obligationId);
        if (
          !obligation ||
          obligation.payerCompanyId !== settlement.payerCompanyId ||
          obligation.recipientKey !== settlement.recipientKey
        )
          throw new Error("Invalid ledger evidence");
        return { ...allocation, sourceLabel: obligation.sourceLabel };
      }),
    );
    const reversal = await settlementReversal(ctx, settlement);
    return {
      settlement: companyRead
        ? await safeSettlement(ctx, args, settlement, !!reversal)
        : publicSettlement(settlement, !!reversal),
      allocations: labeledAllocations,
      reversal: reversal
        ? {
            createdAt: reversal.createdAt,
            reason:
              reversal.payload.type === "outside_settlement_reversed"
                ? reversal.payload.reason
                : undefined,
          }
        : undefined,
    };
  },
});
export const listSettlementHistory = query({
  args: {
    ...auth,
    recipient: v.optional(outgoingRecipientInput),
    payerCompanyId: v.optional(v.id("companies")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const access = await historyAuthority(ctx, args);
    const page = await ctx.db
      .query("outgoingSettlements")
      .withIndex("by_recipient", (q) =>
        q
          .eq("payerCompanyId", access.payerCompanyId)
          .eq("recipientKey", access.key),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (settlement) => {
          const reversed = !!(await settlementReversal(ctx, settlement));
          return access.companyRead
            ? await safeSettlement(ctx, args, settlement, reversed)
            : publicSettlement(settlement, reversed);
        }),
      ),
    };
  },
});

export const previewPayment = query({
  args: {
    ...auth,
    recipient: outgoingRecipientInput,
    amountCents: v.number(),
    selectedObligationIds: v.optional(v.array(v.id("outgoingObligations"))),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(
      ctx,
      args.sessionToken,
      args.userId,
    );
    return paymentPreview(
      ctx,
      owner.companyId,
      recipientKey(args.recipient),
      args,
    );
  },
});
