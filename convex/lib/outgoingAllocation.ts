import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  cents,
  boundedTotal,
  projection,
  obligationForPayer,
  MAX_OUTGOING_LINES,
  MAX_RECIPIENT_OBLIGATIONS,
} from "./outgoingLedger";
export async function planOutsideAllocation(
  ctx: QueryCtx | MutationCtx,
  payerCompanyId: Id<"companies">,
  key: string,
  args: {
    currency: string;
    amountCents: number;
    selectedObligationIds?: Id<"outgoingObligations">[];
    allocations?: {
      obligationId: Id<"outgoingObligations">;
      amountCents: number;
      expectedVersion: number;
    }[];
  },
) {
  cents(args.amountCents);
  if (args.currency !== "USD") throw new Error("Unsupported currency");
  const ids =
    args.allocations?.map((a) => a.obligationId) ?? args.selectedObligationIds;
  if (
    ids &&
    (ids.length === 0 ||
      ids.length > MAX_OUTGOING_LINES ||
      new Set(ids).size !== ids.length)
  )
    throw new Error("Invalid or duplicate selected obligations");
  let obligations: Doc<"outgoingObligations">[];
  if (ids)
    obligations = await Promise.all(
      ids.map((id) => obligationForPayer(ctx, id, payerCompanyId)),
    );
  else {
    obligations = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_recipient", (q) =>
        q.eq("payerCompanyId", payerCompanyId).eq("recipientKey", key),
      )
      .take(MAX_RECIPIENT_OBLIGATIONS + 1);
    if (obligations.length > MAX_RECIPIENT_OBLIGATIONS)
      throw new Error(
        "Recipient history too large: select explicit obligations",
      );
    obligations = obligations.filter(
      (o) => o.voidedAt === undefined && projection(o).outstandingCents > 0,
    );
    if (obligations.length > MAX_OUTGOING_LINES)
      throw new Error("Too many obligations: select explicit obligations");
  }
  for (const obligation of obligations) {
    if (
      obligation.recipientKey !== key ||
      obligation.currency !== args.currency
    )
      throw new Error("Recipient/currency mismatch");
    if (obligation.voidedAt !== undefined)
      throw new Error("Voided obligation is not payable");
  }
  obligations.sort(
    (a, b) =>
      a.approvedAt - b.approvedAt ||
      (a._id < b._id ? -1 : a._id > b._id ? 1 : 0),
  );
  const planned: {
    obligation: Doc<"outgoingObligations">;
    amountCents: number;
  }[] = [];
  if (args.allocations) {
    let total = 0;
    for (const allocation of args.allocations) {
      cents(allocation.amountCents);
      const obligation = obligations.find(
        (o) => o._id === allocation.obligationId,
      )!;
      if (allocation.expectedVersion !== obligation.ledgerVersion)
        throw new Error("Stale selected allocation");
      if (allocation.amountCents > projection(obligation).outstandingCents)
        throw new Error("Allocation exceeds outstanding");
      total = boundedTotal(total + allocation.amountCents);
      planned.push({ obligation, amountCents: allocation.amountCents });
    }
    if (total !== args.amountCents) throw new Error("Allocation sum mismatch");
  } else {
    let remaining = args.amountCents;
    for (const obligation of obligations) {
      if (remaining === 0) break;
      const amountCents = Math.min(
        remaining,
        projection(obligation).outstandingCents,
      );
      if (amountCents > 0) planned.push({ obligation, amountCents });
      remaining -= amountCents;
    }
    if (remaining > 0) throw new Error("Payment exceeds outstanding");
  }
  if (planned.length === 0) throw new Error("No payable obligations");

  return planned;
}
