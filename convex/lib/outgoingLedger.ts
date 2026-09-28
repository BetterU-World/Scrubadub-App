import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  outgoingSource,
  outgoingLineInput,
  outgoingRecipientInput,
  outgoingEventPayload,
} from "./outgoingValidators";

export const MAX_OUTGOING_CENTS = 1_000_000_000_000;
export const MAX_OUTGOING_LINES = 100;
export const MAX_RECIPIENT_OBLIGATIONS = 500;
export type RecipientInput = Infer<typeof outgoingRecipientInput>;
export type Source = Infer<typeof outgoingSource>;
type ReadCtx = QueryCtx | MutationCtx;

export function cents(value: number, signed = false) {
  if (
    !Number.isSafeInteger(value) ||
    Math.abs(value) > MAX_OUTGOING_CENTS ||
    (signed ? value === 0 : value <= 0)
  )
    throw new Error("Invalid integer minor-unit amount");
  return value;
}
export function boundedTotal(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_OUTGOING_CENTS)
    throw new Error("Financial total exceeds safe bounds");
  return value;
}
export function usd(currency: string) {
  if (currency !== "USD")
    throw new Error("Unsupported currency: use explicit USD");
}
export function text(value: string, name: string, max = 1000) {
  if (!value.trim() || value.length > max) throw new Error(`Invalid ${name}`);
}
export function recipientKey(recipient: RecipientInput) {
  return recipient.type === "worker"
    ? `worker:${recipient.userId}`
    : `partner_company:${recipient.companyId}`;
}
export function sourceKey(source: Source) {
  return source.type === "worker_job"
    ? `worker_job:${source.jobId}`
    : `partner_shared_job:${source.sharedJobId}`;
}
export function projection(obligation: Doc<"outgoingObligations">) {
  const adjustedPrincipalCents = boundedTotal(
    obligation.basePrincipalCents + obligation.adjustmentCents,
  );
  const outstandingCents = boundedTotal(
    adjustedPrincipalCents - obligation.settledCents,
  );
  return {
    basePrincipalCents: obligation.basePrincipalCents,
    adjustmentCents: obligation.adjustmentCents,
    adjustedPrincipalCents,
    recordedPaidCents: obligation.settledCents,
    outstandingCents,
    collectibleOutstandingCents:
      obligation.voidedAt === undefined ? outstandingCents : 0,
    paymentState:
      obligation.settledCents === 0 && adjustedPrincipalCents > 0
        ? ("OWED" as const)
        : outstandingCents === 0
          ? ("PAID" as const)
          : ("PARTIALLY_PAID" as const),
    lifecycle:
      obligation.voidedAt === undefined
        ? ("APPROVED" as const)
        : ("VOIDED" as const),
    adjusted: obligation.adjustmentCount > 0,
    ledgerVersion: obligation.ledgerVersion,
  };
}

export async function buildTerms(
  ctx: ReadCtx,
  payerCompanyId: Id<"companies">,
  source: Source,
  currency: string,
  input: Infer<typeof outgoingLineInput>[],
) {
  usd(currency);
  if (input.length === 0 || input.length > MAX_OUTGOING_LINES)
    throw new Error("Invalid terms line count");
  const payer = await ctx.db.get(payerCompanyId);
  if (!payer) throw new Error("Payer not found");
  let job: Doc<"jobs"> | null;
  let partnerCompanyId: Id<"companies"> | undefined;
  if (source.type === "worker_job") job = await ctx.db.get(source.jobId);
  else {
    const share = await ctx.db.get(source.sharedJobId);
    if (
      !share ||
      share.fromCompanyId !== payerCompanyId ||
      share.toCompanyId === payerCompanyId
    )
      throw new Error("Cross-company source rejected");
    partnerCompanyId = share.toCompanyId;
    const copiedJob = await ctx.db.get(share.copiedJobId);
    if (!copiedJob || copiedJob.companyId !== partnerCompanyId)
      throw new Error("Cross-company shared source rejected");
    job = await ctx.db.get(share.originalJobId);
  }
  if (!job || job.companyId !== payerCompanyId)
    throw new Error("Cross-company source rejected");
  const seen = new Set<string>();
  let total = 0;
  const lines: Doc<"outgoingTerms">["lines"] = [];
  for (const line of input) {
    text(line.lineId, "line identity", 100);
    text(line.basis, "basis");
    cents(line.amountCents);
    total = boundedTotal(total + line.amountCents);
    if (seen.has(line.lineId)) throw new Error("Duplicate terms line");
    seen.add(line.lineId);
    if (line.recipient.type === "worker") {
      if (source.type !== "worker_job")
        throw new Error("Source/recipient mismatch");
      const worker = await ctx.db.get(line.recipient.userId);
      if (
        !worker ||
        worker.companyId !== payerCompanyId ||
        worker.status !== "active" ||
        !["cleaner", "maintenance", "manager"].includes(worker.role)
      )
        throw new Error("Invalid worker recipient");
      const profile = await ctx.db
        .query("workerProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", worker._id))
        .unique();
      if (profile && profile.companyId !== payerCompanyId)
        throw new Error("Invalid worker profile");
      lines.push({
        ...line,
        recipient: {
          type: "worker",
          userId: worker._id,
          workerProfileId: profile?._id,
          displayName: worker.name,
        },
      });
    } else {
      if (
        source.type !== "partner_shared_job" ||
        line.recipient.companyId !== partnerCompanyId
      )
        throw new Error("Source/recipient mismatch");
      const company = await ctx.db.get(line.recipient.companyId);
      if (!company) throw new Error("Invalid partner recipient");
      lines.push({
        ...line,
        recipient: {
          type: "partner_company",
          companyId: company._id,
          displayName: company.name,
        },
      });
    }
  }
  return {
    payerName: payer.name,
    sourceLabel: `${job.scheduledDate} ${job.type}`,
    lines,
  };
}

export async function obligationForPayer(
  ctx: ReadCtx,
  id: Id<"outgoingObligations">,
  payerCompanyId: Id<"companies">,
) {
  const obligation = await ctx.db.get(id);
  if (!obligation || obligation.payerCompanyId !== payerCompanyId)
    throw new Error("Access denied");
  return obligation;
}
export async function targetEvents(
  ctx: ReadCtx,
  payerCompanyId: Id<"companies">,
  targetKey: string,
) {
  return ctx.db
    .query("outgoingEvents")
    .withIndex("by_target", (q) =>
      q.eq("payerCompanyId", payerCompanyId).eq("targetKey", targetKey),
    )
    .collect();
}
export async function settlementReversal(
  ctx: ReadCtx,
  settlement: Doc<"outgoingSettlements">,
) {
  return (
    await targetEvents(
      ctx,
      settlement.payerCompanyId,
      `settlement:${settlement._id}`,
    )
  ).find((event) => event.payload.type === "outside_settlement_reversed");
}
export async function event(
  ctx: MutationCtx,
  payerCompanyId: Id<"companies">,
  actorUserId: Id<"users">,
  targetKey: string,
  payload: Infer<typeof outgoingEventPayload>,
  idem?: { idempotencyKey: string; requestFingerprint: string },
) {
  return ctx.db.insert("outgoingEvents", {
    payerCompanyId,
    actorUserId,
    targetKey,
    payload,
    createdAt: Date.now(),
    ...idem,
  });
}
// Exact canonical JSON, not a lossy hash. Object insertion order is immaterial.
export function fingerprint(value: unknown) {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, value]) => value !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, value]) => [key, canonical(value)]),
      );
    }
    return input;
  }
  return JSON.stringify(canonical(value));
}
export async function eventRetry(
  ctx: ReadCtx,
  payerCompanyId: Id<"companies">,
  idempotencyKey: string,
  requestFingerprint: string,
) {
  text(idempotencyKey, "idempotency key", 200);
  const prior = await ctx.db
    .query("outgoingEvents")
    .withIndex("by_idempotency", (q) =>
      q
        .eq("payerCompanyId", payerCompanyId)
        .eq("idempotencyKey", idempotencyKey),
    )
    .unique();
  // All financial commands share one payer-scoped namespace, including settlements.
  const settlement = await ctx.db
    .query("outgoingSettlements")
    .withIndex("by_idempotency", (q) =>
      q
        .eq("payerCompanyId", payerCompanyId)
        .eq("idempotencyKey", idempotencyKey),
    )
    .unique();
  if (settlement || (prior && prior.requestFingerprint !== requestFingerprint))
    throw new Error("Idempotency key content mismatch");
  return prior;
}
