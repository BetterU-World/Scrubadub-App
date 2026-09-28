import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Narrow compatibility evidence, not a V2 ledger or a claim of reconstructed finances. */
export async function recordLegacyCompletionConflict(
  ctx: MutationCtx,
  input: {
    companyId: Id<"companies">;
    entityType: string;
    entityId: string;
    previousSessionId?: string;
    incomingSessionId: string;
    incomingPaymentIntentId?: string;
  },
) {
  const details = JSON.stringify(input);
  const existing = await ctx.db
    .query("auditLog")
    .withIndex("by_companyId_timestamp", (q) =>
      q.eq("companyId", input.companyId),
    )
    .filter((q) => q.and(
      q.eq(q.field("action"), "legacy_outgoing_reconciliation_required"),
      q.eq(q.field("entityId"), input.entityId),
      q.eq(q.field("details"), details),
    ))
    .first();
  if (existing) return;
  const owner = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q) => q.eq("companyId", input.companyId))
    .filter((q) => q.eq(q.field("role"), "owner"))
    .first();
  if (!owner) {
    console.error("[legacy-outgoing:reconciliation-required]", input);
    throw new Error(
      "Legacy outgoing completion requires review: company owner unavailable",
    );
  }
  await ctx.db.insert("auditLog", {
    companyId: input.companyId,
    userId: owner._id,
    action: "legacy_outgoing_reconciliation_required",
    entityType: input.entityType,
    entityId: input.entityId,
    details,
    timestamp: Date.now(),
  });
}
