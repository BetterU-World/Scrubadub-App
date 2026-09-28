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
import {
  projection,
  recipientKey,
  settlementReversal,
  targetEvents,
  boundedTotal,
  MAX_RECIPIENT_OBLIGATIONS,
} from "./lib/outgoingLedger";

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
  if (user.companyId !== payerCompanyId) throw new Error("Access denied");
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
      .collect();
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
          ? { ...settlement, ledgerReversed: !!reversal }
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
  args: { ...auth, recipient: v.optional(outgoingRecipientInput) },
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
    let outstandingCents = 0;
    let recordedPaidCents = 0;
    for (const obligation of obligations) {
      if (obligation.currency !== "USD")
        throw new Error(
          "Unsupported currency in ledger: totals cannot mix currencies",
        );
      const state = projection(obligation);
      outstandingCents = boundedTotal(
        outstandingCents + state.collectibleOutstandingCents,
      );
      recordedPaidCents = boundedTotal(
        recordedPaidCents + state.recordedPaidCents,
      );
    }
    return {
      currency: "USD",
      outstandingCents,
      recordedPaidCents,
      obligationCount: obligations.length,
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
    const reversal = await settlementReversal(ctx, settlement);
    return {
      settlement: companyRead
        ? { ...settlement, ledgerReversed: !!reversal }
        : publicSettlement(settlement, !!reversal),
      allocations,
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
            ? { ...settlement, ledgerReversed: reversed }
            : publicSettlement(settlement, reversed);
        }),
      ),
    };
  },
});
