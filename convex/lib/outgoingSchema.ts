import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  outgoingSource,
  outgoingRecipient,
  outgoingLine,
  outsideMethod,
  outgoingAcceptance,
  outgoingEventPayload,
} from "./outgoingValidators";

export const outgoingTables = {
  outgoingTerms: defineTable({
    payerCompanyId: v.id("companies"),
    source: outgoingSource,
    sourceKey: v.string(),
    version: v.number(),
    revision: v.number(),
    lifecycle: v.union(v.literal("draft"), v.literal("approved")),
    currency: v.string(),
    lines: v.array(outgoingLine),
    payerName: v.string(),
    sourceLabel: v.string(),
    createdById: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedById: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    acceptance: v.optional(outgoingAcceptance),
  })
    .index("by_payer", ["payerCompanyId"])
    .index("by_source_version", ["payerCompanyId", "sourceKey", "version"]),
  outgoingObligations: defineTable({
    payerCompanyId: v.id("companies"),
    recipient: outgoingRecipient,
    recipientKey: v.string(),
    source: outgoingSource,
    sourceKey: v.string(),
    termsId: v.id("outgoingTerms"),
    termsVersion: v.number(),
    lineId: v.string(),
    basePrincipalCents: v.number(),
    currency: v.string(),
    basis: v.string(),
    payerName: v.string(),
    sourceLabel: v.string(),
    approvedById: v.id("users"),
    approvedAt: v.number(),
    createdAt: v.number(),
    // Derived caches: updated atomically with allocations/events. Never edit base principal.
    adjustmentCents: v.number(),
    adjustmentCount: v.number(),
    settledCents: v.number(),
    ledgerVersion: v.number(),
    voidedAt: v.optional(v.number()),
  })
    .index("by_payer", ["payerCompanyId", "approvedAt"])
    .index("by_recipient", ["payerCompanyId", "recipientKey", "approvedAt"])
    .index("by_source", ["payerCompanyId", "sourceKey"])
    .index("by_terms_line", ["termsId", "lineId"]),
  outgoingSettlements: defineTable({
    payerCompanyId: v.id("companies"),
    recipient: outgoingRecipient,
    recipientKey: v.string(),
    currency: v.string(),
    amountCents: v.number(),
    paymentDate: v.string(),
    method: outsideMethod,
    publicReference: v.optional(v.string()),
    administrativeNote: v.optional(v.string()),
    recordedById: v.id("users"),
    recordedAt: v.number(),
    provenance: v.literal("outside_declared"),
    idempotencyKey: v.string(),
    requestFingerprint: v.string(),
  })
    .index("by_payer", ["payerCompanyId", "recordedAt"])
    .index("by_recipient", ["payerCompanyId", "recipientKey", "recordedAt"])
    .index("by_idempotency", ["payerCompanyId", "idempotencyKey"]),
  outgoingSettlementAllocations: defineTable({
    payerCompanyId: v.id("companies"),
    settlementId: v.id("outgoingSettlements"),
    obligationId: v.id("outgoingObligations"),
    amountCents: v.number(),
    createdAt: v.number(),
  })
    .index("by_settlement", ["settlementId"])
    .index("by_obligation", ["obligationId"]),
  outgoingEvents: defineTable({
    payerCompanyId: v.id("companies"),
    targetKey: v.string(),
    actorUserId: v.id("users"),
    createdAt: v.number(),
    payload: outgoingEventPayload,
    idempotencyKey: v.optional(v.string()),
    requestFingerprint: v.optional(v.string()),
  })
    .index("by_target", ["payerCompanyId", "targetKey", "createdAt"])
    .index("by_idempotency", ["payerCompanyId", "idempotencyKey"]),
};
