import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { planOutsideAllocation } from "./outgoingAllocation";
import {
  projection,
  boundedTotal,
  MAX_RECIPIENT_OBLIGATIONS,
} from "./outgoingLedger";

export async function paymentPreview(
  ctx: QueryCtx,
  payerCompanyId: Id<"companies">,
  key: string,
  args: {
    amountCents: number;
    selectedObligationIds?: Id<"outgoingObligations">[];
  },
) {
  try {
    const plan = await planOutsideAllocation(ctx, payerCompanyId, key, {
      ...args,
      currency: "USD",
    });
    const history = await ctx.db
      .query("outgoingObligations")
      .withIndex("by_recipient", (q) =>
        q.eq("payerCompanyId", payerCompanyId).eq("recipientKey", key),
      )
      .take(MAX_RECIPIENT_OBLIGATIONS + 1);
    if (history.some((o) => o.currency !== "USD"))
      throw new Error("Unsupported currency in ledger");
    return {
      error: null,
      remainingRecipientCents:
        history.length > MAX_RECIPIENT_OBLIGATIONS
          ? null
          : history.reduce(
              (total, o) =>
                boundedTotal(total + projection(o).collectibleOutstandingCents),
              0,
            ) - args.amountCents,
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
          projection(p.obligation).collectibleOutstandingCents - p.amountCents,
      })),
    };
  } catch (error) {
    return { error: (error as Error).message, allocations: [] };
  }
}
